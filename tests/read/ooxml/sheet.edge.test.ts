import { describe, expect, it } from 'vitest'
import type { ResolveContext } from '../../../src/read/ooxml/cells'
import { RangeFormatError, readSheet } from '../../../src/read/ooxml/sheet'
import type { Styles } from '../../../src/read/ooxml/styles'

const ctx = (sharedStrings: string[] = []): ResolveContext => ({
  sharedStrings,
  styles: { isDate: () => false } as Styles,
  date1904: false,
  utc: false,
})

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`

describe('readSheet エッジ', () => {
  it('r 属性の無いセルは出現順で列に割り当て', () => {
    const xml = sheet(
      '<row r="1"><c t="inlineStr"><is><t>A</t></is></c><c t="inlineStr"><is><t>B</t></is></c></row>' +
        '<row r="2"><c><v>1</v></c><c><v>2</v></c></row>',
    )
    const { headers, rows } = readSheet(xml, ctx())
    expect(headers).toEqual(['A', 'B'])
    expect(rows[0]?.cells.A?.value).toBe(1)
    expect(rows[0]?.cells.B?.value).toBe(2)
  })

  it('壊れた r 属性のセルは列 0 に衝突させず出現順に割り当て', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>A</t></is></c><c r="??" t="inlineStr"><is><t>B</t></is></c></row>' +
        '<row r="2"><c r="A2"><v>1</v></c><c r="??"><v>2</v></c></row>',
    )
    const { headers, rows } = readSheet(xml, ctx())
    expect(headers).toEqual(['A', 'B'])
    expect(rows[0]?.cells.A?.value).toBe(1)
    expect(rows[0]?.cells.B?.value).toBe(2)
  })

  it('inline 文字列のふりがな <rPh> を除外', () => {
    const xml = sheet(
      '<row r="1"><c t="inlineStr"><is><t>見出し</t></is></c></row>' +
        '<row r="2"><c t="inlineStr"><is><r><t>関西</t><rPh><t>カンサイ</t></rPh></r></is></c></row>',
    )
    expect(readSheet(xml, ctx()).rows[0]?.cells.見出し?.value).toBe('関西')
  })

  it('r 属性の無い行は連番で扱う', () => {
    const xml = sheet(
      '<row><c r="A1" t="inlineStr"><is><t>H</t></is></c></row>' +
        '<row><c r="A2"><v>9</v></c></row>',
    )
    expect(readSheet(xml, ctx()).rows[0]?.cells.H?.value).toBe(9)
  })

  it('壊れた r 属性の行は NaN を伝播させず連番にフォールバック', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>H</t></is></c></row>' +
        '<row r="abc"><c><v>9</v></c></row>' +
        '<row><c><v>10</v></c></row>',
    )
    const { rows } = readSheet(xml, ctx())
    expect(rows.map((r) => r.rowNum)).toEqual([2, 3])
    expect(rows[0]?.cells.H?.value).toBe(9)
    expect(rows[1]?.cells.H?.value).toBe(10)
  })

  it('非空行が無ければ空の結果', () => {
    expect(readSheet(sheet(''), ctx())).toEqual({ headers: [], rows: [] })
  })

  it('headerRow が存在しない行を指すとヘッダー空', () => {
    const xml = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>H</t></is></c></row>')
    expect(readSheet(xml, ctx(), { headerRow: 99 }).headers).toEqual([])
  })

  it('列のみ range "B:C" は全行・指定列に限定する', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>名前</t></is></c><c r="B1" t="inlineStr"><is><t>年齢</t></is></c><c r="C1" t="inlineStr"><is><t>備考</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="B2"><v>30</v></c><c r="C2" t="inlineStr"><is><t>m</t></is></c></row>',
    )
    const { headers, rows } = readSheet(xml, ctx(), { range: 'B:C' })
    expect(headers).toEqual(['年齢', '備考'])
    expect(rows[0]?.cells.年齢?.value).toBe(30)
  })

  it('行のみ range "2:3" は全列・指定行に限定する', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>無視</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>H</t></is></c></row>' +
        '<row r="3"><c r="A3"><v>9</v></c></row>',
    )
    const { headers, rows } = readSheet(xml, ctx(), { range: '2:3' })
    expect(headers).toEqual(['H'])
    expect(rows[0]?.cells.H?.value).toBe(9)
  })

  it('自己終了 <v/> が後続セルのテキストを吸わない', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>H1</t></is></c><c r="B1" t="inlineStr"><is><t>H2</t></is></c></row>' +
        '<row r="2"><c r="A2"><v/></c><c r="B2" t="inlineStr"><is><t>abc</t></is></c></row>',
    )
    const { rows } = readSheet(xml, ctx())
    expect(rows[0]?.cells.H1?.value).toBeNull()
    expect(rows[0]?.cells.H2?.value).toBe('abc')
  })

  it('自己終了 <is/> が後続セルのテキストを吸わない', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>H1</t></is></c><c r="B1" t="inlineStr"><is><t>H2</t></is></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is/></c><c r="B2"><v>9</v></c></row>',
    )
    const { rows } = readSheet(xml, ctx())
    expect(rows[0]?.cells.H1?.value).toBeNull()
    expect(rows[0]?.cells.H2?.value).toBe(9)
  })

  it('形式が不正な range は RangeFormatError を投げる', () => {
    const xml = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>H</t></is></c></row>')
    expect(() => readSheet(xml, ctx(), { range: '???' })).toThrow(RangeFormatError)
    expect(() => readSheet(xml, ctx(), { range: '1A:2' })).toThrow(RangeFormatError)
    // 開始・終了で形式が食い違う混在も不正
    expect(() => readSheet(xml, ctx(), { range: 'A1:D' })).toThrow(RangeFormatError)
  })
})
