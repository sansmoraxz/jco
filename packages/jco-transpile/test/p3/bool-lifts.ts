import { join } from 'node:path';

import { assert, suite, test } from 'vitest';

import { setupAsyncTest } from '../helpers.js';
import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';

// A `bool` is lifted as true from any nonzero value (Canonical ABI
// `convert_int_to_bool`), from a flat core value or a byte in memory.
suite('bool lifting', () => {
    const setup = (name: string, imports = {}) =>
        setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `bool-lifts-${name}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'bool-lifts.wat'),
                imports: {
                    take: { default: () => {} },
                    'take-async': { default: async () => {} },
                    ...imports,
                },
            },
            jco: { transpile: { extraArgs: { validLiftingOptimization: false } } },
        });

    test.concurrent.each(['run', 'runAsync'])('%s passes each argument as a bool', async (run) => {
        const calls: boolean[] = [];
        const { instance, cleanup } = await setup(run, {
            take: { default: (v: boolean) => void calls.push(v) },
            'take-async': { default: async (v: boolean) => void calls.push(v) },
        });
        try {
            await instance[run]();
            assert.deepStrictEqual(calls, [false, true, true, true, true]);
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a flat result is true when nonzero', async () => {
        const { instance, cleanup } = await setup('bool-of');
        try {
            for (const [bits, value] of [
                [0, false],
                [1, true],
                [2, true],
                [0x100, true],
                [0xffffffff, true],
            ]) {
                assert.strictEqual(await instance.boolOf(bits), value);
            }
        } finally {
            await cleanup();
        }
    });

    test.concurrent('a byte in memory is true when nonzero', async () => {
        const { instance, cleanup } = await setup('bools');
        try {
            assert.deepStrictEqual(await instance.bools(), [false, true, true, true]);
        } finally {
            await cleanup();
        }
    });
});
