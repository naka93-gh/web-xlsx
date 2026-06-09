import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { applySchema } from '../src/schema'
import type { SheetRow } from '../src/sheet'
import type { Schema } from '../src/types'
import { buildXlsx } from './helpers/zip'

/** SheetRow を組み立てる小ヘルパ */
const row = (
  rowNum: number,
  cells: Record<string, { value: unknown; raw?: string }>,
): SheetRow => ({
  rowNum,
  cells: Object.fromEntries(
    Object.entries(cells).map(([k, v]) => [k, { value: v.value as never, raw: v.raw }]),
  ),
})

describe('applySchema', () => {
  const schema = {
    名前: { prop: 'name', type: 'string', required: true },
    年齢: { prop: 'age', type: 'number' },
    入社日: { prop: 'hireDate', type: 'date' },
  } satisfies Schema

  it('型付けして data に入れる', () => {
    const rows = [
      row(2, {
        名前: { value: 'Alice' },
        年齢: { value: 30 },
        入社日: { value: new Date(2020, 0, 1) },
      }),
    ]
    const { data, errors } = applySchema(rows, schema)
    expect(errors).toEqual([])
    expect(data[0]).toEqual({ name: 'Alice', age: 30, hireDate: new Date(2020, 0, 1) })
  })

  it('required 欠落は行を除外して error', () => {
    const rows = [
      row(2, { 名前: { value: null }, 年齢: { value: 30 } }),
      row(3, { 名前: { value: 'Bob' }, 年齢: { value: 25 } }),
    ]
    const { data, errors } = applySchema(rows, schema)
    expect(data).toHaveLength(1)
    expect(data[0]?.name).toBe('Bob')
    expect(errors[0]).toMatchObject({ row: 2, column: '名前', message: '必須です' })
  })

  it('defaultValue で補完', () => {
    const s = { 区分: { prop: 'kind', type: 'string', defaultValue: '未設定' } } satisfies Schema
    const { data } = applySchema([row(2, { 区分: { value: null } })], s)
    expect(data[0]?.kind).toBe('未設定')
  })

  it('型不一致は error', () => {
    const { data, errors } = applySchema(
      [row(2, { 名前: { value: 'x' }, 年齢: { value: 'abc' } })],
      schema,
    )
    expect(data).toHaveLength(0)
    expect(errors[0]).toMatchObject({ row: 2, column: '年齢', message: '数値ではありません' })
  })

  it('validate 失敗は error', () => {
    const s = {
      年齢: {
        prop: 'age',
        type: 'number',
        validate: (v) => (typeof v === 'number' && v < 0 ? '負の値です' : null),
      },
    } satisfies Schema
    const { errors } = applySchema([row(2, { 年齢: { value: -1 } })], s)
    expect(errors[0]?.message).toBe('負の値です')
  })

  it('大整数IDは string 指定で raw の桁を保持', () => {
    const s = { 社員番号: { prop: 'code', type: 'string' } } satisfies Schema
    const { data } = applySchema(
      [row(2, { 社員番号: { value: Number('12345678901234567'), raw: '12345678901234567' } })],
      s,
    )
    expect(data[0]?.code).toBe('12345678901234567')
  })
})

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

describe('parse（高レベル・スキーマ E2E）', () => {
  it('スキーマで型付けし、不正行は errors に', async () => {
    const bytes = await buildXlsx({
      '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships>
        <Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
        <Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
      </Relationships>`,
      'xl/sharedStrings.xml': `<sst><si><t>名前</t></si><si><t>年齢</t></si><si><t>Alice</t></si></sst>`,
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>30</v></c></row>
        <row r="3"><c r="A3" t="inlineStr"><is><t>Bob</t></is></c><c r="B3" t="inlineStr"><is><t>x</t></is></c></row>
      </sheetData></worksheet>`,
    })

    const schema = {
      名前: { prop: 'name', type: 'string', required: true },
      年齢: { prop: 'age', type: 'number' },
    } satisfies Schema

    const result = await parse(bytes, { schema })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toEqual([{ name: 'Alice', age: 30 }])
    expect(result.errors[0]).toMatchObject({
      row: 3,
      column: '年齢',
      message: '数値ではありません',
    })
  })
})
