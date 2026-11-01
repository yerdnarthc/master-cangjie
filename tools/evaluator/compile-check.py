"""Compilation enforcement and real-compiler evidence, with exact report references."""
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


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    require(os.geteuid() == 0, 'Run as root in the existing Linux prototype.')
    identity = 'compile-check-' + uuid.uuid4().hex
    folder = ROOT / 'results'
    folder.mkdir(exist_ok=True)
    sources = folder / identity
    sources.mkdir()
    valid = sources / 'many-functions.cj'
    valid.write_text(''.join(f'func value{i}(): Int64 {{ return {i} }}\n' for i in range(200)) +
        'main(): Int64 {\nlet total = ' + ' + '.join(f'value{i}()' for i in range(200)) +
        '\nprintln(total)\nreturn 0\n}\n')
    invalid = sources / 'many-errors.cj'
    invalid.write_text('main(): Int64 {\n' +
        ''.join(f'let value{i} = missing{i}\n' for i in range(1000)) + 'return 0\n}\n')
    report = {'passed': False, 'cases': [], 'runner_sha256': hashlib.sha256(
        (ROOT / 'runner.py').read_bytes()).hexdigest()}

    def run(label, source, expected, probe=None, stdout=None):
        record = {'case': label, 'evidence': 'controlled substitute' if probe else 'real Cangjie',
                  'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest()}
        report['cases'].append(record)
        probe_id = uuid.uuid4().hex
        container = 'mcj-probe-' + probe_id
        record['container'] = container
        args = [sys.executable, str(ROOT / 'runner.py'), str(source), '--probe-id', probe_id]
        if probe:
            args += ['--compile-probe', probe]
        child = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            out, err = child.communicate(timeout=150)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            child.send_signal(signal.SIGTERM)
            try:
                child.communicate(timeout=90)
            except subprocess.TimeoutExpired:
                child.kill()
                child.communicate()
            # Only this invocation's UUID container may be removed here.
            subprocess.run(['docker', 'rm', '-f', container], capture_output=True, timeout=20)
            listing = subprocess.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + container + '$'],
                capture_output=True, text=True, timeout=20, check=True)
            record['emergency_cleanup_confirmed'] = not listing.stdout.strip()
            raise RuntimeError('Outer interruption/deadline; inspect probe containers.')
        record.update({'runner_exit': child.returncode, 'runner_stderr': err[:2000]})
        summary = json.loads(out)
        path = Path(summary['report']).resolve()
        require(path.parent == folder, 'Unexpected report directory.')
        record['report'] = str(path)
        data = json.loads(path.read_text())
        require(data['container'] == container, 'Container association mismatch.')
        require(Path(data['source']).resolve() == source.resolve(), 'Source association mismatch.')
        require(data['compiler_mode'] == (probe or 'cangjie'), 'Compiler mode mismatch.')
        require(data['outcome'] == expected, f'{label}: unexpected outcome {data["outcome"]}')
        require(child.returncode == (0 if expected == 'completed' else 1), 'Wrong runner exit.')
        require(data['cleanup_confirmed'] is True, 'Cleanup not confirmed.')
        listing = subprocess.run(['docker', 'ps', '-aq', '--filter',
            'name=^/' + data['container'] + '$'], capture_output=True, text=True, timeout=20, check=True)
        require(not listing.stdout.strip(), 'Container still exists after runner cleanup.')
        config = data['configuration']
        require(config['Runtime'] == RUNTIME and config['NetworkMode'] == 'none'
            and config['ReadonlyRootfs'] and config['PidsLimit'] == 256, 'Restrictions changed.')
        require(data['guest_limits']['stdout'] == '32\n32\n', 'Guest limit not verified.')
        phase = data['compile']
        record['compile'] = {k: phase[k] for k in ('reason', 'exit_code', 'duration_seconds', 'captured_bytes')}
        record['image_id'] = data['image_id']
        require(0 <= phase['captured_bytes'] <= 1048576, 'Capture exceeded budget.')
        if probe:
            require('execute' not in data, 'Execution started after failed compilation.')
            require(phase['reason'] == ('deadline' if probe == 'deadline' else 'output_limit'), 'Wrong phase reason.')
            require('MCJ-COMPILE-' + probe.upper() in phase['stderr'], 'Probe did not start.')
            require(phase['duration_seconds'] < 70, 'Phase detection took unexpectedly long.')
            if probe == 'deadline':
                require(phase['duration_seconds'] >= 60, 'Deadline triggered prematurely.')
            else:
                require(phase['captured_bytes'] == 1048576, 'Output cap not reached exactly.')
        elif expected == 'compile_nonzero':
            require(phase['reason'] == 'exited' and phase['exit_code'] != 0 and phase['stderr'], 'Diagnostics absent.')
            require('execute' not in data, 'Invalid program executed.')
        else:
            require(phase['reason'] == 'exited' and phase['exit_code'] == 0, 'Compilation failed.')
            execution = data['execute']
            require(execution['reason'] == 'exited' and execution['exit_code'] == 0
                and execution['stdout'] == stdout and execution['stderr'] == '', 'Unexpected execution evidence.')
        record['passed'] = True
        print(label + ': PASS', flush=True)

    try:
        hello = ROOT / 'fixtures' / 'guest-hello.cj'
        run('controlled compilation deadline', hello, 'compile_deadline', 'deadline')
        run('recovery after deadline', hello, 'completed', stdout='Hello, World!\n')
        run('controlled compiler output cap', hello, 'compile_output_limit', 'output')
        run('recovery after output cap', hello, 'completed', stdout='Hello, World!\n')
        run('real compiler: 200 functions', valid, 'completed', stdout='19900\n')
        run('real compiler: 1000 undefined names', invalid, 'compile_nonzero')
        run('final recovery', hello, 'completed', stdout='Hello, World!\n')
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
