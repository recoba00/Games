"""Generate Windows Store artifacts using PWABuilder's official packaging API."""
from pathlib import Path
import hashlib
import io
import json
import urllib.request
import urllib.error
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
options = json.loads((ROOT / 'windows-package.json').read_text(encoding='utf-8'))
request = urllib.request.Request(
    'https://pwabuilder-windows-docker.azurewebsites.net/msix/generateZip',
    data=json.dumps(options).encode('utf-8'),
    headers={'Content-Type': 'application/json'}, method='POST')
print('Generating Windows package via PWABuilder...', flush=True)
try:
    with urllib.request.urlopen(request, timeout=600) as response:
        data = response.read()
except urllib.error.HTTPError as error:
    detail = error.read().decode('utf-8', errors='replace').split('HEADERS')[0]
    raise SystemExit(f'PWABuilder HTTP {error.code}: {detail[:2500]}')
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    if archive.testzip() is not None:
        raise ValueError('Corrupt package archive')
    names = archive.namelist()
    if not any(name.endswith(('.msix', '.msixbundle')) for name in names):
        raise ValueError('No Windows package in API response')
    bundle_name = next(name for name in names if name.endswith('.msixbundle'))
    bundle_data = archive.read(bundle_name)
    with zipfile.ZipFile(io.BytesIO(bundle_data)) as bundle:
        package_names = [name for name in bundle.namelist() if name.endswith(('.appx', '.msix'))]
        if not package_names:
            raise ValueError('Empty Windows bundle')
        for name in package_names:
            with zipfile.ZipFile(io.BytesIO(bundle.read(name))) as package:
                manifest = package.read('AppxManifest.xml').decode('utf-8')
                document = ET.fromstring(manifest)
                identity = document.find('{*}Identity')
                for key, expected in [('Name', options['packageId']),
                                      ('Publisher', options['publisher']['commonName']),
                                      ('Version', options['version'])]:
                    if identity.get(key) != expected:
                        raise ValueError(f'Package identity mismatch: {key}')
                if document.find('{*}Properties/{*}PublisherDisplayName').text != options['publisher']['displayName']:
                    raise ValueError('Publisher display name mismatch')
                if document.find('{*}Properties/{*}DisplayName').text != options['name']:
                    raise ValueError('Reserved Store display name mismatch')
                app = document.find('{*}Applications/{*}Application')
                if app.find('{*}VisualElements').get('DisplayName') != options['name']:
                    raise ValueError('Application display name mismatch')
                args = app.get('{http://schemas.microsoft.com/appx/manifest/uap/windows10/10}Parameters', '')
                if '--app-fallback-url=' + options['url'] not in args.split():
                    raise ValueError('Package launch URL mismatch')
output = ROOT / 'windows'
output.mkdir(exist_ok=True)
target = output / f'hanipcut-windows-{options["version"]}.zip'
target.write_bytes(data)
bundle_target = output / f'hanipcut-{options["version"]}.msixbundle'
bundle_target.write_bytes(bundle_data)
print(f'Saved: {target}')
print(f'SHA256: {hashlib.sha256(data).hexdigest()}')
print(f'Identity verified; Store bundle: {bundle_target}')
