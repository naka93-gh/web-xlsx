import { describe, expect, it } from 'vitest'
import { openZip, ZipError } from '../../../src/read/io/zip.js'

const enc = new TextEncoder()

/** deflate-raw で圧縮 */
async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

type Spec = { name: string; content: string; method?: 0 | 8 }

/** テスト用の最小 ZIP を組み立てる（CRC は 0 のまま＝リーダは検査しない） */
async function buildZip(specs: Spec[]): Promise<Uint8Array> {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const spec of specs) {
    const method = spec.method ?? 0
    const raw = enc.encode(spec.content)
    const data = method === 8 ? await deflateRaw(raw) : raw
    const nameBytes = enc.encode(spec.name)

    const lh = new Uint8Array(30 + nameBytes.length + data.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(8, method, true)
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
    cv.setUint16(10, method, true)
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
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, specs.length, true)
  ev.setUint16(10, specs.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdStart, true)

  const parts = [...locals, ...centrals, eocd]
  const totalLen = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(totalLen)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

describe('openZip', () => {
  it('stored（無圧縮）エントリを読む', async () => {
    const zip = await openZip(await buildZip([{ name: 'a.txt', content: 'hello' }]))
    expect(await zip.readText('a.txt')).toBe('hello')
  })

  it('deflate エントリを展開して読む', async () => {
    const content = 'x'.repeat(500)
    const zip = await openZip(await buildZip([{ name: 'big.xml', content, method: 8 }]))
    expect(await zip.readText('big.xml')).toBe(content)
  })

  it('複数エントリ・ネストしたパスのとき has で存在判定し読む', async () => {
    const zip = await openZip(
      await buildZip([
        { name: '[Content_Types].xml', content: '<types/>' },
        { name: 'xl/worksheets/sheet1.xml', content: '<sheet/>', method: 8 },
      ]),
    )
    expect(zip.has('xl/worksheets/sheet1.xml')).toBe(true)
    expect(zip.has('nope')).toBe(false)
    expect(await zip.readText('xl/worksheets/sheet1.xml')).toBe('<sheet/>')
  })

  it('UTF-8（日本語）を正しくデコードする', async () => {
    const zip = await openZip(await buildZip([{ name: 's.xml', content: '名前と年齢', method: 8 }]))
    expect(await zip.readText('s.xml')).toBe('名前と年齢')
  })

  it('同じエントリを二度読んでも一致する（キャッシュ）', async () => {
    const zip = await openZip(await buildZip([{ name: 'a.txt', content: 'cached', method: 8 }]))
    expect(await zip.readText('a.txt')).toBe('cached')
    expect(await zip.readText('a.txt')).toBe('cached')
  })

  it('ZIP でないバイト列のとき ZipError を投げる', async () => {
    await expect(openZip(enc.encode('not a zip at all'))).rejects.toBeInstanceOf(ZipError)
  })

  it('存在しないエントリのとき ZipError を投げる', async () => {
    const zip = await openZip(await buildZip([{ name: 'a.txt', content: 'x' }]))
    await expect(zip.readBytes('missing')).rejects.toBeInstanceOf(ZipError)
  })
})

describe('openZip 解凍サイズ上限（ZIP 爆弾対策）', () => {
  /** EOCD から中央ディレクトリ先頭オフセットを得る */
  function cdOffset(zip: Uint8Array): number {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
    return view.getUint32(zip.length - 22 + 16, true)
  }

  it('単体エントリの宣言サイズが上限超過なら too-large で弾く', async () => {
    const zip = await openZip(await buildZip([{ name: 'big.xml', content: 'x'.repeat(200) }]), {
      maxEntryBytes: 50,
    })
    await expect(zip.readBytes('big.xml')).rejects.toMatchObject({ code: 'too-large' })
  })

  it('宣言サイズを小さく偽装しても、ストリーム展開中の累積で打ち切る', async () => {
    // deflate で大きく膨らむのに CDH の uncompressedSize を 5 と偽る ZIP 爆弾相当
    const bytes = await buildZip([{ name: 'bomb.xml', content: 'x'.repeat(5000), method: 8 }])
    new DataView(bytes.buffer).setUint32(cdOffset(bytes) + 24, 5, true)
    const zip = await openZip(bytes, { maxEntryBytes: 100 })
    await expect(zip.readBytes('bomb.xml')).rejects.toMatchObject({ code: 'too-large' })
  })

  it('アーカイブ全体の累積が上限を超えたとき too-large で弾く', async () => {
    const zip = await openZip(
      await buildZip([
        { name: 'a.xml', content: 'x'.repeat(60) },
        { name: 'b.xml', content: 'x'.repeat(60) },
      ]),
      { maxTotalBytes: 100 },
    )
    expect((await zip.readBytes('a.xml')).length).toBe(60)
    await expect(zip.readBytes('b.xml')).rejects.toMatchObject({ code: 'too-large' })
  })

  it('上限内なら通常どおり読める', async () => {
    const content = 'x'.repeat(1000)
    const zip = await openZip(await buildZip([{ name: 'ok.xml', content, method: 8 }]), {
      maxEntryBytes: 4096,
      maxTotalBytes: 8192,
    })
    expect(await zip.readText('ok.xml')).toBe(content)
  })
})
