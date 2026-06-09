import { describe, expect, it } from 'vitest'
import { openZip, ZipError } from '../../../src/read/io/zip'

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
  it('EOCD シグネチャが無ければ ZipError', async () => {
    await expect(openZip(new Uint8Array(40))).rejects.toThrow(ZipError)
  })

  it('ZIP64（cdOffset=0xffffffff）は未対応で ZipError', async () => {
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint32(16, 0xffffffff, true)
    await expect(openZip(eocd)).rejects.toThrow(/ZIP64/)
  })

  it('エントリ単位の ZIP64 マーカー（localOffset=0xffffffff）は未対応で ZipError', async () => {
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

  it('未対応の圧縮方式は ZipError', async () => {
    const zip = await openZip(buildSingle('a.txt', 'x', 99))
    await expect(zip.readBytes('a.txt')).rejects.toThrow(/圧縮方式/)
  })
})
