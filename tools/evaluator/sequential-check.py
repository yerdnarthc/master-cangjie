"""Real Cangjie storage isolation between successive disposable runner jobs."""
import hashlib
from settings import RUNTIME
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def main():
    require(os.geteuid() == 0, 'Run as root in the existing Linux prototype.')
    identity = 'sequential-check-' + uuid.uuid4().hex
    folder = ROOT / 'results'
    folder.mkdir(exist_ok=True)
    sources = folder / identity
    sources.mkdir()
    token = uuid.uuid4().hex
    paths = ['/work/mcj-sequential-marker.txt', '/tmp/mcj-sequential-marker.txt']
    # The same absolute paths and payload are used by both producer/reader pairs.
    control = '''
        File.writeTo(path, marker)
        if (!exists(path)) { return 4 }
        let data = File.readFrom(path)
        if (data.size != marker.size) { return 2 }
        for (i in 0..marker.size) {
            if (data[i] != marker[i]) { return 3 }
        }
        println("write-read-ok: ${path}")
'''
    header = ('import std.fs.*\nimport std.env.*\nmain(): Int64 {\n' +
        f'    let marker = "{token}".toArray()\n' +
        '    for (path in ["' + '", "'.join(paths) + '"]) {\n')
    writer = header + control + '    }\n    println("writer-markers-ready")\n    getStdOut().flush()\n'
    reader = header + '''
        if (exists(path)) {
            println("UNEXPECTED-existing-marker: ${path}")
            return 5
        }
        println("exists-false: ${path}")
        var absent = false
        try {
            let prior = File.readFrom(path)
            println("UNEXPECTED-prior-marker: ${path} bytes=${prior.size}")
        } catch (e: FSException) {
            absent = true
            println("marker-absent: ${path}")
            println(e)
        }
        if (!absent) { return 1 }
''' + control + '    }\n    return 0\n}\n'
    contents = {'writer.cj': writer + '    return 0\n}\n',
                'timeout-writer.cj': writer + '    while (true) {}\n    return 0\n}\n',
                'reader.cj': reader}
    for name, content in contents.items():
        (sources / name).write_text(content)
    report = {'passed': False, 'cases': [], 'paths': paths, 'marker': token,
              'runner_sha256': hashlib.sha256((ROOT / 'runner.py').read_bytes()).hexdigest()}

    def run(label, filename, timeout=False, reads=False):
        source = sources / filename
        probe_id = uuid.uuid4().hex
        container = 'mcj-probe-' + probe_id
        record = {'case': label, 'container': container,
                  'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        report['cases'].append(record)
        child = subprocess.Popen([sys.executable, str(ROOT / 'runner.py'), str(source),
            '--probe-id', probe_id], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            out, err = child.communicate(timeout=120)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            child.send_signal(signal.SIGTERM)
            try:
                child.communicate(timeout=90)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
            subprocess.run(['docker', 'rm', '-f', container], capture_output=True, timeout=20)
            raise RuntimeError('Outer interruption/deadline; inspect probe containers.')
        record.update({'runner_exit': child.returncode, 'runner_stderr': err[:2000]})
        summary = json.loads(out)
        path = Path(summary['report']).resolve()
        require(path.parent == folder, 'Unexpected report path.')
        record['report'] = str(path)
        data = json.loads(path.read_text())
        require(data['container'] == container and Path(data['source']).resolve() == source,
                'Report association mismatch.')
        require(data['compiler_mode'] == 'cangjie', 'Real compiler required.')
        require(data['outcome'] == ('execute_deadline' if timeout else 'completed')
            and child.returncode == (1 if timeout else 0), 'Unexpected runner outcome.')
        compile_result = data['compile']
        require(compile_result['reason'] == 'exited' and compile_result['exit_code'] == 0,
                'Compilation failed.')
        config = data['configuration']
        require(config['Runtime'] == RUNTIME and config['NetworkMode'] == 'none'
            and config['ReadonlyRootfs'] and config['PidsLimit'] == 256
            and all(p in config['Tmpfs'] for p in ('/work', '/tmp')), 'Restrictions changed.')
        mounts = config['Mounts']
        require(len(mounts) == 1 and mounts[0]['Type'] == 'bind' and mounts[0]['ReadOnly']
            and mounts[0]['Source'] == str(source) and mounts[0]['Target'] == '/input/main.cj',
            'Unexpected persistent mounts.')
        require(data['guest_limits']['stdout'] == '32\n32\n', 'Guest limits absent.')
        result = data['execute']
        require(result['reason'] == ('deadline' if timeout else 'exited'), 'Wrong execution reason.')
        require(result['duration_seconds'] >= 5 if timeout else result['exit_code'] == 0,
                'Execution result mismatch.')
        require(0 <= result['captured_bytes'] <= 1048576 and not result['stderr'], 'Unexpected output.')
        stdout = result['stdout']
        require('UNEXPECTED' not in stdout, 'Prior job data visible.')
        for marker_path in paths:
            require('write-read-ok: ' + marker_path + '\n' in stdout, 'Writable/readable control missing.')
            if reads:
                require('marker-absent: ' + marker_path + '\n' in stdout, 'Missing absence marker.')
        if reads:
            require(all('exists-false: ' + p + '\n' in stdout for p in paths), 'Explicit absence checks missing.')
        else:
            require('writer-markers-ready\n' in stdout, 'Writer did not finish both markers.')
        require(data['cleanup_confirmed'] is True, 'Runner cleanup failed.')
        listing = subprocess.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + container + '$'],
            capture_output=True, text=True, timeout=20, check=True)
        require(not listing.stdout.strip(), 'Prior container remains before next job.')
        record.update({'passed': True, 'execute': result, 'image_id': data['image_id'],
                       'container_absent_before_next_job': True})
        print(label + ': PASS', flush=True)

    try:
        run('normal writer', 'writer.cj')
        run('fresh reader after normal completion', 'reader.cj', reads=True)
        run('timeout writer', 'timeout-writer.cj', timeout=True)
        run('fresh reader after timeout', 'reader.cj', reads=True)
        require(len({case['container'] for case in report['cases']}) == 4, 'Containers must be distinct.')
        require(len({case['image_id'] for case in report['cases']}) == 1, 'Image changed across jobs.')
        report['passed'] = True
    except (Exception, KeyboardInterrupt) as exc:
        report['error'] = str(exc) or 'Interrupted'
    finally:
        path = folder / (identity + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({'passed': report['passed'], 'report': str(path), 'error': report.get('error')}))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
