import { assertScore, passes } from "./evaluation.ts";
import type { Score } from "./evaluation.ts";

/** Compare exact fractions, keeping retained evidence when percentages tie. */
export function betterScore(candidate: Score, retained: Score): boolean {
  assertScore(candidate);
  assertScore(retained);
  return BigInt(candidate.earned) * BigInt(retained.possible)
    > BigInt(retained.earned) * BigInt(candidate.possible);
}

export type CodingProgress = Readonly<{
  bestScore: Score | null;
  completed: boolean;
  nextTopicAvailable: boolean;
  solved: boolean;
}>;

/** finalizedScore must come from a confirmed submission, never a pending/batch estimate. */
export function retainCodingProgress(
  previous: CodingProgress,
  finalizedScore: Score | null,
  solvedInBatch = false,
): CodingProgress {
  if (previous.bestScore !== null) assertScore(previous.bestScore);
  if (finalizedScore !== null) assertScore(finalizedScore);
  const bestScore = finalizedScore !== null
    && (previous.bestScore === null || betterScore(finalizedScore, previous.bestScore))
    ? { ...finalizedScore } : previous.bestScore;
  const completed = previous.completed || (finalizedScore !== null && passes(finalizedScore));
  return {
    bestScore,
    completed,
    nextTopicAvailable: previous.nextTopicAvailable || completed,
    solved: previous.solved || solvedInBatch,
  };
}
