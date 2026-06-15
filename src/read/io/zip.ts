// ZIP コンテナの読み取り（必要パーツだけ DecompressionStream で遅延展開）

import type { ZipLimits } from '../types.js'

const SIG_EOCD = 0x06054b50 // End Of Central Directory
const SIG_CDH = 0x02014b50 // Central Directory Header
const SIG_LFH = 0x04034b50 // Local File Header

/**
 * ZIP 読み取りの失敗コード
 *
 * - `not-zip` … そもそも ZIP コンテナとして認識できない（EOCD 不在 等）
 * - `invalid` … ZIP としては開けたが中身が壊れている/未対応（中央ディレクトリ破損・ZIP64 等）
 * - `unsupported` … 実行環境が DecompressionStream 非対応
 * - `too-large` … 解凍サイズが上限超過
 */
export type ZipErrorCode = 'not-zip' | 'invalid' | 'unsupported' | 'too-large'

/**
 * ZIP 読み取りの失敗
 */
export class ZipError extends Error {
  readonly code: ZipErrorCode
  constructor(code: ZipErrorCode, message: string) {
    super(message)
    this.name = 'ZipError'
    this.code = code
  }
}

// ZIP 爆弾対策の既定上限（数 KB が GB に膨らむ展開で OOM するのを防ぐ）
const DEFAULT_MAX_ENTRY_BYTES = 300 * 1024 * 1024 // 単体エントリの解凍サイズ上限
const DEFAULT_MAX_TOTAL_BYTES = 600 * 1024 * 1024 // アーカイブ全体の累積解凍サイズ上限

/**
 * central directory の 1 エントリ
 */
type Entry = {
  method: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
}

/**
 * 開いた ZIP アーカイブ
 */
export type ZipArchive = {
  has(name: string): boolean
  readBytes(name: string): Promise<Uint8Array>
  readText(name: string): Promise<string>
}

const utf8 = new TextDecoder()

/**
 * deflate-raw を展開する
 *
 * 中央ディレクトリの宣言値は信用できない（ZIP 爆弾は小さく偽装しうる）ため、
 * ストリームを 1 チャンクずつ読みながら累積バイトを測り、limit 超過で打ち切る
 */
