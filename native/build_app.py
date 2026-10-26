#!/usr/bin/env python3
"""Build an offline macOS .app using the system Swift compiler; no packages required."""
import argparse
import plistlib
import re
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT.parent / '算数练习室.app')
args = parser.parse_args()
destination = args.output.resolve()
if destination.suffix != '.app':
    parser.error('Output must end in .app')

# Build a fresh bundle next to the destination so existing builds survive compilation failures.
with tempfile.TemporaryDirectory(prefix='arithmetic-macos-') as work:
    work = Path(work)
    bundle = work / destination.name
    contents = bundle / 'Contents'
    resources = contents / 'Resources'
    executables = contents / 'MacOS'
    resources.mkdir(parents=True)
    executables.mkdir()
    core = re.sub(r'^export ', '', (ROOT / 'dist/core.mjs').read_text(), flags=re.M)
    app = re.sub(r'^import .*?;\s*', '', (ROOT / 'dist/app.mjs').read_text(), count=1)
    app = (app.replace('当前浏览器', '这台电脑')
              .replace('浏览器存储不可用', '本地存储不可用')
              .replace('关闭页面后设置和成绩将无法保存', '退出 App 后设置和成绩将无法保存')
              .replace('清除浏览器数据会删除记录', '关闭 App 后仍会保留记录')
              .replace('切换页面不会暂停', '切换窗口或关闭 App 后也不会暂停'))
    script = f'(() => {{\n{core}\n{app}\n}})();'
    # Keep closing script text safe if future question copy includes HTML examples.
    script = script.replace('</script', '<\\/script')
    html = (ROOT / 'dist/index.html').read_text()
    html = re.sub(r'\s*<script type="module" src="app.mjs"></script>', '', html)
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>' + (ROOT / 'dist/styles.css').read_text() + '</style>')
    html = html.replace('</body>', '<script>\n' + script + '\n</script>\n</body>')
    (resources / 'index.html').write_text(html)
    shutil.copy2(ROOT / 'native/storage-bridge.js', resources)
    (work / 'bundle.js').write_text(script)
    subprocess.run(['node', '--check', str(work / 'bundle.js')], check=True)
    metadata = {
        'CFBundleDevelopmentRegion': 'zh_CN',
        'CFBundleLocalizations': ['zh_CN'],
        'CFBundleDisplayName': '算数练习室',
        'CFBundleName': '算数练习室',
        'CFBundleExecutable': 'ArithmeticStudio',
        'CFBundleIdentifier': 'local.jacksongao.ArithmeticStudio',
        'CFBundlePackageType': 'APPL',
        'CFBundleShortVersionString': '1.0.1',
        'CFBundleVersion': '2',
        'CFBundleIconFile': 'AppIcon',
        'LSMinimumSystemVersion': '12.0',
        'LSApplicationCategoryType': 'public.app-category.education',
        'NSHighResolutionCapable': True,
        'NSSupportsAutomaticGraphicsSwitching': True,
        'NSPrincipalClass': 'NSApplication',
        'NSHumanReadableCopyright': '算数练习室 · 本地离线版',
    }
    with (contents / 'Info.plist').open('wb') as f:
        plistlib.dump(metadata, f)
    (contents / 'PkgInfo').write_text('APPL????')
    module_cache = Path(tempfile.gettempdir()) / 'arithmetic-studio-swift-module-cache'
    subprocess.run(['xcrun', 'swiftc', '-O', '-target', 'arm64-apple-macosx12.0',
                    '-module-cache-path', str(module_cache), str(ROOT / 'native/main.swift'),
                    '-framework', 'Cocoa', '-framework', 'WebKit',
                    '-o', str(executables / 'ArithmeticStudio')], check=True)
    subprocess.run(['xcrun', 'swift', '-module-cache-path', str(module_cache),
                    str(ROOT / 'native/make-icon.swift'), str(work / 'AppIcon.iconset')], check=True)
    # ICNS uses a big-endian container of PNG representations. Writing it directly
    # avoids iconutil's dependency on host image conversion services.
    representations = [
        (b'icp4', 'icon_16x16.png'), (b'icp5', 'icon_32x32.png'),
        (b'icp6', 'icon_32x32@2x.png'), (b'ic07', 'icon_128x128.png'),
        (b'ic08', 'icon_256x256.png'), (b'ic09', 'icon_512x512.png'),
        (b'ic10', 'icon_512x512@2x.png'),
    ]
    blocks = []
    for kind, name in representations:
        png = (work / 'AppIcon.iconset' / name).read_bytes()
        blocks.append(kind + struct.pack('>I', 8 + len(png)) + png)
    icon = b''.join(blocks)
    (resources / 'AppIcon.icns').write_bytes(b'icns' + struct.pack('>I', 8 + len(icon)) + icon)
    subprocess.run(['codesign', '--force', '--sign', '-', str(bundle)], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(bundle)], check=True)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        existing = destination / 'Contents/Info.plist'
        if not existing.exists() or plistlib.loads(existing.read_bytes()).get('CFBundleIdentifier') != metadata['CFBundleIdentifier']:
            parser.error('Refusing to replace an unrelated application')
        shutil.rmtree(destination)
    shutil.copytree(bundle, destination)
print(f'已构建：{destination}')
