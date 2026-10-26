(() => {
  'use strict';
  const values = Object.assign(Object.create(null), window.__ARITHMETIC_INITIAL_DATA__ || {});
  delete window.__ARITHMETIC_INITIAL_DATA__;
  const send = message => window.webkit.messageHandlers.arithmeticStorage.postMessage(message);
  window.ArithmeticDesktop = true;
  window.arithmeticStorage = Object.freeze({
    getItem(key) { key = String(key); return Object.hasOwn(values, key) ? values[key] : null; },
    setItem(key, value) {
      key = String(key); value = String(value);
      if (!key.startsWith('arithmetic-studio.')) throw new Error('无效的本地数据键');
      send({ action: 'set', key, value });
      values[key] = value;
    },
    removeItem(key) {
      key = String(key);
      if (!key.startsWith('arithmetic-studio.')) return;
      send({ action: 'remove', key });
      delete values[key];
    },
    snapshot() { return { ...values }; }
  });
})();
