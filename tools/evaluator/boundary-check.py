"""Bounded orphan recovery and harmless credential-canary evidence."""
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
from credential_probe import KEYS, command
from orphan_cleanup import docker, reconcile

ROOT = Path(__file__).resolve().parent


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def main():
    require(os.geteuid() == 0, 'Run as root in the existing Linux prototype.')
    identity = 'boundary-check-' + uuid.uuid4().hex
    folder = ROOT / 'results' / identity
    folder.mkdir(parents=True)
    report = {'passed': False, 'runner_sha256': hashlib.sha256((ROOT / 'runner.py').read_bytes()).hexdigest()}
    children, names = [], []

    def start(args=(), env=None):
        job = uuid.uuid4().hex
        name = 'mcj-probe-' + job
        names.append(name)
        with (folder / (job + '.stdout')).open('w') as out, (folder / (job + '.stderr')).open('w') as err:
            child = subprocess.Popen([sys.executable, str(ROOT / 'runner.py'),
                str(ROOT / 'fixtures' / 'guest-hello.cj'), '--probe-id', job, *args],
                stdout=out, stderr=err, env=env)
        children.append(child)
        return child, name

    def ready(child, name):
        until = time.monotonic() + 30
        while time.monotonic() < until:
            require(child.poll() is None, 'Runner exited before readiness.')
            p = subprocess.run(['docker', 'exec', name, '/bin/bash', '-c',
                'test "$(cat /tmp/mcj-interrupt-ready 2>/dev/null)" = ready'], capture_output=True, timeout=5)
            if p.returncode == 0:
                return
            time.sleep(0.05)
        raise RuntimeError('Readiness deadline reached.')

    def result(child, name):
        code = child.wait(timeout=90)
        path = ROOT / 'results' / (name + '.json')
        data = json.loads(path.read_text())
        require(data['container'] == name and data['cleanup_confirmed'], 'Bad report/cleanup.')
        require(not docker('ps', '-aq', '--filter', 'name=^/' + name + '$').strip(), 'Container remains.')
        return code, data, str(path)

    try:
        active, active_name = start(('--compile-probe', 'interrupt'))
        ready(active, active_name)
        dead, dead_name = start(('--compile-probe', 'interrupt'))
        ready(dead, dead_name)
        dead.send_signal(signal.SIGKILL)
        require(dead.wait(timeout=5) == -signal.SIGKILL, 'Runner not hard-killed.')
        orphan = json.loads(docker('inspect', dead_name))[0]
        require(orphan['State']['Running'], 'No live orphan established.')
        require(not (ROOT / 'results' / (dead_name + '.json')).exists(), 'Killed runner unexpectedly finalized.')
        active_id = json.loads(docker('inspect', active_name))[0]['Id']
        began = time.monotonic()
        recovery, recovery_name = start()
        code, data, path = result(recovery, recovery_name)
        require(code == 0 and data['outcome'] == 'completed'
            and data['execute']['stdout'] == 'Hello, World!\n', 'Recovery failed.')
        cleanup = data['startup_reconciliation']
        report['reconciliation'] = cleanup
        require(orphan['Id'] in cleanup['removed'] and active_id in cleanup['active'], 'Reconciliation selection wrong.')
        require(json.loads(docker('inspect', active_name))[0]['State']['Running']
            and active.poll() is None, 'Active job removed.')
        require(not docker('ps', '-aq', '--filter', 'id=' + orphan['Id']).strip(), 'Orphan remains.')
        again = reconcile()
        require(not again['removed'] and active_id in again['active'], 'Reconciliation not idempotent.')
        report.update({'orphan_container': orphan['Id'], 'orphan_recovery_report': path,
                       'reconciliation': cleanup, 'second_reconciliation': again,
                       'recovery_seconds': round(time.monotonic() - began, 3)})
        require(report['recovery_seconds'] < 30, 'Local recovery exceeded 30 seconds.')
        active.send_signal(signal.SIGTERM)
        active_code, active_data, active_path = result(active, active_name)
        require(active_code == 1 and active_data['outcome'] == 'interrupted', 'Active control cleanup failed.')
        report['active_control_report'] = active_path
        print('orphan cleanup and recovery: PASS', flush=True)

        canary = folder / 'host-only-canary.txt'
        payload = 'MCJ-DUMMY-NOT-A-SECRET-' + uuid.uuid4().hex
        canary.write_text(payload)
        canary.chmod(0o644)
        require(canary.read_text() == payload, 'Host canary missing.')
        env = os.environ.copy()
        env.update({key: payload for key in KEYS})
        child, name = start(('--credential-canary', str(canary)), env)
        code, data, path = result(child, name)
        require(code == 0 and data['outcome'] == 'completed'
            and data['execute']['stdout'] == 'Hello, World!\n', 'Credential check/recovery failed.')
        for stage in ('credentials_before_compile', 'credentials_before_execute'):
            require(data[stage]['reason'] == 'exited' and data[stage]['exit_code'] == 0
                and data[stage]['stdout'] == 'credential-boundary-ok\n', 'Credential boundary failed.')
        mounts = data['configuration']['Mounts']
        require(len(mounts) == 1 and mounts[0]['ReadOnly'] and mounts[0]['Target'] == '/input/main.cj', 'Unexpected mounts.')
        image = json.loads(docker('image', 'inspect', data['image_id']))[0]
        image_env = image['Config'].get('Env') or []
        require(not any(value.split('=', 1)[0] in KEYS or payload in value for value in image_env), 'Credential key baked into image.')
        report.update({'credential_report': path, 'image_id': data['image_id'],
                       'image_environment_keys': [value.split('=', 1)[0] for value in image_env]})
        controls = []
        for kind, expected in (('environment', 21), ('file', 22)):
            control_name = 'mcj-probe-' + uuid.uuid4().hex
            names.append(control_name)
            args = ['create', '--name', control_name, '--runtime=' + RUNTIME, '--network=none',
                    '--read-only', '--user=10001:10001', '--cap-drop=ALL', '--security-opt=no-new-privileges=true',
                    '--memory=2g', '--memory-swap=2g', '--pids-limit=256', '--ulimit', 'nproc=32:32', '--log-driver=none']
            if kind == 'environment':
                args += ['--env', KEYS[0] + '=' + payload]
            else:
                args += ['--mount', f'type=bind,src={canary},dst={canary},readonly']
            docker(*args, data['image_id'], '/bin/bash', '-c', command(str(canary)))
            # A deliberately rejected probe may propagate a nonzero client status.
            subprocess.run(['docker', 'start', '-a', control_name], capture_output=True, timeout=20)
            state = json.loads(docker('inspect', control_name))[0]['State']
            require(not state['Running'] and state['ExitCode'] == expected, 'Exposure sensitivity control failed.')
            docker('rm', '-f', control_name)
            require(not docker('ps', '-aq', '--filter', 'name=^/' + control_name + '$').strip(), 'Control cleanup failed.')
            controls.append({'kind': kind, 'exit': state['ExitCode'], 'cleanup_confirmed': True})
        report['sensitivity_controls'] = controls
        print('credential exposure and sensitivity controls: PASS', flush=True)
        report['passed'] = True
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
    finally:
        for child in children:
            if child.poll() is None:
                child.send_signal(signal.SIGTERM)
                try:
                    child.wait(timeout=70)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait(timeout=5)
        for name in names:
            try:
                if docker('ps', '-aq', '--filter', 'name=^/' + name + '$').strip():
                    report['passed'] = False
                    report.setdefault('fallback_cleanup', []).append(name)
                    docker('rm', '-f', name)
            except Exception as exc:
                report['passed'] = False
                report['cleanup_error'] = str(exc)
        path = ROOT / 'results' / (identity + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'passed': report['passed'], 'report': str(path), 'error': report.get('error')}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
