"""Selected Cangjie compatibility under guest NPROC=32; main runner unchanged."""
from settings import RUNTIME
import json
import os
from pathlib import Path
import signal
import threading
import uuid
from runner import IMAGE, control, phase, interrupted


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run: sudo python3 cangjie-guest-check.py')
    signal.signal(signal.SIGTERM, interrupted)
    name = 'mcj-probe-cjguest-' + uuid.uuid4().hex
    report = {'container': name, 'phases': {}, 'checks': {}, 'cleanup_confirmed': False}
    stop = threading.Event()
    monitor = None
    samples = []
    try:
        folder = Path(__file__).resolve().parent / 'fixtures'
        mounts = []
        for fixture in ('guest-hello.cj', 'guest-tasks.cj'):
            source = folder / fixture
            if not source.is_file():
                raise RuntimeError('Missing fixture: ' + str(source))
            mounts += ['--mount', f'type=bind,src={source},dst=/input/{fixture},readonly']
        report['image_id'] = control('image', 'inspect', IMAGE, '--format', '{{.Id}}').strip()
        control('create', '--name', name, '--runtime=' + RUNTIME, '--network=none',
                '--ulimit', 'nproc=32:32', '--read-only', '--user=10001:10001',
                '--cap-drop=ALL', '--security-opt=no-new-privileges=true',
                '--cpus=1', '--memory=2g', '--memory-swap=2g', '--pids-limit=256',
                '--log-driver=none', '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
                '--tmpfs', '/work:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
                *mounts, IMAGE, '/bin/sleep', 'infinity')
        control('start', name)
        info = json.loads(control('inspect', name))[0]
        report['configuration'] = info['HostConfig']
        membership = next(line.split(':', 2)[2] for line in
            Path(f"/proc/{info['State']['Pid']}/cgroup").read_text().splitlines() if line.startswith('0::'))
        root = Path('/sys/fs/cgroup').resolve()
        group = (root / membership.lstrip('/')).resolve()
        if root not in group.parents or (group / 'pids.max').read_text().strip() != '256' or (group / 'memory.max').read_text().strip() != str(2 * 1024**3):
            raise RuntimeError('Host PID/memory limits not verified; compilation skipped.')

        def snapshot():
            sample = {'pids': int((group / 'pids.current').read_text()),
                      'pid_events': dict((k, int(v)) for k, v in
                          (line.split() for line in (group / 'pids.events').read_text().splitlines())),
                      'memory_events': dict((k, int(v)) for k, v in
                          (line.split() for line in (group / 'memory.events').read_text().splitlines()))}
            samples.append(sample)

        snapshot()

        def watch():
            while not stop.wait(0.01):
                try:
                    snapshot()
                    if len(samples) > 4000:
                        del samples[1:2001]
                except OSError:
                    break

        monitor = threading.Thread(target=watch, daemon=True)
        monitor.start()

        def run(label, command, seconds, expected=None):
            result = phase(name, command, seconds)
            report['phases'][label] = result
            ok = result['reason'] == 'exited' and result['exit_code'] == 0
            if expected is not None:
                ok = ok and result['stdout'] == expected
            report['checks'][label] = ok
            if not ok:
                raise RuntimeError(label + ' failed; remaining phases skipped.')
            return result

        run('guest soft/hard limits are 32', 'ulimit -Su; ulimit -Hu', 5, '32\n32\n')
        version = run('compiler version command', 'source /opt/cangjie/envsetup.sh; exec cjc --version', 5)
        report['checks']['Cangjie version and Linux target match'] = '1.0.5' in version['stdout'] and 'x86_64-unknown-linux-gnu' in version['stdout']
        if not report['checks']['Cangjie version and Linux target match']:
            raise RuntimeError('Unexpected compiler version or target.')
        for fixture, output in (('guest-hello', 'Hello, World!\n'),
                                ('guest-tasks', 'tasks=8 total=39999600028\n')):
            run(fixture + ' compilation',
                f'set -e; source /opt/cangjie/envsetup.sh; cd /work; '
                f'cp /input/{fixture}.cj main.cj; exec cjc main.cj -o {fixture}', 60)
            for attempt in range(1, 4):
                run(f'{fixture} execution {attempt}',
                    f'source /opt/cangjie/envsetup.sh; cd /work; exec ./{fixture}', 5, output)
        run('Hello World recovery after tasks',
            'source /opt/cangjie/envsetup.sh; cd /work; exec ./guest-hello', 5, 'Hello, World!\n')
        stop.set()
        monitor.join(timeout=2)
        snapshot()
        pid_delta = max(x['pid_events'].get('max', 0) for x in samples) - samples[0]['pid_events'].get('max', 0)
        oom_delta = max(x['memory_events'].get('oom_kill', 0) for x in samples) - samples[0]['memory_events'].get('oom_kill', 0)
        report['host_pid_event_delta'] = pid_delta
        report['host_oom_kill_delta'] = oom_delta
        report['max_sampled_host_pids'] = max(x['pids'] for x in samples)
        report['checks'].update({
            'host PID limit not exhausted': pid_delta == 0 and report['max_sampled_host_pids'] < 256,
            'no host OOM kill recorded': oom_delta == 0,
            'sandbox survived all phases': json.loads(control('inspect', name))[0]['State']['Running'] is True})
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
    finally:
        stop.set()
        if monitor:
            monitor.join(timeout=2)
        try:
            report['state_before_cleanup'] = json.loads(control('inspect', name))[0]['State']
        except Exception as exc:
            report['inspect_error'] = str(exc)[:1000]
        try:
            control('rm', '-f', name)
            report['cleanup_confirmed'] = True
        except Exception as exc:
            try:
                report['cleanup_confirmed'] = not control('ps', '-aq', '--filter', f'name=^/{name}$').strip()
            except Exception:
                pass
            report['cleanup_detail'] = str(exc)[:1000]
        report['checks']['container absent after cleanup'] = report['cleanup_confirmed']
        destination = Path(__file__).resolve().parent / 'results'
        destination.mkdir(exist_ok=True)
        path = destination / ('cangjie-guest-check-' + uuid.uuid4().hex + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('Report:', path)
        print('Host PID event delta:', report.get('host_pid_event_delta'))
        print('Host OOM-kill delta:', report.get('host_oom_kill_delta'))
        print('Max sampled host PIDs:', report.get('max_sampled_host_pids'))
        for label, result in report['phases'].items():
            print(label, 'reason:', result['reason'], 'exit:', result['exit_code'])
            print('stdout:', repr(result['stdout'][:500]))
            print('stderr:', repr(result['stderr'][:1000]))
        for label, passed in report['checks'].items():
            print(('PASS' if passed else 'FAIL') + ': ' + label)
        if 'error' in report:
            print('ERROR:', report['error'])
        if not report['cleanup_confirmed']:
            print('Check/remove: sudo docker rm -f ' + name)
    return 0 if all(report['checks'].values()) and 'error' not in report else 1


if __name__ == '__main__':
    raise SystemExit(main())
