// Zips wordpress/colvy → public/downloads/colvy-wordpress.zip so Settings → API
// can offer "Download plugin". Runs before `next build` (npm "prebuild").
// No dependencies: a minimal ZIP writer over node:zlib.

import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'

const root = join(process.cwd(), 'wordpress', 'colvy')
const out = join(process.cwd(), 'public', 'downloads', 'colvy-wordpress.zip')

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

const files = []
const walk = dir => {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p); else files.push(p)
  }
}
walk(root)

// DOS date/time for "now" — WordPress shows it nowhere, but unzip tools like a sane value.
const d = new Date()
const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()

const locals = [], centrals = []
let offset = 0
for (const p of files) {
  const name = Buffer.from('colvy/' + relative(root, p).split(sep).join('/'))
  const data = readFileSync(p)
  const comp = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const lh = Buffer.alloc(30)
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8)
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14)
  lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
  locals.push(lh, name, comp)
  const ch = Buffer.alloc(46)
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(8, 10)
  ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16)
  ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28)
  ch.writeUInt32LE(offset, 42)
  centrals.push(ch, name)
  offset += lh.length + name.length + comp.length
}
const cd = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)

mkdirSync(join(process.cwd(), 'public', 'downloads'), { recursive: true })
writeFileSync(out, Buffer.concat([...locals, cd, end]))
console.log(`[wp-plugin] ${files.length} files → public/downloads/colvy-wordpress.zip`)
