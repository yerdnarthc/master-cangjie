"""Bounded process-limit probe; host tasks and gVisor guest processes differ."""
from settings import PROCESS_RUNTIME
import json
import argparse
import os
from pathlib import Path
import re
import signal
import threading
import uuid
from runner import IMAGE, control, phase, interrupted


def fields(result):
    return {key: int(value) for key, value in re.findall(r'^([A-Z_]+)=(-?\d+)$', result['stdout'], re.M)}


def normal(result):
    return result['reason'] == 'exited' and result['exit_code'] == 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--guest-limit', action='store_true',
                        help='Test guest RLIMIT_NPROC=32 while retaining host PID limit 256')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit('Run: sudo python3 process-check.py')
    signal.signal(signal.SIGTERM, interrupted)
    name = 'mcj-probe-process-' + uuid.uuid4().hex
    report = {'container': name, 'checks': {}, 'cleanup_confirmed': False,
              'scope': 'bounded native fork probe, configured PID limit 256'}
    report['guest_limit_experiment'] = args.guest_limit
    stop = threading.Event()
    monitor = None
    samples = []
    try:
        source = Path(__file__).resolve().parent / 'process-probe.c'
        if not source.is_file():
            raise RuntimeError('Copy process-probe.c into this folder first.')
        if not Path('/sys/fs/cgroup/cgroup.controllers').exists():
            raise RuntimeError('Host cgroup v2 required; stress skipped.')
        report['image_id'] = control('image', 'inspect', IMAGE, '--format', '{{.Id}}').strip()
        guest_options = ['--ulimit', 'nproc=32:32'] if args.guest_limit else []
        control('create', *guest_options, '--name', name, '--runtime=' + PROCESS_RUNTIME, '--network=none',
                '--read-only', '--user=10001:10001', '--cap-drop=ALL',
                '--security-opt=no-new-privileges=true', '--cpus=1',
                '--memory=2g', '--memory-swap=2g', '--pids-limit=256', '--log-driver=none',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=32m,mode=1777',
                '--tmpfs', '/work:rw,exec,nosuid,nodev,size=32m,uid=10001,gid=10001,mode=0700',
                '--mount', f'type=bind,src={source},dst=/input/probe.c,readonly',
                IMAGE, '/bin/sleep', 'infinity')
        control('start', name)
        info = json.loads(control('inspect', name))[0]
        report['configuration'] = info['HostConfig']
        membership = next(line.split(':', 2)[2] for line in
            Path(f"/proc/{info['State']['Pid']}/cgroup").read_text().splitlines() if line.startswith('0::'))
        root = Path('/sys/fs/cgroup').resolve()
        group = (root / membership.lstrip('/')).resolve()
        if root not in group.parents or (group / 'pids.max').read_text().strip() != '256':
            raise RuntimeError('Dedicated host pids.max not verified as 256; stress skipped.')
        if (group / 'memory.max').read_text().strip() != str(2 * 1024**3):
            raise RuntimeError('Host memory boundary not verified; stress skipped.')
        report['host_cgroup'] = str(group)
        report['host_pids_max'] = 256

        def counters():
            return {key: int(value) for key, value in
                    (line.split() for line in (group / 'pids.events').read_text().splitlines())}

        def snapshot():
            sample = {'pid_events': counters(),
                      'pids_current': int((group / 'pids.current').read_text()),
                      'memory_current': int((group / 'memory.current').read_text()),
                      'memory_events': dict((key, int(value)) for key, value in
                          (line.split() for line in (group / 'memory.events').read_text().splitlines()))}
            samples.append(sample)
            return sample

        report['compile'] = phase(name, 'cd /work; exec gcc -O0 /input/probe.c -o process-probe', 30)
        if not normal(report['compile']):
            raise RuntimeError('Compilation failed; stress skipped.')
        report['positive_control'] = phase(name, 'exec /work/process-probe 4', 15)
        positive = fields(report['positive_control'])
        if not normal(report['positive_control']) or positive.get('CREATED') != 4 or positive.get('REAPED') != 4 or positive.get('FORK_ERRNO') != 0:
            raise RuntimeError('Four-child positive control failed; stress skipped.')
        before = counters()
        report['before'] = snapshot()

        def watch():
            while not stop.wait(0.005):
                try:
                    snapshot()
                    if len(samples) > 4000:
                        del samples[1:2001]
                except OSError:
                    break

        monitor = threading.Thread(target=watch, daemon=True)
        monitor.start()
        report['stress'] = phase(name, 'exec /work/process-probe 320', 15)
        stop.set()
        monitor.join(timeout=2)
        try:
            snapshot()
        except OSError as exc:
            report['final_counter_read_error'] = str(exc)
        report['last_host_sample'] = samples[-1]
        report['max_sampled_host_pids'] = max(x['pids_current'] for x in samples)
        report['max_sampled_memory_bytes'] = max(x['memory_current'] for x in samples)
        report['memory_oom_kill_delta'] = max(x['memory_events'].get('oom_kill', 0) for x in samples) - report['before']['memory_events'].get('oom_kill', 0)
        after = {'max': max(x['pid_events'].get('max', 0) for x in samples)}
        report['host_pid_max_event_delta'] = after.get('max', 0) - before.get('max', 0)
        stress = report['stress']
        observed = fields(stress)
        report['observed'] = observed
        # Guest processes are virtualized; a guest denial may not increment host events.
        expected_guest_boundary = 32 if args.guest_limit else 256
        guest_boundary = (observed.get('AT_BOUNDARY') == expected_guest_boundary and
                          observed.get('CREATED', -1) + observed.get('BASELINE', -1) == expected_guest_boundary)
        host_boundary = report['host_pid_max_event_delta'] > 0
        report['boundary_evidence'] = {'guest_process_boundary': guest_boundary,
                                      'host_pid_events': host_boundary}
        report['recovery'] = phase(name, 'exec /work/process-probe 4', 15)
        recovery = fields(report['recovery'])
        report['checks'] = {
            'host pids.max verified at 256': True,
            'four-child positive control succeeded': True,
            'stress completed before deadline': normal(stress),
            'fork refused with EAGAIN': observed.get('FORK_ERRNO', 0) != 0 and observed.get('FORK_ERRNO') == observed.get('EAGAIN_VALUE'),
            'bounded attempt stopped before 320 children': 0 < observed.get('CREATED', -1) < 320,
            'PID boundary corroborated': guest_boundary or host_boundary,
            'every created stress child reaped': observed.get('CREATED', -1) == observed.get('REAPED', -2),
            'four-child recovery control succeeded': normal(report['recovery']) and recovery.get('CREATED') == 4 and recovery.get('REAPED') == 4 and recovery.get('FORK_ERRNO') == 0,
            'sandbox survived process stress': json.loads(control('inspect', name))[0]['State']['Running'] is True,
        }
        if args.guest_limit:
            report['checks'].update({
                'guest soft and hard NPROC limits observed at 32': all(fields(report[key]).get('NPROC_SOFT') == 32 and fields(report[key]).get('NPROC_HARD') == 32 for key in ('positive_control', 'stress', 'recovery')),
                'guest boundary reached at 32 processes': guest_boundary,
                'host PID limit not exhausted': report['host_pid_max_event_delta'] == 0 and report['max_sampled_host_pids'] < 256,
                'no host OOM kill recorded': report['memory_oom_kill_delta'] == 0,
            })
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
        folder = Path(__file__).resolve().parent / 'results'
        folder.mkdir(exist_ok=True)
        path = folder / ('process-check-' + uuid.uuid4().hex + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('Report:', path)
        print('Host pids.max:', report.get('host_pids_max'))
        print('Host PID max event delta:', report.get('host_pid_max_event_delta'))
        print('Boundary evidence:', report.get('boundary_evidence'))
        print('Max sampled host PID usage:', report.get('max_sampled_host_pids'))
        print('Max sampled host memory:', report.get('max_sampled_memory_bytes'))
        print('Host OOM-kill delta:', report.get('memory_oom_kill_delta'))
        print('State before cleanup:', report.get('state_before_cleanup'))
        for key in ('compile', 'positive_control', 'stress', 'recovery'):
            result = report.get(key)
            if result:
                print(key, 'reason:', result['reason'], 'exit:', result['exit_code'])
                print('stdout:', repr(result['stdout'][:1000]))
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
