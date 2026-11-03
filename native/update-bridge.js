(() => {
  'use strict';
  const pending = new Map(), listeners = new Set();
  let counter = 0;
  window.__arithmeticUpdateReply = (id, state) => {
    const resolve = pending.get(id);
    if (resolve) { pending.delete(id); resolve(state); }
  };
  window.__arithmeticUpdateState = state => { for (const listener of listeners) listener(state); };
  const request = action => new Promise(resolve => {
    const id = ++counter;
    pending.set(id, resolve);
    window.webkit.messageHandlers.arithmeticUpdates.postMessage({ id, action });
  });
  window.arithmeticUpdates = Object.freeze({
    getState: () => request('state'), check: () => request('check'),
    download: () => request('download'), install: () => request('install'),
    onState(callback) { listeners.add(callback); return () => listeners.delete(callback); }
  });
})();
