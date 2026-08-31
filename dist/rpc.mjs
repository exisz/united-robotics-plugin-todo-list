import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_STATE_BYTES = 1024 * 1024;
const MAX_ITEMS = 5_000;
const MAX_TEXT_LENGTH = 500;

const PUBLIC_ERRORS = {
  invalid_request: "The Todo List request is invalid.",
  method_not_allowed: "The requested Todo List method is not allowed.",
  state_invalid: "Todo List state is invalid.",
  state_unavailable: "Todo List state is unavailable.",
  todo_not_found: "That task no longer exists.",
};

class TodoError extends Error {
  constructor(code) {
    super(PUBLIC_ERRORS[code] ?? "Todo List failed.");
    this.name = "TodoError";
    this.code = code;
  }
}

function errorEnvelope(error) {
  const safe = error instanceof TodoError ? error : new TodoError("state_unavailable");
  return { version: 1, ok: false, error: { code: safe.code, message: safe.message } };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stateDirectory() {
  const directory = process.env.WORLD_PLUGIN_STATE_DIR;
  if (typeof directory !== "string" || !path.isAbsolute(directory) || directory.length > 4_096) {
    throw new TodoError("state_unavailable");
  }
  return directory;
}

function validateState(value) {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.items) || value.items.length > MAX_ITEMS) {
    throw new TodoError("state_invalid");
  }

  const ids = new Set();
  const items = value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      !/^todo-[a-z0-9-]{1,80}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.text !== "string" ||
      item.text.length < 1 ||
      item.text.length > MAX_TEXT_LENGTH ||
      item.text.trim() !== item.text ||
      typeof item.completed !== "boolean"
    ) {
      throw new TodoError("state_invalid");
    }
    ids.add(item.id);
    return { id: item.id, text: item.text, completed: item.completed };
  });

  return { schemaVersion: 1, items };
}

async function readState() {
  const file = path.join(stateDirectory(), "state.json");
  try {
    const details = await stat(file);
    if (!details.isFile() || details.size > MAX_STATE_BYTES) throw new TodoError("state_invalid");
    return validateState(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return { schemaVersion: 1, items: [] };
    if (error instanceof SyntaxError) throw new TodoError("state_invalid");
    if (error instanceof TodoError) throw error;
    throw new TodoError("state_unavailable");
  }
}

async function writeState(state) {
  const directory = stateDirectory();
  const next = validateState(state);
  const file = path.join(directory, "state.json");
  const temporary = path.join(directory, `.state.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } catch {
    await rm(temporary, { force: true }).catch(() => {});
    throw new TodoError("state_unavailable");
  }
  return next;
}

function paramsRecord(params) {
  if (!isRecord(params)) throw new TodoError("invalid_request");
  return params;
}

function taskText(params) {
  const value = paramsRecord(params).text;
  if (typeof value !== "string") throw new TodoError("invalid_request");
  const text = value.trim();
  if (!text || text.length > MAX_TEXT_LENGTH || text.includes("\0")) throw new TodoError("invalid_request");
  return text;
}

function taskId(params) {
  const id = paramsRecord(params).id;
  if (typeof id !== "string" || !/^todo-[a-z0-9-]{1,80}$/.test(id)) throw new TodoError("invalid_request");
  return id;
}

async function dispatch(method, params) {
  if (method === "todo.list") {
    if (params !== undefined && (!isRecord(params) || Object.keys(params).length > 0)) throw new TodoError("invalid_request");
    return readState();
  }

  if (method === "todo.add") {
    const state = await readState();
    if (state.items.length >= MAX_ITEMS) throw new TodoError("state_invalid");
    const item = {
      id: `todo-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      text: taskText(params),
      completed: false,
    };
    return writeState({ ...state, items: [...state.items, item] });
  }

  if (method === "todo.toggle") {
    const id = taskId(params);
    const state = await readState();
    const index = state.items.findIndex((item) => item.id === id);
    if (index < 0) throw new TodoError("todo_not_found");
    const items = state.items.map((item, itemIndex) => itemIndex === index ? { ...item, completed: !item.completed } : item);
    return writeState({ ...state, items });
  }

  if (method === "todo.remove") {
    const id = taskId(params);
    const state = await readState();
    const items = state.items.filter((item) => item.id !== id);
    if (items.length === state.items.length) throw new TodoError("todo_not_found");
    return writeState({ ...state, items });
  }

  throw new TodoError("method_not_allowed");
}

async function readRequest() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_REQUEST_BYTES) throw new TodoError("invalid_request");
    chunks.push(chunk);
  }

  try {
    const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!isRecord(request) || request.version !== 1 || typeof request.method !== "string") {
      throw new TodoError("invalid_request");
    }
    return request;
  } catch (error) {
    if (error instanceof TodoError) throw error;
    throw new TodoError("invalid_request");
  }
}

try {
  const request = await readRequest();
  const result = await dispatch(request.method, request.params);
  process.stdout.write(JSON.stringify({ version: 1, ok: true, result }));
} catch (error) {
  process.stdout.write(JSON.stringify(errorEnvelope(error)));
  process.exitCode = 1;
}
