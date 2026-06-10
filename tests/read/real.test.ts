import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Schema } from '../../src/core/types'
import { parse } from '../../src/read/parse'

// 実ファイル fixture（openpyxl 生成。自前 writer を通さない独立した本物の OOXML）。
// [Content_Types].xml・docProps・完全な名前空間・numFmt 由来の日付・t="n"/t="b" など
// 自前 buildXlsx に無い実構造で parser を検証する。生成元は tests/fixtures/generate.py
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')

/** fixture を tight な Uint8Array として読む（Buffer のプール共有を避ける） */
function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, `${name}.xlsx`)))
}

describe('実ファイル / employees.xlsx（型付き取込の主軸）', () => {
  it('文字列・数値・日付・真偽をネイティブ型で読む', async () => {
    const result = await parse(fixture('employees'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.errors).toEqual([])
    expect(result.data).toHaveLength(3)

    const r0 = result.data[0]
    expect(r0?.名前).toBe('田中太郎')
    expect(r0?.年齢).toBe(30) // t="n" の数値
    expect(r0?.在籍).toBe(true) // t="b"
    expect(r0?.給与).toBe(4500000)
    // numFmt(yyyy-mm-dd, custom id 165)由来でシリアル値を Date に解決
    expect(r0?.入社日).toBeInstanceOf(Date)
    const d = r0?.入社日 as Date
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2020, 3, 1])

    expect(result.data[1]?.在籍).toBe(false)
    expect(result.data[2]?.名前).toBe('John Smith')
    expect((result.data[2]?.入社日 as Date).getFullYear()).toBe(2019)
  })

  it('スキーマで型付けすると推論型で取れ、検証エラーは無い', async () => {
    const schema = {
      名前: { prop: 'name', type: 'string', required: true },
      年齢: { prop: 'age', type: 'number' },
      入社日: { prop: 'joinedAt', type: 'date' },
      在籍: { prop: 'active', type: 'boolean' },
      給与: { prop: 'salary', type: 'number' },
    } satisfies Schema

    const result = await parse(fixture('employees'), { schema })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.errors).toEqual([])
    expect(result.data).toHaveLength(3)

    const r0 = result.data[0]
    expect(r0?.name).toBe('田中太郎')
    expect(r0?.age).toBe(30)
    expect(r0?.active).toBe(true)
    expect(r0?.salary).toBe(4500000)
    expect(r0?.joinedAt).toBeInstanceOf(Date)
  })
})

describe('実ファイル / multisheet.xlsx（シート選択）', () => {
  it('既定は先頭シート（売上）', async () => {
    const result = await parse(fixture('multisheet'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(2)
    expect(result.data[0]?.月).toBe('1月')
    expect(result.data[0]?.金額).toBe(100)
  })

  it('名前でシートを選ぶ（費用）', async () => {
    const result = await parse(fixture('multisheet'), { sheet: '費用' })
    expect(result.ok && result.data).toHaveLength(1)
    if (result.ok) expect(result.data[0]?.金額).toBe(50)
  })

  it('index でシートを選ぶ（2 → Summary）', async () => {
    const result = await parse(fixture('multisheet'), { sheet: 2 })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]?.項目).toBe('利益')
    expect(result.data[0]?.値).toBe(250)
  })

  it('存在しないシート名は sheet-not-found', async () => {
    const result = await parse(fixture('multisheet'), { sheet: '無い' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('sheet-not-found')
  })
})

describe('実ファイル / edge.xlsx（テキスト ID・空白・空セル）', () => {
  it('テキスト格納の ID は桁落ち/先頭ゼロ欠落せず読める', async () => {
    const result = await parse(fixture('edge'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(2)
    // 19桁ID・先頭ゼロは数値だと壊れるが、テキスト格納なら raw 文字列のまま
    expect(result.data[0]?.ID).toBe('1234567890123456789')
    expect(result.data[1]?.ID).toBe('0042')
  })

  it('前後空白の保持・空セルの null・浮動小数/負数', async () => {
    const result = await parse(fixture('edge'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]?.名前).toBe('  前後  ') // xml:space="preserve"
    expect(result.data[0]?.メモ).toBeNull() // 空セルは欠落 → null
    expect(result.data[0]?.数値).toBe(3.14)
    expect(result.data[1]?.数値).toBe(-7)
  })

  it('string スキーマで大整数 ID をプロパティに型付けできる', async () => {
    const schema = {
      ID: { prop: 'id', type: 'string', required: true },
    } satisfies Schema
    const result = await parse(fixture('edge'), { schema })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]?.id).toBe('1234567890123456789')
    expect(result.data[1]?.id).toBe('0042')
  })
})
