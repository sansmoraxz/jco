import { join } from 'node:path';

import { suite, test, assert } from 'vitest';

import { WASIShim } from '@bytecodealliance/preview2-shim/instantiation';

import { setupAsyncTest } from '../helpers.js';
import { AsyncFunction, LOCAL_TEST_COMPONENTS_DIR, P3_COMPONENT_FIXTURES_DIR } from '../common.js';

// Regression coverage for the flat lowering of 1-byte async host import
// results (`bool`, `u8`, `s8`) and elementwise-lowered `list<u8>` results:
// the runtime must write these into guest memory with 1-byte stores. The
// previous `DataView.setUint32` writes overflowed 3 bytes past the guest's
// exactly-sized return-area/list allocations, silently corrupting the guest
// heap (layout-dependent dlmalloc `unlink_chunk` traps much later).
//
// The `async-scalar-lowers` fixture guest detects any such overflow
// deterministically via a rear-canary global allocator and asserts zero
// violations (see crates/test-components/src/bin/async_scalar_lowers.rs and
// crates/js-component-bindgen/src/intrinsics/lower.rs).
suite('async host import 1-byte scalar result lowering', () => {
    test.concurrent('bool/u8/s8/list<u8> results are written with exact widths', async () => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-scalar-lowers.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/async-scalar-lowers-host': {
                        getBool: async () => true,
                        getU8: async () => 0xab,
                        getS8: async () => -5,
                        getListU8: async () => new Uint8Array(Array.from({ length: 32 }, (_, i) => i)),
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                    },
                },
            },
        });

        try {
            const run = instance['jco:test-components/local-run-async'].run;
            assert.instanceOf(run, AsyncFunction);
            await Promise.race([
                run(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('export call timed out')), 10_000)),
            ]);
        } finally {
            await cleanup();
        }
    });
});

// With strict type checks enabled, values are validated before they are
// written into guest memory, rather than being coerced by the write.
suite('async host import scalar result lowering (strict)', () => {
    async function setup(overrides: Record<string, () => Promise<unknown>>) {
        return await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                path: join(LOCAL_TEST_COMPONENTS_DIR, 'async-scalar-lowers.wasm'),
                imports: {
                    ...new WASIShim().getImportObject(),
                    'jco:test-components/async-scalar-lowers-host': {
                        getBool: async () => true,
                        getU8: async () => 0xab,
                        getS8: async () => -5,
                        getListU8: async () => new Uint8Array(Array.from({ length: 32 }, (_, i) => i)),
                        ...overrides,
                    },
                },
            },
            jco: {
                transpile: {
                    extraArgs: {
                        minify: false,
                        strict: true,
                    },
                },
            },
        });
    }

    test.concurrent('valid results are lowered', async () => {
        const { instance, cleanup } = await setup({});
        try {
            await instance['jco:test-components/local-run-async'].run();
        } finally {
            await cleanup();
        }
    });

    test.concurrent.each([
        { name: 'a non-boolean bool', overrides: { getBool: async () => 1 }, message: 'invalid bool value [1]' },
        { name: 'an out of range u8', overrides: { getU8: async () => 300 }, message: 'invalid u8 value [300]' },
        { name: 'a fractional s8', overrides: { getS8: async () => 1.5 }, message: 'invalid s8 value [1.5]' },
        { name: 'a non-numeric s8', overrides: { getS8: async () => '5' }, message: 'invalid s8 value [5]' },
    ])('$name is rejected', async ({ overrides, message }) => {
        const { instance, cleanup } = await setup(overrides);
        try {
            let error: unknown;
            try {
                await instance['jco:test-components/local-run-async'].run();
            } catch (err) {
                error = err;
            }
            assert.instanceOf(error, TypeError);
            assert.strictEqual((error as TypeError).message, message);
        } finally {
            await cleanup();
        }
    });
});

// A `char` an async host import returns is written into guest memory as its
// code point, U+0000 and code points past U+FFFF included.
suite('async host import char result lowering', () => {
    test.concurrent('a char result is written as its code point', async () => {
        let next = '';
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: 'async-import-char-result',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'async-import-char-result.wat'),
                imports: { 'get-char': { default: async () => next } },
            },
        });
        try {
            for (const char of ['A', '\0', '\u{ffff}', '\u{1f680}', '\u{10ffff}']) {
                next = char;
                assert.strictEqual(await instance.run(), char.codePointAt(0));
            }
        } finally {
            await cleanup();
        }
    });
});

// An async host import's result is written wherever the guest asks for it,
// address 0 included.
suite('async host import result lowering at address 0', () => {
    test.concurrent.each(['run', 'runStackful'])('%s finds the result at address 0', async (run) => {
        const { instance, cleanup } = await setupAsyncTest({
            asyncMode: 'jspi',
            component: {
                name: `async-import-result-at-zero-${run}`,
                path: join(P3_COMPONENT_FIXTURES_DIR, 'async-import-result-at-zero.wat'),
                imports: { get: { default: async () => 42 } },
            },
        });
        try {
            assert.strictEqual(await instance[run](), 42);
        } finally {
            await cleanup();
        }
    });
});
