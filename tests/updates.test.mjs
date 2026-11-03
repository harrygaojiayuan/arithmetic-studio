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
  return { updater, service:new UpdateController(updater,{currentVersion:'1.2.4',supported}) };
}

test('updates require explicit check, download and install; duplicate actions coalesce and do not downgrade or use prereleases', async () => {
  const {updater,service}=fixture();
  assert.equal(updater.autoDownload,false); assert.equal(updater.autoInstallOnAppQuit,false);
  assert.equal(updater.allowPrerelease,false); assert.equal(updater.allowDowngrade,false);
  await service.download(); service.install();
  assert.equal(updater.downloads,0); assert.equal(updater.installs,0);
  await Promise.all([service.check(),service.check()]);
  assert.equal(updater.checks,1); assert.equal(service.snapshot().status,'available');
  const events=[]; service.on('change',state=>events.push(state));
  await Promise.all([service.download(),service.download()]);
  assert.equal(updater.downloads,1); assert.equal(updater.installs,0);
  assert.ok(events.some(state=>state.status==='downloading'&&state.progress===47));
  assert.equal(service.snapshot().status,'downloaded');
  await service.check(); assert.equal(updater.checks,1);
  service.install(); service.install(); await new Promise(setImmediate);
  assert.equal(updater.installs,1);
});

test('offline, checksum and install errors stay recoverable and never install failed downloads', async () => {
  const {updater,service}=fixture();
  const check=updater.checkForUpdates;
  updater.checkForUpdates=async()=>{throw new Error('network /private/local/path');};
  await service.check(); assert.equal(service.snapshot().status,'error');
  assert.ok(!service.snapshot().message.includes('/private/'));
  updater.checkForUpdates=check; await service.check();
  updater.downloadUpdate=async()=>{throw new Error('sha512 checksum mismatch');};
  await service.download(); assert.match(service.snapshot().message,/校验失败/);
  service.install(); await new Promise(setImmediate); assert.equal(updater.installs,0);
  await service.check(); assert.equal(service.snapshot().status,'available');
  updater.emit('update-downloaded',{version:'2.0.0'});
  updater.quitAndInstall=()=>{throw new Error('installer denied');};
  service.install(); await new Promise(setImmediate); assert.equal(service.snapshot().status,'error');
});

test('unsupported builds do not request updates and latest-version checks do not offer a download', async () => {
  const unsupported=fixture(false);
  await unsupported.service.check(); await unsupported.service.download(); unsupported.service.install();
  assert.equal(unsupported.updater.checks,0);
  const {updater,service}=fixture();
  updater.checkForUpdates=async()=>{updater.emit('update-not-available',{version:'1.2.4'});return {};};
  await service.check(); assert.equal(service.snapshot().status,'current');
  await service.download(); assert.equal(updater.downloads,0);
});
