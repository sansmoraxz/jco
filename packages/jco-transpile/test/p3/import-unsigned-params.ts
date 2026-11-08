import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

// A `u8` or `u16` argument is lifted from the low bits of its core i32
// (Canonical ABI `lift_flat_unsigned`), whatever the bits above them are.
suite('host import u8 and u16 parameter lifting', () => {
    test.concurrent.each(['run', 'runAsync'])('%s passes each argument as its unsigned value', async (run) => {
        const calls: [number, number][] = [];
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `import-unsigned-params-${run}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'import-unsigned-params.wat'),
                imports: {
                    take: { default: (a: number, b: number) => void calls.push([a, b]) },
                    'take-async': { default: async (a: number, b: number) => void calls.push([a, b]) },
                },
            },
        });
        try {
            await instance[run]();
            assert.deepStrictEqual(calls, [
                [255, 65535],
                [255, 65535],
                [127, 32767],
                [255, 65535],
                [128, 32768],
            ]);
        } finally {
            await cleanup();
        }
    });
});
