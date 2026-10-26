'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function request(message) {
  const reply = ipcRenderer.sendSync('practice-storage', message);
  if (!reply?.ok) throw new Error(reply?.error || '无法保存本地数据');
  return reply.value;
}

const values = Object.assign(Object.create(null), request({ action: 'snapshot' }));
contextBridge.exposeInMainWorld('ArithmeticDesktop', true);
contextBridge.exposeInMainWorld('arithmeticStorage', {
  getItem(key) { key = String(key); return Object.hasOwn(values, key) ? values[key] : null; },
  setItem(key, value) {
    key = String(key); value = String(value);
    request({ action: 'set', key, value });
    values[key] = value;
  },
  removeItem(key) {
    key = String(key); request({ action: 'remove', key }); delete values[key];
  },
  snapshot() { return { ...values }; }
});
