import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
function repositoryRoot(): string {
  let directory = process.env.MCJ_REPO_ROOT ?? process.cwd();
  while (!existsSync(resolve(directory, 'content/coding'))) {
    const parent = resolve(directory, '..');
    if (parent === directory) throw new Error('Set MCJ_REPO_ROOT to the repository checkout.');
    directory = parent;
  }
  return directory;
}
export const root = repositoryRoot();
if (existsSync(resolve(root, '.env'))) loadEnvFile(resolve(root, '.env'));
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing runtime configuration: ${name}`);
  return value;
}
export function developmentIdentityEnabled(): boolean {
  return process.env.MCJ_DEVELOPMENT_IDENTITY === 'true' && ['development', 'test'].includes(process.env.NODE_ENV ?? '');
}
export function localDevelopment(): void {
  if (!developmentIdentityEnabled()) throw new Error('Development identity is unavailable in this environment.');
}
