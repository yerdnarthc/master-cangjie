"""Local IPv4 TCP isolation probe; uses trusted Bash, not learner source."""
import ipaddress
from settings import RUNTIME
import json
import os
from pathlib import Path
import signal
import socketserver
import threading
import uuid

from runner import IMAGE, control, phase, interrupted


def probe(mode, gateway, port, token):
    name = 'mcj-probe-net-' + uuid.uuid4().hex
    result = {'container': name, 'network': mode, 'cleanup_confirmed': False}
    try:
        control('create', '--name', name, '--runtime=' + RUNTIME,
                '--network=' + mode, '--read-only', '--user=10001:10001',
                '--cap-drop=ALL', '--security-opt=no-new-privileges=true',
                '--cpus=1', '--memory=2g', '--memory-swap=2g', '--pids-limit=256',
                '--log-driver=none',
                '--tmpfs', '/tmp:rw,nosuid,nodev,size=256m,mode=1777',
                '--tmpfs', '/work:rw,exec,nosuid,nodev,size=256m,uid=10001,gid=10001,mode=0700',
                IMAGE, '/bin/sleep', 'infinity')
        control('start', name)
        info = json.loads(control('inspect', name))[0]
        result['configuration'] = info['HostConfig']
        command = (f'set -e; exec 3<>/dev/tcp/{gateway}/{port}; '
                   f"printf '%s\\n' '{token}' >&3; "
                   'IFS= read -r reply <&3; printf "%s\\n" "$reply"')
        result['execution'] = phase(name, command, 5)
    finally:
        try:
            control('rm', '-f', name)
            result['cleanup_confirmed'] = True
        except Exception as exc:
            result['cleanup_error'] = str(exc)[:4096]
            print('Check/remove this container: sudo docker rm -f ' + name)
        # Preserve evidence even when a Docker call raises an exception.
        RUNS.append(result)
    return result


RUNS = []


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run: sudo python3 network-check.py')
    signal.signal(signal.SIGTERM, interrupted)
    report = {'runs': RUNS, 'checks': {}, 'scope': 'IPv4 TCP to controlled Docker-host endpoint'}
    received = []
    reply = 'MCJ-ENDPOINT-' + uuid.uuid4().hex
    tokens = {key: 'MCJ-' + key + '-' + uuid.uuid4().hex
              for key in ('before', 'blocked', 'after')}

    class Endpoint(socketserver.StreamRequestHandler):
        def handle(self):
            self.request.settimeout(2)
            entry = {'peer': self.client_address[0], 'token': None}
            received.append(entry)
            try:
                entry['token'] = self.rfile.readline(256).decode().strip()
                self.wfile.write((reply + '\n').encode())
                self.wfile.flush()
            except Exception as exc:
                entry['error'] = str(exc)[:200]

    try:
        report['image_id'] = control('image', 'inspect', IMAGE, '--format', '{{.Id}}').strip()
        network = json.loads(control('network', 'inspect', 'bridge'))[0]
        gateway = str(next(ipaddress.IPv4Address(item['Gateway'])
                           for item in network['IPAM']['Config']
                           if ':' not in item.get('Gateway', ':')))
        # Bind only the Docker bridge address, not all host interfaces.
        with socketserver.TCPServer((gateway, 0), Endpoint) as server:
            port = server.server_address[1]
            report['endpoint'] = {'address': gateway, 'port': port}
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                before = probe('bridge', gateway, port, tokens['before'])
                first = before['execution']
                if not (first['reason'] == 'exited' and first['exit_code'] == 0
                        and first['stdout'] == reply + '\n' and before['cleanup_confirmed']):
                    raise RuntimeError('Positive control failed; network isolation not established.')
                blocked = probe('none', gateway, port, tokens['blocked'])
                after = probe('bridge', gateway, port, tokens['after'])
            finally:
                server.shutdown()
                thread.join(timeout=5)
        report['endpoint_closed'] = server.socket.fileno() == -1
        def control_pass(run):
            evidence = run['execution']
            return evidence['reason'] == 'exited' and evidence['exit_code'] == 0 and evidence['stdout'] == reply + '\n'
        evidence = blocked['execution']
        report['checks'] = {
            'positive control before succeeded': control_pass(before),
            'positive control after succeeded': control_pass(after),
            'blocked probe exited without deadline': evidence['reason'] == 'exited',
            'blocked probe returned positive nonzero': evidence['exit_code'] > 0,
            'blocked probe received no endpoint reply': evidence['stdout'] == '',
            'network unreachable diagnostic': 'network is unreachable' in evidence['stderr'].lower(),
            'endpoint received only the two control connections': len(received) == 2 and [x['token'] for x in received] == [tokens['before'], tokens['after']],
            'gVisor used throughout': all(x['configuration']['Runtime'] == RUNTIME for x in RUNS),
            'blocked probe configured with no network': blocked['configuration']['NetworkMode'] == 'none',
            'all probe containers removed': all(x['cleanup_confirmed'] for x in RUNS),
            'temporary endpoint closed': report['endpoint_closed'],
        }
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
    finally:
        report['endpoint_connections'] = received
        folder = Path(__file__).resolve().parent / 'results'
        folder.mkdir(exist_ok=True)
        output = folder / ('network-check-' + uuid.uuid4().hex + '.json')
        output.write_text(json.dumps(report, indent=2) + '\n')
        print('Report:', output)
        for run in RUNS:
            evidence = run.get('execution', {})
            print('Network:', run['network'], 'reason:', evidence.get('reason'),
                  'exit:', evidence.get('exit_code'), 'cleanup:', run['cleanup_confirmed'])
            print('stderr preview:', repr(evidence.get('stderr', '')[:500]))
        for label, passed in report['checks'].items():
            print(('PASS' if passed else 'FAIL') + ': ' + label)
        if 'error' in report:
            print('ERROR:', report['error'])
    return 0 if report['checks'] and all(report['checks'].values()) and 'error' not in report else 1


if __name__ == '__main__':
    raise SystemExit(main())
