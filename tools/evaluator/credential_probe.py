"""Harmless canary boundary probe; does not enumerate or print real credentials."""
import shlex

KEYS = ['MCJ_APPLICATION_TOKEN', 'MCJ_QUEUE_TOKEN', 'MCJ_STORAGE_TOKEN',
        'MCJ_DELIVERY_TOKEN', 'MCJ_GOOGLE_TOKEN', 'DATABASE_URL']


def command(host_path):
    keys = ' '.join(KEYS)
    return ('set -e; source /opt/cangjie/envsetup.sh; ' + f'for key in {keys}; do '
            'if [[ -v $key ]]; then echo exposed-environment; exit 21; fi; done; '
            f'for path in {shlex.quote(host_path)} /var/run/docker.sock /run/docker.sock '
            '/root/.aws/credentials /root/.config/gcloud/application_default_credentials.json; do '
            'if test -e "$path"; then echo exposed-path; exit 22; fi; done; '
            'echo credential-boundary-ok')
