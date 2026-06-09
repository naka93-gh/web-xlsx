// 共有文字列テーブル（xl/sharedStrings.xml）の解析

import { tokenize } from '../io/xml'

/**
 * sharedStrings.xml を index → 文字列の配列に変換する
 *
 * 各 `<si>` が 1 件。`<r>` ラン（リッチテキスト）は連結し、
 * `<rPh>`（ふりがな）内のテキストは除外する
 * 返す配列の index はセルの共有文字列参照（`t="s"` の `<v>`）と一致する
 */
export function parseSharedStrings(xml: string): string[] {
  const result: string[] = []

  let current: string | null = null // 現在の <si> の蓄積（範囲外は null）
  let inText = false // <t> の内側か
  let skip = 0 // <rPh> の内側（>0 で除外）

  for (const token of tokenize(xml)) {
    if (token.type === 'open') {
      if (token.name === 'si') {
        if (token.selfClosing) result.push('')
        else current = ''
      } else if (token.name === 'rPh') {
        if (!token.selfClosing) skip++
      } else if (token.name === 't') {
        if (!token.selfClosing) inText = true
      }
    } else if (token.type === 'text') {
      if (current !== null && inText && skip === 0) current += token.value
    } else {
      if (token.name === 't') {
        inText = false
      } else if (token.name === 'rPh') {
        if (skip > 0) skip--
      } else if (token.name === 'si') {
        result.push(current ?? '')
        current = null
      }
    }
  }

  return result
}
