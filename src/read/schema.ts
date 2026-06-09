// スキーマ検証・型付け（SheetRow[] → 型付き行 ＋ 行エラー）

import { parseIsoDate } from '../core/date'
import type { Cell, ColumnType, RowError, Schema } from '../core/types'
import type { SheetRow } from './ooxml/sheet'

/** 解決済み値を列型に強制する */
function coerce(
  type: ColumnType,
  resolved: Cell,
  raw: string | undefined,
): { value: Cell } | { error: string } {
  switch (type) {
    case 'string':
      // 数値セルは raw（元テキスト）を使い大整数の桁落ちを防ぐ。共有文字列等は resolved
      return { value: typeof resolved === 'number' && raw !== undefined ? raw : String(resolved) }
    case 'number': {
      if (typeof resolved === 'number') return { value: resolved }
      // resolved は文字列セルの実テキスト。raw は t="s" だと共有文字列の index なので使わない
      const n = Number(resolved)
      return Number.isFinite(n) ? { value: n } : { error: '数値ではありません' }
    }
    case 'boolean': {
      if (typeof resolved === 'boolean') return { value: resolved }
      const t = String(resolved).toLowerCase()
      if (t === 'true' || t === '1') return { value: true }
      if (t === 'false' || t === '0') return { value: false }
      return { error: '真偽値ではありません' }
    }
    case 'date': {
      if (resolved instanceof Date) return { value: resolved }
      if (typeof resolved === 'string') {
        const d = parseIsoDate(resolved)
        return d ? { value: d } : { error: '日付ではありません' }
      }
      return { error: '日付ではありません' }
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
): { data: Record<string, Cell>[]; errors: RowError[] } {
  const columns = Object.entries(schema)
  const data: Record<string, Cell>[] = []
  const errors: RowError[] = []

  for (const sr of rows) {
    const out: Record<string, Cell> = {}
    const rowErrors: RowError[] = []

    for (const [header, column] of columns) {
      const cell = sr.cells[header]
      const resolved: Cell = cell ? cell.value : null

      if (resolved === null || resolved === '') {
        if (column.defaultValue !== undefined) out[column.prop] = column.defaultValue as Cell
        else if (column.required)
          rowErrors.push({ row: sr.rowNum, column: header, message: '必須です' })
        else out[column.prop] = null
        continue
      }

      if (column.validate) {
        const message = column.validate(resolved)
        if (message) {
          rowErrors.push({ row: sr.rowNum, column: header, value: resolved, message })
          continue
        }
      }

      const result = coerce(column.type, resolved, cell?.raw)
      if ('error' in result) {
        rowErrors.push({ row: sr.rowNum, column: header, value: resolved, message: result.error })
        continue
      }
      out[column.prop] = result.value
    }

    if (rowErrors.length > 0) errors.push(...rowErrors)
    else data.push(out)
  }

  return { data, errors }
}
