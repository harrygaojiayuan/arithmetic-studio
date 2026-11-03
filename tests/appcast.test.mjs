import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { makeAppcast } from '../scripts/make-macos-appcast.mjs';

test('Mac appcast signs the exact archive and rejects a signing key that differs from the app', () => {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const archive=Buffer.from('test archive'), publicBytes=publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('base64');
  const options={version:'1.2.5',archive,publicKey:publicBytes,privateKey:privateKey.export({type:'pkcs8',format:'pem'})};
  const xml=makeAppcast(options);
  const signature=Buffer.from(xml.match(/sparkle:edSignature="([^"]+)"/)[1],'base64');
  assert.equal(verify(null,archive,publicKey,signature),true);
  assert.equal(verify(null,Buffer.from('modified archive'),publicKey,signature),false);
  assert.match(xml,/releases\/download\/v1\.2\.5\/ArithmeticStudio-1\.2\.5-macos-universal\.zip/);
  assert.match(xml,new RegExp(`length="${archive.length}"`));
  assert.throws(()=>makeAppcast({...options,publicKey:'wrong'}),/does not match/);
  assert.throws(()=>makeAppcast({...options,version:'<bad>'}),/Invalid release/);
  assert.ok(!xml.includes('PRIVATE KEY'));
});
