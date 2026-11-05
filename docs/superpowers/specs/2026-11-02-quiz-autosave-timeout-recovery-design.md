# Quiz Autosave Timeout Recovery — Design

**Status:** Approved 2026-11-02

## Intent

Keep multiple-choice answers recoverable and synchronize them after slow or interrupted saves. A timeout must leave the learner's work visibly unsynced until the server confirms it. Replaying a request whose response was lost must either confirm that exact snapshot or surface a conflict that preserves both versions.

Today, answer edits are written to IndexedDB and autosaved after a 1.5-second debounce. Each request has a 15-second client timeout. A failed request leaves the local draft dirty, but the completed debounce is not scheduled again when the request times out. The quiz persistence adapter already recognizes an identical answer snapshot at a newer work revision as a successful replay; a different snapshot at a stale revision becomes a conflict.

## Goals

- Retry transient autosave failures without requiring another answer selection.
- Preserve the exact pending request snapshot and base revision, along with any newer local edits, so reload recovery can reconcile an uncertain response before sending newer work.
- Send only one draft save at a time. After a save is confirmed, send any newer snapshot against the returned work revision.
- Keep unsynced work and status until an acknowledgement confirms the corresponding snapshot.
- Stop automatic retries on conflicts, authentication failures, and other non-retryable client errors; keep both conflict candidates available for learner choice.
- Make the held-request browser journeys deterministic under Playwright Inspector and test the timeout path separately.

## Non-goals

- Changing quiz submission idempotency or evaluation recovery.
- Changing coding-draft autosave behavior.
- Adding a new server request identity or changing the quiz draft API contract unless implementation verification shows the current replay contract is insufficient.
- Redesigning the conflict-resolution interface.

## Constraints

- UC-12-AC2: changed answer selections must be recoverable on return.
- UC-16-AC2: offline edits remain unsynced until confirmed and conflicting work is not silently overwritten.
- INV-22: preserve conflicting drafts until learner choice.
- Keep the current 1.5-second debounce and 15-second request timeout. Tests control time for deterministic retry and held-response scenarios; the stalled-autosave submission-recovery journey uses real timers because its 10-second preparation deadline is installed after asynchronous IndexedDB work.
- Learner-facing status and recovery copy follows `docs/content-style.md`.

## Approaches

1. **Bounded automatic retry of a durable pending snapshot — selected.** Persist the exact in-flight snapshot and revision before sending it. On timeout, network failure, HTTP 408/429, or 5xx, replay that same request up to three times after delays of 1, 2, and 4 seconds. An `online` event can prompt one immediate retry under the same single-flight guard. After the retry limit, retain the unsynced draft and show an accessible manual retry action. This handles short outages automatically and lets the existing server replay rule resolve a lost response without inventing a new API identity.
2. **Learner-triggered retry.** Keep the local snapshot and offer a retry action, with an attempt when connectivity returns. This limits background requests but leaves work unsynced through transient failures until the learner acts or reconnects.
3. **Test-only timing changes.** Freeze or control timers in the tests without changing recovery behavior. This removes the Inspector flake but leaves the real timeout path without automatic recovery.

The selected approach best matches UC-16's requirement to sync offline edits when connectivity returns while bounding retries and preserving a manual escape route.

## Behavior contract

1. On answer selection, retain the latest answer snapshot locally and mark it unsynced.
2. Before sending an autosave, persist its immutable answer snapshot and `baseRevision` as the pending request. Continue to keep any newer answer snapshot separately as the current local draft.
3. On a confirmed save, clear the pending request. If no newer edit exists, clear the local dirty draft and report it saved. If newer edits exist, keep them locally, adopt the returned revision, and schedule the latest snapshot.
4. On a retryable failure, keep the pending request unchanged and replay it with the same `baseRevision` and answers. The server may acknowledge an identical snapshot even if that first request committed; a divergent stale snapshot must return a conflict.
5. On reload, restore the pending request and latest local snapshot. Reconcile the pending request first; after it is acknowledged, sync any newer local snapshot.
6. On conflict or non-retryable failure, stop automatic retries. Preserve local work, show accurate unsynced/error status, and allow the applicable learner recovery action. Never label an uncertain request as saved.
7. After three automatic retries, stop the retry timer. Keep the local draft and expose a manual retry action. A later online transition may trigger one immediate attempt, subject to the same single-flight behavior.

Retry policy defaults (implementation choice): three retries after the initial attempt; 1s, 2s, then 4s delay; retry only transport/timeouts and HTTP 408, 429, or 5xx. A successful acknowledgement resets the retry count for the next snapshot. Conflicts, 401, account-change errors, and other 4xx responses do not retry automatically.

## Validation boundary

- Browser journeys cover edits made during a held save, transient failure and bounded retry, retry after reconnection, exhausted retries with manual recovery, reload with a pending request plus newer local edits, and conflict/auth failures that stop retries.
- Existing held-response tests use Playwright-controlled time and immutable response fixtures so Step over duration cannot reorder their intended scenario. The stalled-autosave submission-recovery journey is the exception: it uses real timers, waits for the intercepted first save, and allows up to 22 seconds for both the preparation recovery state and the 15-second save timeout.
- A browser journey against the dedicated `_test` PostgreSQL database lets the server commit a save and drops the first response. The client then replays the identical request; verify the server's current answers and revision, no duplicate conflict, preservation of newer answers, and the saved/unsynced status.
- Storage failure must never produce a saved status. The app may still attempt a live server save, but it must report that browser recovery could not be guaranteed.

## Decisions left to implementation

Keep the retry scheduler within the quiz workspace lifecycle unless implementation reveals a clean existing shared seam. Keep the durable pending-save metadata quiz-specific; do not change the shared coding-draft format just to host quiz retry state. If the IndexedDB record format needs a schema version change, use a forward-compatible Dexie migration and retain existing drafts.
