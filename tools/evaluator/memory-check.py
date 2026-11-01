"""Local cgroup-v2 memory enforcement probe, using a temporary 512 MiB limit."""
from settings import RUNTIME
import json
import os
from pathlib import Path
import signal
import threading
import uuid
from runner import IMAGE, control, phase, interrupted

LIMIT = 512 * 1024 * 1024


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run: sudo python3 memory-check.py')
    signal.signal(signal.SIGTERM, interrupted)
    name = 'mcj-probe-memory-' + uuid.uuid4().hex
    report = {'container': name, 'checks': {}, 'cleanup_confirmed': False,
              'scope': 'native anonymous allocation under temporary 512 MiB host cgroup limit'}
    stop = threading.Event()
    monitor = None
    samples = []
    try:
        available = next(int(line.split()[1]) * 1024 for line in
                         Path('/proc/meminfo').read_text().splitlines() if line.startswith('MemAvailable:'))
        if available < 1024 * 1024 * 1024:
            raise RuntimeError('Less than 1 GiB available on host; stop before starting probe.')
        if not Path('/sys/fs/cgroup/cgroup.controllers').exists():
            raise RuntimeError('This probe requires host cgroup v2; no stress run started.')
        source = Path(__file__).resolve().parent / 'memory-probe.c'
        if not source.is_file():
            raise RuntimeError('Copy memory-probe.c into the same folder first.')
        report['image_id'] = control('image', 'inspect', IMAGE, '--format', '{{.Id}}').strip()
        control('create', '--name', name, '--runtime=' + RUNTIME, '--network=none',
                '--read-only', '--user=10001:10001', '--cap-drop=ALL',
                '--security-opt=no-new-privileges=true', '--cpus=1',
                '--memory=512m', '--memory-swap=512m', '--pids-limit=256', '--log-driver=none',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=32m,mode=1777',
                '--tmpfs', '/work:rw,exec,nosuid,nodev,size=32m,uid=10001,gid=10001,mode=0700',
                '--mount', f'type=bind,src={source},dst=/input/probe.c,readonly',
                IMAGE, '/bin/sleep', 'infinity')
        control('start', name)
        info = json.loads(control('inspect', name))[0]
        report['configuration'] = info['HostConfig']
        pid = info['State']['Pid']
        membership = next(line.split(':', 2)[2] for line in
                          Path(f'/proc/{pid}/cgroup').read_text().splitlines() if line.startswith('0::'))
        root = Path('/sys/fs/cgroup').resolve()
        group = (root / membership.lstrip('/')).resolve()
        if root not in group.parents:
            raise RuntimeError('Cannot resolve a dedicated host cgroup safely.')
        # Fail closed if Docker's reported PID does not identify the limited group.
        if int((group / 'memory.max').read_text().strip()) != LIMIT:
            raise RuntimeError('Host memory.max is not 512 MiB; stress run skipped.')
        if (group / 'memory.swap.max').read_text().strip() != '0':
            raise RuntimeError('Host swap limit is not zero; stress run skipped.')
        report['host_cgroup'] = str(group)
        report['host_memory_max'] = LIMIT
        report['host_swap_max'] = 0

        def snapshot():
            events = dict((key, int(value)) for key, value in
                          (line.split() for line in (group / 'memory.events').read_text().splitlines()))
            sample = {'events': events, 'current_bytes': int((group / 'memory.current').read_text())}
            samples.append(sample)
            return sample

        report['compile'] = phase(name,
            'set -e; cd /work; exec gcc -O0 /input/probe.c -o memory-probe', 30)
        if report['compile']['reason'] != 'exited' or report['compile']['exit_code'] != 0:
            raise RuntimeError('Native probe compilation failed; stress run skipped.')
        report['positive_control'] = phase(name, 'exec /work/memory-probe 16', 10)
        positive = report['positive_control']
        if positive['reason'] != 'exited' or positive['exit_code'] != 0 or 'allocation-completed-mib=16' not in positive['stdout']:
            raise RuntimeError('16 MiB positive control failed; stress run skipped.')
        before = snapshot()
        report['before'] = before

        def watch():
            while not stop.wait(0.01):
                try:
                    snapshot()
                    if len(samples) > 2000:
                        del samples[1:1001]
                except OSError:
                    # The runtime may remove the cgroup after an OOM termination.
                    break

        monitor = threading.Thread(target=watch, daemon=True)
        monitor.start()
        report['stress'] = phase(name, 'exec /work/memory-probe 768', 15)
        stop.set()
        monitor.join(timeout=2)
        try:
            snapshot()
        except OSError as exc:
            report['final_cgroup_read_error'] = str(exc)
        maxima = {key: max(sample['events'].get(key, 0) for sample in samples)
                  for key in ('max', 'oom', 'oom_kill')}
        delta = {key: value - before['events'].get(key, 0) for key, value in maxima.items()}
        report['event_deltas'] = delta
        report['max_sampled_current_bytes'] = max(sample['current_bytes'] for sample in samples)
        stress = report['stress']
        report['checks'] = {
            'host memory.max verified at 512 MiB': True,
            'host swap disabled for probe': True,
            '16 MiB positive control succeeded': True,
            'stress allocation started': 'allocation-started' in stress['stdout'],
            'stress ended before external deadline': stress['reason'] == 'exited',
            'stress returned nonzero': stress['exit_code'] != 0,
            '768 MiB allocation did not complete': 'allocation-completed-mib=768' not in stress['stdout'],
            'host memory max events increased': delta['max'] > 0,
            'host cgroup OOM evidence recorded': delta['oom'] > 0 or delta['oom_kill'] > 0,
        }
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
            # Preflight can fail before any container exists.
            try:
                report['cleanup_confirmed'] = not control('ps', '-aq', '--filter', f'name=^/{name}$').strip()
            except Exception:
                pass
            report['cleanup_detail'] = str(exc)[:1000]
        report['checks']['container absent after cleanup'] = report['cleanup_confirmed']
        folder = Path(__file__).resolve().parent / 'results'
        folder.mkdir(exist_ok=True)
        path = folder / ('memory-check-' + uuid.uuid4().hex + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('Report:', path)
        print('Host memory.max:', report.get('host_memory_max'))
        print('Host memory.swap.max:', report.get('host_swap_max'))
        print('Memory event deltas:', report.get('event_deltas'))
        print('Max sampled memory.current:', report.get('max_sampled_current_bytes'))
        for key in ('compile', 'positive_control', 'stress'):
            result = report.get(key, {})
            if result:
                print(key, 'reason:', result['reason'], 'exit:', result['exit_code'])
                print('stdout:', repr(result['stdout'][:500]))
                print('stderr:', repr(result['stderr'][:500]))
        for label, passed in report['checks'].items():
            print(('PASS' if passed else 'FAIL') + ': ' + label)
        if 'error' in report:
            print('ERROR:', report['error'])
        if not report['cleanup_confirmed']:
            print('Check/remove: sudo docker rm -f ' + name)
    return 0 if all(report['checks'].values()) and 'error' not in report else 1


if __name__ == '__main__':
    raise SystemExit(main())
