// ZIP コンテナの読み取り（必要パーツだけ DecompressionStream で遅延展開）

const SIG_EOCD = 0x06054b50 // End Of Central Directory
const SIG_CDH = 0x02014b50 // Central Directory Header
const SIG_LFH = 0x04034b50 // Local File Header

/** ZIP 読み取りの失敗 */
export class ZipError extends Error {
  readonly code: 'not-zip' | 'unsupported'
  constructor(code: 'not-zip' | 'unsupported', message: string) {
    super(message)
    this.name = 'ZipError'
    this.code = code
  }
}

/** central directory の 1 エントリ */
type Entry = {
  method: number
  compressedSize: number
  localOffset: number
}

/** 開いた ZIP アーカイブ */
export interface ZipArchive {
  has(name: string): boolean
  names(): string[]
  readBytes(name: string): Promise<Uint8Array>
  readText(name: string): Promise<string>
}

const utf8 = new TextDecoder()

/** deflate-raw を展開する */
async function inflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ZipError('unsupported', 'DecompressionStream が利用できない環境です')
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** 末尾から EOCD シグネチャを探す（後ろにコメントが付きうる） */
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
export async function openZip(input: ArrayBuffer | Uint8Array): Promise<ZipArchive> {
  // 解析中はバッファを ArrayBuffer 固定で扱う（Blob/DecompressionStream の型要件）
  const bytes = (
    input instanceof Uint8Array ? input : new Uint8Array(input)
  ) as Uint8Array<ArrayBuffer>
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const eocd = findEocd(bytes, view)
  const total = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  if (total === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipError('not-zip', 'ZIP64 は未対応です')
  }

  const entries = new Map<string, Entry>()
  let p = cdOffset
  for (let idx = 0; idx < total; idx++) {
    if (view.getUint32(p, true) !== SIG_CDH) {
      throw new ZipError('not-zip', '中央ディレクトリが壊れています')
    }
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.set(name, { method, compressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }

  const cache = new Map<string, Uint8Array>()

  async function readBytes(name: string): Promise<Uint8Array> {
    const cached = cache.get(name)
    if (cached) return cached

    const entry = entries.get(name)
    if (!entry) throw new ZipError('not-zip', `エントリが見つかりません: ${name}`)

    if (view.getUint32(entry.localOffset, true) !== SIG_LFH) {
      throw new ZipError('not-zip', 'ローカルヘッダが壊れています')
    }
    // name/extra 長はローカルヘッダ自身から読む（中央ディレクトリと異なりうる）
    const nameLen = view.getUint16(entry.localOffset + 26, true)
    const extraLen = view.getUint16(entry.localOffset + 28, true)
    const dataStart = entry.localOffset + 30 + nameLen + extraLen
    const data = bytes.subarray(dataStart, dataStart + entry.compressedSize)

    let out: Uint8Array
    if (entry.method === 0) {
      out = data
    } else if (entry.method === 8) {
      out = await inflateRaw(data)
    } else {
      throw new ZipError('not-zip', `未対応の圧縮方式です: ${entry.method}`)
    }
    cache.set(name, out)
    return out
  }

  return {
    has: (name) => entries.has(name),
    names: () => [...entries.keys()],
    readBytes,
    readText: async (name) => utf8.decode(await readBytes(name)),
  }
}
