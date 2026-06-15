import { describe, expect, it } from 'vitest'
import type { Schema } from '../../src/core/types.js'
import type { SheetRow } from '../../src/read/ooxml/sheet.js'
import { parse } from '../../src/read/parse.js'
import { applySchema } from '../../src/read/schema.js'
import { buildXlsx } from '../helpers/zip.js'

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

  it('required 欠落のとき行を除外して error にする', () => {
    const rows = [
      row(2, { 名前: { value: null }, 年齢: { value: 30 } }),
      row(3, { 名前: { value: 'Bob' }, 年齢: { value: 25 } }),
    ]
    const { data, errors } = applySchema(rows, schema)
    expect(data).toHaveLength(1)
    expect(data[0]?.name).toBe('Bob')
    expect(errors[0]).toMatchObject({ row: 2, column: '名前', message: '必須です' })
  })

  it('defaultValue で補完する', () => {
    const s = { 区分: { prop: 'kind', type: 'string', defaultValue: '未設定' } } satisfies Schema
    const { data } = applySchema([row(2, { 区分: { value: null } })], s)
    expect(data[0]?.kind).toBe('未設定')
  })

  it('defaultValue は列の type に対応する型に限定される（型レベル）', () => {
    // 型変換を通さず出力に入るため、InferRow の型と実体がずれる指定はコンパイルエラーにする
    const ok = {
      入社日: { prop: 'hireDate', type: 'date', defaultValue: new Date(2020, 0, 1) },
    } satisfies Schema
    const ng = {
      // @ts-expect-error type:'date' に文字列の defaultValue は渡せない
      入社日: { prop: 'hireDate', type: 'date', defaultValue: '2020-01-01' },
    } satisfies Schema
    const { data } = applySchema([row(2, { 入社日: { value: null } })], ok)
    expect(data[0]?.hireDate).toEqual(new Date(2020, 0, 1))
    expect(ng).toBeDefined()
  })

  it('型不一致のとき error にする', () => {
    const { data, errors } = applySchema(
      [row(2, { 名前: { value: 'x' }, 年齢: { value: 'abc' } })],
      schema,
    )
    expect(data).toHaveLength(0)
    expect(errors[0]).toMatchObject({ row: 2, column: '年齢', message: '数値ではありません' })
  })

  it('validate 失敗のとき error にする', () => {
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

  it('validate が throw しても巻き込まず、その行を error にして他行は通す', () => {
    const s = {
      年齢: {
        prop: 'age',
        type: 'number',
        validate: (v) => {
          if (v === 99) throw new Error('検証器が壊れた')
          return null
        },
      },
    } satisfies Schema
    const { data, errors } = applySchema(
      [row(2, { 年齢: { value: 99 } }), row(3, { 年齢: { value: 30 } })],
      s,
    )
    expect(data).toEqual([{ age: 30 }])
    expect(errors[0]).toMatchObject({ row: 2, column: '年齢', message: '検証器が壊れた' })
  })

  it('大整数ID は string 指定で raw の桁を保持する', () => {
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
  /** ヘッダー「名前 / 年齢」の 2 データ行（3 行目の年齢は数値にならない）fixture */
  const fixture = () =>
    buildXlsx({
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

  it('スキーマで型付けし、不正行は errors に入れる', async () => {
    const bytes = await fixture()

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

  it('必須列がヘッダーに無いとき missing-column のファイルエラーを返す', async () => {
    const schema = {
      名前: { prop: 'name', type: 'string', required: true },
      社員番号: { prop: 'code', type: 'string', required: true },
    } satisfies Schema
    const result = await parse(await fixture(), { schema })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('missing-column')
    expect(result.error.message).toContain('社員番号')
  })

  it('任意列・defaultValue 持ちの必須列はヘッダーに無くてもエラーにしない', async () => {
    const schema = {
      名前: { prop: 'name', type: 'string', required: true },
      部署: { prop: 'dept', type: 'string' }, // 無い列・任意 → null
      区分: { prop: 'kind', type: 'string', required: true, defaultValue: '一般' }, // 無い列・既定値で補完
    } satisfies Schema
    const result = await parse(await fixture(), { schema })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data[0]).toEqual({ name: 'Alice', dept: null, kind: '一般' })
  })
})
