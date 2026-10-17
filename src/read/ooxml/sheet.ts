import { formatIsoDate } from '../../core/date.js'
import type { Cell } from '../../core/types.js'
import type { ParseOptions } from '../types.js'
import { type ResolveContext, resolveCell } from './cells.js'
import { type CellRange, parseRange } from './range.js'
import { collectRows, type PresentRow } from './rows.js'

/**
 * raw は大整数の桁落ち回避用に数値セルの元テキストのみ保持し、それ以外は undefined
 */
export type SheetCell = { value: Cell; raw: string | undefined }

export type SheetRow = { rowNum: number; cells: Record<string, SheetCell> }

export type ReadSheetResult = { headers: string[]; rows: SheetRow[] }

type HeaderCol = { col: number; key: string }

export class OptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptionError'
  }
}

/**
 * ヘッダー検出・ヘッダー構築・空行スキップで空判定がズレると、空文字のみの行がヘッダーに選ばれて結果が黙って空になる等の不整合を生む
 * そのため判定を一箇所に集約する
 */
function isBlank(value: Cell): boolean {
  return value === null || value === ''
}

function collectInRange(
  xml: string,
  range: CellRange | undefined,
): { present: PresentRow[]; inColRange: (col: number) => boolean } {
  const inColRange = (col: number) => !range || (col >= range.minCol && col <= range.maxCol)
  let present = collectRows(xml)
  if (range) present = present.filter((r) => r.rowNum >= range.minRow && r.rowNum <= range.maxRow)
  return { present, inColRange }
}

function resolveHeaderColumns(
  headerRow: PresentRow | undefined,
  ctx: ResolveContext,
  inColRange: (col: number) => boolean,
): HeaderCol[] {
  if (!headerRow) return []
  const cols: HeaderCol[] = []
  const sorted = [...headerRow.cells.entries()].sort((a, b) => a[0] - b[0])
  for (const [col, raw] of sorted) {
    if (!inColRange(col)) continue
    const value = resolveCell(raw, ctx)
    if (isBlank(value)) continue
    // Date は実装依存の Date.toString でなく ISO 8601 にする（schema 側 formatIsoDate と対称）
    const key = value instanceof Date ? formatIsoDate(value, ctx.utc) : String(value)
    cols.push({ col, key })
  }
  return cols
}

function buildDataRows(
  present: PresentRow[],
  headerCols: HeaderCol[],
  ctx: ResolveContext,
  headerRowNum: number,
  skipEmpty: boolean,
): SheetRow[] {
  const rows: SheetRow[] = []
  for (const r of present) {
    if (r.rowNum <= headerRowNum) continue
    // __proto__ 等の列名が prototype セッターに吸われて消えるのを防ぐ
    const cells: Record<string, SheetCell> = Object.create(null)
    let hasValue = false
    for (const { col, key } of headerCols) {
      const raw = r.cells.get(col)
      const value = raw ? resolveCell(raw, ctx) : null
      if (!isBlank(value)) hasValue = true
      cells[key] = { value, raw: typeof value === 'number' ? raw?.value : undefined }
    }
    if (skipEmpty && !hasValue) continue
    rows.push({ rowNum: r.rowNum, cells })
  }
  return rows
}

export function readSheet(
  xml: string,
  ctx: ResolveContext,
  options: Pick<ParseOptions, 'headerRow' | 'range' | 'skipEmptyRows'> = {},
): ReadSheetResult {
  // headerRow の 0 以下・非整数は黙って空結果になるため明示エラーにする
  if (options.headerRow !== undefined) {
    const h = options.headerRow
    if (!Number.isInteger(h) || h < 1) {
      throw new OptionError(`headerRow must be an integer >= 1: ${h}`)
    }
  }

  const range = options.range ? parseRange(options.range) : undefined
  const { present, inColRange } = collectInRange(xml, range)

  const isNonEmpty = (r: PresentRow): boolean => {
    for (const [col, raw] of r.cells) {
      if (inColRange(col) && !isBlank(resolveCell(raw, ctx))) return true
    }
    return false
  }

  const headerRowNum = options.headerRow ?? present.find(isNonEmpty)?.rowNum
  if (headerRowNum === undefined) return { headers: [], rows: [] }

  const headerRow = present.find((r) => r.rowNum === headerRowNum)
  const headerCols = resolveHeaderColumns(headerRow, ctx, inColRange)
  const rows = buildDataRows(present, headerCols, ctx, headerRowNum, options.skipEmptyRows ?? true)

  return { headers: headerCols.map((h) => h.key), rows }
}

export function readSheetArrays(
  xml: string,
  ctx: ResolveContext,
  options: Pick<ParseOptions, 'range' | 'skipEmptyRows'> = {},
): Cell[][] {
  const range = options.range ? parseRange(options.range) : undefined
  const { present, inColRange } = collectInRange(xml, range)
  const baseCol = range ? range.minCol : 0

  const resolved: { values: Map<number, Cell>; hasValue: boolean }[] = []
  let rightCol = baseCol - 1
  for (const r of present) {
    const values = new Map<number, Cell>()
    let hasValue = false
    for (const [col, raw] of r.cells) {
      if (!inColRange(col)) continue
      const value = resolveCell(raw, ctx)
      values.set(col, value)
      if (!isBlank(value)) {
        hasValue = true
        if (col > rightCol) rightCol = col
      }
    }
    resolved.push({ values, hasValue })
  }

  if (range && Number.isFinite(range.maxCol)) rightCol = range.maxCol

  const skipEmpty = options.skipEmptyRows ?? true
  const width = Math.max(0, rightCol - baseCol + 1)
  const out: Cell[][] = []
  for (const r of resolved) {
    if (skipEmpty && !r.hasValue) continue
    const arr: Cell[] = new Array(width).fill(null)
    for (const [col, value] of r.values) {
      const i = col - baseCol
      if (i >= 0 && i < width) arr[i] = value
    }
    out.push(arr)
  }
  return out
}
