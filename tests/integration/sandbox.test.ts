import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runSandbox, reconcileSandboxes } from '../../apps/evaluation-worker/src/sandbox.ts';

// These checks require the actual Linux Docker/gVisor/Cangjie host.
describe.skipIf(process.env.MCJ_REAL_SANDBOX !== 'true')('real sandbox adapter', () => {
  const image = process.env.MCJ_EVALUATOR_IMAGE ?? 'sha256:77cf9faa236790dbd636cb41c93c62f3b1a12c3e5e5630b3892eee9ba15b0534';
  const runtime = process.env.MCJ_EVALUATOR_RUNTIME ?? 'runsc-systrap';
  async function run(source: string, inputBase64 = '', signal?: AbortSignal) {
    const leaseDirectory = await mkdtemp(join(tmpdir(), 'mcj-sandbox-test-'));
    let safeToRemoveTestDirectory = false;
    try {
      const result = await runSandbox({ requestId: randomUUID(), generation: 1,
        source, inputBase64, image, runtime, leaseDirectory }, signal);
      safeToRemoveTestDirectory = result.cleanupConfirmed;
      expect(result.cleanupConfirmed).toBe(true);
      expect((await reconcileSandboxes(leaseDirectory)).removed).toEqual([]);
      return result;
    } finally {
      // Preserve recovery evidence/lease identity when container cleanup fails.
      if (safeToRemoveTestDirectory) await rm(leaseDirectory, { recursive: true, force: true });
    }
  }
  it('compiles actual Cangjie and retains exact output bytes', async () => {
    const r = await run('main(): Int64 { println("Hello, World!"); return 0 }');
    expect(r.outcome).toBe('completed');
    expect(Buffer.from(r.stdoutBase64, 'base64')).toEqual(Buffer.from('Hello, World!\n'));
    expect(r.compilerVersion).toContain('1.0.5');
    expect(r.imageId).toMatch(/^sha256:/);
  });
  it('supplies nonempty stdin without changing output bytes', async () => {
    const r = await run('import std.console.*\nmain(): Int64 { println(Console.stdIn.readln() ?? ""); return 0 }', Buffer.from('Cangjie\n').toString('base64'));
    expect(r.outcome).toBe('completed');
    expect(Buffer.from(r.stdoutBase64, 'base64')).toEqual(Buffer.from('Cangjie\n'));
  });
  it('distinguishes compiler rejection from runtime failure', async () => {
    expect((await run('this is not valid Cangjie')).outcome).toBe('compile-failure');
    expect((await run('main(): Int64 { return 7 }')).outcome).toBe('runtime-failure');
  });
  it('stops an executing program at its deadline', async () => {
    expect((await run('main(): Int64 {\n    while (true) {}\n    return 0\n}')).outcome).toBe('timeout');
  });
  it('bounds noisy execution and confirms cleanup', async () => {
    const r = await run('main(): Int64 {\n    while (true) { println("abcdefghijklmnopqrstuvwxyz0123456789") }\n    return 0\n}');
    expect(r.outcome).toBe('output-limit');
    expect(Buffer.from(r.stdoutBase64, 'base64').length).toBeLessThanOrEqual(1024 * 1024);
  });
  it('cleans up an aborted request', async () => {
    const controller = new AbortController();
    controller.abort();
    expect((await run('main(): Int64 { return 0 }', '', controller.signal)).outcome).toBe('interrupted');
  });
});
