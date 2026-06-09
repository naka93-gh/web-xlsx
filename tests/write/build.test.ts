import { describe, expect, it } from 'vitest'
import type { Schema } from '../../src/core/types'
import { parse } from '../../src/read/parse'
import { build } from '../../src/write/build'

describe('build → parse ラウンドトリップ（スキーマ無し）', () => {
  it('文字列・数値・真偽・日付を書いて読み戻せる', async () => {
    const rows = [
      { 名前: '田中太郎', 年齢: 30, 在籍: true, 入社日: new Date(2020, 0, 15) },
      { 名前: '鈴木花子', 年齢: 25, 在籍: false, 入社日: new Date(2021, 5, 1) },
    ]
    const bytes = await build(rows)
    const result = await parse(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toMatchObject({ 名前: '田中太郎', 年齢: 30, 在籍: true })
    const hire = result.data[0]?.入社日
    expect(hire).toBeInstanceOf(Date)
    expect((hire as Date).getFullYear()).toBe(2020)
    expect((hire as Date).getMonth()).toBe(0)
    expect((hire as Date).getDate()).toBe(15)
  })

  it('列順は最初に現れたキー順になる', async () => {
    const bytes = await build([{ b: 1, a: 2 }])
    const result = await parse(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.keys(result.data[0] ?? {})).toEqual(['b', 'a'])
  })

  it('null セルは空として読み戻る', async () => {
    const bytes = await build([{ 名前: '佐藤', メモ: null }])
    const result = await parse(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]?.メモ ?? null).toBeNull()
  })
})

describe('build → parse ラウンドトリップ（スキーマ）', () => {
  const schema = {
    名前: { prop: 'name', type: 'string', required: true },
    年齢: { prop: 'age', type: 'number' },
    入社日: { prop: 'hireDate', type: 'date' },
  } satisfies Schema

  it('スキーマで書いてスキーマで読み戻すと型が保たれる', async () => {
    const bytes = await build([{ name: '山田', age: 42, hireDate: new Date(2019, 2, 10) }], {
      schema,
    })
    const result = await parse(bytes, { schema })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.errors).toHaveLength(0)
    expect(result.data[0]?.name).toBe('山田')
    expect(result.data[0]?.age).toBe(42)
    expect(result.data[0]?.hireDate).toBeInstanceOf(Date)
  })
})

describe('build オプション', () => {
  it('style:false でも有効な xlsx として読み戻せる', async () => {
    const bytes = await build([{ x: 'a' }], { style: false })
    const result = await parse(bytes)
    expect(result.ok).toBe(true)
  })

  it('sheetName を指定したシートから読める', async () => {
    const bytes = await build([{ x: 'a' }], { sheetName: '社員一覧' })
    const result = await parse(bytes, { sheet: '社員一覧' })
    expect(result.ok).toBe(true)
  })

  it('前後の空白を含む文字列が保持される', async () => {
    const bytes = await build([{ s: '  spaced  ' }])
    const result = await parse(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]?.s).toBe('  spaced  ')
  })
})
