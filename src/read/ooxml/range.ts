import { columnToIndex, MAX_COL_INDEX } from '../../core/a1.js'

/**
 * 列は 0 始まり、行は 1 始まり
 */
export type CellRange = { minCol: number; maxCol: number; minRow: number; maxRow: number }

export class RangeFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RangeFormatError'
  }
}

function parseEndpoint(ref: string): { col: number | null; row: number | null } | null {
  const m = /^([A-Za-z]+)?(\d+)?$/.exec(ref)
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  const col = m[1] !== undefined ? columnToIndex(m[1]) : null
  // XFD 超の列指定は誤りとして弾く（許すと矩形化の右端埋めで巨大配列を確保させられる）
  if (col !== null && col > MAX_COL_INDEX) return null
  return {
    col,
    row: m[2] !== undefined ? Number.parseInt(m[2], 10) : null,
  }
}

function axisSpan(s: number | null, e: number | null, range: string): [number, number] | null {
  if (s === null && e === null) return null
  if (s === null || e === null) {
    throw new RangeFormatError(`range start and end have mismatched forms: "${range}"`)
  }
  return [Math.min(s, e), Math.max(s, e)]
}

export function parseRange(range: string): CellRange {
  const parts = range.split(':')
  // "A1:B2:C3" のようなコロン過多は黙って "A1:B2" に丸めず不正として弾く
  if (parts.length > 2) throw new RangeFormatError(`Invalid range format: "${range}"`)
  const [a, b] = parts
  const start = a ? parseEndpoint(a) : null
  const end = b !== undefined ? parseEndpoint(b) : start
  if (!start || !end) throw new RangeFormatError(`Invalid range format: "${range}"`)

  const col = axisSpan(start.col, end.col, range)
  const row = axisSpan(start.row, end.row, range)
  return {
    minCol: col ? col[0] : 0,
    maxCol: col ? col[1] : Number.POSITIVE_INFINITY,
    minRow: row ? row[0] : 1,
    maxRow: row ? row[1] : Number.POSITIVE_INFINITY,
  }
}
