import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('../assets/', import.meta.url));
mkdirSync(directory, { recursive: true });
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let i=0;i<8;i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function chunk(name, content) {
  const data = Buffer.concat([Buffer.from(name),content]);
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const header = Buffer.alloc(4), tail = Buffer.alloc(4);
  header.writeUInt32BE(content.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header,data,tail]);
}
function roundedRect(x,y,left,top,width,height,radius) {
  const dx = Math.max(left+radius-x, 0, x-(left+width-radius));
  const dy = Math.max(top+radius-y, 0, y-(top+height-radius));
  return x >= left && y >= top && x <= left+width && y <= top+height && dx*dx+dy*dy <= radius*radius;
}
function png(size) {
  const scanlines = Buffer.alloc(size*(size*4+1));
  const background = [61,102,77], foreground = [232,242,222];
  for (let y=0;y<size;y++) for (let x=0;x<size;x++) {
    const rgba = [0,0,0,0];
    for (const sy of [.25,.75]) for (const sx of [.25,.75]) {
      const px=(x+sx)*1024/size, py=(y+sy)*1024/size;
      if (!roundedRect(px,py,56,56,912,912,207)) continue;
      const plus = roundedRect(px,py,477,265,70,494,35) || roundedRect(px,py,265,477,494,70,35);
      const color = plus ? foreground : background;
      for (let c=0;c<3;c++) rgba[c] += color[c];
      rgba[3]++;
    }
    const index = y*(size*4+1)+1+x*4;
    for (let c=0;c<3;c++) scanlines[index+c] = rgba[3] ? Math.round(rgba[c]/rgba[3]) : 0;
    scanlines[index+3] = Math.round(rgba[3]*255/4);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
}
writeFileSync(`${directory}/icon.png`,png(1024));
const images = [16,32,48,64,128,256].map(size => ({ size, data:png(size) }));
const header = Buffer.alloc(6+images.length*16); header.writeUInt16LE(1,2); header.writeUInt16LE(images.length,4);
let offset=header.length;
images.forEach(({size,data},i) => {
  const index=6+i*16; header[index]=size%256; header[index+1]=size%256;
  header.writeUInt16LE(1,index+4); header.writeUInt16LE(32,index+6);
  header.writeUInt32LE(data.length,index+8); header.writeUInt32LE(offset,index+12); offset+=data.length;
});
writeFileSync(`${directory}/icon.ico`,Buffer.concat([header,...images.map(image=>image.data)]));
console.log('已生成 Windows 应用图标。');
