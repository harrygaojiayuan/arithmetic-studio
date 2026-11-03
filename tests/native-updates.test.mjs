import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('Mac update bridge sends only action identifiers and correlates replies and state notifications', async () => {
  const messages=[];
  const window={webkit:{messageHandlers:{arithmeticUpdates:{postMessage:message=>messages.push(message)}}}};
  vm.runInNewContext(readFileSync(new URL('../native/update-bridge.js',import.meta.url),'utf8'),{window});
  const pending=window.arithmeticUpdates.check();
  assert.equal(messages.length,1); assert.equal(messages[0].action,'check');
  assert.deepEqual(Object.keys(messages[0]).sort(),['action','id']);
  window.__arithmeticUpdateReply(messages[0].id,{status:'checking'});
  assert.equal((await pending).status,'checking');
  const seen=[]; const unsubscribe=window.arithmeticUpdates.onState(state=>seen.push(state));
  window.__arithmeticUpdateState({status:'available'});
  assert.equal(seen.length,1); unsubscribe();
  window.__arithmeticUpdateState({status:'downloaded'});
  assert.equal(seen.length,1);
});
