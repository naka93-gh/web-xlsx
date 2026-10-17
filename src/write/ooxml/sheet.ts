import { indexToColumn } from '../../core/a1.js'
import { dateToSerial } from '../../core/serial.js'
import type { Cell } from '../../core/types.js'
import { DECL, NS_MAIN } from './consts.js'
import { escapeText } from './escape.js'
import { DATE_STYLE, HEADER_STYLE } from './styles.js'

function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
  return w
}

function cellText(value: Cell): string {
  if (value === null) return ''
  if (value instanceof Date) return 'yyyy-mm-dd' // 日付の表示書式と同じ 10 文字
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

function columnWidths(headers: string[], rows: Cell[][]): number[] {
  return headers.map((header, c) => {
    let max = displayWidth(header)
    for (const row of rows) {
      const w = displayWidth(cellText(row[c] ?? null))
      if (w > max) max = w
    }
    return Math.min(60, Math.max(8, max + 2))
  })
}

/**
 * style は cellXfs のインデックス
 */
function cellXml(ref: string, value: Cell, style: number, utc: boolean): string {
  const s = style > 0 ? ` s="${style}"` : ''
  if (value === null || value === '') return `<c r="${ref}"${s}/>`
  if (value instanceof Date) {
    // Invalid Date はシリアル値が NaN になり壊れた XML を出すため空セルにする（非有限数値と同じ扱い）
    if (Number.isNaN(value.getTime())) return `<c r="${ref}"${s}/>`
    // Date はシリアル値なので表示書式が必須で、渡された style より DATE_STYLE を優先する
    return `<c r="${ref}" s="${DATE_STYLE}"><v>${dateToSerial(value, { utc })}</v></c>`
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : `<c r="${ref}"${s}/>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"${s}><v>${value ? 1 : 0}</v></c>`
  }

  // 前後空白の消失を防ぐため preserve を付ける
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escapeText(value)}</t></is></c>`
}

function rowXml(rowIndex: number, cells: Cell[], style: number, utc: boolean): string {
  const rowNum = rowIndex + 1
  let body = ''
  for (let c = 0; c < cells.length; c++) {
    body += cellXml(`${indexToColumn(c)}${rowNum}`, cells[c] ?? null, style, utc)
  }
  return `<row r="${rowNum}">${body}</row>`
}

export type SheetOptions = {
  style: boolean
  utc: boolean
}

export function sheetXml(headers: string[], rows: Cell[][], options: SheetOptions): string {
  const { style, utc } = options

  const cols =
    style && headers.length > 0
      ? `<cols>${columnWidths(headers, rows)
          .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
          .join('')}</cols>`
      : ''

  const sheetViews = style
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : ''

  const headerStyle = style ? HEADER_STYLE : 0
  let data = rowXml(0, headers, headerStyle, utc)
  for (let r = 0; r < rows.length; r++) {
    // biome-ignore lint/style/noNonNullAssertion: r は rows の範囲内
    data += rowXml(r + 1, rows[r]!, 0, utc)
  }

  return `${DECL}<worksheet xmlns="${NS_MAIN}">${sheetViews}${cols}<sheetData>${data}</sheetData></worksheet>`
}
