import { findDuplicateProp } from '../core/schema.js'
import type { Cell, InferRow, Row, Schema } from '../core/types.js'
import { buildZip, type ZipEntry } from './io/zip.js'
import { sheetXml } from './ooxml/sheet.js'
import { stylesXml } from './ooxml/styles.js'
import { contentTypesXml, rootRelsXml, workbookRelsXml, workbookXml } from './ooxml/workbook.js'
import type { BuildArgs, BuildArgsWithSchema, BuildOptions, BuildResult } from './types.js'

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
export function build<const S extends Schema>(
  rows: InferRow<S>[],
  args: BuildArgsWithSchema<S>,
): Promise<BuildResult>
/**
 * 行データを xlsx バイト列に書き出す（スキーマ無し）
 *
 * 行のキーがヘッダー、列順は最初に現れた順
 */
export function build(rows: Row[], args?: BuildArgs): Promise<BuildResult>
export async function build(
  rows: Record<string, unknown>[],
  args: { schema?: Schema; options?: BuildOptions } = {},
): Promise<BuildResult> {
  const { schema, options = {} } = args

  // スキーマ付きは prop 重複を設定ミスとして弾く（read の入口検査と対称に Result で返す）
  // 複数列が同じ prop だと同じソース値が複数列に複製される
  if (schema) {
    const dupProp = findDuplicateProp(schema)
    if (dupProp !== undefined) {
      return {
        ok: false,
        error: {
          code: 'invalid-option',
          message: `Duplicate schema prop: "${dupProp}"`,
        },
      }
    }
  }

  const style = options.style ?? true
  const utc = options.utc ?? false
  const { headers, matrix } = schema ? fromSchema(rows, schema) : fromRows(rows as Row[])

  const enc = new TextEncoder()
  const part = (name: string, xml: string): ZipEntry => ({ name, data: enc.encode(xml) })

  const data = await buildZip([
    part('[Content_Types].xml', contentTypesXml()),
    part('_rels/.rels', rootRelsXml()),
    part('xl/workbook.xml', workbookXml(options.sheetName ?? 'Sheet1')),
    part('xl/_rels/workbook.xml.rels', workbookRelsXml()),
    part('xl/styles.xml', stylesXml()),
    part('xl/worksheets/sheet1.xml', sheetXml(headers, matrix, { style, utc })),
  ])
  return { ok: true, data }
}
