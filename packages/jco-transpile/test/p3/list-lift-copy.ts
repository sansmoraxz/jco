import { join } from 'node:path';

import { afterAll, assert, beforeAll, suite, test, vi } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

// What the fixture keeps at 1024.
const BYTES = new Uint8Array([0, 0, 0x80, 0x3f, 0, 0, 0, 0x40, 0, 0, 0, 0, 0, 0, 0xf0, 0x3f]);

suite('lifting a list of numbers', () => {
    let instance;
    let cleanup;

    beforeAll(async () => {
        ({ instance, cleanup } = await setupAsyncTest({
            component: {
                name: 'list-lift-copy',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'list-lift-copy.wat'),
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    test.each([
        ['getU8', Uint8Array],
        ['getS8', Int8Array],
        ['getU16', Uint16Array],
        ['getS16', Int16Array],
        ['getU32', Uint32Array],
        ['getS32', Int32Array],
        ['getU64', BigUint64Array],
        ['getS64', BigInt64Array],
        ['getF32', Float32Array],
        ['getF64', Float64Array],
    ])('%s gives a typed array of what is in memory', async (getter, typedArray) => {
        const list = await instance[getter]();
        assert.instanceOf(list, typedArray);
        assert.deepStrictEqual(list, new typedArray(BYTES.buffer));
    });

    test('in the items of a stream', async () => {
        const reader = (await instance.openLists(5))[Symbol.asyncIterator]();
        assert.deepStrictEqual((await reader.next()).value, new Uint8Array([1, 2, 3, 4, 5]));
        assert.deepStrictEqual((await reader.next()).value, new Uint8Array([]));
    });

    test('a tuple reads on from after the list', async () => {
        const reader = (await instance.openTuples())[Symbol.asyncIterator]();
        assert.deepStrictEqual((await reader.next()).value, [BYTES.slice(0, 4), 7]);
        assert.deepStrictEqual((await reader.next()).value, [BYTES.slice(4, 6), 9]);
    });

    test('a list of lists', async () => {
        const reader = (await instance.openNested())[Symbol.asyncIterator]();
        assert.deepStrictEqual((await reader.next()).value, [
            new Uint16Array(BYTES.buffer, 0, 2),
            new Uint16Array(BYTES.buffer, 4, 1),
        ]);
    });

    test('does not read element by element', async () => {
        const reader = (await instance.openLists(64 * 1024))[Symbol.asyncIterator]();
        let views = 0;
        const RealDataView = DataView;
        vi.stubGlobal(
            'DataView',
            class extends RealDataView {
                constructor(...args: ConstructorParameters<typeof DataView>) {
                    super(...args);
                    views += 1;
                }
            },
        );
        try {
            assert.strictEqual((await reader.next()).value.length, 64 * 1024);
        } finally {
            vi.unstubAllGlobals();
        }
        assert.isBelow(views, 64, 'one read of the item, not one per element');
    });
});
