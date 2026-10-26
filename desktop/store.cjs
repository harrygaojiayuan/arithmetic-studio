'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KEYS = new Set(['config', 'duration', 'records', 'session', 'probe'].map(name => `arithmetic-studio.${name}${name === 'probe' ? '' : '.v1'}`));
function validKey(key) { return typeof key === 'string' && KEYS.has(key); }

class PracticeStore {
  constructor(directory) {
    this.file = path.join(directory, 'data.json');
    fs.mkdirSync(directory, { recursive: true });
    this.values = Object.create(null);
    if (fs.existsSync(this.file)) {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.entries(data).some(([key,value]) => !validKey(key) || typeof value !== 'string')) {
        throw new Error('本地数据格式不正确，原文件已保留。');
      }
      Object.assign(this.values, data);
    }
  }

  snapshot() { return { ...this.values }; }

  update(action, key, value) {
    if (!validKey(key)) throw new Error('无效的数据键');
    const next = { ...this.values };
    if (action === 'set' && typeof value === 'string') next[key] = value;
    else if (action === 'remove') delete next[key];
    else throw new Error('无效的数据操作');
    const temporary = `${this.file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(next), { encoding: 'utf8', mode: 0o600, flush: true });
      fs.renameSync(temporary, this.file);
    } catch (error) {
      try { fs.unlinkSync(temporary); } catch {}
      throw error;
    }
    this.values = next;
  }
}
module.exports = { PracticeStore, validKey };
