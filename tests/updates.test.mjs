import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { UpdateController } from '../desktop/updates.cjs';

function fixture(supported = true) {
  const updater = new EventEmitter();
  updater.checks=0; updater.downloads=0; updater.installs=0;
  updater.checkForUpdates = async () => { updater.checks++; updater.emit('update-available',{version:'2.0.0'}); return {}; };
  updater.downloadUpdate = async () => { updater.downloads++; updater.emit('download-progress',{percent:47.3}); updater.emit('update-downloaded',{version:'2.0.0'}); return ['installer.exe']; };
  updater.quitAndInstall = (silent,restart) => { assert.equal(silent,true); assert.equal(restart,true); updater.installs++; };
  return { updater, service:new UpdateController(updater,{currentVersion:'1.2.5',supported}) };
}

test('one install action downloads, verifies and silently installs with restart; duplicates coalesce', async () => {
  const {updater,service}=fixture();
  assert.equal(updater.autoDownload,false); assert.equal(updater.autoInstallOnAppQuit,false);
  assert.equal(updater.allowPrerelease,false); assert.equal(updater.allowDowngrade,false);
  await service.install(); assert.equal(updater.downloads,0); assert.equal(updater.installs,0);
  await Promise.all([service.check(),service.check()]);
  assert.equal(updater.checks,1); assert.equal(service.snapshot().status,'available');
  assert.equal(updater.downloads,0); assert.equal(updater.installs,0);
  const events=[]; service.on('change',state=>events.push(state));
  await Promise.all([service.install(),service.install()]);
  await new Promise(setImmediate);
  assert.equal(updater.downloads,1); assert.equal(updater.installs,1);
  assert.ok(events.some(state=>state.status==='downloading'&&state.progress===47));
  assert.equal(service.snapshot().status,'installing');
  await service.check(); await service.install();
  assert.equal(updater.checks,1); assert.equal(updater.installs,1);
});

test('offline, checksum and install errors remain recoverable and failed downloads never install', async () => {
  const {updater,service}=fixture();
  const check=updater.checkForUpdates, download=updater.downloadUpdate;
  updater.checkForUpdates=async()=>{throw new Error('network /private/local/path');};
  await service.check(); assert.equal(service.snapshot().status,'error');
  assert.ok(!service.snapshot().message.includes('/private/'));
  updater.checkForUpdates=check; await service.check();
  updater.downloadUpdate=async()=>{throw new Error('sha512 checksum mismatch');};
  await service.install(); assert.match(service.snapshot().message,/校验失败/);
  await new Promise(setImmediate); assert.equal(updater.installs,0);
  await service.check(); assert.equal(service.snapshot().status,'available');
  updater.downloadUpdate=download;
  updater.quitAndInstall=()=>{throw new Error('installer denied');};
  await service.install(); await new Promise(setImmediate); assert.equal(service.snapshot().status,'error');
});

test('a resolved but incomplete download and emitted download error never launch an installer', async () => {
  for (const emitError of [false,true]) {
    const {updater,service}=fixture();
    await service.check();
    updater.downloadUpdate=async()=>{ if(emitError) updater.emit('error',new Error('failed')); return []; };
    await service.install(); await new Promise(setImmediate);
    assert.equal(updater.installs,0); assert.equal(service.snapshot().status,'error');
  }
});

test('unsupported and current builds do not download or install', async () => {
  const unsupported=fixture(false);
  await unsupported.service.check(); await unsupported.service.install();
  assert.equal(unsupported.updater.checks,0); assert.equal(unsupported.updater.downloads,0);
  const {updater,service}=fixture();
  updater.checkForUpdates=async()=>{updater.emit('update-not-available',{version:'1.2.5'});return {};};
  await service.check(); assert.equal(service.snapshot().status,'current');
  await service.install(); assert.equal(updater.downloads,0);
});
