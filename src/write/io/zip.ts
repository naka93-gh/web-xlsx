// ZIP コンテナの書き込み（CompressionStream で deflate-raw、CRC32 は自前）

import { crc32 } from './crc32.js'

const SIG_LFH = 0x04034b50 // Local File Header
const SIG_CDH = 0x02014b50 // Central Directory Header
const SIG_EOCD = 0x06054b50 // End Of Central Directory

// 固定のタイムスタンプ（1980-01-01）。出力を再現可能にするため現在時刻は使わない
const DOS_TIME = 0
const DOS_DATE = 0x21 // (year-1980=0)<<9 | month1<<5 | day1

/**
 * ZIP に入れる 1 エントリ
 */
export type ZipEntry = {
  /** アーカイブ内パス（例: "xl/worksheets/sheet1.xml"） */
  name: string
  /** 格納する生バイト列 */
  data: Uint8Array
}

const utf8 = new TextEncoder()

/**
 * deflate-raw 圧縮。CompressionStream 非対応環境では null（呼び側で stored にフォールバック）
 */
async function deflateRaw(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null
  let compressor: CompressionStream
  try {
    compressor = new CompressionStream('deflate-raw')
  } catch {
    // deflate-raw 未対応（Node 20.11 以下・旧ブラウザ）。stored で出せば xlsx は成立する
    return null
  }
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(compressor)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/**
 * 圧縮済みエントリの内部表現
 */
type Prepared = {
  nameBytes: Uint8Array
  method: number // 0=stored / 8=deflate
  crc: number
  data: Uint8Array // 格納する実バイト（圧縮 or 生）
  rawSize: number
  localOffset: number
}

/**
 * エントリ群を 1 つの ZIP バイト列に組み立てる
 *
 * 各エントリは deflate を試し、縮まなければ無圧縮(stored)で格納する。
 * ZIP64 は出さない（4GB 級は対象外）
 */
export async function buildZip(entries: ZipEntry[]): Promise<Uint8Array> {
  // 各エントリを圧縮（または stored）して、CRC・サイズ・配置オフセットを確定する
  const prepared: Prepared[] = []
  let offset = 0

  for (const entry of entries) {
    const raw = entry.data
    const deflated = await deflateRaw(raw)
    // 縮まない（小さいXML等）なら stored の方が小さい
    const useDeflate = deflated !== null && deflated.length < raw.length
    const data = useDeflate ? deflated : raw
    const nameBytes = utf8.encode(entry.name)
    prepared.push({
      nameBytes,
      method: useDeflate ? 8 : 0,
      crc: crc32(raw),
      data,
      rawSize: raw.length,
      localOffset: offset,
    })
    offset += 30 + nameBytes.length + data.length
  }

  // 各エントリのローカルヘッダ＋データと、中央ディレクトリヘッダを書き出す
  const cdStart = offset
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []

  for (const p of prepared) {
    // ローカルファイルヘッダ
    const lh = new Uint8Array(30 + p.nameBytes.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, SIG_LFH, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0, true) // flags
    lv.setUint16(8, p.method, true)
    lv.setUint16(10, DOS_TIME, true)
    lv.setUint16(12, DOS_DATE, true)
    lv.setUint32(14, p.crc, true)
    lv.setUint32(18, p.data.length, true) // compressed size
    lv.setUint32(22, p.rawSize, true) // uncompressed size
    lv.setUint16(26, p.nameBytes.length, true)
    lv.setUint16(28, 0, true) // extra length
    lh.set(p.nameBytes, 30)
    locals.push(lh, p.data)

    // 中央ディレクトリヘッダ
    const ch = new Uint8Array(46 + p.nameBytes.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, SIG_CDH, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0, true) // flags
    cv.setUint16(10, p.method, true)
    cv.setUint16(12, DOS_TIME, true)
    cv.setUint16(14, DOS_DATE, true)
    cv.setUint32(16, p.crc, true)
    cv.setUint32(20, p.data.length, true)
    cv.setUint32(24, p.rawSize, true)
    cv.setUint16(28, p.nameBytes.length, true)
    cv.setUint16(30, 0, true) // extra length
    cv.setUint16(32, 0, true) // comment length
    cv.setUint16(34, 0, true) // disk number start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, p.localOffset, true)
    ch.set(p.nameBytes, 46)
    centrals.push(ch)
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0)

  // EOCD
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, SIG_EOCD, true)
  ev.setUint16(4, 0, true) // disk number
  ev.setUint16(6, 0, true) // disk with cd
  ev.setUint16(8, prepared.length, true) // entries on this disk
  ev.setUint16(10, prepared.length, true) // total entries
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, cdStart, true)
  ev.setUint16(20, 0, true) // comment length

  // 連結
  const totalSize = cdStart + cdSize + 22
  const out = new Uint8Array(totalSize)
  let at = 0
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, at)
    at += part.length
  }
  return out
}
