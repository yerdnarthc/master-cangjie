"""Readiness-synchronized cooperative signals during compile/execute, then recovery."""
import hashlib
from settings import RUNTIME
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parent


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def docker(*args):
    return subprocess.run(['docker', *args], capture_output=True, text=True, timeout=10)


def main():
    require(os.geteuid() == 0, 'Run as root in the existing Linux prototype.')
    folder = ROOT / 'results'
    folder.mkdir(exist_ok=True)
    report = {'passed': False, 'cases': [], 'runner_sha256': hashlib.sha256(
        (ROOT / 'runner.py').read_bytes()).hexdigest()}

    def run(phase=None, sig=None):
        probe_id = uuid.uuid4().hex
        container = 'mcj-probe-' + probe_id
        source = ROOT / 'fixtures' / ('interrupt-execute.cj' if phase == 'execute' else 'guest-hello.cj')
        record = {'case': phase + '/' + sig.name if phase else 'Hello World recovery',
                  'container': container, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        report['cases'].append(record)
        args = [sys.executable, str(ROOT / 'runner.py'), str(source), '--probe-id', probe_id]
        if phase == 'compile':
            args += ['--compile-probe', 'interrupt']
        child = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            if phase:
                deadline = time.monotonic() + 30
                while True:
                    require(child.poll() is None, 'Runner exited before readiness.')
                    require(time.monotonic() < deadline, 'Readiness deadline reached.')
                    probe = docker('exec', container, '/bin/bash', '-c',
                                   'test "$(cat /tmp/mcj-interrupt-ready 2>/dev/null)" = ready')
                    if probe.returncode == 0:
                        break
                    time.sleep(0.05)
                record['sandbox_ready_before_signal'] = True
                sent = time.monotonic()
                child.send_signal(sig)
            out, err = child.communicate(timeout=90)
            record.update({'runner_exit': child.returncode, 'runner_stderr': err[:2000]})
            if phase:
                record['signal_to_runner_exit_seconds'] = round(time.monotonic() - sent, 3)
            summary = json.loads(out)
            path = Path(summary['report']).resolve()
            require(path == folder / (container + '.json'), 'Unexpected report path.')
            record['report'] = str(path)
            data = json.loads(path.read_text())
            require(data['container'] == container and Path(data['source']).resolve() == source,
                    'Report association mismatch.')
            require(data['compiler_mode'] == ('interrupt' if phase == 'compile' else 'cangjie'),
                    'Compiler mode mismatch.')
            require(data['cleanup_confirmed'] is True, 'Runner cleanup failed.')
            listing = docker('ps', '-aq', '--filter', 'name=^/' + container + '$')
            require(listing.returncode == 0 and not listing.stdout.strip(), 'Container still exists.')
            record['container_absent_without_checker_removal'] = True
            config = data['configuration']
            require(config['Runtime'] == RUNTIME and config['NetworkMode'] == 'none'
                and config['ReadonlyRootfs'] and config['PidsLimit'] == 256
                and data['guest_limits']['stdout'] == '32\n32\n', 'Restrictions changed.')
            if phase:
                require(child.returncode == 1 and data['outcome'] == 'interrupted', 'Not an interrupted outcome.')
                require(data['interruption_signal'] == sig.name and data['interrupted_phase'] == phase,
                        'Wrong signal/phase evidence.')
                require('execute' not in data, 'Interrupted phase must not produce a completed execution result.')
                if phase == 'compile':
                    require('compile' not in data, 'Interrupted compile must not produce a completed result.')
                else:
                    require(data['compile']['reason'] == 'exited' and data['compile']['exit_code'] == 0,
                            'Real compilation did not succeed.')
            else:
                require(child.returncode == 0 and data['outcome'] == 'completed', 'Recovery failed.')
                require(data['compile']['reason'] == 'exited' and data['compile']['exit_code'] == 0,
                        'Recovery compilation failed.')
                result = data['execute']
                require(result['reason'] == 'exited' and result['exit_code'] == 0
                    and result['stdout'] == 'Hello, World!\n' and not result['stderr'], 'Recovery output mismatch.')
            record.update({'passed': True, 'image_id': data['image_id']})
            print(record['case'] + ': PASS', flush=True)
        finally:
            # Fallback may clean a failed probe but never counts as a passing case.
            if child.poll() is None:
                child.send_signal(signal.SIGTERM)
                try:
                    child.communicate(timeout=90)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.communicate()
            listing = docker('ps', '-aq', '--filter', 'name=^/' + container + '$')
            if listing.returncode != 0 or listing.stdout.strip():
                record['checker_cleanup_attempted'] = True
                record['passed'] = False
                removal = docker('rm', '-f', container)
                remaining = docker('ps', '-aq', '--filter', 'name=^/' + container + '$')
                record['fallback_remove_exit'] = removal.returncode
                record['fallback_cleanup_confirmed'] = remaining.returncode == 0 and not remaining.stdout.strip()

    try:
        for phase in ('compile', 'execute'):
            for sig in (signal.SIGINT, signal.SIGTERM):
                run(phase, sig)
                run()
        require(len({c['container'] for c in report['cases']}) == 8, 'Containers must be distinct.')
        require(len({c['image_id'] for c in report['cases']}) == 1, 'Image changed.')
        require(all(c.get('passed') and not c.get('checker_cleanup_attempted') for c in report['cases']),
                'Checker fallback cleanup cannot establish a passing case.')
        report['passed'] = True
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
    finally:
        path = folder / ('interruption-check-' + uuid.uuid4().hex + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'passed': report['passed'], 'report': str(path), 'error': report.get('error')}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
