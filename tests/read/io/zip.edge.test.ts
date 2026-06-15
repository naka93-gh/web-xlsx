import { describe, expect, it, vi } from 'vitest'
import { openZip, ZipError } from '../../../src/read/io/zip.js'

const enc = new TextEncoder()

/** 単一エントリの ZIP を任意の圧縮方式で組む（CRC 0・data は無圧縮の生バイト） */
function buildSingle(name: string, content: string, method: number): Uint8Array {
  const raw = enc.encode(content)
  const nameBytes = enc.encode(name)
  const lh = new Uint8Array(30 + nameBytes.length + raw.length)
  const lv = new DataView(lh.buffer)
  lv.setUint32(0, 0x04034b50, true)
  lv.setUint16(8, method, true)
  lv.setUint32(18, raw.length, true)
  lv.setUint32(22, raw.length, true)
  lv.setUint16(26, nameBytes.length, true)
  lh.set(nameBytes, 30)
  lh.set(raw, 30 + nameBytes.length)

  const ch = new Uint8Array(46 + nameBytes.length)
  const cv = new DataView(ch.buffer)
  cv.setUint32(0, 0x02014b50, true)
  cv.setUint16(10, method, true)
  cv.setUint32(20, raw.length, true)
  cv.setUint32(24, raw.length, true)
  cv.setUint16(28, nameBytes.length, true)
  cv.setUint32(42, 0, true)
  ch.set(nameBytes, 46)

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, 1, true)
  ev.setUint16(10, 1, true)
  ev.setUint32(12, ch.length, true)
  ev.setUint32(16, lh.length, true)

  const out = new Uint8Array(lh.length + ch.length + eocd.length)
  out.set(lh, 0)
  out.set(ch, lh.length)
  out.set(eocd, lh.length + ch.length)
  return out
}

describe('openZip エッジ', () => {
  it('EOCD シグネチャが無いとき ZipError を投げる', async () => {
    await expect(openZip(new Uint8Array(40))).rejects.toThrow(ZipError)
  })

  it('ZIP64（cdOffset=0xffffffff）のとき未対応で ZipError を投げる', async () => {
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint32(16, 0xffffffff, true)
    await expect(openZip(eocd)).rejects.toThrow(/ZIP64/)
  })

  it('エントリ単位の ZIP64 マーカー（localOffset=0xffffffff）のとき未対応で ZipError を投げる', async () => {
    const zip = buildSingle('a.txt', 'x', 0)
    // 中央ディレクトリヘッダ（localOffset は CDH 先頭 +42）を ZIP64 マーカーに差し替える
    const cdStart = zip.length - 22 - (46 + enc.encode('a.txt').length)
    new DataView(zip.buffer).setUint32(cdStart + 42, 0xffffffff, true)
    await expect(openZip(zip)).rejects.toThrow(/ZIP64/)
  })

  it('stored(0) は展開なしで読める', async () => {
    const zip = await openZip(buildSingle('a.txt', 'plain', 0))
    expect(await zip.readText('a.txt')).toBe('plain')
  })

  it('未対応の圧縮方式のとき ZipError を投げる', async () => {
    const zip = await openZip(buildSingle('a.txt', 'x', 99))
    await expect(zip.readBytes('a.txt')).rejects.toThrow(/compression method/)
  })

  it('stored の宣言 compressedSize 超過（隣接バイト混入）は invalid として拒否', async () => {
    // 実体 5B の stored エントリの CDH compressedSize を 30 に偽装する。
    // 検査が無いと subarray が後続の中央ディレクトリ("PK\x01\x02"…)を含んだまま黙って返る
    const zip = buildSingle('a.txt', 'hello', 0)
    const cdStart = zip.length - 22 - (46 + enc.encode('a.txt').length)
    new DataView(zip.buffer).setUint32(cdStart + 20, 30, true) // CDH compressedSize を 30 に
    const archive = await openZip(zip)
    await expect(archive.readBytes('a.txt')).rejects.toThrow(/boundary/)
  })

  it('中央ディレクトリが末尾で切れているとき RangeError でなく ZipError を投げる', async () => {
    const zip = buildSingle('a.txt', 'x', 0)
    // EOCD の cdOffset を末尾近く（46 バイト読めない位置）に書き換える
    new DataView(zip.buffer).setUint32(zip.length - 22 + 16, zip.length - 10, true)
    await expect(openZip(zip)).rejects.toThrow(/Central directory/)
  })

  it('ローカルヘッダが境界外を指しているとき RangeError でなく ZipError を投げる', async () => {
    const zip = buildSingle('a.txt', 'x', 0)
    // CDH の localOffset を末尾近く（30 バイト読めない位置）に書き換える
    const cdStart = zip.length - 22 - (46 + enc.encode('a.txt').length)
    new DataView(zip.buffer).setUint32(cdStart + 42, zip.length - 5, true)
    const archive = await openZip(zip)
    await expect(archive.readBytes('a.txt')).rejects.toThrow(/Local header/)
  })

  it('壊れた deflate ストリームのとき英語の内部メッセージでなく ZipError を投げる', async () => {
    // method=8 だが中身は生テキスト（不正な deflate データ）
    const zip = await openZip(buildSingle('a.txt', 'not-deflate-data', 8))
    await expect(zip.readBytes('a.txt')).rejects.toThrow(/Compressed data is corrupt/)
  })
})

describe('deflate-raw 非対応環境', () => {
  // 展開を要する deflate(8) エントリ。展開直前に環境要因で失敗させる
  const deflated = () => buildSingle('a.txt', 'x', 8)

  it('DecompressionStream が無い環境のとき unsupported を返す（破損扱いにしない）', async () => {
    const zip = await openZip(deflated())
    vi.stubGlobal('DecompressionStream', undefined)
    try {
      await expect(zip.readBytes('a.txt')).rejects.toMatchObject({
        code: 'unsupported',
      } satisfies Partial<ZipError>)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('DecompressionStream はあるが deflate-raw 未対応（構築で例外）のとき unsupported を返す', async () => {
    const zip = await openZip(deflated())
    class Broken {
      constructor() {
        throw new TypeError("Unsupported compression format: 'deflate-raw'")
      }
    }
    vi.stubGlobal('DecompressionStream', Broken)
    try {
      await expect(zip.readBytes('a.txt')).rejects.toMatchObject({
        code: 'unsupported',
      } satisfies Partial<ZipError>)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
