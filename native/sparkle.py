"""Fetch the pinned official Sparkle distribution and verify it before use."""
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
CONFIG = json.loads((ROOT / 'native/sparkle.json').read_text())


def distribution():
    cache = ROOT / 'release' / f".sparkle-{CONFIG['version']}"
    archive = cache / 'distribution.tar.xz'
    cache.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        request = urllib.request.Request(CONFIG['url'], headers={'User-Agent': 'ArithmeticStudio-build'})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != CONFIG['sha256']:
            raise RuntimeError('Sparkle distribution checksum mismatch')
        archive.write_bytes(data)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != CONFIG['sha256']:
        raise RuntimeError('Cached Sparkle distribution checksum mismatch')
    if not (cache / 'Sparkle.framework').exists():
        subprocess.run(['tar', '-xf', str(archive), '-C', str(cache)], check=True)
    return cache
