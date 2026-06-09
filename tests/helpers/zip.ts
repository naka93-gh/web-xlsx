// テスト用: path→内容のマップから xlsx 相当の ZIP バイトを組む（全エントリ deflate）

const enc = new TextEncoder()

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** path→内容（XML 文字列）のマップから ZIP を構築する（CRC は 0） */
export async function buildXlsx(files: Record<string, string>): Promise<Uint8Array> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const [name, content] of Object.entries(files)) {
    const raw = enc.encode(content)
    const data = await deflateRaw(raw)
    const nameBytes = enc.encode(name)

    const lh = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, 8, true)
    lv.setUint32(18, data.length, true)
    lv.setUint32(22, raw.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lh.set(nameBytes, 30)
    lh.set(data, 30 + nameBytes.length)
    locals.push(lh)

    const ch = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(10, 8, true)
    cv.setUint32(20, data.length, true)
    cv.setUint32(24, raw.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    ch.set(nameBytes, 46)
    centrals.push(ch)

    offset += lh.length
  }

  const cdStart = offset
  const cdSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const count = Object.keys(files).length
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, count, true)
  ev.setUint16(10, count, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdStart, true)

  const parts = [...locals, ...centrals, eocd]
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
