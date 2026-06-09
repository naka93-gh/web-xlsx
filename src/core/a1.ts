// A1 形式の列表記と 0 始まり列インデックスの変換

/** 列文字（"A" "AA"）を 0 始まりの列インデックスに変換する */
export function columnToIndex(letters: string): number {
  let n = 0
  const upper = letters.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64)
  }
  return n - 1
}
