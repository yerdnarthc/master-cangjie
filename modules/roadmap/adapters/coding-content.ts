import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { root } from "../../../infrastructure/runtime/config.ts";
import type {
  CaseDefinition,
  CodingProblem,
  CodingAssessment,
  AnyAssessment,
} from "../application/content.ts";

export const CODING_TOPIC_PROBLEMS: Record<string, string[]> = {
  "running-the-first-cangjie-program": ["hello-world"],
  "program-structure": [
    "program-card",
    "update-session-status",
    "global-and-local-labels",
  ],
  expressions: [
    "score-band",
    "smaller-value",
    "countdown",
    "run-at-least-once",
    "sum-the-interval",
    "skip-and-stop",
  ],
  functions: [
    "return-a-message",
    "moon-crew-snacks",
    "subtract-two-values",
  ],
};

export async function readProblem(
  topicSlug: string,
  problemSlug: string,
): Promise<CodingProblem> {
  const dir = resolve(root, "content/coding", topicSlug, problemSlug);
  const problemMd = await readFile(resolve(dir, "problem.md"), "utf8");
  const starterCj = await readFile(resolve(dir, "starter.cj"), "utf8");
  const assessmentMd = await readFile(resolve(dir, "assessment.md"), "utf8");

  const titleMatch = problemMd.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : problemSlug;

  const revMatch = assessmentMd.match(/Assessment revision:\s*(\d+)/i);
  const revision = revMatch ? parseInt(revMatch[1], 10) : 1;

  // Parse test inventory table from assessment.md
  // Format: | case-01 | Visible | tests/case-01.in | tests/case-01.out | ...
  const testTableRegex = /\|\s*(case-\d+)\s*\|\s*(Visible|Hidden)\s*\|/gi;
  const tests: CaseDefinition[] = [];
  let match;
  while ((match = testTableRegex.exec(assessmentMd)) !== null) {
    const id = match[1];
    const visibility = match[2].toLowerCase() as "visible" | "hidden";
    const inBuf = await readFile(resolve(dir, "tests", `${id}.in`));
    const outBuf = await readFile(resolve(dir, "tests", `${id}.out`));
    tests.push({
      id,
      visibility,
      inputBase64: inBuf.toString("base64"),
      expectedBase64: outBuf.toString("base64"),
    });
  }

  return {
    problemId: `${topicSlug}/${problemSlug}`,
    slug: problemSlug,
    topicId: topicSlug,
    revision,
    title,
    statement: problemMd,
    starter: starterCj,
    languageVersion: "1.0.5",
    requirements: [],
    tests,
  };
}

export async function readTopicCodingAssessment(
  topicSlug: string,
): Promise<CodingAssessment> {
  const problemSlugs = CODING_TOPIC_PROBLEMS[topicSlug];
  if (!problemSlugs || !problemSlugs.length) {
    throw new Error(`Unknown coding topic: ${topicSlug}`);
  }

  const problems = await Promise.all(
    problemSlugs.map((slug) => readProblem(topicSlug, slug)),
  );

  const firstProblem = problems[0];

  const assessment: CodingAssessment = {
    kind: "coding",
    topicId: topicSlug,
    revision: 1,
    problems,
    // Provide top-level fields for backwards compatibility with single-problem Hello World
    problemId: firstProblem.problemId,
    title: firstProblem.title,
    statement: firstProblem.statement,
    starter: firstProblem.starter,
    languageVersion: "1.0.5",
    requirements: [],
    tests: firstProblem.tests,
  };

  return assessment;
}

export function contentHash(content: AnyAssessment | unknown): string {
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export function publicProblem(content: CodingProblem) {
  return {
    topicId: content.topicId,
    revision: content.revision,
    problemId: content.problemId,
    slug: content.slug,
    title: content.title,
    statement: content.statement,
    starter: content.starter,
    languageVersion: content.languageVersion,
    tests: content.tests.map((c) =>
      c.visibility === "visible"
        ? {
            id: c.id,
            visibility: c.visibility,
            input: Buffer.from(c.inputBase64, "base64").toString("utf8"),
            expected: Buffer.from(c.expectedBase64, "base64").toString("utf8"),
          }
        : { id: c.id, visibility: c.visibility },
    ),
  };
}
