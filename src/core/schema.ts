// スキーマ共通ユーティリティ（読み書き共有）

import type { Schema } from './types.js'

/**
 * 文字列列の最初の重複を返す（無ければ undefined）
 */
export function firstDuplicate(values: Iterable<string>): string | undefined {
  const seen = new Set<string>()
  for (const v of values) {
    if (seen.has(v)) return v
    seen.add(v)
  }
  return undefined
}

/**
 * スキーマ内で重複する `prop` を返す（無ければ undefined）
 *
 * 複数列が同じ prop を持つと、読みは後勝ちで値が黙って上書きされ、書きは同じ
 * ソース値が複数列に複製される。ヘッダー重複（duplicate-header）と対称に入口で弾く。
 */
export function findDuplicateProp(schema: Schema): string | undefined {
  return firstDuplicate(Object.values(schema).map((col) => col.prop))
}
