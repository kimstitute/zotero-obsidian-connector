"""Build a reproducible XPI. Python 3.10+, standard library only."""
import argparse
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build(repository=None):
    manifest = json.loads((ROOT / 'src/manifest.json').read_text(encoding='utf-8'))
    version = manifest['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Use a three-part numeric version in src/manifest.json')
    if repository and not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
        raise ValueError('Repository must be OWNER/REPOSITORY')
    app = manifest['applications']['zotero']
    if repository:
        app['update_url'] = f'https://github.com/{repository}/releases/latest/download/updates.json'
        manifest['homepage_url'] = f'https://github.com/{repository}'
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    filename = f'zotero-obsidian-connector-{version}.xpi'
    output = dist / filename
    files = {
        'manifest.json': (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode(),
        'bootstrap.js': (ROOT / 'src/bootstrap.js').read_bytes(),
        'connector.js': (ROOT / 'src/connector.js').read_bytes(),
        'note-document.js': (ROOT / 'src/note-document.js').read_bytes(),
        'note-tabs.js': (ROOT / 'src/note-tabs.js').read_bytes(),
        'LICENSE': (ROOT / 'LICENSE').read_bytes(),
        'icons/icon-48.png': (ROOT / 'assets/icon-48.png').read_bytes(),
        'icons/icon-96.png': (ROOT / 'assets/icon-96.png').read_bytes(),
    }
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    (dist / (filename + '.sha256')).write_text(f'{digest}  {filename}\n', encoding='ascii')
    updates = []
    if repository:
        updates.append({'version': version,
            'update_link': f'https://github.com/{repository}/releases/download/v{version}/{filename}',
            'update_hash': 'sha256:' + digest,
            'applications': {'zotero': {'strict_min_version': app['strict_min_version'], 'strict_max_version': app['strict_max_version']}}})
    (dist / 'updates.json').write_text(json.dumps({'addons': {app['id']: {'updates': updates}}}, indent=2) + '\n', encoding='utf-8')
    print(f'Built dist/{filename}')
    if not repository:
        print('Local build: update server is a reserved .invalid placeholder. Rebuild with --repository before publishing.')
    return output

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repository', help='Public GitHub OWNER/REPOSITORY for release and update URLs')
    build(parser.parse_args().repository)
