'use strict';
const { app, BrowserWindow, Menu, protocol, session, ipcMain, dialog } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { PracticeStore } = require('./store.cjs');

const APP_URL = 'arithmetic://app/index.html';
const smoke = process.argv.includes('--smoke-test');
const option = name => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
let window, store;
const rendererErrors = [];
app.setName('ArithmeticStudio');
const directory = smoke ? option('--smoke-data-dir') : path.join(app.getPath('appData'), 'ArithmeticStudio');
if (!directory) throw new Error('Smoke tests require an isolated data directory');
app.setPath('userData', path.resolve(directory));
protocol.registerSchemesAsPrivileged([{ scheme: 'arithmetic', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    try {
      store = new PracticeStore(app.getPath('userData'));
      installStorage();
      installProtocol();
      session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
      session.defaultSession.setPermissionCheckHandler(() => false);
      // This app serves bundled assets only and never needs a network connection.
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
      window = new BrowserWindow({
        title: '算数练习室', width: 1100, height: 850, minWidth: 380, minHeight: 620,
        backgroundColor: '#f7f8f2', show: false, autoHideMenuBar: true,
        icon: path.join(__dirname, '../assets/icon.png'),
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true,
          nodeIntegration: false, sandbox: true, webSecurity: true,
          backgroundThrottling: false
        }
      });
      const active = window;
      active.webContents.on('preload-error', (_event, _file, error) => rendererErrors.push(`preload: ${error.message}`));
      active.webContents.on('console-message', (_event, ...args) => {
        const message = typeof args[0] === 'object' ? args[0]?.message : args[1];
        if (message) rendererErrors.push(String(message));
      });
      active.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      active.webContents.on('will-navigate', (event, url) => { if (url !== APP_URL) event.preventDefault(); });
      active.on('closed', () => { window = null; });
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        { label: '应用', submenu: [{ label: '退出', role: 'quit' }] },
        { label: '编辑', submenu: [{ label: '撤销', role: 'undo' }, { type: 'separator' }, { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' }, { label: '全选', role: 'selectAll' }] },
        { label: '窗口', submenu: [{ label: '最小化', role: 'minimize' }, { label: '切换全屏', role: 'togglefullscreen' }] }
      ]));
      await active.loadURL(APP_URL);
      if (smoke) {
        await require('./smoke.cjs').runSmoke(active, store, option('--smoke-report'));
        app.quit();
      } else active.show();
    } catch (error) {
      if (smoke) {
        const report = option('--smoke-report');
        if (report) fs.writeFileSync(report, JSON.stringify({ ok: false, error: error.stack, rendererErrors }, null, 2));
        console.error(error); app.exit(1);
      } else {
        dialog.showErrorBox('无法打开算数练习室', `${error.message}\n\n数据位置：${app.getPath('userData')}`);
        app.quit();
      }
    }
  });
}

function installStorage() {
  ipcMain.on('practice-storage', (event, message) => {
    try {
      if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== APP_URL) throw new Error('无效的应用页面');
      if (message?.action === 'snapshot') event.returnValue = { ok: true, value: store.snapshot() };
      else {
        store.update(message?.action, message?.key, message?.value);
        event.returnValue = { ok: true };
      }
    } catch (error) { event.returnValue = { ok: false, error: error.message }; }
  });
}

function installProtocol() {
  const types = new Map([['index.html','text/html'], ['styles.css','text/css'], ['app.mjs','text/javascript'], ['core.mjs','text/javascript']]);
  protocol.handle('arithmetic', request => {
    const url = new URL(request.url);
    const file = url.pathname.slice(1);
    if (request.method !== 'GET' || url.hostname !== 'app' || !types.has(file)) return new Response('Not found', { status: 404 });
    let content = fs.readFileSync(path.join(__dirname, '../dist', file), 'utf8');
    if (file === 'app.mjs') content = content.replaceAll('当前浏览器','这台电脑').replaceAll('浏览器存储不可用','本地存储不可用').replaceAll('关闭页面后设置和成绩将无法保存','退出 App 后设置和成绩将无法保存').replaceAll('清除浏览器数据会删除记录','关闭 App 后仍会保留记录').replaceAll('切换页面不会暂停','切换窗口或关闭 App 后也不会暂停');
    return new Response(content, { headers: {
      'Content-Type': `${types.get(file)}; charset=utf-8`,
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'"
    } });
  });
}

app.on('window-all-closed', () => app.quit());
