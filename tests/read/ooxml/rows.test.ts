import { describe, expect, it } from 'vitest'
import { collectRows } from '../../../src/read/ooxml/rows.js'

const sheet = (rows: string) => `<worksheet><sheetData>${rows}</sheetData></worksheet>`

describe('collectRows', () => {
  it('行番号・列インデックス付きで raw セルを取り出す', () => {
    const rows = collectRows(
      sheet('<row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" s="3"><v>30</v></c></row>'),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.rowNum).toBe(2)
    expect(rows[0]?.cells.get(0)).toEqual({ type: 's', value: '0' })
    // 疎なセル（B2 欠落）は Map に入らない。C2 は style 付き
    expect(rows[0]?.cells.has(1)).toBe(false)
    expect(rows[0]?.cells.get(2)).toEqual({ style: 3, value: '30' })
  })

  it('r 属性の無い行・セルは連番／出現順にフォールバック', () => {
    const rows = collectRows(
      sheet('<row><c><v>1</v></c><c><v>2</v></c></row><row><c><v>3</v></c></row>'),
    )
    expect(rows.map((r) => r.rowNum)).toEqual([1, 2])
    expect(rows[0]?.cells.get(0)?.value).toBe('1')
    expect(rows[0]?.cells.get(1)?.value).toBe('2')
    expect(rows[1]?.cells.get(0)?.value).toBe('3')
  })

  it('壊れた r 属性の行は NaN を伝播させず連番にフォールバック', () => {
    const rows = collectRows(
      sheet('<row r="1"><c r="A1"><v>1</v></c></row><row r="xx"><c r="A2"><v>2</v></c></row>'),
    )
    expect(rows.map((r) => r.rowNum)).toEqual([1, 2])
  })

  it('自己終了セル <c/> も Map に入る（値なし）', () => {
    const rows = collectRows(sheet('<row r="1"><c r="A1"/></row>'))
    expect(rows[0]?.cells.get(0)).toEqual({})
  })

  it('インライン文字列 <is><t> を inlineText に収める', () => {
    const rows = collectRows(
      sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>直書き</t></is></c></row>'),
    )
    expect(rows[0]?.cells.get(0)).toEqual({ type: 'inlineStr', inlineText: '直書き' })
  })

  it('ふりがな <rPh> の本文はインライン文字列から除外する', () => {
    const rows = collectRows(
      sheet(
        '<row r="1"><c r="A1" t="inlineStr"><is><r><t>関西</t><rPh><t>カンサイ</t></rPh></r></is></c></row>',
      ),
    )
    expect(rows[0]?.cells.get(0)?.inlineText).toBe('関西')
  })

  it('自己終了 <v/> は後続セルのテキストを吸わない', () => {
    const rows = collectRows(
      sheet('<row r="1"><c r="A1"><v/></c><c r="B1" t="inlineStr"><is><t>abc</t></is></c></row>'),
    )
    expect(rows[0]?.cells.get(0)?.value).toBeUndefined()
    expect(rows[0]?.cells.get(1)?.inlineText).toBe('abc')
  })

  it('sheetData の外の要素は無視する', () => {
    const xml =
      '<worksheet><dimension ref="A1:B2"/><sheetData><row r="1"><c r="A1"><v>9</v></c></row></sheetData></worksheet>'
    const rows = collectRows(xml)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.cells.get(0)?.value).toBe('9')
  })

  it('空の sheetData は空配列', () => {
    expect(collectRows(sheet(''))).toEqual([])
  })

  it('自己終了 <sheetData/> も空配列（スコープに入らない）', () => {
    expect(collectRows('<worksheet><sheetData/></worksheet>')).toEqual([])
  })
})
