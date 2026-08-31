import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import styles from "./plugin.css";

const h = React.createElement;

function normalizedState(value) {
  if (!value || value.schemaVersion !== 1 || !Array.isArray(value.items)) {
    throw new Error("Todo List returned an invalid response.");
  }
  return value.items;
}

function errorMessage(error) {
  if (error && typeof error.message === "string" && error.message.trim()) return error.message;
  return "Todo List could not complete the operation.";
}

function Ledger({ invoke }) {
  const inputId = useId();
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const sequence = useRef(Promise.resolve());

  const run = useCallback((operation, { initial = false } = {}) => {
    const next = sequence.current.then(async () => {
      if (!mounted.current) return;
      if (!initial) setBusy(true);
      setError("");
      try {
        const result = await operation();
        if (mounted.current) setItems(normalizedState(result));
      } catch (cause) {
        if (mounted.current) setError(errorMessage(cause));
      } finally {
        if (mounted.current) {
          if (initial) setLoading(false);
          else setBusy(false);
        }
      }
    });
    sequence.current = next.catch(() => {});
    return next;
  }, []);

  useEffect(() => {
    mounted.current = true;
    run(() => invoke("todo.list"), { initial: true });
    return () => { mounted.current = false; };
  }, [invoke, run]);

  const add = (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || loading) return;
    setDraft("");
    run(() => invoke("todo.add", { text }));
  };

  const toggle = (id) => {
    if (!busy && !loading) run(() => invoke("todo.toggle", { id }));
  };

  const remove = (id) => {
    if (!busy && !loading) run(() => invoke("todo.remove", { id }));
  };

  const completed = items.filter((item) => item.completed).length;
  const open = items.length - completed;

  return h("section", { className: "urtodo-shell", "aria-busy": loading || busy },
    h("header", { className: "urtodo-header" },
      h("div", null,
        h("p", { className: "urtodo-kicker" }, "WORLD OPS / LOCAL STATE"),
        h("h2", null, "TASK LEDGER"),
      ),
      h("div", { className: "urtodo-status", title: busy ? "Writing local state" : "Local state ready" },
        h("span", { className: `urtodo-lamp ${busy ? "is-pulsing" : ""}` }),
        busy ? "WRITING" : "ONLINE",
      ),
    ),
    h("div", { className: "urtodo-metrics", "aria-label": "Task totals" },
      h("div", null, h("strong", null, String(open).padStart(2, "0")), h("span", null, "OPEN")),
      h("div", null, h("strong", null, String(completed).padStart(2, "0")), h("span", null, "CLOSED")),
      h("div", null, h("strong", null, String(items.length).padStart(2, "0")), h("span", null, "TOTAL")),
    ),
    h("form", { className: "urtodo-entry", onSubmit: add },
      h("label", { htmlFor: inputId }, "NEW WORK ORDER"),
      h("div", null,
        h("input", {
          id: inputId,
          value: draft,
          onChange: (event) => setDraft(event.target.value),
          maxLength: 500,
          placeholder: "Describe next operation…",
          disabled: loading || busy,
          autoComplete: "off",
        }),
        h("button", { type: "submit", disabled: !draft.trim() || loading || busy, "aria-label": "Add task" }, "+"),
      ),
    ),
    error && h("div", { className: "urtodo-error", role: "alert" },
      h("span", null, "FAULT"), error,
      h("button", { type: "button", onClick: () => setError(""), "aria-label": "Dismiss error" }, "×"),
    ),
    h("div", { className: "urtodo-list", "aria-live": "polite" },
      loading
        ? h(React.Fragment, null, [0, 1, 2].map((index) => h("div", { className: "urtodo-skeleton", key: index })))
        : items.length === 0
          ? h("div", { className: "urtodo-empty" },
              h("span", null, "Ø"),
              h("strong", null, "QUEUE CLEAR"),
              h("p", null, "No active work orders in this ledger."),
            )
          : items.map((item, index) => h("article", { className: `urtodo-row ${item.completed ? "is-complete" : ""}`, key: item.id },
              h("span", { className: "urtodo-index", "aria-hidden": "true" }, String(index + 1).padStart(2, "0")),
              h("button", {
                className: "urtodo-check",
                type: "button",
                onClick: () => toggle(item.id),
                disabled: busy,
                "aria-label": item.completed ? `Reopen ${item.text}` : `Complete ${item.text}`,
                "aria-pressed": item.completed,
              }, item.completed ? "✓" : ""),
              h("span", { className: "urtodo-text" }, item.text),
              h("button", {
                className: "urtodo-remove",
                type: "button",
                onClick: () => remove(item.id),
                disabled: busy,
                "aria-label": `Remove ${item.text}`,
              }, "×"),
            )),
    ),
    h("footer", null,
      h("span", null, "INSTANCE-SHARED"),
      h("span", null, "ATOMIC JSON STORE"),
    ),
  );
}

export function mount(root, { props = {}, invoke } = {}) {
  if (!(root instanceof HTMLElement)) throw new TypeError("Todo List requires an HTMLElement root.");
  if (typeof invoke !== "function") throw new TypeError("Todo List requires an invoke function.");
  const stylesheet = document.createElement("style");
  stylesheet.dataset.worldPlugin = "todo-list";
  stylesheet.textContent = styles;
  document.head.append(stylesheet);
  const reactRoot = createRoot(root);
  reactRoot.render(h(Ledger, { invoke, props }));
  return () => {
    reactRoot.unmount();
    stylesheet.remove();
  };
}
