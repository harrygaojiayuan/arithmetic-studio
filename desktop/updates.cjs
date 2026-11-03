'use strict';
const { EventEmitter } = require('node:events');

// This controller has no access to PracticeStore or renderer-supplied URLs.
class UpdateController extends EventEmitter {
  constructor(updater, { currentVersion, supported = true } = {}) {
    super();
    this.updater = updater;
    this.pending = null;
    this.state = { currentVersion, supported, status: supported ? 'idle' : 'unsupported', version: null, progress: 0, message: supported ? '从 GitHub 检查最新正式版本。' : '请使用已安装的 Windows 版检查更新。', installLabel: '安装并重启' };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = true;
    updater.on('checking-for-update', () => this.set({ status:'checking', message:'正在检查 GitHub…', progress:0, version:null }));
    updater.on('update-available', info => this.set({ status:'available', version:info.version, message:`发现新版本 ${info.version}。` }));
    updater.on('update-not-available', () => this.set({ status:'current', version:null, message:'当前已是最新版本。' }));
    updater.on('download-progress', info => this.set({ status:'downloading', progress:Math.min(100, Math.max(0, Math.round(info.percent || 0))), message:'正在下载更新，请稍候…' }));
    updater.on('update-downloaded', info => this.set({ status:'downloaded', version:info.version, progress:100, message:'下载和校验已完成，可以安装并重启。练习记录会保留。' }));
    updater.on('error', error => this.fail(error));
  }
  snapshot() { return { ...this.state }; }
  set(values) { Object.assign(this.state, values); this.emit('change', this.snapshot()); }
  fail(error) {
    const checksum = /checksum|sha512|sha256/i.test(String(error?.message));
    this.set({ status:'error', progress:0, message:checksum ? '更新文件校验失败，请重新检查并下载。' : '更新失败，请检查网络连接后重试。练习记录不受影响。' });
  }
  async run(operation) {
    if (this.pending) return this.pending;
    this.pending = Promise.resolve().then(operation).catch(error => this.fail(error)).then(() => this.snapshot()).finally(() => { this.pending = null; });
    return this.pending;
  }
  check() {
    if (!this.state.supported || ['downloading','downloaded','installing'].includes(this.state.status)) return Promise.resolve(this.snapshot());
    return this.run(async () => {
      this.set({ status:'checking', message:'正在检查 GitHub…', progress:0, version:null });
      const result = await this.updater.checkForUpdates();
      if (!result) throw new Error('Updater unavailable');
    });
  }
  download() {
    if (!this.state.supported || this.state.status !== 'available') return Promise.resolve(this.snapshot());
    return this.run(async () => {
      this.set({ status:'downloading', progress:0, message:'正在下载更新，请稍候…' });
      await this.updater.downloadUpdate();
    });
  }
  install() {
    if (!this.state.supported || this.state.status !== 'downloaded') return this.snapshot();
    this.set({ status:'installing', message:'正在安装更新，应用将重新启动…' });
    setImmediate(() => {
      try { this.updater.quitAndInstall(true, true); } catch (error) { this.fail(error); }
    });
    return this.snapshot();
  }
}
module.exports = { UpdateController };
