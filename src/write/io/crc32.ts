// CRC-32（IEEE 802.3, ZIP 用）。Web 標準 API に無いため自前実装する

/**
 * CRC-32 ルックアップテーブル（多項式 0xEDB88320、初回のみ生成）
 */
let table: Uint32Array | null = null

function getTable(): Uint32Array {
  if (table) return table
  // 各バイト値 0..255 を多項式で 8 ビット分畳んでテーブル化する
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    t[n] = c >>> 0
  }
  table = t
  return t
}

/**
 * バイト列の CRC-32 を返す（符号なし 32bit）
 */
export function crc32(data: Uint8Array): number {
  const t = getTable()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: data[i] と t は範囲内で常に存在する
    crc = t[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
