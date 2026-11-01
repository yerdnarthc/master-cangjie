import { spawn, spawnSync } from 'node:child_process';
import { closeSync, constants, openSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join } from 'node:path';

export type SandboxInput = {
  requestId: string; generation: number; source: string; inputBase64: string;
  image: string; runtime: string; leaseDirectory: string;
};
export type SandboxEvidence = {
  outcome: 'completed' | 'compile-failure' | 'runtime-failure' | 'timeout' |
    'output-limit' | 'operational-error' | 'interrupted';
  stdoutBase64: string; diagnostics: string; cleanupConfirmed: boolean;
  compilerVersion: string; imageId: string;
};
type Phase = { reason: 'exited' | 'timeout' | 'output-limit' | 'interrupted' | 'spawn-error';
  code: number | null; stdout: Buffer; stderr: Buffer };
const CAP = 1024 * 1024;
const OWNER = 'io.mastercangjie.integration';
const JOB = 'io.mastercangjie.sandbox';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX = /^[0-9a-f]{32}$/;
const envsetup = 'source /opt/cangjie/envsetup.sh; ';

/** Only Docker's client is killed here; the enclosing sandbox is always removed in finally. */
function command(args: string[], milliseconds: number, signal?: AbortSignal): Promise<Phase> {
  if (signal?.aborted) return Promise.resolve({ reason: 'interrupted', code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) });
  return new Promise((resolve) => {
    let reason: Phase['reason'] = 'exited';
    let total = 0;
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = (why: Phase['reason']) => { if (reason === 'exited') reason = why; child.kill('SIGKILL'); };
    const timer = setTimeout(() => stop('timeout'), milliseconds);
    const abort = () => stop('interrupted');
    signal?.addEventListener('abort', abort, { once: true });
    let spawnError: Error | undefined;
    const collect = (target: Buffer[], chunk: Buffer) => {
      const remaining = CAP - total;
      target.push(chunk.subarray(0, remaining));
      total += Math.min(remaining, chunk.length);
      if (chunk.length > remaining) stop('output-limit');
    };
    child.stdout.on('data', (chunk: Buffer) => collect(stdout, chunk));
    child.stderr.on('data', (chunk: Buffer) => collect(stderr, chunk));
    child.on('error', (error) => { spawnError = error; reason = 'spawn-error'; });
    child.on('close', (code) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (spawnError && total < CAP) stderr.push(Buffer.from(spawnError.message).subarray(0, CAP - total));
      resolve({ reason, code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) });
    });
  });
}

async function docker(args: string[]): Promise<string> {
  const result = await command(args, 20000);
  if (result.reason !== 'exited' || result.code !== 0) {
    throw new Error(`Docker control failed (${result.reason}): ${result.stderr.toString('utf8').slice(0, 2000)}`);
  }
  return result.stdout.toString('utf8');
}

function lock(path: string, create: boolean): number | null {
  // The child locks its inherited descriptor 3. Parent and child share the open
  // file description, so the lock remains held by the parent descriptor afterward.
  const fd = openSync(path, constants.O_RDWR | constants.O_NOFOLLOW | (create ? constants.O_CREAT : 0), 0o600);
  const result = spawnSync('flock', ['-n', '3'], { stdio: ['ignore', 'pipe', 'pipe', fd], timeout: 5000 });
  if (result.status === 0) return fd;
  closeSync(fd);
  if (result.status === 1) return null;
  throw new Error('Could not establish a host flock lease.');
}

