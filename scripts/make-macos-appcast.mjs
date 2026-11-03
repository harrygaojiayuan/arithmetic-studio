import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function makeAppcast({ version, archive, privateKey, publicKey, downloadURL }) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  const key = createPrivateKey(privateKey);
  const actual = createPublicKey(key).export({ type:'spki', format:'der' }).subarray(-32).toString('base64');
  if (key.asymmetricKeyType !== 'ed25519' || actual !== publicKey) throw new Error('Signing key does not match the embedded Mac public key');
  const signature = sign(null, archive, key);
  if (!verify(null, archive, createPublicKey(key), signature)) throw new Error('Update signature did not verify');
  const url = downloadURL ?? `https://github.com/harrygaojiayuan/arithmetic-studio/releases/download/v${version}/ArithmeticStudio-${version}-macos-universal.zip`;
  const escaped = url.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>算数练习室</title>
    <item>
      <title>算数练习室 ${version}</title>
      <sparkle:version>${version}</sparkle:version>
      <sparkle:shortVersionString>${version}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>12.0</sparkle:minimumSystemVersion>
      <enclosure url="${escaped}" length="${archive.length}" type="application/octet-stream" sparkle:edSignature="${signature.toString('base64')}" />
    </item>
  </channel>
</rss>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const version = JSON.parse(readFileSync('package.json')).version;
  const { publicKey } = JSON.parse(readFileSync('native/sparkle.json'));
  if (!process.env.MACOS_UPDATE_PRIVATE_KEY) throw new Error('MACOS_UPDATE_PRIVATE_KEY is required to sign a Mac release');
  const archive = readFileSync(`release/ArithmeticStudio-${version}-macos-universal.zip`);
  writeFileSync('release/appcast.xml', makeAppcast({ version, archive, publicKey, privateKey:process.env.MACOS_UPDATE_PRIVATE_KEY }));
  console.log(`Signed Mac update manifest for ${version}; private key was not written to the release.`);
}
