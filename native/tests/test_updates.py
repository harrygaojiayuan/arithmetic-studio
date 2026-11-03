"""Exercise the real Sparkle driver, archive validation, replacement and relaunch."""
import functools
import hashlib
import http.server
import json
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]


def run(*arguments):
    subprocess.run(arguments, check=True)


class QuietServer(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def exercise(bundle, binary, temporary, tampered):
    work = temporary / ('tampered' if tampered else 'upgrade')
    work.mkdir()
    served = work / 'served'
    served.mkdir()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietServer, directory=str(served)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    report = work / 'result.json'
    states = work / 'states.json'
    data = work / 'practice-data.json'
    data.write_text('{"records":[{"id":"synthetic-only","correct":8}]}')
    original_data = data.read_bytes()
    key = work / 'test-private.pem'
    public = work / 'test-public.txt'
    run('node', '-e', "const c=require('node:crypto'),f=require('node:fs');const k=c.generateKeyPairSync('ed25519');f.writeFileSync(process.argv[1],k.privateKey.export({type:'pkcs8',format:'pem'}));f.writeFileSync(process.argv[2],k.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64'));", str(key), str(public))
    identifier = f'local.arithmeticstudio.UpdateTest.{uuid.uuid4().hex}'
    installed = work / 'installed' / 'UpdateProbe.app'
    incoming = work / 'incoming' / 'UpdateProbe.app'
    for destination, version in [(installed, '9.0.0'), (incoming, '9.0.1')]:
        shutil.copytree(bundle, destination, symlinks=True)
        shutil.copy2(binary, destination / 'Contents/MacOS/ArithmeticStudio')
        info_path = destination / 'Contents/Info.plist'
        info = plistlib.loads(info_path.read_bytes())
        info.update(CFBundleIdentifier=identifier, CFBundleVersion=version, CFBundleShortVersionString=version,
                    SUFeedURL=base + '/appcast.xml', SUPublicEDKey=public.read_text(),
                    NSAppTransportSecurity={'NSAllowsLocalNetworking': True})
        info_path.write_bytes(plistlib.dumps(info))
        (destination / 'Contents/Resources/update-test.json').write_text(json.dumps({'report':str(report), 'states':str(states)}))
        run('codesign', '--force', '--sign', '-', str(destination))
        run('codesign', '--verify', '--deep', '--strict', str(destination))
    archive = served / 'update.zip'
    run('ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', str(incoming), str(archive))
    signing_script = "import{readFileSync as r,writeFileSync as w}from'node:fs';import{makeAppcast}from './scripts/make-macos-appcast.mjs';w(process.argv[1],makeAppcast({version:'9.0.1',archive:r(process.argv[2]),privateKey:r(process.argv[3]),publicKey:r(process.argv[4],'utf8'),downloadURL:process.argv[5]}));"
    run('node', '--input-type=module', '-e', signing_script, str(served / 'appcast.xml'), str(archive), str(key), str(public), base + '/update.zip')
    if tampered:
        with archive.open('ab') as stream:
            stream.write(b'tampered-after-signing')
    try:
        run('open', '-n', str(installed))
        deadline = time.monotonic() + 120
        while not report.exists() and time.monotonic() < deadline:
            time.sleep(0.25)
        if not report.exists():
            raise RuntimeError(f'Mac update timed out; states={states.read_text() if states.exists() else "none"}')
        result = json.loads(report.read_text())
        installed_version = plistlib.loads((installed / 'Contents/Info.plist').read_bytes())['CFBundleVersion']
        transitions = json.loads(states.read_text())
        assert 'available' in transitions and 'downloading' in transitions, transitions
        if tampered:
            assert not result['ok'] and installed_version == '9.0.0', result
        else:
            assert result['ok'] and result['relaunched'] and installed_version == '9.0.1', result
            assert 'installing' in transitions, transitions
        assert data.read_bytes() == original_data, 'Practice data changed during update'
        return {'ok':True, 'tampered':tampered, 'installedVersion':installed_version, 'transitions':transitions}
    finally:
        server.shutdown()


def main():
    bundle = Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='arithmetic-update-test-') as directory:
        work = Path(directory)
        binary = work / 'update-host'
        frameworks = bundle / 'Contents/Frameworks'
        run('xcrun', 'swiftc', '-O', str(ROOT / 'native/tests/update-host.swift'), str(ROOT / 'native/updates.swift'),
            '-F', str(frameworks), '-framework', 'Cocoa', '-framework', 'Sparkle',
            '-Xlinker', '-rpath', '-Xlinker', '@executable_path/../Frameworks', '-o', str(binary))
        results = [exercise(bundle, binary, work, tampered) for tampered in [False, True]]
    output = {'ok':True, 'checks':['real-sparkle-download', 'ed25519-verification', 'automatic-app-replacement',
                                  'automatic-relaunch', 'tampered-archive-rejected', 'practice-data-preserved'], 'results':results}
    (ROOT / 'release/Mac-update-verification.json').write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps(output))


if __name__ == '__main__':
    main()