export async function reconcileSandboxes(leaseDirectory: string): Promise<{ removed: string[]; active: string[]; refused: string[] }> {
  if (process.platform !== 'linux') throw new Error('Sandbox reconciliation requires Linux.');
  await mkdir(leaseDirectory, { recursive: true, mode: 0o700 });
  const result = { removed: [] as string[], active: [] as string[], refused: [] as string[] };
  const ids = (await docker(['ps', '-aq', '--no-trunc', '--filter', `label=${OWNER}=1`])).split(/\s+/).filter(Boolean);
  for (const id of ids) {
    let data;
    try { data = JSON.parse(await docker(['inspect', id]))[0]; }
    catch (error) {
      if (!(await docker(['ps', '-aq', '--filter', `id=${id}`])).trim()) continue;
      throw error;
    }
    const job: string = data.Config?.Labels?.[JOB] ?? '';
    const path = join(leaseDirectory, job + '.lock');
    const valid = HEX.test(job) && data.Name === '/mcj-eval-' + job;
    if (!valid || !(await stat(path).catch(() => null))?.isFile()) { result.refused.push(id); continue; }
    const fd = lock(path, false);
    if (fd === null) { result.active.push(id); continue; }
    try {
      if (!(await docker(['ps', '-aq', '--filter', `id=${id}`])).trim()) continue;
      try { await docker(['rm', '-f', id]); }
      catch (error) {
        if ((await docker(['ps', '-aq', '--filter', `id=${id}`])).trim()) throw error;
      }
      if ((await docker(['ps', '-aq', '--filter', `id=${id}`])).trim()) throw new Error('Orphan cleanup not confirmed.');
      // The UUID was validated above; never derive a host deletion target from
      // an unvalidated container path or mount representation.
      await rm(join(leaseDirectory, job + '.source'), { recursive: true, force: true });
      result.removed.push(id);
    } finally { closeSync(fd); }
  }
  return result;
}

