import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("dist contains exactly the fixed World V1 artifacts", async () => {
  assert.deepEqual((await readdir("dist")).sort(), ["manifest.json", "plugin.js", "rpc.mjs"]);
  assert.deepEqual(JSON.parse(await readFile("dist/manifest.json", "utf8")), {
    schemaVersion: 1,
    id: "todo-list",
    name: "Todo List",
    publisher: "United Robotics",
  });
});

test("plugin.js is self-contained ESM and exports mount", async () => {
  const source = await readFile("dist/plugin.js", "utf8");
  assert.match(source, /export\s*\{[^}]*mount/);
  assert.doesNotMatch(source, /from\s*["'](?:react|react-dom|\.\/plugin\.css)/);
  assert.match(source, /worldPlugin/);

  const plugin = await import(new URL("../dist/plugin.js", import.meta.url));
  assert.equal(typeof plugin.mount, "function");
  assert.deepEqual(Object.keys(plugin), ["mount"]);
});

test("rpc.mjs is standalone", async () => {
  const source = await readFile("dist/rpc.mjs", "utf8");
  assert.doesNotMatch(source, /from\s*["'](?!node:)/);
  assert.doesNotMatch(source, /process\.env\.(?!WORLD_PLUGIN_STATE_DIR)/);
});
