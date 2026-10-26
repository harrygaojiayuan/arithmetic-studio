import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const directory = process.argv[2] || 'release';
const files = readdirSync(directory).filter(file => /\.(exe|zip)$/.test(file)).sort();
if (!files.length) throw new Error('没有找到 Windows 发布文件');
const sums=[];
for (const file of files) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(join(directory,file))) hash.update(chunk);
  sums.push(`${hash.digest('hex')}  ${file}`);
}
writeFileSync(join(directory,'SHA256SUMS.txt'),`${sums.join('\n')}\n`);
