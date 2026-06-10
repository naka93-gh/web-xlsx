// セル値の解決（raw セル → Cell）と A1 参照ユーティリティ

import { columnToIndex } from '../../core/a1'
import { parseIsoDate } from '../../core/date'
import { serialToDate } from '../../core/serial'
import type { Cell } from '../../core/types'
import type { Styles } from './styles'

/** シート XML から取り出した未解決のセル */
export type RawCell = {
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
  /** 日付を UTC 固定で解釈する（既定 false=ローカル壁時計） */
  utc: boolean
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
      // strict OOXML の ISO 日付文字列。不正形式は null
      return cell.value ? parseIsoDate(cell.value, ctx.utc) : null
    default: {
      // 数値（t='n' または無印）
      if (cell.value === undefined || cell.value === '') return null
      const num = Number(cell.value)
      if (!Number.isFinite(num)) return null
      if (cell.style !== undefined && ctx.styles.isDate(cell.style)) {
        return serialToDate(num, { date1904: ctx.date1904, utc: ctx.utc })
      }
      return num
    }
  }
}

/** セル参照 "B12" を列(0始まり)・行(1始まり)に分解する。解析できなければ null */
export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref)
  if (!m) return null
  return { col: columnToIndex(m[1] as string), row: Number.parseInt(m[2] as string, 10) }
}
