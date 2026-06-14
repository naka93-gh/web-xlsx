// range オプション文字列（"A1:D100" など）を行・列の範囲に解析する

import { columnToIndex, MAX_COL_INDEX } from '../../core/a1.js'

/**
 * 行・列の範囲（0 始まり列・1 始まり行。欠けた次元は無制限）
 */
export type CellRange = { minCol: number; maxCol: number; minRow: number; maxRow: number }

/**
 * range オプションの形式が不正なときに投げる
 */
export class RangeFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RangeFormatError'
  }
}

/**
 * range の端点 "A1"/"A"(列のみ)/"1"(行のみ) を分解。欠けた次元は null。解析不能なら null を返す
 */
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

/**
 * 1 軸の最小・最大を返す。片側だけ指定（端点で形式不一致）なら投げる
 */
function axisSpan(s: number | null, e: number | null, range: string): [number, number] | null {
  if (s === null && e === null) return null
  if (s === null || e === null) {
    throw new RangeFormatError(`range の開始と終了で形式が一致しません: "${range}"`)
  }
  return [Math.min(s, e), Math.max(s, e)]
}

/**
 * range 文字列を行・列の範囲に分解する
 *
 * "A1:D100"（矩形）/ "A:D"（列のみ・全行）/ "2:100"（行のみ・全列）に対応する
 * 欠けた次元は無制限。形式が不正なら {@link RangeFormatError} を投げる
 */
export function parseRange(range: string): CellRange {
  const parts = range.split(':')
  // "A1:B2:C3" のようなコロン過多は黙って "A1:B2" に丸めず不正として弾く
  if (parts.length > 2) throw new RangeFormatError(`range の形式が不正です: "${range}"`)
  const [a, b] = parts
  const start = a ? parseEndpoint(a) : null
  const end = b !== undefined ? parseEndpoint(b) : start
  if (!start || !end) throw new RangeFormatError(`range の形式が不正です: "${range}"`)

  const col = axisSpan(start.col, end.col, range)
  const row = axisSpan(start.row, end.row, range)
  return {
    minCol: col ? col[0] : 0,
    maxCol: col ? col[1] : Number.POSITIVE_INFINITY,
    minRow: row ? row[0] : 1,
    maxRow: row ? row[1] : Number.POSITIVE_INFINITY,
  }
}
