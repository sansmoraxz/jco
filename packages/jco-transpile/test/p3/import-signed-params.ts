import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

// An `s8` or `s16` argument is lifted from the low bits of its core i32
// (Canonical ABI `lift_flat_signed`), whatever the bits above them are: a guest
// may pass -1 as an `s8` with them zeroed (0xff) as well as sign-extended.
suite('host import s8 and s16 parameter lifting', () => {
    test.concurrent.each(['run', 'runAsync'])('%s passes each argument as its signed value', async (run) => {
        const calls: [number, number][] = [];
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `import-signed-params-${run}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'import-signed-params.wat'),
                imports: {
                    take: { default: (a: number, b: number) => void calls.push([a, b]) },
                    'take-async': { default: async (a: number, b: number) => void calls.push([a, b]) },
                },
            },
        });
        try {
            await instance[run]();
            assert.deepStrictEqual(calls, [
                [-1, -1],
                [-128, -32768],
                [127, 32767],
                [-1, -1],
                [-128, -32768],
            ]);
        } finally {
            await cleanup();
        }
    });
});
