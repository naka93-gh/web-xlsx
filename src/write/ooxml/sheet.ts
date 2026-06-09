// worksheet（sheet1.xml）生成。セル値・先頭行固定・列幅自動

import { colName } from '../../core/a1'
import { dateToSerial } from '../../core/serial'
import type { Cell } from '../../core/types'
import { escapeText } from './escape'
import { DATE_STYLE, HEADER_STYLE } from './styles'

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'

/** 表示幅の概算（全角を 2 カウント） */
function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0xff ? 2 : 1
  return w
}

/** 列幅計算用に、セル値を表示文字列へ */
function cellText(value: Cell): string {
  if (value === null) return ''
  if (value instanceof Date) return 'yyyy-mm-dd' // 10 文字相当
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

/** ヘッダーとデータから列ごとの幅を見積もる（8〜60 にクランプ） */
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

/** 1 セルを <c> へ。style は cellXfs インデックス（0 は省略） */
function cellXml(ref: string, value: Cell, style: number): string {
  const s = style > 0 ? ` s="${style}"` : ''
  if (value === null || value === '') return `<c r="${ref}"${s}/>`
  if (value instanceof Date) {
    return `<c r="${ref}" s="${DATE_STYLE}"><v>${dateToSerial(value)}</v></c>`
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : `<c r="${ref}"${s}/>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"${s}><v>${value ? 1 : 0}</v></c>`
  }
  // 文字列はインライン文字列。前後空白の消失を防ぐため preserve を付ける
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${escapeText(value)}</t></is></c>`
}

/** 1 行を <row> へ */
function rowXml(rowIndex: number, cells: Cell[], style: number): string {
  const rowNum = rowIndex + 1
  let body = ''
  for (let c = 0; c < cells.length; c++) {
    body += cellXml(`${colName(c)}${rowNum}`, cells[c] ?? null, style)
  }
  return `<row r="${rowNum}">${body}</row>`
}

/** sheet 生成オプション */
export type SheetOptions = {
  /** ヘッダー太字・先頭行固定・列幅自動を付ける */
  style: boolean
}

/**
 * worksheet XML を生成する
 *
 * 1 行目はヘッダー（headers）、以降が rows。style 有効時は
 * 先頭行固定（freeze pane）・列幅自動・ヘッダー太字を付与する
 */
export function sheetXml(headers: string[], rows: Cell[][], options: SheetOptions): string {
  const { style } = options

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
  let data = rowXml(0, headers, headerStyle)
  for (let r = 0; r < rows.length; r++) {
    // biome-ignore lint/style/noNonNullAssertion: r は rows の範囲内
    data += rowXml(r + 1, rows[r]!, 0)
  }

  return `${DECL}<worksheet xmlns="${NS_MAIN}">${sheetViews}${cols}<sheetData>${data}</sheetData></worksheet>`
}
