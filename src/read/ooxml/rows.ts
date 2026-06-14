// sheetData（xl/worksheets/sheetN.xml）を SAX 風に走査し、存在する行を取り出す

import { tokenize } from '../io/xml.js'
import { parseRef, type RawCell } from './cells.js'

/**
 * シート上に存在した行（列インデックス → raw セル）
 */
export type PresentRow = { rowNum: number; cells: Map<number, RawCell> }

/**
 * sheetData をトークン走査し、存在する行を列インデックス付きで取り出す
 *
 * SAX 風の状態機械。タグの open/text/close を 1 パスで処理し、入れ子の現在位置を
 * 下のフラグ群で覚えておく（DOM を作らないのでメモリは行 1 つ分で済む）
 */
export function collectRows(xml: string): PresentRow[] {
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
