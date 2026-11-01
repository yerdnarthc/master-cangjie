"""Local single-host reconciliation. Never remove an actively locked job."""
import fcntl
import json
from pathlib import Path
import subprocess
import uuid

ROOT = Path(__file__).resolve().parent
LABEL = 'io.mastercangjie.prototype'
JOB = 'io.mastercangjie.job'


def docker(*args):
    p = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=20)
    if p.returncode:
        raise RuntimeError('Docker control failed: ' + p.stderr[:1000])
    return p.stdout


def lease(job):
    folder = ROOT / 'leases'
    folder.mkdir(mode=0o700, exist_ok=True)
    handle = (folder / (job + '.lock')).open('a+')
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BaseException:
        handle.close()
        raise
    return handle


def reconcile():
    result = {'removed': [], 'active': [], 'refused': []}
    ids = docker('ps', '-aq', '--no-trunc', '--filter', 'label=' + LABEL + '=1').split()
    for identity in ids:
        try:
            data = json.loads(docker('inspect', identity))[0]
        except RuntimeError:
            if not docker('ps', '-aq', '--filter', 'id=' + identity).strip():
                continue
            raise
        job = data['Config']['Labels'].get(JOB, '')
        try:
            valid = uuid.UUID(hex=job).hex == job
        except ValueError:
            valid = False
        lock = ROOT / 'leases' / (job + '.lock') if valid else None
        if not valid or data['Name'] != '/mcj-probe-' + job or not lock.is_file():
            result['refused'].append(identity)
            continue
        with lock.open('a+') as handle:
            try:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                result['active'].append(identity)
                continue
            # Exact immutable container ID, never a broad name/prefix removal.
            if not docker('ps', '-aq', '--filter', 'id=' + identity).strip():
                continue
            try:
                docker('rm', '-f', identity)
            except RuntimeError:
                if docker('ps', '-aq', '--filter', 'id=' + identity).strip():
                    raise
            if docker('ps', '-aq', '--filter', 'id=' + identity).strip():
                raise RuntimeError('Orphan removal not confirmed.')
            result['removed'].append(identity)
    return result


if __name__ == '__main__':
    print(json.dumps(reconcile()))
