// ワークシート（xl/worksheets/sheetN.xml）の解析 — 行/セルを組み立てる

import { tokenize } from '../io/xml'
import type { Cell, ParseOptions } from '../types'
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
        const col = ref ? parseRef(ref).col : nextCol
        nextCol = col + 1
        cellCol = col
        const raw: RawCell = { ref }
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

/** "A1:D100" を行・列の範囲に分解する（列のみの指定は非対応） */
function parseRange(
  range: string,
): { minCol: number; maxCol: number; minRow: number; maxRow: number } | undefined {
  const [a, b] = range.split(':')
  if (!a) return undefined
  const start = parseRef(a)
  const end = b ? parseRef(b) : start
  if (start.row === 0 || end.row === 0) return undefined
  return {
    minCol: Math.min(start.col, end.col),
    maxCol: Math.max(start.col, end.col),
    minRow: Math.min(start.row, end.row),
    maxRow: Math.max(start.row, end.row),
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
