#!/usr/bin/env python3
"""Create a universal Mac app, drag-to-install DMG and application ZIP."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
RELEASE = ROOT / 'release'
RELEASE.mkdir(exist_ok=True)
name = f'ArithmeticStudio-{VERSION}-macos-universal'

with tempfile.TemporaryDirectory(prefix='arithmetic-macos-package-') as work:
    work = Path(work)
    stage = work / 'volume'
    stage.mkdir()
    bundle = stage / '算数练习室.app'
    subprocess.run([sys.executable, str(ROOT / 'native/build_app.py'),
                    '--arch', 'universal', '--output', str(bundle)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(bundle)], check=True)
    architecture = subprocess.check_output(['xcrun', 'lipo', '-archs',
        str(bundle / 'Contents/MacOS/ArithmeticStudio')], text=True).split()
    if set(architecture) != {'arm64', 'x86_64'}:
        raise RuntimeError('Universal app must include Apple Silicon and Intel executables')
    (stage / 'Applications').symlink_to('/Applications')
    (stage / '安装说明.txt').write_text(
        '算数练习室 · Mac 版\n\n'
        '支持 macOS 12 及以上版本，适用于 Apple Silicon（M 系列）和 Intel Mac。\n'
        '将“算数练习室.app”拖到 Applications 文件夹，然后从应用程序中打开。\n'
        '可离线使用，设置和成绩保存在本机；更新应用不会覆盖个人数据。\n\n'
        '此版本未使用 Apple Developer ID 签名，也未公证。macOS 首次打开下载的应用时可能提示无法验证开发者。\n',
        encoding='utf-8')
    zip_path = RELEASE / f'{name}.zip'
    dmg_path = RELEASE / f'{name}.dmg'
    subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc', '--keepParent',
                    str(bundle), str(zip_path)], check=True)
    subprocess.run(['hdiutil', 'create', '-ov', '-volname', '算数练习室',
                    '-srcfolder', str(stage), '-format', 'UDZO', '-fs', 'HFS+',
                    str(dmg_path)], check=True)
    subprocess.run(['hdiutil', 'verify', str(dmg_path)], check=True)
    # Verify the downloadable ZIP preserves the executable and code signature.
    extracted = work / 'extracted'
    subprocess.run(['ditto', '-x', '-k', str(zip_path), str(extracted)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict',
                    str(extracted / bundle.name)], check=True)

files = [dmg_path, zip_path]
sums = [f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.name}' for file in files]
(RELEASE / 'SHA256SUMS-macos.txt').write_text('\n'.join(sums)+'\n')
(RELEASE / 'Mac-build-verification.json').write_text(json.dumps({
    'ok': True, 'version': VERSION, 'architectures': sorted(architecture),
    'minimum_macos': '12.0', 'checks': [
        'swift-arm64-compile', 'swift-x86_64-compile', 'universal-binary',
        'ad-hoc-signature', 'dmg-integrity', 'zip-extract-signature'
    ]}, ensure_ascii=False, indent=2)+'\n')
for file in files:
    print(f'已打包：{file}')
