"""Sequential local regression checks; exact report references, stop on failure."""
from settings import RUNTIME
import json
import hashlib
import os
from pathlib import Path
import signal
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent


def invoke(script, *args):
    p = subprocess.Popen([sys.executable, str(ROOT / script), *args], cwd=ROOT,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        out, err = p.communicate(timeout=180)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        p.send_signal(signal.SIGTERM)
        try:
            p.communicate(timeout=60)
        except subprocess.TimeoutExpired:
            p.kill()
            p.communicate()
        raise RuntimeError('Regression interrupted or outer deadline reached; inspect remaining probe containers.')
    return p.returncode, out, err


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def validate_fixture_path(path):
    # JSON escaping alone does not protect Cangjie's ${...} interpolation.
    require(not any(c in str(path) for c in '$"\\') and not any(ord(c) < 32 for c in str(path)),
            'Use a Linux checkout path without dollar signs, double quotes, backslashes or control characters.')


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run: sudo python3 regression-check.py')
    validate_fixture_path(ROOT)
    report = {'cases': [], 'passed': False}
    cases = [('guest-hello.cj', 'completed'), ('compile-error.cj', 'compile_nonzero'),
             ('nonzero-exit.cj', 'execute_nonzero'), ('runtime-fault.cj', 'execute_nonzero'),
             ('deadline.cj', 'execute_deadline'), ('output-limit.cj', 'execute_output_limit'),
             ('fs-writable.cj', 'completed'), ('fs-readonly.cj', 'completed'),
             ('fs-host-canary.cj', 'completed'), ('fs-source-readonly.cj', 'completed'),
             ('guest-tasks.cj', 'completed')]
    try:
        folder = ROOT / 'results'
        folder.mkdir(exist_ok=True)
        canary = folder / ('host-canary-' + uuid.uuid4().hex + '.txt')
        canary.write_bytes(b'MCJ-HOST-CANARY-NOT-A-SECRET\n')
        canary.chmod(0o644)
        report['host_canary'] = str(canary)
        for filename, expected in cases:
            record = {'fixture': filename}
            report['cases'].append(record)
            source = ROOT / 'fixtures' / filename
            if filename == 'fs-host-canary.cj':
                source = folder / ('host-isolation-' + uuid.uuid4().hex + '.cj')
                template = (ROOT / 'fixtures' / 'fs-host-canary.cj.in').read_text()
                source.write_text(template.replace('"__HOST_CANARY_PATH__"',
                    json.dumps(str(canary), ensure_ascii=False)))
            if filename == 'fs-source-readonly.cj':
                # Use disposable input, writable even by the sandbox UID. The
                # read-only bind mount must supply the tested write boundary.
                folder = ROOT / 'results'
                folder.mkdir(exist_ok=True)
                source = folder / ('source-write-' + uuid.uuid4().hex + '.cj')
                source.write_bytes((ROOT / 'fixtures' / filename).read_bytes())
                source.chmod(0o666)
                before = source.read_bytes()
                record['source_mode'] = oct(source.stat().st_mode & 0o777)
                record['source_sha256_before'] = hashlib.sha256(before).hexdigest()
                require(record['source_mode'] == '0o666', 'Disposable source must be writable for positive permission control.')
            code, out, err = invoke('runner.py', str(source))
            if filename == 'fs-source-readonly.cj':
                after = source.read_bytes()
                record['source_sha256_after'] = hashlib.sha256(after).hexdigest()
                require(before == after, 'Host source bytes changed.')
            record.update({'runner_exit': code, 'runner_stderr': err[:2000]})
            summary = json.loads(out)
            path = Path(summary['report']).resolve()
            require(path.parent == ROOT / 'results', 'Unexpected report location.')
            record['report'] = str(path)
            data = json.loads(path.read_text())
            require(data['outcome'] == expected, f'{filename}: unexpected outcome {data["outcome"]}; inspect {path}')
            require(code == (0 if expected == 'completed' else 1), 'Unexpected runner exit status.')
            require(data['cleanup_confirmed'] is True, 'Cleanup not confirmed.')
            require(Path(data['source']).resolve() == source.resolve(), 'Source association mismatch.')
            require(data['guest_limits']['stdout'] == '32\n32\n' and data['guest_limits']['exit_code'] == 0, 'Guest limits not observed.')
            config = data['configuration']
            require(config['PidsLimit'] == 256 and config['Runtime'] == RUNTIME and config['NetworkMode'] == 'none' and config['ReadonlyRootfs'], 'Container restrictions changed.')
            require(any(x['Name'] == 'nproc' and x['Soft'] == 32 and x['Hard'] == 32 for x in config['Ulimits']), 'Guest limit not configured.')
            compile_result = data['compile']
            require(compile_result['reason'] == 'exited', 'Compilation hit an unexpected limit.')
            if filename == 'compile-error.cj':
                require(compile_result['exit_code'] != 0 and compile_result['stderr'] and 'execute' not in data, 'Compilation failure evidence missing.')
            else:
                require(compile_result['exit_code'] == 0, 'Compilation failed.')
                result = data['execute']
                require(0 <= result['captured_bytes'] <= 1048576, 'Output capture exceeded cap.')
                stdout, stderr = result['stdout'], result['stderr']
                if expected in ('completed', 'execute_nonzero'):
                    require(result['reason'] == 'exited', 'Unexpected execution termination.')
                if expected == 'completed':
                    require(result['exit_code'] == 0, 'Expected successful fixture exit.')
                if filename == 'guest-hello.cj':
                    require(stdout == 'Hello, World!\n' and not stderr, 'Hello World output mismatch.')
                elif filename == 'guest-tasks.cj':
                    require(stdout == 'tasks=8 total=39999600028\n' and not stderr, 'Concurrent workload output mismatch.')
                elif filename == 'nonzero-exit.cj':
                    require(result['exit_code'] == 7 and stdout == 'intentional-exit-7\n' and not stderr, 'Exit-7 evidence mismatch.')
                elif filename == 'runtime-fault.cj':
                    require(result['exit_code'] > 0 and 'before-bounds-check' in stdout and 'IndexOutOfBoundsException' in stdout + stderr and 'UNEXPECTED' not in stdout + stderr, 'Runtime fault evidence mismatch.')
                elif filename == 'deadline.cj':
                    require(result['reason'] == 'deadline' and result['duration_seconds'] >= 5 and result['captured_bytes'] == 0, 'Deadline evidence mismatch.')
                elif filename == 'output-limit.cj':
                    require(result['reason'] == 'output_limit' and result['captured_bytes'] == 1048576 and sum(len(result[k].encode()) for k in ('stdout', 'stderr')) == 1048576, 'Output-limit evidence mismatch.')
                elif filename == 'fs-writable.cj':
                    require('write-read-ok: /work/mcj-write-probe.txt' in stdout and 'write-read-ok: /tmp/mcj-write-probe.txt' in stdout, 'Task storage evidence missing.')
                elif filename == 'fs-readonly.cj':
                    require('readonly-write-denied' in stdout and 'read-only file system' in stdout.lower() and 'UNEXPECTED' not in stdout, 'Read-only evidence missing.')
                elif filename == 'fs-source-readonly.cj':
                    mounts = config['Mounts']
                    require(len(mounts) == 1 and mounts[0]['Type'] == 'bind'
                        and mounts[0]['Source'] == str(source) and mounts[0]['Target'] == '/input/main.cj'
                        and mounts[0]['ReadOnly'] is True, 'Source read-only bind configuration missing.')
                    require(all(marker in stdout for marker in ('source-read-ok', 'work-source-write-read-ok',
                        'source-write-denied', 'mounted-source-bytes-unchanged'))
                        and 'read-only file system' in stdout.lower() and 'UNEXPECTED' not in stdout
                        and not stderr, 'Source write protection evidence missing.')
                elif filename == 'fs-host-canary.cj':
                    mounts = config['Mounts']
                    require(canary.read_bytes() == b'MCJ-HOST-CANARY-NOT-A-SECRET\n', 'Host canary changed.')
                    require('host-canary-inaccessible' in stdout and 'UNEXPECTED' not in stdout and len(mounts) == 1 and mounts[0]['Source'] == data['source'] and mounts[0]['ReadOnly'], 'Host isolation evidence missing.')
            record['passed'] = True
            print('PASS: main runner / ' + filename, flush=True)
        # These retain their dedicated experimental configurations; they are not
        # evidence that every probe used the main runner's guest limit.
        helpers = [('boundary-check.py', []), ('interruption-check.py', []), ('sequential-check.py', []), ('compile-check.py', []), ('process-check.py', ['--guest-limit']), ('cangjie-guest-check.py', []),
                   ('network-check.py', []), ('storage-check.py', []), ('memory-check.py', [])]
        for script, args in helpers:
            record = {'helper': script, 'args': args}
            report['cases'].append(record)
            code, out, err = invoke(script, *args)
            record.update({'exit': code, 'stdout': out, 'stderr': err[:2000]})
            print(out, end='', flush=True)
            require(code == 0, script + ' failed; inspect its summary above.')
            record['passed'] = True
            print('PASS: dedicated probe / ' + script, flush=True)
        result = subprocess.run(['docker', 'ps', '-aq', '--filter', 'name=mcj-probe-'],
                                capture_output=True, text=True, timeout=20)
        require(result.returncode == 0 and not result.stdout.strip(), 'Probe containers remain or cleanup listing failed.')
        report['passed'] = True
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
        print('FAIL:', report['error'], flush=True)
    finally:
        folder = ROOT / 'results'
        folder.mkdir(exist_ok=True)
        path = folder / ('regression-check-' + uuid.uuid4().hex + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('Regression report:', path)
        print('OVERALL:', 'PASS' if report['passed'] else 'FAIL')
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
