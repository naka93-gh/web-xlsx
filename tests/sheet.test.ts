import { describe, expect, it } from 'vitest'
import type { ResolveContext } from '../src/cells'
import { readSheet } from '../src/sheet'
import type { Styles } from '../src/styles'

const sharedStrings = ['名前', '年齢', 'Alice', 'Bob']
const noDate: Styles = { isDate: () => false }

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  sharedStrings,
  styles: noDate,
  date1904: false,
  ...over,
})

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`

describe('readSheet', () => {
  it('ヘッダー（先頭非空行）とデータ行を読む', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>30</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>25</v></c></row>',
    )
    const { headers, rows } = readSheet(xml, ctx())
    expect(headers).toEqual(['名前', '年齢'])
    expect(rows).toHaveLength(2)
    expect(rows[0]?.rowNum).toBe(2)
    expect(rows[0]?.cells.名前?.value).toBe('Alice')
    expect(rows[0]?.cells.年齢?.value).toBe(30)
    expect(rows[1]?.cells.名前?.value).toBe('Bob')
  })

  it('疎なセル（欠落列）は null', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="2"><c r="B2"><v>30</v></c></row>',
    )
    const { rows } = readSheet(xml, ctx())
    expect(rows[0]?.cells.名前?.value).toBeNull()
    expect(rows[0]?.cells.年齢?.value).toBe(30)
  })

  it('inline 文字列を読む', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2" t="inlineStr"><is><t>直書き</t></is></c></row>',
    )
    expect(readSheet(xml, ctx()).rows[0]?.cells.名前?.value).toBe('直書き')
  })

  it('空行は既定でスキップ・skipEmptyRows:false で保持', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2"/></row>' +
        '<row r="3"><c r="A3" t="s"><v>2</v></c></row>',
    )
    expect(readSheet(xml, ctx()).rows.map((r) => r.rowNum)).toEqual([3])
    expect(readSheet(xml, ctx(), { skipEmptyRows: false }).rows.map((r) => r.rowNum)).toEqual([
      2, 3,
    ])
  })

  it('headerRow でタイトル行を飛ばす', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="inlineStr"><is><t>社員一覧</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>0</v></c><c r="B2" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>30</v></c></row>',
    )
    const { headers, rows } = readSheet(xml, ctx(), { headerRow: 2 })
    expect(headers).toEqual(['名前', '年齢'])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.cells.名前?.value).toBe('Alice')
  })

  it('range で範囲を限定する', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>備考</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>30</v></c><c r="C2" t="inlineStr"><is><t>x</t></is></c></row>',
    )
    const { headers } = readSheet(xml, ctx(), { range: 'A1:B2' })
    expect(headers).toEqual(['名前', '年齢'])
  })

  it('日付スタイルの数値は Date', () => {
    const dateOnly: Styles = { isDate: (i) => i === 5 }
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2" s="5"><v>43831</v></c></row>',
    )
    const v = readSheet(xml, ctx({ styles: dateOnly })).rows[0]?.cells.名前?.value
    expect(v).toBeInstanceOf(Date)
    expect((v as Date).getFullYear()).toBe(2020)
  })

  it('大整数は raw に元テキストを保持（精度対策）', () => {
    const xml = sheet(
      '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2"><v>12345678901234567</v></c></row>',
    )
    const cell = readSheet(xml, ctx()).rows[0]?.cells.名前
    expect(cell?.raw).toBe('12345678901234567')
    expect(typeof cell?.value).toBe('number')
  })
})
