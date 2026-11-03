import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, assert, beforeAll, suite, test } from 'vitest';

import { P3_COMPONENT_FIXTURES_DIR } from '../common.js';
import { setupAsyncTest } from '../helpers.js';

const WRITE_PENDING = -2;

const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

suite('a future an async export returns', () => {
    let esModule;
    let esModuleOutputPath;
    let cleanup;

    beforeAll(async () => {
        ({ esModule, esModuleOutputPath, cleanup } = await setupAsyncTest({
            component: {
                name: 'future-drop',
                path: join(P3_COMPONENT_FIXTURES_DIR, 'future-drop.wat'),
                skipInstantiation: true,
            },
        }));
    });

    afterAll(async () => {
        await cleanup?.();
    });

    /** A new instance, and the things it made with how often they were disposed. */
    async function setup() {
        const things = { made: 0, disposed: 0 };
        class Thing {
            constructor() {
                things.made += 1;
            }
            [Symbol.dispose]() {
                things.disposed += 1;
            }
        }
        const instance = await esModule.instantiate(undefined, { 'test:host/things': { Thing } });
        return { instance, things };
    }

    suite.each([
        ['async', async (instance, writeNow) => ({ future: await instance.openFuture(writeNow) })],
        [
            'sync',
            async (instance, writeNow) => {
                await instance.prepare(writeNow);
                return { future: instance.takeFuture() };
            },
        ],
    ])('a future returned from a %s call', (_, open) => {
        test('holding it reads nothing', async () => {
            const { instance, things } = await setup();
            await open(instance, true);
            await pause();
            assert.strictEqual(instance.writeResult(), WRITE_PENDING);
            assert.strictEqual(things.disposed, 0);
        });
    });
});
