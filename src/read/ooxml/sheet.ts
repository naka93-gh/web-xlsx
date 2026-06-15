// ワークシートをヘッダー解決つき行データ／配列に変換する

import { formatIsoDate } from '../../core/date.js'
import type { Cell } from '../../core/types.js'
import type { ParseOptions } from '../types.js'
import { type ResolveContext, resolveCell } from './cells.js'
import { type CellRange, parseRange } from './range.js'
import { collectRows, type PresentRow } from './rows.js'

/**
 * 解決済みのセル
 * raw は大整数の桁落ち回避用に数値セルの元テキストのみ保持し、それ以外は undefined
 */
export type SheetCell = { value: Cell; raw: string | undefined }

/**
 * 1 データ行（シート上の行番号つき）
 */
export type SheetRow = { rowNum: number; cells: Record<string, SheetCell> }

/**
 * readSheet の結果
 */
export type ReadSheetResult = { headers: string[]; rows: SheetRow[] }

/**
 * ヘッダーの 1 列（列インデックスと解決済みキー）
 */
type HeaderCol = { col: number; key: string }

/**
 * headerRow 等オプションの指定値が不正なときに投げる
 */
export class OptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptionError'
  }
}

/**
 * 空セルの定義（解決後の値）
 *
 * `null`（欠落セル）と `''`（空文字セル）を空とみなす。ヘッダー検出・ヘッダー構築・
 * 空行スキップで判定がズレると、空文字のみの行がヘッダーに選ばれて結果が黙って
 * 空になる等の不整合を生むため、一箇所に集約する
 */
function isBlank(value: Cell): boolean {
  return value === null || value === ''
}

/**
 * present 行を取得し range で行を絞る。列の範囲内判定（inColRange）も返す
 */
function collectInRange(
  xml: string,
  range: CellRange | undefined,
): { present: PresentRow[]; inColRange: (col: number) => boolean } {
  const inColRange = (col: number) => !range || (col >= range.minCol && col <= range.maxCol)
  let present = collectRows(xml)
  if (range) present = present.filter((r) => r.rowNum >= range.minRow && r.rowNum <= range.maxRow)
  return { present, inColRange }
}

/**
 * ヘッダー行から (列index, キー) の対を作る。範囲外・空セルは除外、Date は ISO 8601 化
 */
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

/**
 * ヘッダー行より後の行を headerCols に沿って SheetRow 化する（空行は skipEmpty に従う）
 */
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
      // raw は桁落ち回避用に数値セルの元テキストだけ持つ
      cells[key] = { value, raw: typeof value === 'number' ? raw?.value : undefined }
    }
    if (skipEmpty && !hasValue) continue
    rows.push({ rowNum: r.rowNum, cells })
  }
  return rows
}

/**
 * ワークシート XML を行データに変換する
 *
 * ヘッダーは既定で最初の非空行、`headerRow`/`range` で上書きできる
 * 疎なセルは A1 参照で位置決めし、欠落列は null になる
 */
export function readSheet(
  xml: string,
  ctx: ResolveContext,
  options: Pick<ParseOptions, 'headerRow' | 'range' | 'skipEmptyRows'> = {},
): ReadSheetResult {
  // headerRow は 1 始まりの行番号。0 以下・非整数は黙って空結果になるため明示エラーに
  if (options.headerRow !== undefined) {
    const h = options.headerRow
    if (!Number.isInteger(h) || h < 1) {
      throw new OptionError(`headerRow は 1 以上の整数で指定してください: ${h}`)
    }
  }

  // 存在する行を集め、range があれば行で絞る
  const range = options.range ? parseRange(options.range) : undefined
  const { present, inColRange } = collectInRange(xml, range)

  // 行が非空か（範囲内の列に空でない値があるか）
  const isNonEmpty = (r: PresentRow): boolean => {
    for (const [col, raw] of r.cells) {
      if (inColRange(col) && !isBlank(resolveCell(raw, ctx))) return true
    }
    return false
  }

  // ヘッダー行を決める（指定が無ければ最初の非空行）
  const headerRowNum = options.headerRow ?? present.find(isNonEmpty)?.rowNum
  if (headerRowNum === undefined) return { headers: [], rows: [] }

  // ヘッダー列を解決し、以降の行をそれに沿ってデータ化する
  const headerRow = present.find((r) => r.rowNum === headerRowNum)
  const headerCols = resolveHeaderColumns(headerRow, ctx, inColRange)
  const rows = buildDataRows(present, headerCols, ctx, headerRowNum, options.skipEmptyRows ?? true)

  return { headers: headerCols.map((h) => h.key), rows }
}

/**
 * ワークシート XML をヘッダー無しで `Cell[][]`（配列 of 配列）に変換する
 *
 * ヘッダー解決をせず位置で取り込む。各行は列A(index 0)から最大使用列まで
 * `null` 埋めで矩形化する。`range` 指定時は範囲の左端を index 0 とし、
 * 範囲右端まで（指定があれば）埋める。空行は `skipEmptyRows` に従う
 */
export function readSheetArrays(
  xml: string,
  ctx: ResolveContext,
  options: Pick<ParseOptions, 'range' | 'skipEmptyRows'> = {},
): Cell[][] {
  // 存在する行を集め、range があれば行で絞る。左端列を index 0 の基準にする
  const range = options.range ? parseRange(options.range) : undefined
  const { present, inColRange } = collectInRange(xml, range)
  const baseCol = range ? range.minCol : 0

  // 各行を解決しつつ、範囲内で値を持つ最大列を求める（矩形の右端）
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

  // range で右端が確定しているなら、データが無くてもそこまで埋める
  if (range && Number.isFinite(range.maxCol)) rightCol = range.maxCol

  // 各行を baseCol 起点・width 列の配列に矩形化する（空行は skipEmpty に従う）
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
