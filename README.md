# Todo List — United Robotics World plugin

The official Todo List plugin is a compact operations ledger for United Robotics World. It ships as three fixed, public artifacts:

- `dist/manifest.json` — the four-field World V1 manifest
- `dist/plugin.js` — a self-contained ESM frontend with React, ReactDOM, and styles bundled in
- `dist/rpc.mjs` — a dependency-free, one-shot Node.js backend

## Develop

Requires Node.js 22 or newer.

```bash
npm ci
npm run check
```

`npm run build` recreates `dist/`. `npm test` runs the backend behavior and artifact contract tests.

## World methods

The frontend uses only the `invoke` function supplied by World:

| Method | Input |
| --- | --- |
| `todo.list` | none |
| `todo.add` | `{ "text": "Inspect line 4" }` |
| `todo.toggle` | `{ "id": "todo-…" }` |
| `todo.remove` | `{ "id": "todo-…" }` |

The backend accepts one version-1 JSON envelope on stdin and emits one version-1 envelope on stdout. It is standalone and needs no package installation at runtime.

## Persistent state

World derives and injects `WORLD_PLUGIN_STATE_DIR`; the plugin never accepts a path from the browser or RPC input. For a frontline at `<frontline>`, Todo data is:

```text
<frontline>/plugin-data/todo-list/state.json
```

`todo.list` is read-only and does **not** create the directory. The first mutation creates it. Mutations write a temporary file and atomically rename it over `state.json`. This directory is for non-secret, instance-shared plugin state only—never put credentials or tokens in it.

## Immutable installation URL

After a commit is pushed, pin the frontline panel to the exact Git commit SHA through jsDelivr (never `main`, a tag that can move, or `latest`):

```text
https://cdn.jsdelivr.net/gh/exisz/united-robotics-plugin-todo-list@<FULL_GIT_SHA>/dist/manifest.json
```

World derives sibling `plugin.js` and `rpc.mjs` URLs from that manifest URL. The SHA keeps all three artifacts on the same immutable revision.
