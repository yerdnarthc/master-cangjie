import { describe, it, expect } from 'vitest';
import { readHelloWorld, publicProblem } from '../../modules/roadmap/adapters/hello-world-content.ts';
import { actorFromSession, issueDevelopmentSession } from '../../modules/learner-account/adapters/development-session.ts';

describe('content and authenticated development actor', () => {
  it('imports exact approved bytes and exposes only the learner problem', async () => {
    const content = await readHelloWorld();
    expect(content.tests).toHaveLength(1);
    expect(Buffer.from(content.tests[0].inputBase64, 'base64').length).toBe(0);
    expect(Buffer.from(content.tests[0].expectedBase64, 'base64')).toEqual(Buffer.from('Hello, World!\n'));
    expect(content.requirements).toEqual([]);
    const publicData = publicProblem(content);
    expect(publicData).not.toHaveProperty('reference');
    expect(publicData).not.toHaveProperty('assessment');
  });

  it('requires a session and rejects deployed development identity', () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = 'test';
    env.MCJ_DEVELOPMENT_IDENTITY = 'true';
    env.MCJ_SESSION_SECRET = 'test-only-secret-with-at-least-thirty-two-characters';
    expect(() => actorFromSession(undefined)).toThrow('Sign in');
    expect(actorFromSession(issueDevelopmentSession()).learnerId).toBe('10000000-0000-4000-8000-000000000001');
    env.NODE_ENV = 'production';
    expect(() => issueDevelopmentSession()).toThrow('unavailable');
    env.NODE_ENV = 'test';
  });
});
