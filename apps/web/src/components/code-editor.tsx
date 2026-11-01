"use client";
import { useEffect, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";

let configured: Promise<void> | undefined;
function configure() {
  configured ??= import("monaco-editor/editor/editor.api.js").then((monaco) => {
    (
      globalThis as typeof globalThis & { MonacoEnvironment?: unknown }
    ).MonacoEnvironment = {
      getWorker: () =>
        new Worker(
          new URL("monaco-editor/editor/editor.worker.js", import.meta.url),
          { type: "module" },
        ),
    };
    loader.config({ monaco: monaco as Monaco });
    monaco.languages.register({ id: "cangjie" });
    monaco.languages.setMonarchTokensProvider("cangjie", {
      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"],
          [/"([^"\\]|\\.)*"/, "string"],
          [
            /\b(main|func|let|var|return|if|else|while|do|for|in|break|continue|import)\b/,
            "keyword",
          ],
          [/\b(Int64|String|Bool|Unit|Float64)\b/, "type"],
          [/\b\d+\b/, "number"],
        ],
      },
    });
  });
  return configured;
}
export default function CodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [plain, setPlain] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    configure()
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <div className="code-editor">
      <div className="editor-heading">
        <span>Cangjie · main.cj</span>
        <button type="button" onClick={() => setPlain((p) => !p)}>
          {plain ? "Use code editor" : "Use plain text editor"}
        </button>
      </div>
      {plain || failed || !ready ? (
        <textarea
          aria-label="Cangjie source"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Editor
          height="380px"
          language="cangjie"
          theme="vs-dark"
          value={value}
          onChange={(next) => onChange(next ?? "")}
          options={{
            ariaLabel: "Cangjie source",
            minimap: { enabled: false },
            fontSize: 15,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
          }}
        />
      )}
      {failed && (
        <p className="muted">
          The code editor could not load. You can continue in the plain text
          editor.
        </p>
      )}
    </div>
  );
}
