"""Local Linux-only feasibility probe. Trusted operator input; not a public evaluator."""
import argparse
import base64
from settings import RUNTIME
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import time
import uuid
from orphan_cleanup import lease, reconcile, LABEL, JOB

from settings import IMAGE
CAP = 1024 * 1024


def control(*args):
    p = subprocess.run(['docker', *args], capture_output=True, timeout=20)
    if p.returncode:
        raise RuntimeError(p.stderr.decode(errors='replace')[:4096])
    return p.stdout.decode()


def phase(name, command, seconds):
    """Bound Docker client output and wall time outside the container."""
    started = time.monotonic()
    buffers = {'stdout': bytearray(), 'stderr': bytearray()}
    total = 0
    reason = 'exited'
    p = subprocess.Popen(['docker', 'exec', name, '/bin/bash', '-c', command],
                         stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        with selectors.DefaultSelector() as sel:
            for stream, label in ((p.stdout, 'stdout'), (p.stderr, 'stderr')):
                os.set_blocking(stream.fileno(), False)
                sel.register(stream, selectors.EVENT_READ, label)
            while sel.get_map() or p.poll() is None:
                if time.monotonic() - started >= seconds:
                    reason = 'deadline'
                    break
                for key, _ in sel.select(timeout=0.05):
                    data = os.read(key.fileobj.fileno(), 16384)
                    if not data:
                        sel.unregister(key.fileobj)
                        continue
                    remaining = CAP - total
                    buffers[key.data].extend(data[:remaining])
                    total += min(len(data), remaining)
                    if len(data) > remaining:
                        reason = 'output_limit'
                        break
                if reason != 'exited':
                    break
    finally:
        # Killing docker exec alone does NOT stop the sandbox process.
        # The caller inspects and removes the entire container in its finally block.
        if p.poll() is None:
            p.kill()
        p.wait(timeout=5)
        p.stdout.close()
        p.stderr.close()
    return {'reason': reason, 'exit_code': p.returncode,
            'duration_seconds': round(time.monotonic() - started, 3),
            'captured_bytes': total,
            'stdout_base64': base64.b64encode(buffers['stdout']).decode('ascii'),
            **{key: value.decode(errors='replace') for key, value in buffers.items()}}


def interrupted(signum, frame):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--stdin', type=Path, help='Read-only test input file (maximum 256 KiB).')
    parser.add_argument('--record-compiler-version', action='store_true')
    parser.add_argument('--compile-probe', choices=('deadline', 'output', 'interrupt'),
                        help='Trusted local enforcement probe; substitutes for cjc, never compiler evidence.')
    parser.add_argument('--probe-id', type=uuid.UUID,
                        help='Trusted checker correlation ID for targeted emergency cleanup.')
    parser.add_argument('--credential-canary', type=Path,
                        help='Trusted local host-only dummy canary path; enables access checks.')
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    if not source.is_file() or source.stat().st_size > 256 * 1024:
        parser.error('Provide a source file no larger than 256 KiB.')
    test_input = args.stdin.resolve(strict=True) if args.stdin else None
    if test_input and (not test_input.is_file() or test_input.stat().st_size > 256 * 1024):
        parser.error('Provide an input file no larger than 256 KiB.')
    input_mount = (['--mount', f'type=bind,src={test_input},dst=/input/stdin,readonly']
                   if test_input else [])
    if os.geteuid() != 0:
        parser.error('Run with sudo python3 runner.py SOURCE.')
    name = 'mcj-probe-' + (args.probe_id or uuid.uuid4()).hex
    report = {'container': name, 'source': str(source), 'image': IMAGE,
              'limits': {'compile_seconds': 60, 'execute_seconds': 5,
                         'output_bytes_per_phase': CAP, 'guest_nproc': 32,
                         'host_pids': 256}, 'outcome': 'operational_error'}
    cleanup_ok = False
    job_lease = lease(name.removeprefix('mcj-probe-'))
    report['compiler_mode'] = args.compile_probe or 'cangjie'
    report['stdin_file'] = str(test_input) if test_input else None
    def handle_interrupt(signum, frame):
        report['interruption_signal'] = signal.Signals(signum).name
        interrupted(signum, frame)
    signal.signal(signal.SIGTERM, handle_interrupt)
    signal.signal(signal.SIGINT, handle_interrupt)
    try:
        report['startup_reconciliation'] = reconcile()
        report['image_id'] = control('image', 'inspect', IMAGE, '--format', '{{.Id}}').strip()
        # Create by name first so cleanup can find it even after a startup timeout.
        control('create', '--name', name, '--runtime=' + RUNTIME,
                '--label', LABEL + '=1', '--label', JOB + '=' + name.removeprefix('mcj-probe-'),
                '--ulimit', 'nproc=32:32',
                '--network=none', '--read-only', '--user=10001:10001',
                '--cap-drop=ALL', '--security-opt=no-new-privileges=true',
                '--cpus=1', '--memory=2g', '--memory-swap=2g', '--pids-limit=256',
                '--log-driver=none',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
                '--tmpfs', '/work:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
                '--mount', f'type=bind,src={source},dst=/input/main.cj,readonly',
                *input_mount, IMAGE, '/bin/sleep', 'infinity')
        control('start', name)
        report['configuration'] = json.loads(control('inspect', name))[0]['HostConfig']
        report['guest_limits'] = phase(name, 'ulimit -Su; ulimit -Hu', 5)
        limits = report['guest_limits']
        if limits['reason'] != 'exited' or limits['exit_code'] != 0 or limits['stdout'] != '32\n32\n':
            raise RuntimeError('Guest soft/hard process limits were not verified as 32.')
        def credential_check(stage):
            from credential_probe import command
            result = phase(name, command(str(args.credential_canary)), 5)
            report[stage] = result
            if result['reason'] != 'exited' or result['exit_code'] != 0:
                raise RuntimeError('Credential exposure probe failed: ' + stage)
        if args.credential_canary:
            credential_check('credentials_before_compile')
        if args.record_compiler_version:
            report['compiler_version'] = phase(name,
                'source /opt/cangjie/envsetup.sh; cjc --version', 5)
        compile_command = ('set -e; source /opt/cangjie/envsetup.sh; '
            'cp /input/main.cj /work/main.cj; cd /work; exec cjc main.cj -o program')
        if args.compile_probe == 'deadline':
            compile_command = 'printf "MCJ-COMPILE-DEADLINE\\n" >&2; exec sleep 120'
        elif args.compile_probe == 'output':
            compile_command = ('printf "MCJ-COMPILE-OUTPUT\\n" >&2; '
                'while :; do printf "%4096s" x >&2; done')
        elif args.compile_probe == 'interrupt':
            compile_command = 'printf ready > /tmp/mcj-interrupt-ready; exec sleep 120'
        report['active_phase'] = 'compile'
        compile_result = phase(name, compile_command, 60)
        report['compile'] = compile_result
        if compile_result['reason'] != 'exited':
            report['outcome'] = 'compile_' + compile_result['reason']
        elif compile_result['exit_code'] != 0:
            report['outcome'] = 'compile_nonzero'
        else:
            if args.credential_canary:
                credential_check('credentials_before_execute')
            report['active_phase'] = 'execute'
            result = phase(name,
                'source /opt/cangjie/envsetup.sh; cd /work; exec ./program < ' +
                ('/input/stdin' if test_input else '/dev/null'), 5)
            report['execute'] = result
            report['outcome'] = ('execute_' + result['reason']
                if result['reason'] != 'exited' else
                'completed' if result['exit_code'] == 0 else 'execute_nonzero')
    except KeyboardInterrupt:
        report['outcome'] = 'interrupted'
        report['interrupted_phase'] = report.get('active_phase', 'setup')
    except Exception as exc:
        report['error'] = str(exc)[:4096]
    finally:
        # Finish bounded cleanup even if another terminal/outer signal arrives.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        try:
            report['container_state'] = json.loads(control('inspect', name))[0]['State']
        except Exception as exc:
            report['inspect_error'] = str(exc)[:4096]
        try:
            control('rm', '-f', name)
            cleanup_ok = True
        except Exception as exc:
            # A failure before container creation may leave nothing to remove.
            try:
                matches = control('ps', '-aq', '--filter', f'name=^/{name}$').strip()
                cleanup_ok = not matches
            except Exception:
                cleanup_ok = False
            report['cleanup_detail'] = str(exc)[:4096]
        report['cleanup_confirmed'] = cleanup_ok
        job_lease.close()
        folder = Path(__file__).resolve().parent / 'results'
        folder.mkdir(exist_ok=True)
        output = folder / (name + '.json')
        output.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'outcome': report['outcome'], 'cleanup_confirmed': cleanup_ok,
                          'report': str(output)}, indent=2))
        if not cleanup_ok:
            print('CLEANUP FAILED. Run: sudo docker rm -f ' + name)
    return 0 if cleanup_ok and report['outcome'] == 'completed' else 1


if __name__ == '__main__':
    raise SystemExit(main())
