import { assert, suite, test } from "vitest";

import { parse } from "../src/api.js";
import { $init, generate } from "../obj/js-component-bindgen-component.js";

/** What `wat` transpiles to, by the bindgen of this build. */
async function generated(wat) {
    await $init;
    const { files } = generate(await parse(wat), {
        name: "component",
        instantiation: { tag: "async" },
        noTypescript: true,
        map: [],
    });
    return files;
}

/** `instantiate` for `wat`: each call makes a new instance of one transpiled module. */
async function transpiled(wat) {
    let source;
    const modules = new Map();
    for (const [name, bytes] of await generated(wat)) {
        if (name.endsWith(".wasm")) {
            modules.set(name, WebAssembly.compile(bytes));
        } else if (name.endsWith(".js")) {
            source = Buffer.from(bytes).toString("base64");
        }
    }
    const { instantiate } = await import(`data:text/javascript;base64,${source}`);
    return (imports, options, instantiateCore) =>
        instantiate((name) => modules.get(name), imports, instantiateCore, options);
}

/** A host object that counts how often it is disposed. */
function things() {
    const disposed = new Map();
    class Thing {
        [Symbol.dispose]() {
            disposed.set(this, (disposed.get(this) ?? 0) + 1);
        }
    }
    return { Thing, disposed };
}

/** No async at all: what a guest holds, drops or is lent is up to which export it is given to. */
const SYNC_THINGS = `
(component
  (import "test:host/things" (instance $host
    (export "thing" (type (sub resource)))
  ))
  (alias export $host "thing" (type $thing))
  (core func $drop (canon resource.drop $thing))
  (core module $m
    (import "" "drop" (func $drop (param i32)))
    (func (export "hold") (param i32))
    (func (export "drop") (param i32) (call $drop (local.get 0)))
    (func (export "noop"))
  )
  (core instance $i (instantiate $m (with "" (instance (export "drop" (func $drop))))))
  (func (export "hold") (param "t" (own $thing)) (canon lift (core func $i "hold")))
  (func (export "release") (param "t" (own $thing)) (canon lift (core func $i "drop")))
  (func (export "look") (param "t" (borrow $thing)) (canon lift (core func $i "drop")))
  (func (export "dispose") (canon lift (core func $i "noop")))
)`;

suite("stopping an instance", () => {
    test("each host object is disposed once, and what was only lent is not", async () => {
        const instantiate = await transpiled(SYNC_THINGS);
        const { Thing, disposed } = things();
        const instance = await instantiate({ "test:host/things": { Thing } });

        const held = new Thing();
        instance.hold(held);
        const dropped = new Thing();
        instance.release(dropped);
        assert.strictEqual(disposed.get(dropped), 1, "jco disposes what a guest drops");
        // A guest holds it twice, and drops it once: jco disposes it.
        const twice = new Thing();
        instance.hold(twice);
        instance.release(twice);
        assert.strictEqual(disposed.get(twice), 1);
        const lent = new Thing();
        instance.look(lent);

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
        assert.strictEqual(disposed.get(dropped), 1);
        assert.strictEqual(disposed.get(twice), 1);
        assert.isFalse(disposed.has(lent), "the host still owns what it lent");

        instance._util.stop();
        assert.strictEqual(disposed.get(held), 1);
    });
});
