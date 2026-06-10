// ワークシート（xl/worksheets/sheetN.xml）の解析 — 行/セルを組み立てる

import { columnToIndex } from '../../core/a1'
import type { Cell, ParseOptions } from '../../core/types'
import { tokenize } from '../io/xml'
import { parseRef, type RawCell, type ResolveContext, resolveCell } from './cells'

/** 解決済みのセル（raw は精度対策で元の <v> テキストを保持） */
export type SheetCell = { value: Cell; raw: string | undefined }

/** 1 データ行（シート上の行番号つき） */
export type SheetRow = { rowNum: number; cells: Record<string, SheetCell> }

/** readSheet の結果 */
export type ReadSheetResult = { headers: string[]; rows: SheetRow[] }

/** シート上に存在した行（列インデックス → raw セル） */
type PresentRow = { rowNum: number; cells: Map<number, RawCell> }

/** sheetData をトークン走査し、存在する行を列インデックス付きで取り出す */
function collectRows(xml: string): PresentRow[] {
  const rows: PresentRow[] = []

  let inSheetData = false
  let row: PresentRow | null = null
  let lastRowNum = 0
  let nextCol = 0
  let cell: RawCell | null = null
  let cellCol = 0
  let inV = false
  let valueBuf = ''
  let inIs = false
  let inT = false
  let phonetic = 0
  let inlineBuf = ''

  for (const token of tokenize(xml)) {
    if (token.type === 'open') {
      if (token.name === 'sheetData') {
        if (!token.selfClosing) inSheetData = true
      } else if (!inSheetData) {
        // sheetData の外は無視
      } else if (token.name === 'row') {
        const r = token.attrs.r
        const num: number = r !== undefined ? Number.parseInt(r, 10) : lastRowNum + 1
        lastRowNum = num
        row = { rowNum: num, cells: new Map() }
        nextCol = 0
      } else if (token.name === 'c') {
        const ref = token.attrs.r ?? ''
        // 参照が解析できない（属性欠落 or 壊れた r）場合は出現順にフォールバック
        const col = parseRef(ref)?.col ?? nextCol
        nextCol = col + 1
        cellCol = col
        const raw: RawCell = {}
        if (token.attrs.t !== undefined) raw.type = token.attrs.t
        if (token.attrs.s !== undefined) raw.style = Number.parseInt(token.attrs.s, 10)
        cell = raw
        valueBuf = ''
        inlineBuf = ''
        if (token.selfClosing) {
          row?.cells.set(col, raw)
          cell = null
        }
      } else if (token.name === 'v') {
        inV = true
        valueBuf = ''
      } else if (token.name === 'is') {
        inIs = true
        inlineBuf = ''
      } else if (token.name === 't' && inIs) {
        if (!token.selfClosing) inT = true
      } else if (token.name === 'rPh' && inIs) {
        if (!token.selfClosing) phonetic++
      }
    } else if (token.type === 'text') {
      if (inV) valueBuf += token.value
      else if (inIs && inT && phonetic === 0) inlineBuf += token.value
    } else {
      // close
      if (token.name === 'v') {
        inV = false
        if (cell) cell.value = valueBuf
      } else if (token.name === 't') {
        inT = false
      } else if (token.name === 'rPh') {
        if (phonetic > 0) phonetic--
      } else if (token.name === 'is') {
        inIs = false
        if (cell) cell.inlineText = inlineBuf
      } else if (token.name === 'c') {
        if (cell && row) row.cells.set(cellCol, cell)
        cell = null
      } else if (token.name === 'row') {
        if (row) rows.push(row)
        row = null
      } else if (token.name === 'sheetData') {
        inSheetData = false
      }
    }
  }

  return rows
}

/** range オプションの形式が不正なときに投げる */
export class RangeFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RangeFormatError'
  }
}

/** range の端点 "A1"/"A"(列のみ)/"1"(行のみ) を分解。欠けた次元は null。解析不能なら null を返す */
function parseEndpoint(ref: string): { col: number | null; row: number | null } | null {
  const m = /^([A-Za-z]+)?(\d+)?$/.exec(ref)
  if (!m || (m[1] === undefined && m[2] === undefined)) return null
  return {
    col: m[1] !== undefined ? columnToIndex(m[1]) : null,
    row: m[2] !== undefined ? Number.parseInt(m[2], 10) : null,
  }
}

/** 1 軸の最小・最大を返す。片側だけ指定（端点で形式不一致）なら投げる */
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
function parseRange(range: string): {
  minCol: number
  maxCol: number
  minRow: number
  maxRow: number
} {
  const [a, b] = range.split(':')
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
  const range = options.range ? parseRange(options.range) : undefined
  const inColRange = (col: number) => !range || (col >= range.minCol && col <= range.maxCol)

  let present = collectRows(xml)
  if (range) present = present.filter((r) => r.rowNum >= range.minRow && r.rowNum <= range.maxRow)

  // 行が非空か（範囲内の列に非 null 値があるか）
  const isNonEmpty = (r: PresentRow): boolean => {
    for (const [col, raw] of r.cells) {
      if (inColRange(col) && resolveCell(raw, ctx) !== null) return true
    }
    return false
  }

  const headerRowNum = options.headerRow ?? present.find(isNonEmpty)?.rowNum
  if (headerRowNum === undefined) return { headers: [], rows: [] }

  const headerRow = present.find((r) => r.rowNum === headerRowNum)
  const headerCols: { col: number; key: string }[] = []
  if (headerRow) {
    const sorted = [...headerRow.cells.entries()].sort((a, b) => a[0] - b[0])
    for (const [col, raw] of sorted) {
      if (!inColRange(col)) continue
      const value = resolveCell(raw, ctx)
      if (value === null || value === '') continue
      headerCols.push({ col, key: String(value) })
    }
  }
  const headers = headerCols.map((h) => h.key)

  const skipEmpty = options.skipEmptyRows ?? true
  const rows: SheetRow[] = []
  for (const r of present) {
    if (r.rowNum <= headerRowNum) continue
    const cells: Record<string, SheetCell> = {}
    let hasValue = false
    for (const { col, key } of headerCols) {
      const raw = r.cells.get(col)
      const value = raw ? resolveCell(raw, ctx) : null
      if (value !== null) hasValue = true
      cells[key] = { value, raw: raw ? (raw.value ?? raw.inlineText) : undefined }
    }
    if (skipEmpty && !hasValue) continue
    rows.push({ rowNum: r.rowNum, cells })
  }

  return { headers, rows }
}
