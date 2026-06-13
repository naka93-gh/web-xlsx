// A1 形式の列表記と 0 始まり列インデックスの相互変換（読み書き共有）

/**
 * Excel の最大列インデックス（XFD = 16,383、0 始まり）
 *
 * これを超える列参照は正規の xlsx には存在しない。読み取りで超過を許すと
 * 矩形化（header:false）で巨大配列を確保させられるため、壊れた参照として扱う
 */
export const MAX_COL_INDEX = 16383

/** 列文字（"A" "AA"）を 0 始まりの列インデックスに変換する */
export function columnToIndex(letters: string): number {
  let n = 0
  const upper = letters.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64)
  }
  return n - 1
}

/** 0 始まりの列インデックスを列文字（A, B, ..., Z, AA, ...）に変換する（columnToIndex の逆） */
export function indexToColumn(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
