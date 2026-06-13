// スキーマ共通ユーティリティ（読み書き共有）

import type { Schema } from './types.js'

/**
 * スキーマ内で重複する `prop` を返す（無ければ undefined）
 *
 * 複数列が同じ prop を持つと、読みは後勝ちで値が黙って上書きされ、書きは同じ
 * ソース値が複数列に複製される。ヘッダー重複（duplicate-header）と対称に入口で弾く。
 */
export function findDuplicateProp(schema: Schema): string | undefined {
  const seen = new Set<string>()
  for (const col of Object.values(schema)) {
    if (seen.has(col.prop)) return col.prop
    seen.add(col.prop)
  }
  return undefined
}
