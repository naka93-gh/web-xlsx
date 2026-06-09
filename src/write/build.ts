// 書き出しオーケストレーション（行 → セル → XML パーツ → ZIP → bytes）

import type { Cell, InferRow, Row, Schema } from '../core/types'
import { buildZip, type ZipEntry } from './io/zip'
import { sheetXml } from './ooxml/sheet'
import { stylesXml } from './ooxml/styles'
import { contentTypesXml, rootRelsXml, workbookRelsXml, workbookXml } from './ooxml/workbook'

/** 書き出しオプション */
export interface BuildOptions {
  /** シート名（既定: "Sheet1"） */
  sheetName?: string

  /**
   * 激安スタイル（ヘッダー太字 + 先頭行固定 + 列幅自動）を付ける（既定: true）
   *
   * `false` で一括無効化。日付の表示書式は値の正しさに必須なので常に有効
   */
  style?: boolean
}

/** unknown 値を Cell に寄せる（Cell 外の型は String 化、未入力は null） */
function toCell(value: unknown): Cell {
  if (value === undefined || value === null) return null
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value
  }
  // object / array / bigint / symbol 等は String 化して文字列セルにする（cellXml の crash 回避）
  return String(value)
}

/** スキーマ無し: 全行のキーを出現順に集めてヘッダーとし、セル行列を作る */
function fromRows(rows: Row[]): { headers: string[]; matrix: Cell[][] } {
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }
  const matrix = rows.map((row) => headers.map((h) => toCell(row[h])))
  return { headers, matrix }
}

/** スキーマ付き: スキーマのキー順をヘッダーに、prop でセル値を引く */
function fromSchema(
  rows: Record<string, unknown>[],
  schema: Schema,
): {
  headers: string[]
  matrix: Cell[][]
} {
  const columns = Object.entries(schema)
  const headers = columns.map(([header]) => header)
  const matrix = rows.map((row) => columns.map(([, col]) => toCell(row[col.prop])))
  return { headers, matrix }
}

/**
 * 行データを xlsx バイト列に書き出す（スキーマ付き）
 *
 * スキーマのキー順が列順、キーがヘッダー、`prop` で各行の値を引く
 */
export function build<S extends Schema>(
  rows: InferRow<S>[],
  options: BuildOptions & { schema: S },
): Promise<Uint8Array>
/**
 * 行データを xlsx バイト列に書き出す（スキーマ無し）
 *
 * 行のキーがヘッダー、列順は最初に現れた順
 */
export function build(rows: Row[], options?: BuildOptions): Promise<Uint8Array>
export async function build(
  rows: Record<string, unknown>[],
  options: BuildOptions & { schema?: Schema } = {},
): Promise<Uint8Array> {
  const style = options.style ?? true
  const { headers, matrix } = options.schema
    ? fromSchema(rows, options.schema)
    : fromRows(rows as Row[])

  const enc = new TextEncoder()
  const part = (name: string, xml: string): ZipEntry => ({ name, data: enc.encode(xml) })

  return buildZip([
    part('[Content_Types].xml', contentTypesXml()),
    part('_rels/.rels', rootRelsXml()),
    part('xl/workbook.xml', workbookXml(options.sheetName ?? 'Sheet1')),
    part('xl/_rels/workbook.xml.rels', workbookRelsXml()),
    part('xl/styles.xml', stylesXml()),
    part('xl/worksheets/sheet1.xml', sheetXml(headers, matrix, { style })),
  ])
}
