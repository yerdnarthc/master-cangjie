import type pg from "pg";

export type CaseDefinition = {
  id: string;
  visibility: "visible" | "hidden";
  inputBase64: string;
  expectedBase64: string;
};
export type CodingAssessment = {
  kind?: "coding";
  topicId: string;
  revision: number;
  problemId: string;
  title: string;
  statement: string;
  starter: string;
  languageVersion: "1.0.5";
  requirements: unknown[];
  tests: CaseDefinition[];
};

export type Choice = { id: string; text: string };
export type Question = {
  id: string;
  prompt: string;
  choices: Choice[];
  correctChoiceId: string;
  explanation: string;
};

export type MultipleChoiceAssessment = {
  kind: "multiple-choice";
  topicId: string;
  revision: number;
  title: string;
  questions: Question[];
};

export type Assessment = CodingAssessment;
export type AnyAssessment = CodingAssessment | MultipleChoiceAssessment;

export const HELLO_TOPIC = "running-the-first-cangjie-program";
export const HELLO_PROBLEM = `${HELLO_TOPIC}/hello-world`;

export async function assessmentFor<T extends AnyAssessment = CodingAssessment>(
  client: pg.Pool | pg.PoolClient,
  topicId: string = HELLO_TOPIC,
  revision?: number,
): Promise<T> {
  const result = await client.query(
    "SELECT definition FROM assessment_revisions WHERE topic_id=$1 AND revision=COALESCE($2,(SELECT current_revision FROM topics WHERE id=$1))",
    [topicId, revision ?? null],
  );
  if (!result.rowCount) throw new Error("Published assessment is unavailable.");
  return result.rows[0].definition as T;
}
