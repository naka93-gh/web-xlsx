import { columnToIndex, MAX_COL_INDEX } from '../../core/a1.js'
import { parseIsoDate } from '../../core/date.js'
import { serialToDate } from '../../core/serial.js'
import type { Cell } from '../../core/types.js'
import type { Styles } from './styles.js'

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

export type ResolveContext = {
  sharedStrings: string[]
  styles: Styles
  date1904: boolean
  utc: boolean
}

/**
 * 数式は評価せずキャッシュ値（`<v>`）を読む
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
      // t="d" は strict OOXML の ISO 日付文字列
      return cell.value ? parseIsoDate(cell.value, ctx.utc) : null
    default: {
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

export function parseRef(ref: string): { col: number; row: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref)
  if (!m) return null
  const col = columnToIndex(m[1] as string)
  // XFD 超は正規の xlsx に無い壊れた参照で、許すと矩形化で巨大配列を確保させられる
  if (col > MAX_COL_INDEX) return null
  return { col, row: Number.parseInt(m[2] as string, 10) }
}