async function inflateRaw(data: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('unsupported', 'DecompressionStream が利用できない環境です')
  }
  let decompressor: DecompressionStream
  try {
    decompressor = new DecompressionStream('deflate-raw')
  } catch {
    // 構築自体が失敗するのは deflate-raw 未対応（Node 20.11 以下・旧ブラウザ）
    // 破損扱い(invalid-xlsx)でなく環境要因として明示する
    throw new ZipError('unsupported', 'DecompressionStream が deflate-raw に未対応の環境です')
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
        throw new ZipError('too-large', `解凍サイズが上限(${limit} バイト)を超えました`)
      }
      chunks.push(value)
    }
  } catch (e) {
    // 壊れた deflate ストリームの例外は実装依存の英語メッセージなので包み直す
    if (e instanceof ZipError) throw e
    throw new ZipError('invalid', '圧縮データが壊れています')
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
 * 末尾から EOCD シグネチャを探す（後ろにコメントが付きうる）
 */
function findEocd(bytes: Uint8Array, view: DataView): number {
  const n = bytes.length
  if (n < 22) throw new ZipError('not-zip', 'ZIP として短すぎます')
  const minPos = Math.max(0, n - 22 - 0xffff)
  for (let p = n - 22; p >= minPos; p--) {
    if (view.getUint32(p, true) === SIG_EOCD) return p
  }
  throw new ZipError('not-zip', 'EOCD が見つかりません（ZIP ではありません）')
}

/**
 * ZIP バイト列を開き、エントリを名前引きできるアーカイブを返す
 *
 * 展開は readBytes/readText の呼び出し時に遅延実行し、結果をキャッシュする
 */
export async function openZip(
  input: ArrayBuffer | Uint8Array,
  limits: ZipLimits = {},
): Promise<ZipArchive> {
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES

  // 入力を正規化し、解析用の DataView を張る
  // 解析中はバッファを ArrayBuffer 固定で扱う（Blob/DecompressionStream の型要件）
  const bytes = (
    input instanceof Uint8Array ? input : new Uint8Array(input)
  ) as Uint8Array<ArrayBuffer>
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // EOCD を見つけて中央ディレクトリの位置とエントリ数を得る
  const eocd = findEocd(bytes, view)
  const total = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipError('invalid', 'ZIP64 は未対応です')
  }

  // 中央ディレクトリを走査してエントリ表（名前 → 位置・サイズ）を作る
  const entries = new Map<string, Entry>()
  let p = cdOffset
  for (let idx = 0; idx < total; idx++) {
    // 切断された CD で DataView の RangeError（英語の内部メッセージ）を漏らさない
    if (p + 46 > view.byteLength || view.getUint32(p, true) !== SIG_CDH) {
      throw new ZipError('invalid', '中央ディレクトリが壊れています')
    }
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const uncompressedSize = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    // エントリ単位の ZIP64 マーカー（実値は extra に逃がされる）
    // 未検出だと巨大オフセット/サイズで壊れた deflate を食って不明瞭失敗するため明示エラーに
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff
    ) {
      throw new ZipError('invalid', 'ZIP64 は未対応です')
    }
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }

  const cache = new Map<string, Uint8Array>()
  let totalDecompressed = 0 // 展開済みエントリの累積バイト（アーカイブ全体の上限判定）

  async function readBytes(name: string): Promise<Uint8Array> {
    // 同じエントリの再展開を避ける
    const cached = cache.get(name)
    if (cached) return cached

    // エントリ表から位置を引く
    const entry = entries.get(name)
    if (!entry) throw new ZipError('invalid', `エントリが見つかりません: ${name}`)

    // ローカルヘッダを検証し、圧縮データの開始位置を求める
    if (
      entry.localOffset + 30 > view.byteLength ||
      view.getUint32(entry.localOffset, true) !== SIG_LFH
    ) {
      throw new ZipError('invalid', 'ローカルヘッダが壊れています')
    }

    // name/extra 長はローカルヘッダ自身から読む（中央ディレクトリと異なりうる）
    const nameLen = view.getUint16(entry.localOffset + 26, true)
    const extraLen = view.getUint16(entry.localOffset + 28, true)
    const dataStart = entry.localOffset + 30 + nameLen + extraLen
    // 切り出し範囲が中央ディレクトリ（= ローカルデータ領域の終端）を越えないか検査する
    // stored(method 0) は宣言 compressedSize が実体より大きくても deflate のように壊れず
    // 素通りし、subarray が後続バイト（CD 等）を含んだまま返す silent corruption になりうる
    if (dataStart + entry.compressedSize > cdOffset) {
      throw new ZipError('invalid', 'エントリのデータ範囲がアーカイブ境界を超えています')
    }
    const data = bytes.subarray(dataStart, dataStart + entry.compressedSize)

    // このエントリに許す解凍サイズの上限を決める
    // 残り予算（全体上限 − 既展開分）と単体上限の小さい方をこのエントリの上限に
    const limit = Math.min(maxEntryBytes, maxTotalBytes - totalDecompressed)
    if (limit < 0) {
      throw new ZipError('too-large', `解凍サイズが全体上限(${maxTotalBytes} バイト)を超えました`)
    }

    // 圧縮方式ごとに展開する（無圧縮はそのまま、deflate は展開、それ以外は非対応）
    let out: Uint8Array
    if (entry.method === 0) {
      // 無圧縮は入力バッファ内に収まっており膨張しないが、累積予算には数える
      if (data.byteLength > limit) {
        throw new ZipError('too-large', `解凍サイズが上限(${limit} バイト)を超えました`)
      }
      out = data
    } else if (entry.method === 8) {
      // 宣言値が正直に大きい爆弾は展開前に弾く（嘘の宣言値はストリーム側で打ち切る）
      if (entry.uncompressedSize > limit) {
        throw new ZipError('too-large', `解凍サイズが上限(${limit} バイト)を超えました`)
      }
      out = await inflateRaw(data, limit)
    } else {
      throw new ZipError('invalid', `未対応の圧縮方式です: ${entry.method}`)
    }
    // 累積に加えてキャッシュし返す
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
