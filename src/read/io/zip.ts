import type { ZipLimits } from '../types.js'

const SIG_EOCD = 0x06054b50 // End Of Central Directory
const SIG_CDH = 0x02014b50 // Central Directory Header
const SIG_LFH = 0x04034b50 // Local File Header

export type ZipErrorCode = 'not-zip' | 'invalid' | 'unsupported' | 'too-large'

export class ZipError extends Error {
  readonly code: ZipErrorCode
  constructor(code: ZipErrorCode, message: string) {
    super(message)
    this.name = 'ZipError'
    this.code = code
  }
}

// ZIP 爆弾対策の既定上限（数 KB が GB に膨らむ展開で OOM するのを防ぐ）
const DEFAULT_MAX_ENTRY_BYTES = 300 * 1024 * 1024
const DEFAULT_MAX_TOTAL_BYTES = 600 * 1024 * 1024

type Entry = {
  method: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

export type ZipArchive = {
  has(name: string): boolean
  readBytes(name: string): Promise<Uint8Array>
  readText(name: string): Promise<string>
}

const utf8 = new TextDecoder()

/**
 * 中央ディレクトリの宣言値は ZIP 爆弾が小さく偽装しうるので信用しない
 * ストリームを 1 チャンクずつ読みながら累積バイトを測り、limit 超過で打ち切る
 */
async function inflateRaw(data: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('unsupported', 'DecompressionStream is not available in this environment')
  }
  let decompressor: DecompressionStream
  try {
    decompressor = new DecompressionStream('deflate-raw')
  } catch {
    // 構築自体が失敗するのは deflate-raw 未対応（Node 20.11 以下・旧ブラウザ）
    // 破損扱い(invalid-xlsx)でなく環境要因として明示する
    throw new ZipError(
      'unsupported',
      'DecompressionStream does not support deflate-raw in this environment',
    )
  }
  const stream = new Blob([data]).stream().pipeThrough(decompressor)
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) {
        await reader.cancel() // 上流の展開を止めてメモリ膨張を防ぐ
        throw new ZipError('too-large', `Decompressed size exceeded the limit (${limit} bytes)`)
      }
      chunks.push(value)
    }
  } catch (e) {
    // 壊れた deflate ストリームの例外は実装依存の英語メッセージなので包み直す
    if (e instanceof ZipError) throw e
    throw new ZipError('invalid', 'Compressed data is corrupt')
  }

  const out = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    out.set(chunk, at)
    at += chunk.byteLength
  }
  return out
}

/**
 * EOCD（固定部 22 バイト）の後ろには最大 0xFFFF バイトのコメントが付きうるので、末尾から遡って探す
 */
function findEocd(bytes: Uint8Array, view: DataView): number {
  const n = bytes.length
  if (n < 22) throw new ZipError('not-zip', 'Too short to be a ZIP')
  const minPos = Math.max(0, n - 22 - 0xffff)
  for (let p = n - 22; p >= minPos; p--) {
    if (view.getUint32(p, true) === SIG_EOCD) return p
  }
  throw new ZipError('not-zip', 'EOCD not found (not a ZIP)')
}

export async function openZip(
  input: ArrayBuffer | Uint8Array,
  limits: ZipLimits = {},
): Promise<ZipArchive> {
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES

  // Blob/DecompressionStream の型要件でバッファを ArrayBuffer 固定で扱う
  const bytes = (
    input instanceof Uint8Array ? input : new Uint8Array(input)
  ) as Uint8Array<ArrayBuffer>
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const eocd = findEocd(bytes, view)
  const total = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipError('invalid', 'ZIP64 is not supported')
  }

  const entries = new Map<string, Entry>()
  let p = cdOffset
  for (let idx = 0; idx < total; idx++) {
    // 切断された CD で DataView の RangeError（英語の内部メッセージ）を漏らさない
    if (p + 46 > view.byteLength || view.getUint32(p, true) !== SIG_CDH) {
      throw new ZipError('invalid', 'Central directory is corrupt')
    }
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const uncompressedSize = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    // エントリ単位の ZIP64 マーカー（実値は extra に逃がされる）
    // 見逃すと巨大オフセット/サイズで壊れた deflate を食って不明瞭に失敗するため明示エラーにする
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new ZipError('invalid', 'ZIP64 is not supported')
    }
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }

  const cache = new Map<string, Uint8Array>()
  let totalDecompressed = 0

  async function readBytes(name: string): Promise<Uint8Array> {
    const cached = cache.get(name)
    if (cached) return cached

    const entry = entries.get(name)
    if (!entry) throw new ZipError('invalid', `Entry not found: ${name}`)

    if (
      entry.localOffset + 30 > view.byteLength ||
      view.getUint32(entry.localOffset, true) !== SIG_LFH
    ) {
      throw new ZipError('invalid', 'Local header is corrupt')
    }

    // name/extra 長はローカルヘッダ自身から読む（中央ディレクトリと異なりうる）
    const nameLen = view.getUint16(entry.localOffset + 26, true)
    const extraLen = view.getUint16(entry.localOffset + 28, true)
    const dataStart = entry.localOffset + 30 + nameLen + extraLen
    // 中央ディレクトリがローカルデータ領域の終端
    // stored(method 0) は宣言 compressedSize が実体より大きくても deflate のように壊れず素通りし、
    // subarray が後続バイト（CD 等）を含んだまま返す silent corruption になりうる
    if (dataStart + entry.compressedSize > cdOffset) {
      throw new ZipError('invalid', 'Entry data range exceeds the archive boundary')
    }
    const data = bytes.subarray(dataStart, dataStart + entry.compressedSize)

    const limit = Math.min(maxEntryBytes, maxTotalBytes - totalDecompressed)
    if (limit < 0) {
      throw new ZipError(
        'too-large',
        `Decompressed size exceeded the total limit (${maxTotalBytes} bytes)`,
      )
    }

    let out: Uint8Array
    if (entry.method === 0) {
      // 無圧縮は入力バッファ内に収まっており膨張しないが、累積予算には数える
      if (data.byteLength > limit) {
        throw new ZipError('too-large', `Decompressed size exceeded the limit (${limit} bytes)`)
      }
      out = data
    } else if (entry.method === 8) {
      // 宣言値が正直に大きい爆弾は展開前に弾く（嘘の宣言値はストリーム側で打ち切る）
      if (entry.uncompressedSize > limit) {
        throw new ZipError('too-large', `Decompressed size exceeded the limit (${limit} bytes)`)
      }
      out = await inflateRaw(data, limit)
    } else {
      throw new ZipError('invalid', `Unsupported compression method: ${entry.method}`)
    }
    totalDecompressed += out.byteLength
    cache.set(name, out)
    return out
  }

  return {
    has: (name) => entries.has(name),
    readBytes,
    readText: async (name) => utf8.decode(await readBytes(name)),
  }
}
