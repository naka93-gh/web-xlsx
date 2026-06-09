// セル値の解決（raw セル → Cell）と A1 参照ユーティリティ

import { serialToDate } from './serial'
import type { Styles } from './styles'
import type { Cell } from './types'

/** シート XML から取り出した未解決のセル */
export type RawCell = {
  /** セル参照 "A1" */
  ref: string
  /** t 属性（s/inlineStr/str/b/e/d/n、無印は数値） */
  type?: string
  /** s 属性（cellXfs のインデックス） */
  style?: number
  /** <v> のテキスト（s/str/b/n で使う） */
  value?: string
  /** <is> を連結したテキスト（inlineStr で使う） */
  inlineText?: string
}

/** セル解決に必要な文脈 */
export type ResolveContext = {
  sharedStrings: string[]
  styles: Styles
  date1904: boolean
}

/**
 * raw セルをネイティブ値（{@link Cell}）に解決する
 *
 * 数式セルはキャッシュ値（`<v>`）を読む。エラーセルは null
 */
export function resolveCell(cell: RawCell, ctx: ResolveContext): Cell {
  switch (cell.type) {
    case 's': {
      if (cell.value === undefined) return null
      const index = Number.parseInt(cell.value, 10)
      return Number.isFinite(index) ? (ctx.sharedStrings[index] ?? null) : null
    }
    case 'inlineStr':
      return cell.inlineText ?? null
    case 'str':
      return cell.value ?? null
    case 'b':
      return cell.value === undefined ? null : cell.value !== '0'
    case 'e':
      return null
    case 'd':
      // strict OOXML の ISO 日付文字列
      return cell.value ? new Date(cell.value) : null
    default: {
      // 数値（t='n' または無印）
      if (cell.value === undefined || cell.value === '') return null
      const num = Number(cell.value)
      if (!Number.isFinite(num)) return null
      if (cell.style !== undefined && ctx.styles.isDate(cell.style)) {
        return serialToDate(num, { date1904: ctx.date1904 })
      }
      return num
    }
  }
}

/** 列文字（"A" "AA"）を 0 始まりの列インデックスに変換する */
export function columnToIndex(letters: string): number {
  let n = 0
  const upper = letters.toUpperCase()
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64)
  }
  return n - 1
}

/** 0 始まりの列インデックスを列文字に変換する */
export function colIndexToLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** セル参照 "B12" を列(0始まり)・行(1始まり)に分解する */
export function parseRef(ref: string): { col: number; row: number } {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref)
  if (!m) return { col: 0, row: 0 }
  return { col: columnToIndex(m[1] as string), row: Number.parseInt(m[2] as string, 10) }
}
