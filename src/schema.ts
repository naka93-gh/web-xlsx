// スキーマ検証・型付け（SheetRow[] → 型付き行 ＋ 行エラー）

import type { SheetRow } from './sheet'
import type { Cell, ColumnType, RowError, Schema } from './types'

/**
 * 文字列を ISO 8601 として厳密にパースする（不正・非対応形式は null）
 *
 * `new Date(string)` 丸投げは形式の許容範囲が実装依存で、日付のみ ISO は UTC 0:00
 * 解釈になり TZ で暦日がずれる。そこで形式を ISO に限定し、日付のみは
 * {@link serialToDate} と揃えてローカルの壁時計 0:00 として組み立てる
 */
function parseIsoDate(text: string): Date | null {
  const s = text.trim()

  // 日付のみ（YYYY-MM-DD）: ローカル 0:00 として構築
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const d = new Date(year, month - 1, day)
    // 2024-02-30 等の繰り上がりを弾く（構築後に各要素が一致するか確認）
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) return d
    return null
  }

  // 日時（YYYY-MM-DDTHH:mm[:ss[.sss]][Z|±hh:mm]）: TZ 指定が無ければ仕様上ローカル解釈で一意
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) {
    const d = new Date(s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

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
      const n = Number(raw ?? resolved)
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
