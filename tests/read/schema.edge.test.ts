import { describe, expect, it } from 'vitest'
import type { Schema } from '../../src/core/types'
import type { SheetRow } from '../../src/read/ooxml/sheet'
import { applySchema } from '../../src/read/schema'

const row = (cells: Record<string, unknown>): SheetRow => ({
  rowNum: 2,
  cells: Object.fromEntries(
    Object.entries(cells).map(([k, v]) => [k, { value: v as never, raw: undefined }]),
  ),
})

const first = (schema: Schema, cells: Record<string, unknown>) => {
  const { data, errors } = applySchema([row(cells)], schema)
  return { value: data[0], errors }
}

describe('applySchema 型強制の分岐', () => {
  it('boolean: 真値/偽値/文字列/数値/不正', () => {
    const s = { f: { prop: 'f', type: 'boolean' } } satisfies Schema
    expect(first(s, { f: true }).value?.f).toBe(true)
    expect(first(s, { f: 'TRUE' }).value?.f).toBe(true)
    expect(first(s, { f: '0' }).value?.f).toBe(false)
    expect(first(s, { f: 1 }).value?.f).toBe(true)
    expect(first(s, { f: 'はい' }).errors[0]?.message).toBe('真偽値ではありません')
  })

  it('number: 数値文字列は変換、非数値はエラー', () => {
    const s = { n: { prop: 'n', type: 'number' } } satisfies Schema
    expect(first(s, { n: '42' }).value?.n).toBe(42)
    expect(first(s, { n: 'x' }).errors[0]?.message).toBe('数値ではありません')
  })

  it('number: 10 進の符号・小数・指数・前後空白は受理する', () => {
    const s = { n: { prop: 'n', type: 'number' } } satisfies Schema
    expect(first(s, { n: '-3.5' }).value?.n).toBe(-3.5)
    expect(first(s, { n: '.5' }).value?.n).toBe(0.5)
    expect(first(s, { n: '1e3' }).value?.n).toBe(1000)
    expect(first(s, { n: ' 42 ' }).value?.n).toBe(42)
  })

  it('number: 16 進等の非 10 進表記・真偽/日付セル・空白のみはエラー', () => {
    const s = { n: { prop: 'n', type: 'number' } } satisfies Schema
    // Number() 丸投げだと 0x10 → 16 / true → 1 / Date → エポックms / " " → 0 になってしまう
    expect(first(s, { n: '0x10' }).errors[0]?.message).toBe('数値ではありません')
    expect(first(s, { n: true }).errors[0]?.message).toBe('数値ではありません')
    expect(first(s, { n: new Date(2020, 0, 1) }).errors[0]?.message).toBe('数値ではありません')
    expect(first(s, { n: ' ' }).errors[0]?.message).toBe('数値ではありません')
  })

  it('string: 日付セルは ISO 8601 文字列になる（実装依存の Date.toString にしない）', () => {
    const s = { x: { prop: 'x', type: 'string' } } satisfies Schema
    expect(first(s, { x: new Date(2020, 3, 1) }).value?.x).toBe('2020-04-01')
    expect(first(s, { x: new Date(2020, 3, 1, 9, 30, 5) }).value?.x).toBe('2020-04-01T09:30:05')
  })

  it('string: utc 指定なら日付セルは UTC の暦日で ISO 文字列になる', () => {
    const s = { x: { prop: 'x', type: 'string' } } satisfies Schema
    const { data } = applySchema([row({ x: new Date(Date.UTC(2020, 3, 1)) })], s, true)
    expect(data[0]?.x).toBe('2020-04-01')
  })

  it('number: 共有文字列セルは raw（index）でなく解決済みテキストを数値化する', () => {
    // t="s" のセルは raw.value が共有文字列の index 文字列。実値 "12345" が index 3 にある状況を模す
    const s = { n: { prop: 'n', type: 'number' } } satisfies Schema
    const sheetRow: SheetRow = {
      rowNum: 2,
      cells: { n: { value: '12345', raw: '3' } },
    }
    const { data } = applySchema([sheetRow], s)
    expect(data[0]?.n).toBe(12345)
  })

  it('date: Date はそのまま / ISO 文字列は変換 / 不正文字列・非日付はエラー', () => {
    const s = { d: { prop: 'd', type: 'date' } } satisfies Schema
    expect(first(s, { d: new Date(2020, 0, 1) }).value?.d).toBeInstanceOf(Date)
    expect((first(s, { d: '2020-01-01' }).value?.d as Date).getFullYear()).toBe(2020)
    expect(first(s, { d: 'not-a-date' }).errors[0]?.message).toBe('日付ではありません')
    expect(first(s, { d: 123 }).errors[0]?.message).toBe('日付ではありません')
  })

  it('date: 日付のみ ISO は TZ に依らずローカル 0:00（暦日がずれない）', () => {
    const s = { d: { prop: 'd', type: 'date' } } satisfies Schema
    const d = first(s, { d: '2020-01-01' }).value?.d as Date
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2020, 0, 1])
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0])
  })

  it('date: ISO 日時はそのまま受理する', () => {
    const s = { d: { prop: 'd', type: 'date' } } satisfies Schema
    expect((first(s, { d: '2020-01-01T09:30:00' }).value?.d as Date).getHours()).toBe(9)
    expect(first(s, { d: '2020-01-01T00:00:00Z' }).value?.d).toBeInstanceOf(Date)
  })

  it('date: ISO 以外の形式・不正な暦日はエラー', () => {
    const s = { d: { prop: 'd', type: 'date' } } satisfies Schema
    // 実装依存だったスラッシュ区切り・米国式・月名は受理しない
    expect(first(s, { d: '2020/01/01' }).errors[0]?.message).toBe('日付ではありません')
    expect(first(s, { d: '01/15/2020' }).errors[0]?.message).toBe('日付ではありません')
    expect(first(s, { d: 'Jan 15 2020' }).errors[0]?.message).toBe('日付ではありません')
    // 存在しない暦日
    expect(first(s, { d: '2020-02-30' }).errors[0]?.message).toBe('日付ではありません')
    expect(first(s, { d: '2020-13-01' }).errors[0]?.message).toBe('日付ではありません')
  })

  it('空セルで required でも default でもなければ null', () => {
    const s = { x: { prop: 'x', type: 'string' } } satisfies Schema
    expect(first(s, { x: null }).value?.x).toBeNull()
  })

  it('スキーマ列がシートに無い場合も null/必須エラー', () => {
    const s = { 無い列: { prop: 'missing', type: 'string', required: true } } satisfies Schema
    expect(first(s, {}).errors[0]?.message).toBe('必須です')
  })
})
