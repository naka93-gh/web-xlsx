// スキーマ検証・型付け（SheetRow[] → 型付き行 ＋ 行エラー）

import { formatIsoDate, parseIsoDate } from '../core/date.js'
import type { Cell, ColumnType, Schema } from '../core/types.js'
import type { SheetRow } from './ooxml/sheet.js'
import type { RowError, RowErrorCode } from './types.js'

// 10 進数値の文字列（符号・小数・指数可）。Number() 丸投げだと "0x10" 等の
// 16 進表記や真偽値まで暗黙に通ってしまうため、受理形式を明示的に限定する
const DECIMAL_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/

/**
 * 解決済み値を列型に強制する
 */
function coerce(
  type: ColumnType,
  resolved: Cell,
  raw: string | undefined,
  utc: boolean,
): { value: Cell } | { error: string; code: RowErrorCode } {
  switch (type) {
    case 'string':
      // 数値セルは raw（元テキスト）を使い大整数の桁落ちを防ぐ。共有文字列等は resolved
      if (typeof resolved === 'number' && raw !== undefined) return { value: raw }
      // 日付セルは実装依存の Date.toString でなく ISO 8601 にする（type:'date' の受理形式と対称）
      if (resolved instanceof Date) return { value: formatIsoDate(resolved, utc) }
      return { value: String(resolved) }
    case 'number': {
      if (typeof resolved === 'number') return { value: resolved }
      // 文字列セルの実テキストのみ受理（raw は t="s" だと共有文字列の index なので使わない）
      if (typeof resolved === 'string' && DECIMAL_RE.test(resolved.trim())) {
        return { value: Number(resolved) }
      }
      return { error: 'Not a number', code: 'non-number' }
    }
    case 'boolean': {
      if (typeof resolved === 'boolean') return { value: resolved }
      const t = String(resolved).toLowerCase()
      if (t === 'true' || t === '1') return { value: true }
      if (t === 'false' || t === '0') return { value: false }
      return { error: 'Not a boolean', code: 'non-boolean' }
    }
    case 'date': {
      if (resolved instanceof Date) return { value: resolved }
      if (typeof resolved === 'string') {
        const d = parseIsoDate(resolved, utc)
        return d ? { value: d } : { error: 'Not a date', code: 'non-date' }
      }
      return { error: 'Not a date', code: 'non-date' }
    }
  }
}

/**
 * スキーマで各行を検証・型付けする
 *
 * 全列が通った行だけ `data` に入り、1 つでも失敗した行は除外して `errors` に記録する
 */
export function applySchema(
  rows: SheetRow[],
  schema: Schema,
  utc = false,
): { data: Record<string, Cell>[]; errors: RowError[] } {
  const columns = Object.entries(schema)
  const data: Record<string, Cell>[] = []
  const errors: RowError[] = []

  for (const sr of rows) {
    // __proto__ 等の prop が prototype セッターに吸われて消えるのを防ぐ
    const out: Record<string, Cell> = Object.create(null)
    const rowErrors: RowError[] = []

    for (const [header, column] of columns) {
      const cell = sr.cells[header]
      const resolved: Cell = cell ? cell.value : null

      // 空セル: defaultValue で補完、無ければ required ならエラー・任意なら null
      if (resolved === null || resolved === '') {
        if (column.defaultValue !== undefined) out[column.prop] = column.defaultValue
        else if (column.required)
          rowErrors.push({ code: 'required', row: sr.rowNum, column: header, message: 'Required' })
        else out[column.prop] = null
        continue
      }

      // ユーザー validate を先に通す
      // validate はユーザーコールバック。throw しても parse 全体を巻き込まず行エラーに落とす
      if (column.validate) {
        let message: string | null
        try {
          message = column.validate(resolved)
        } catch (e) {
          message = e instanceof Error ? e.message : 'Validation threw an error'
        }
        if (message) {
          rowErrors.push({
            code: 'validate',
            row: sr.rowNum,
            column: header,
            value: resolved,
            message,
          })
          continue
        }
      }

      // 列型へ強制する。失敗は値を捨てて行エラーに
      const result = coerce(column.type, resolved, cell?.raw, utc)
      if ('error' in result) {
        rowErrors.push({
          code: result.code,
          row: sr.rowNum,
          column: header,
          value: resolved,
          message: result.error,
        })
        continue
      }
      out[column.prop] = result.value
    }

    // 1 列でも失敗した行は data から落とし、エラーだけ集める
    if (rowErrors.length > 0) errors.push(...rowErrors)
    else data.push(out)
  }

  return { data, errors }
}
