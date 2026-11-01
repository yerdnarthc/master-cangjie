import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { root } from "../../../infrastructure/runtime/config.ts";
import type {
  MultipleChoiceAssessment,
  Question,
} from "../application/content.ts";

export type PublicQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; text: string }[];
};

export type PublicQuiz = {
  kind: "multiple-choice";
  topicId: string;
  revision: number;
  title: string;
  questions: PublicQuestion[];
};

export async function readQuiz(
  topicId: string,
): Promise<MultipleChoiceAssessment> {
  const filePath = resolve(root, "content/quizzes", topicId, "activity.json");
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as {
    topicId: string;
    revision: number;
    title: string;
    questions: Question[];
  };

  if (!parsed.topicId || parsed.topicId !== topicId) {
    throw new Error(`Quiz content topicId mismatch: expected ${topicId}`);
  }
  if (!Number.isSafeInteger(parsed.revision) || parsed.revision < 1) {
    throw new Error("Quiz revision must be a positive integer.");
  }
  if (!parsed.title || typeof parsed.title !== "string") {
    throw new Error("Quiz title is required.");
  }
  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 10) {
    throw new Error(
      `A multiple-choice activity must have exactly 10 questions, found ${parsed.questions?.length}`,
    );
  }

  const seenIds = new Set<string>();
  for (const q of parsed.questions) {
    if (!q.id || seenIds.has(q.id))
      throw new Error(`Duplicate or missing question id: ${q.id}`);
    seenIds.add(q.id);
    if (!q.prompt || typeof q.prompt !== "string")
      throw new Error(`Missing prompt for question ${q.id}`);
    if (!Array.isArray(q.choices) || q.choices.length < 2) {
      throw new Error(`Question ${q.id} must have at least 2 choices.`);
    }
    const choiceIds = new Set<string>();
    for (const c of q.choices) {
      if (!c.id || choiceIds.has(c.id))
        throw new Error(`Duplicate choice id ${c.id} in question ${q.id}`);
      choiceIds.add(c.id);
      if (!c.text || typeof c.text !== "string")
        throw new Error(`Empty text for choice ${c.id} in question ${q.id}`);
    }
    if (!choiceIds.has(q.correctChoiceId)) {
      throw new Error(
        `Question ${q.id} correctChoiceId "${q.correctChoiceId}" is not in choices.`,
      );
    }
    if (!q.explanation || typeof q.explanation !== "string") {
      throw new Error(`Missing explanation for question ${q.id}`);
    }
  }

  return {
    kind: "multiple-choice",
    topicId: parsed.topicId,
    revision: parsed.revision,
    title: parsed.title,
    questions: parsed.questions,
  };
}

export function quizContentHash(content: MultipleChoiceAssessment): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

/** Prepares learner-safe questions that strictly conceal correct answers and explanations before submission. */
export function publicQuiz(quiz: MultipleChoiceAssessment): PublicQuiz {
  return {
    kind: "multiple-choice",
    topicId: quiz.topicId,
    revision: quiz.revision,
    title: quiz.title,
    questions: quiz.questions.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
    })),
  };
}
