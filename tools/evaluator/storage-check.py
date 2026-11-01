"""Bounded local tmpfs-capacity probe. Trusted shell commands under gVisor."""
from settings import RUNTIME
import json
import os
from pathlib import Path
import re
import signal
import uuid

from runner import IMAGE, control, phase, interrupted

CAPACITY = 256 * 1024 * 1024


def probe(target, runs):
    name = 'mcj-probe-storage-' + uuid.uuid4().hex
    record = {'target': target, 'container': name, 'cleanup_confirmed': False, 'checks': {}}
    runs.append(record)
    try:
        control('create', '--name', name, '--runtime=' + RUNTIME, '--network=none',
                '--read-only', '--user=10001:10001', '--cap-drop=ALL',
                '--security-opt=no-new-privileges=true', '--cpus=1',
                '--memory=2g', '--memory-swap=2g', '--pids-limit=256', '--log-driver=none',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
                '--tmpfs', '/work:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
                IMAGE, '/bin/sleep', 'infinity')
        control('start', name)
        info = json.loads(control('inspect', name))[0]
        record['configuration'] = info['HostConfig']
        preflight = phase(name,
            f'set -e; printf probe > {target}/small-probe; '
            f'test "$(cat {target}/small-probe)" = probe; rm {target}/small-probe; '
            f'stat -f -c "%S %b" {target}', 5)
        record['preflight'] = preflight
        if preflight['reason'] != 'exited' or preflight['exit_code'] != 0:
            raise RuntimeError('Initial small write/read failed; stop before exhaustion.')
        block_size, blocks = map(int, preflight['stdout'].split())
        record['observed_capacity_bytes'] = block_size * blocks
        if record['observed_capacity_bytes'] != CAPACITY:
            raise RuntimeError('Observed filesystem capacity differs from 256 MiB; investigate.')
        # At most 272 MiB attempted, even if the size limit is ineffective.
        fill = phase(name,
            f'dd if=/dev/zero of={target}/bounded-fill.bin bs=1048576 count=272 status=none; '
            'result=$?; printf "DD_EXIT=%s\\n" "$result"; '
            f'stat -c "FILE_BYTES=%s" {target}/bounded-fill.bin', 15)
        record['fill'] = fill
        match_code = re.search(r'^DD_EXIT=(\d+)$', fill['stdout'], re.M)
        match_size = re.search(r'^FILE_BYTES=(\d+)$', fill['stdout'], re.M)
        size = int(match_size[1]) if match_size else -1
        recovery = phase(name,
            f'set -e; rm -f {target}/bounded-fill.bin; '
            f'printf recovery > {target}/recovery-probe; '
            f'test "$(cat {target}/recovery-probe)" = recovery; '
            f'rm {target}/recovery-probe; printf "recovery-ok\\n"', 5)
        record['recovery'] = recovery
        record['checks'] = {
            'gVisor and network isolation configured': info['HostConfig']['Runtime'] == RUNTIME and info['HostConfig']['NetworkMode'] == 'none',
            'small write/read succeeded': True,
            'filesystem capacity is 256 MiB': block_size * blocks == CAPACITY,
            'fill exited before deadline': fill['reason'] == 'exited' and fill['exit_code'] == 0,
            'dd reported failed write': match_code is not None and int(match_code[1]) != 0,
            'no-space diagnostic captured': 'no space left on device' in fill['stderr'].lower(),
            'file filled near capacity without exceeding it': CAPACITY - 1048576 <= size <= CAPACITY,
            'storage usable again after deleting fill file': recovery['reason'] == 'exited' and recovery['exit_code'] == 0 and recovery['stdout'] == 'recovery-ok\n',
        }
        record['filled_file_bytes'] = size
    finally:
        try:
            record['state_before_cleanup'] = json.loads(control('inspect', name))[0]['State']
        except Exception as exc:
            record['inspect_error'] = str(exc)[:1000]
        try:
            control('rm', '-f', name)
            record['cleanup_confirmed'] = True
        except Exception as exc:
            record['cleanup_error'] = str(exc)[:1000]
            print('Check/remove: sudo docker rm -f ' + name)
        record['checks']['container removed'] = record['cleanup_confirmed']
    return all(record['checks'].values())


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run: sudo python3 storage-check.py')
    signal.signal(signal.SIGTERM, interrupted)
    report = {'runs': [], 'passed': False,
              'scope': '256 MiB tmpfs capacity in separate fresh gVisor containers'}
    try:
        report['image_id'] = control('image', 'inspect', IMAGE, '--format', '{{.Id}}').strip()
        for target in ('/work', '/tmp'):
            if not probe(target, report['runs']):
                raise RuntimeError('Storage probe failed; remaining probes skipped.')
        report['passed'] = True
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
    finally:
        folder = Path(__file__).resolve().parent / 'results'
        folder.mkdir(exist_ok=True)
        path = folder / ('storage-check-' + uuid.uuid4().hex + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('Report:', path)
        for record in report['runs']:
            print('Target:', record['target'], 'capacity:', record.get('observed_capacity_bytes'),
                  'filled bytes:', record.get('filled_file_bytes'))
            print('Fill stderr:', repr(record.get('fill', {}).get('stderr', '')[:500]))
            for label, passed in record['checks'].items():
                print(('PASS' if passed else 'FAIL') + ': ' + label)
        if 'error' in report:
            print('ERROR:', report['error'])
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
