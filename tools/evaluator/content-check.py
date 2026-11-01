"""Verify one content problem's starter/reference against all paired .in/.out files.

Trusted Linux operator tool, not a scoring service or structural-rule analyzer.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('problem', type=Path, help='Problem directory containing starter.cj, reference.cj and tests/.')
    args = parser.parse_args()
    if not hasattr(os, 'geteuid') or os.geteuid() != 0:
        parser.error('Run with sudo python3 on the existing Linux evaluator host.')
    problem = args.problem.resolve(strict=True)
    inputs = sorted((problem / 'tests').glob('*.in'))
    outputs = sorted((problem / 'tests').glob('*.out'))
    require(inputs, 'No input cases found; empty input still requires an explicit .in file.')
    require({p.stem for p in inputs} == {p.stem for p in outputs}, 'Every case needs a matching .in and .out file.')
    # Freeze the bytes used for this verification; source content may subsequently change.
    identity = 'content-check-' + uuid.uuid4().hex
    folder = ROOT / 'results' / identity
    folder.mkdir(parents=True, mode=0o755)
    report = {'passed': False, 'problem': str(problem), 'checks': [],
              'runner_sha256': digest((ROOT / 'runner.py').read_bytes()),
              'checker_sha256': digest(Path(__file__).read_bytes()),
              'scope': 'Exact stdout comparison; no scoring or structural analysis.'}
    def snapshot(path, target):
        require(path.is_file() and path.stat().st_size <= 256 * 1024,
                f'Expected file no larger than 256 KiB: {path}')
        data = path.read_bytes()
        target.write_bytes(data)
        target.chmod(0o644)
        return data
    try:
        sources = {}
        for name in ('starter', 'reference'):
            target = folder / (name + '.cj')
            sources[name] = (target, digest(snapshot(problem / target.name, target)))
        cases = []
        for input_path in inputs:
            input_copy = folder / input_path.name
            output_copy = folder / (input_path.stem + '.out')
            input_bytes = snapshot(input_path, input_copy)
            expected = snapshot(input_path.with_suffix('.out'), output_copy)
            cases.append((input_path.stem, input_copy, input_bytes, expected))
        for source_name, (source, source_hash) in sources.items():
            for case_id, input_path, input_bytes, expected in cases:
                probe_id = uuid.uuid4().hex
                container = 'mcj-probe-' + probe_id
                record = {'source': source_name, 'case': case_id, 'source_sha256': source_hash,
                          'input_sha256': digest(input_bytes), 'expected_sha256': digest(expected),
                          'passed': False, 'container': container}
                report['checks'].append(record)
                child = subprocess.Popen([sys.executable, str(ROOT / 'runner.py'), str(source),
                    '--stdin', str(input_path), '--record-compiler-version', '--probe-id', probe_id],
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                try:
                    out, err = child.communicate(timeout=180)
                except (subprocess.TimeoutExpired, KeyboardInterrupt):
                    child.send_signal(signal.SIGTERM)
                    try:
                        child.communicate(timeout=45)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.communicate()
                    # Target only this invocation. Fallback removal never makes the check pass.
                    subprocess.run(['docker', 'rm', '-f', container], capture_output=True, timeout=20)
                    raise RuntimeError('Checker interrupted or timed out; inspect exact container ' + container)
                record['runner_exit'] = child.returncode
                record['runner_stderr'] = err.decode(errors='replace')[:2000]
                summary = json.loads(out)
                evidence_path = Path(summary['report']).resolve()
                require(evidence_path.parent == ROOT / 'results', 'Unexpected runner report location.')
                record['runner_report'] = str(evidence_path)
                evidence = json.loads(evidence_path.read_text())
                require(evidence['container'] == container and evidence['source'] == str(source),
                        'Runner evidence association mismatch.')
                require(evidence.get('stdin_file') == str(input_path), 'Input association mismatch.')
                require(evidence.get('cleanup_confirmed') is True, 'Sandbox cleanup not confirmed.')
                listing = subprocess.run(['docker', 'ps', '-aq', '--filter', 'name=^/' + container + '$'],
                                         capture_output=True, timeout=20, check=True)
                require(not listing.stdout.strip(), 'Sandbox still exists after cleanup.')
                require(child.returncode == 0 and evidence['outcome'] == 'completed'
                        and evidence['compiler_mode'] == 'cangjie', 'Compilation/execution failed.')
                version = evidence['compiler_version']
                version_text = version['stdout'] + version['stderr']
                require(version['reason'] == 'exited' and version['exit_code'] == 0
                        and re.search(r'(?<![\d.])1\.0\.5(?![\d.])', version_text),
                        'Compiler did not identify itself as Cangjie 1.0.5.')
                record['compiler_version'] = version_text.strip()
                record['image_id'] = evidence['image_id']
                execution = evidence['execute']
                actual = base64.b64decode(execution['stdout_base64'], validate=True)
                record.update(actual_sha256=digest(actual), actual_bytes=len(actual), expected_bytes=len(expected))
                require(actual == expected, f'{source_name}/{case_id}: stdout differs from expected bytes.')
                record['passed'] = True
                print(f'{source_name}/{case_id}: PASS', flush=True)
        report['passed'] = True
    except Exception as exc:
        report['error'] = str(exc)
        print('FAIL: ' + str(exc), file=sys.stderr)
    finally:
        path = ROOT / 'results' / (identity + '.json')
        path.write_text(json.dumps(report, indent=2) + '\n')
        print('Report: ' + str(path), flush=True)
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
