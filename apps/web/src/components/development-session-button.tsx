"use client";

import { useState } from "react";

export default function DevelopmentSessionButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function openWorkspace() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      let result: { error?: string } = {};
      try {
        result = await response.json();
      } catch {
        // The message below stays actionable even if the response is malformed.
      }
      if (!response.ok) {
        setError(result.error ?? "Could not open the workspace.");
        setPending(false);
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not open the development workspace. Check your connection or try again.");
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openWorkspace} disabled={pending}>
        {pending ? "Opening workspace…" : "Open development workspace"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
