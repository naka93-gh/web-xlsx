import { describe, expect, it } from 'vitest'
import type { ResolveContext } from '../../../src/read/ooxml/cells'
import { readSheet } from '../../../src/read/ooxml/sheet'
import type { Styles } from '../../../src/read/ooxml/styles'

const ctx = (sharedStrings: string[] = []): ResolveContext => ({
  sharedStrings,
  styles: { isDate: () => false } as Styles,
  date1904: false,
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

  it('非空行が無ければ空の結果', () => {
    expect(readSheet(sheet(''), ctx())).toEqual({ headers: [], rows: [] })
  })

  it('headerRow が存在しない行を指すとヘッダー空', () => {
    const xml = sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>H</t></is></c></row>')
    expect(readSheet(xml, ctx(), { headerRow: 99 }).headers).toEqual([])
  })

  it('列のみ/不正な range は無視される', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>H</t></is></c></row>' +
        '<row r="2"><c r="A2"><v>1</v></c></row>',
    )
    expect(readSheet(xml, ctx(), { range: 'A:B' }).headers).toEqual(['H'])
  })
})
