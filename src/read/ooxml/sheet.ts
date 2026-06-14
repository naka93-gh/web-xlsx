// ワークシート（xl/worksheets/sheetN.xml）の解析 — 行/セルを組み立てる

import { columnToIndex, MAX_COL_INDEX } from '../../core/a1.js'
import { formatIsoDate } from '../../core/date.js'
import type { Cell, ParseOptions } from '../../core/types.js'
import { tokenize } from '../io/xml.js'
import { parseRef, type RawCell, type ResolveContext, resolveCell } from './cells.js'

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
 * シート上に存在した行（列インデックス → raw セル）
 */
type PresentRow = { rowNum: number; cells: Map<number, RawCell> }

/**
 * 行・列の範囲（0 始まり列・1 始まり行。欠けた次元は無制限）
 */
type CellRange = { minCol: number; maxCol: number; minRow: number; maxRow: number }

/**
 * ヘッダーの 1 列（列インデックスと解決済みキー）
 */
type HeaderCol = { col: number; key: string }

/**
 * 空セルの定義（解決後の値）
 *
 * `null`（欠落セル）と `''`（空文字セル）を空とみなす。ヘッダー検出・ヘッダー構築・
 * 空行スキップで判定がズレると、空文字のみの行がヘッダーに選ばれて結果が黙って
 * 空になる等の不整合を生むため、一箇所に集約する。
 */
function isBlank(value: Cell): boolean {
  return value === null || value === ''
}

/**
 * sheetData をトークン走査し、存在する行を列インデックス付きで取り出す
 *
 * SAX 風の状態機械。タグの open/text/close を 1 パスで処理し、入れ子の現在位置を
 * 下のフラグ群で覚えておく（DOM を作らないのでメモリは行 1 つ分で済む）
 */
function collectRows(xml: string): PresentRow[] {
  const rows: PresentRow[] = []

  // sheetData スコープ内か（外側の要素はすべて無視する）
  let inSheetData = false

  // 現在組み立て中の <row>。lastRowNum/nextCol は r 属性欠落時の連番フォールバック用
  let row: PresentRow | null = null
  let lastRowNum = 0
  let nextCol = 0

  // 現在組み立て中の <c> とその列インデックス
  let cell: RawCell | null = null
  let cellCol = 0

  // <v>（通常値）の収集状態
  let inV = false
  let valueBuf = ''

  // <is>（インライン文字列）の収集状態。phonetic>0 の <rPh>（ふりがな）配下は本文から除外する
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
        const parsed = token.attrs.r !== undefined ? Number.parseInt(token.attrs.r, 10) : Number.NaN
        // 壊れた r 属性はセル側（parseRef 失敗 → 出現順）と同じく連番にフォールバック
        // （NaN を通すと lastRowNum に伝播し、以降の行番号比較がすべて false になる）
        const num = Number.isFinite(parsed) ? parsed : lastRowNum + 1
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
        // 前セルで閉じタグが欠けた場合に走査フラグが次セルへ漏れるのを防ぐ
        inV = false
        inIs = false
        inT = false
        phonetic = 0
        if (token.selfClosing) {
          row?.cells.set(col, raw)
          cell = null
        }
      } else if (token.name === 'v') {
        // 自己終了 <v/> は値が無い。フラグを立てると後続セルのテキストを誤って吸う
        if (!token.selfClosing) {
          inV = true
          valueBuf = ''
        }
      } else if (token.name === 'is') {
        if (!token.selfClosing) {
          inIs = true
          inlineBuf = ''
        }
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
 * headerRow 等オプションの指定値が不正なときに投げる
 */
export class OptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptionError'
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
function parseRange(range: string): CellRange {
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

  // ヘッダー行を決める（指定が無ければ最初の非空行）
  // 行が非空か（範囲内の列に空でない値があるか）
  const isNonEmpty = (r: PresentRow): boolean => {
    for (const [col, raw] of r.cells) {
      if (inColRange(col) && !isBlank(resolveCell(raw, ctx))) return true
    }
    return false
  }
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
