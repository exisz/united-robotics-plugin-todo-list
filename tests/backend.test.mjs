import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const rpc = path.resolve("dist/rpc.mjs");

function invoke(stateDirectory, method, params) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [rpc], {
      env: { PATH: process.env.PATH ?? "", WORLD_PLUGIN_STATE_DIR: stateDirectory },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      try {
        resolve({ code, stderr, envelope: JSON.parse(stdout) });
      } catch (error) {
        reject(new Error(`Invalid RPC output: ${stdout}\n${stderr}`, { cause: error }));
      }
    });
    child.stdin.end(JSON.stringify({ version: 1, method, ...(params === undefined ? {} : { params }) }));
  });
}

async function temporaryRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "urtodo-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("todo.list returns an empty ledger without creating storage", async (t) => {
  const root = await temporaryRoot(t);
  const stateDirectory = path.join(root, "plugin-data", "todo-list");
  const response = await invoke(stateDirectory, "todo.list");

  assert.equal(response.code, 0);
  assert.equal(response.stderr, "");
  assert.deepEqual(response.envelope, {
    version: 1,
    ok: true,
    result: { schemaVersion: 1, items: [] },
  });
  await assert.rejects(readdir(stateDirectory), { code: "ENOENT" });
});

test("add, toggle, list, and remove persist across one-shot processes", async (t) => {
  const root = await temporaryRoot(t);
  const stateDirectory = path.join(root, "plugin-data", "todo-list");

  const added = await invoke(stateDirectory, "todo.add", { text: "  Inspect conveyor 4  " });
  assert.equal(added.code, 0);
  assert.equal(added.envelope.ok, true);
  assert.equal(added.envelope.result.items.length, 1);
  const item = added.envelope.result.items[0];
  assert.match(item.id, /^todo-[a-z0-9-]+$/);
  assert.deepEqual({ text: item.text, completed: item.completed }, { text: "Inspect conveyor 4", completed: false });

  const filesAfterAdd = await readdir(stateDirectory);
  assert.deepEqual(filesAfterAdd, ["state.json"]);

  const toggled = await invoke(stateDirectory, "todo.toggle", { id: item.id });
  assert.equal(toggled.code, 0);
  assert.equal(toggled.envelope.result.items[0].completed, true);

  const listed = await invoke(stateDirectory, "todo.list");
  assert.deepEqual(listed.envelope.result, toggled.envelope.result);

  const diskState = JSON.parse(await readFile(path.join(stateDirectory, "state.json"), "utf8"));
  assert.deepEqual(diskState, listed.envelope.result);

  const removed = await invoke(stateDirectory, "todo.remove", { id: item.id });
  assert.equal(removed.code, 0);
  assert.deepEqual(removed.envelope.result.items, []);

  const afterRestart = await invoke(stateDirectory, "todo.list");
  assert.deepEqual(afterRestart.envelope.result.items, []);
});

test("invalid requests fail with safe public errors", async (t) => {
  const stateDirectory = path.join(await temporaryRoot(t), "todo-list");

  const blank = await invoke(stateDirectory, "todo.add", { text: "   " });
  assert.equal(blank.code, 1);
  assert.deepEqual(blank.envelope, {
    version: 1,
    ok: false,
    error: { code: "invalid_request", message: "The Todo List request is invalid." },
  });

  const missing = await invoke(stateDirectory, "todo.toggle", { id: "todo-does-not-exist" });
  assert.equal(missing.code, 1);
  assert.deepEqual(missing.envelope.error, { code: "todo_not_found", message: "That task no longer exists." });

  const unknown = await invoke(stateDirectory, "filesystem.read", { path: "/etc/passwd" });
  assert.equal(unknown.code, 1);
  assert.deepEqual(unknown.envelope.error, {
    code: "method_not_allowed",
    message: "The requested Todo List method is not allowed.",
  });
});