export async function runSandbox(input: SandboxInput, signal?: AbortSignal): Promise<SandboxEvidence> {
  const evidence: SandboxEvidence = { outcome: 'operational-error', stdoutBase64: '', diagnostics: '',
    cleanupConfirmed: false, compilerVersion: '', imageId: '' };
  let leaseFd: number | undefined;
  let folder: string | undefined;
  let containerMayExist = false;
  const job = randomUUID().replaceAll('-', '');
  const name = 'mcj-eval-' + job;
  try {
    if (process.platform !== 'linux') throw new Error('Sandbox execution requires Linux.');
    if (!UUID.test(input.requestId) || !Number.isSafeInteger(input.generation) || input.generation < 1) throw new Error('Invalid request identity.');
    if (!input.image || !input.runtime || !isAbsolute(input.leaseDirectory) || /[,\n\r]/.test(input.leaseDirectory)) throw new Error('Invalid sandbox configuration.');
    const source = Buffer.from(input.source, 'utf8');
    const stdin = Buffer.from(input.inputBase64, 'base64');
    if (stdin.toString('base64') !== input.inputBase64 || source.length > 256 * 1024 || stdin.length > 256 * 1024) throw new Error('Invalid or oversized execution payload.');
    await mkdir(input.leaseDirectory, { recursive: true, mode: 0o700 });
    const fd = lock(join(input.leaseDirectory, job + '.lock'), true);
    if (fd === null) throw new Error('Fresh sandbox lease unexpectedly active.');
    leaseFd = fd;
    if (signal?.aborted) { evidence.outcome = 'interrupted'; return evidence; }
    await reconcileSandboxes(input.leaseDirectory);
    evidence.imageId = (await docker(['image', 'inspect', input.image, '--format', '{{.Id}}'])).trim();
    folder = join(input.leaseDirectory, job + '.source');
    await mkdir(folder, { mode: 0o700 });
    await writeFile(join(folder, 'main.cj'), source, { mode: 0o644 });
    await writeFile(join(folder, 'stdin'), stdin, { mode: 0o644 });
    containerMayExist = true;
    await docker(['create', '--name', name, '--runtime=' + input.runtime,
      '--label', OWNER + '=1', '--label', JOB + '=' + job,
      '--label', 'io.mastercangjie.request=' + input.requestId,
      '--label', 'io.mastercangjie.generation=' + input.generation,
      '--ulimit', 'nproc=32:32', '--network=none', '--read-only', '--user=10001:10001',
      '--cap-drop=ALL', '--security-opt=no-new-privileges=true', '--cpus=1', '--memory=2g',
      '--memory-swap=2g', '--pids-limit=256', '--log-driver=none',
      '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
      '--tmpfs', '/work:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
      '--mount', `type=bind,src=${join(folder, 'main.cj')},dst=/input/main.cj,readonly`,
      '--mount', `type=bind,src=${join(folder, 'stdin')},dst=/input/stdin,readonly`,
      evidence.imageId, '/bin/sleep', 'infinity']);
    await docker(['start', name]);
    const limits = await command(['exec', name, '/bin/bash', '-c', 'ulimit -Su; ulimit -Hu'], 5000, signal);
    if (limits.reason === 'interrupted') { evidence.outcome = 'interrupted'; return evidence; }
    if (limits.reason !== 'exited' || limits.code !== 0 || limits.stdout.toString() !== '32\n32\n') throw new Error('Guest process limits were not confirmed.');
    const version = await command(['exec', name, '/bin/bash', '-c', envsetup + 'cjc --version'], 5000, signal);
    if (version.reason === 'interrupted') { evidence.outcome = 'interrupted'; return evidence; }
    evidence.compilerVersion = Buffer.concat([version.stdout, version.stderr]).toString('utf8');
    if (version.reason !== 'exited' || version.code !== 0 || !/Cangjie Compiler:\s*1\.0\.5(?![\d.])/.test(evidence.compilerVersion)) throw new Error('Required Cangjie 1.0.5 compiler not confirmed.');
    const compile = await command(['exec', name, '/bin/bash', '-c', 'set -e; ' + envsetup +
      'cp /input/main.cj /work/main.cj; cd /work; exec cjc main.cj -o program'], 60000, signal);
    evidence.diagnostics = Buffer.concat([compile.stdout, compile.stderr]).toString('utf8');
    if (compile.reason !== 'exited') {
      evidence.outcome = compile.reason === 'spawn-error' ? 'operational-error' : compile.reason;
      return evidence;
    }
    const compileState = JSON.parse(await docker(['inspect', name]))[0].State;
    if (!compileState.Running || compileState.Error) throw new Error('Sandbox stopped unexpectedly during compilation.');
    if (compile.code !== 0) { evidence.outcome = 'compile-failure'; return evidence; }
    const execute = await command(['exec', name, '/bin/bash', '-c', envsetup + 'cd /work; exec ./program < /input/stdin'], 5000, signal);
    evidence.stdoutBase64 = execute.stdout.toString('base64');
    // Keep diagnostics bounded across compilation warnings plus execution stderr.
    evidence.diagnostics = Buffer.concat([Buffer.from(evidence.diagnostics), execute.stderr]).subarray(0, CAP).toString('utf8');
    if (execute.reason === 'exited') {
      const executeState = JSON.parse(await docker(['inspect', name]))[0].State;
      if (!executeState.Running || executeState.Error) throw new Error('Sandbox stopped unexpectedly during execution.');
    }
    evidence.outcome = execute.reason === 'exited' ? (execute.code === 0 ? 'completed' : 'runtime-failure') :
      execute.reason === 'spawn-error' ? 'operational-error' : execute.reason;
  } catch (error) {
    evidence.outcome = signal?.aborted ? 'interrupted' : 'operational-error';
    evidence.diagnostics = (error instanceof Error ? error.message : 'Sandbox operation failed.').slice(0, 4096);
  } finally {
    try {
      if (containerMayExist) {
        try { await docker(['rm', '-f', name]); }
        catch (error) {
          if ((await docker(['ps', '-aq', '--filter', `name=^/${name}$`])).trim()) throw error;
        }
        if ((await docker(['ps', '-aq', '--filter', `name=^/${name}$`])).trim()) throw new Error('Sandbox removal not confirmed.');
      }
      evidence.cleanupConfirmed = true;
    } catch {
      evidence.cleanupConfirmed = false;
      evidence.outcome = 'operational-error';
      evidence.diagnostics = 'Sandbox cleanup could not be confirmed.';
    }
    if (folder && evidence.cleanupConfirmed) await rm(folder, { recursive: true, force: true }).catch(() => undefined);
    if (leaseFd !== undefined) closeSync(leaseFd);
    // Retain lease inode files permanently; unlinking live lock files is unsafe.
  }
  return evidence;
}
