export type Score = Readonly<{ earned: number; possible: number }>;

export function assertScore(score: Score): void {
  if (!Number.isSafeInteger(score.earned) || !Number.isSafeInteger(score.possible)
      || score.possible <= 0 || score.earned < 0 || score.earned > score.possible
      || score.earned % 10 !== 0 || score.possible % 10 !== 0) {
    throw new Error("Score must have nonnegative ten-point units within a positive maximum.");
  }
}

export function passes(score: Score): boolean {
  assertScore(score);
  return 5n * BigInt(score.earned) >= 3n * BigInt(score.possible);
}

/** Compare score percentages exactly; ties preserve the earlier best submission. */
export function betterScore(candidate: Score, previous: Score | null): boolean {
  assertScore(candidate);
  if (previous === null) return true;
  assertScore(previous);
  return BigInt(candidate.earned) * BigInt(previous.possible)
    > BigInt(previous.earned) * BigInt(candidate.possible);
}

/** Compare the bytes themselves; display decoding and whitespace normalization are not grading. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

export type EvaluationKind = "single" | "batch";
export type CaseOutcome = "pass" | "fail" | "runtime-error" | "timeout" | "output-limit" | "unknown";
export type EvaluationEvidence =
  | Readonly<{ kind: "compile-failure" }>
  | Readonly<{ kind: "operational-failure" }>
  | Readonly<{ kind: "executed"; cases: readonly Readonly<{ caseId: string; outcome: CaseOutcome }>[] }>;
export type EvaluationDecision =
  | Readonly<{ kind: "incomplete" }>
  | Readonly<{ kind: "confirmed"; score?: Score; solved: boolean }>;
export type EvaluationContext = Readonly<{
  learnerId: string; problemId: string; source: string; languageVersion: string;
  assessment: Readonly<{ topicId: string; revision: number }>;
  caseIds: readonly string[];
}>;
export type EvaluationRecord = Readonly<{
  context: EvaluationContext; kind: EvaluationKind; decision: EvaluationDecision;
}>;

function assertScope(caseIds: readonly string[]): void {
  if (caseIds.length === 0 || caseIds.some(id => id.length === 0)
      || new Set(caseIds).size !== caseIds.length) {
    throw new Error("Evaluation requires a nonempty, distinct case inventory.");
  }
}

/** Receives already-associated, trusted per-case comparisons, never a browser-supplied grade. */
export function evaluate(kind: EvaluationKind, caseIds: readonly string[], evidence: EvaluationEvidence): EvaluationDecision {
  assertScope(caseIds);
  if (kind === "single" && caseIds.length !== 1) throw new Error("A single run selects exactly one case.");
  if (evidence.kind === "operational-failure") return { kind: "incomplete" };
  let passed = 0;
  if (evidence.kind === "executed") {
    const seen = new Set<string>();
    for (const result of evidence.cases) {
      if (!caseIds.includes(result.caseId) || seen.has(result.caseId)) {
        throw new Error("Evidence has an unexpected or repeated case.");
      }
      seen.add(result.caseId);
      if (result.outcome === "pass") passed += 1;
    }
    if (seen.size !== caseIds.length || evidence.cases.some(result => result.outcome === "unknown")) {
      return { kind: "incomplete" };
    }
  }
  if (kind === "single") return { kind: "confirmed", solved: false };
  const score = { earned: passed * 10, possible: caseIds.length * 10 };
  assertScore(score);
  return { kind: "confirmed", score, solved: passed === caseIds.length };
}

/** Work revision alone is not eligibility: compare the immutable source and assessment context. */
export function isEligibleBatch(result: EvaluationRecord, current: EvaluationContext): boolean {
  assertScope(current.caseIds);
  assertScope(result.context.caseIds);
  const previous = result.context;
  if (result.decision.kind === "confirmed" && result.decision.score !== undefined) {
    assertScore(result.decision.score);
    if (result.decision.score.possible !== previous.caseIds.length * 10) return false;
  }
  return result.kind === "batch" && result.decision.kind === "confirmed" && result.decision.score !== undefined
    && previous.learnerId === current.learnerId && previous.problemId === current.problemId
    && previous.source === current.source && previous.languageVersion === current.languageVersion
    && previous.assessment.topicId === current.assessment.topicId
    && previous.assessment.revision === current.assessment.revision
    && previous.caseIds.length === current.caseIds.length
    && previous.caseIds.every(id => current.caseIds.includes(id));
}

export function participationAfter(previous: boolean, event: "view" | "edit" | "single" | "batch"): boolean {
  return previous || event !== "view";
}

/** The milestone has no structural analyzer. Never silently publish unsupported gated content. */
export function assertSupportedRequirements(requirements: readonly unknown[]): void {
  if (requirements.length !== 0) throw new Error("Structural requirements are not supported by this milestone.");
}
