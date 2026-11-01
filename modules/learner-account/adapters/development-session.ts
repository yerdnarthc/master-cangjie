import { createHmac, timingSafeEqual } from 'node:crypto';
import { localDevelopment, requireEnv } from '../../../infrastructure/runtime/config.ts';
import { OperationError, type Actor } from '../application/actor.ts';
export const LEARNER = '10000000-0000-4000-8000-000000000001';
export const OTHER_LEARNER = '10000000-0000-4000-8000-000000000002';
const signature = (value: string) => {
  const secret = requireEnv('MCJ_SESSION_SECRET');
  if (secret.length < 32) throw new Error('Session secret must have at least 32 characters.');
  return createHmac('sha256', secret).update(value).digest('hex');
};
export function issueDevelopmentSession(now = Date.now()): string {
  localDevelopment();
  const payload = `${LEARNER}.${now + 8 * 60 * 60 * 1000}`;
  return `${payload}.${signature(payload)}`;
}
export function actorFromSession(value: string | undefined): Actor {
  localDevelopment();
  if (!value) throw new OperationError(401, 'Sign in to continue.');
  const [id, expires, mac] = value.split('.');
  if (id !== LEARNER || !/^\d+$/.test(expires ?? '') || Number(expires) <= Date.now() || !/^[a-f0-9]{64}$/.test(mac ?? '')) throw new OperationError(401, 'Your session has expired.');
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(signature(`${id}.${expires}`)))) throw new OperationError(401, 'Invalid session.');
  return { learnerId: id };
}
