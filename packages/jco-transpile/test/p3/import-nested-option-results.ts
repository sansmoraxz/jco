import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

// A nested option an async host import returns is lowered into guest memory from
// the value its lift produces, at each nesting depth: an `option<T>` whose `T`
// can itself be absent is `{ tag: 'none' }` or `{ tag: 'some', val }`, and any
// other option is `undefined` or its payload.
suite('async host import nested option result lowering', () => {
    test.concurrent.each([
        ['run2', [{ tag: 'none' }, { tag: 'some', val: undefined }, { tag: 'some', val: 7 }]],
        ['run3', [undefined, { tag: 'none' }, { tag: 'some', val: undefined }, { tag: 'some', val: 7 }]],
    ])('%s returns each value it was given', async (run, values) => {
        let next: unknown;
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `async-import-nested-option-result-${run}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'async-import-nested-option-result.wat'),
                imports: { get2: { default: async () => next }, get3: { default: async () => next } },
            },
        });
        try {
            for (const value of values) {
                next = value;
                assert.deepStrictEqual(await instance[run](), value);
            }
        } finally {
            await cleanup();
        }
    });
});
