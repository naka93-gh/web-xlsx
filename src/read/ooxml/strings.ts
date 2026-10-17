import { tokenize } from '../io/xml.js'

/**
 * `<rPh>`（ふりがな）内のテキストは除外する
 * 返す配列の index はセルの共有文字列参照（`t="s"` の `<v>`）と一致させる
 */
export function parseSharedStrings(xml: string): string[] {
  const result: string[] = []

  let current: string | null = null
  let inText = false
  let skip = 0

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
