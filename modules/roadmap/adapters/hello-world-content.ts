import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { root } from '../../../infrastructure/runtime/config.ts';
import { HELLO_PROBLEM, HELLO_TOPIC, type Assessment } from '../application/content.ts';

export async function readHelloWorld(): Promise<Assessment> {
  const folder = resolve(root, 'content/coding', HELLO_PROBLEM);
  const [statement, starter, input, expected] = await Promise.all([
    readFile(resolve(folder, 'problem.md'), 'utf8'), readFile(resolve(folder, 'starter.cj'), 'utf8'),
    readFile(resolve(folder, 'tests/case-01.in')), readFile(resolve(folder, 'tests/case-01.out'))
  ]);
  if (input.length || !expected.equals(Buffer.from('Hello, World!\n'))) throw new Error('Hello World bytes differ from its approved single-case contract.');
  return { topicId: HELLO_TOPIC, revision: 1, problemId: HELLO_PROBLEM, title: 'Hello, World!',
    statement, starter, languageVersion: '1.0.5', requirements: [],
    tests: [{ id: 'case-01', visibility: 'visible', inputBase64: input.toString('base64'), expectedBase64: expected.toString('base64') }] };
}
export function contentHash(content: Assessment): string { return createHash('sha256').update(JSON.stringify(content)).digest('hex'); }
export function publicProblem(content: Assessment) {
  return { topicId: content.topicId, revision: content.revision, problemId: content.problemId, title: content.title,
    statement: content.statement, starter: content.starter, languageVersion: content.languageVersion,
    tests: content.tests.map(c => c.visibility === 'visible' ? { id: c.id, visibility: c.visibility,
      input: Buffer.from(c.inputBase64, 'base64').toString('utf8'), expected: Buffer.from(c.expectedBase64, 'base64').toString('utf8') } : { id: c.id, visibility: c.visibility }) };
}
