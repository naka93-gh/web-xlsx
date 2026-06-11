import { describe, expect, it } from 'vitest'
import type { Cell } from '../../../src/core/types'
import { sheetXml } from '../../../src/write/ooxml/sheet'

/** 単一データ行の A2 セル XML を取り出す（style 無効でヘッダー装飾を除く） */
function cellA2(value: Cell): string {
  const xml = sheetXml(['h'], [[value]], { style: false, utc: false })
  const m = /<row r="2">(.*?)<\/row>/.exec(xml)
  return m?.[1] ?? ''
}

describe('cellXml の型別分岐', () => {
  it('Date は serial 値 + 日付スタイル（s="1"）', () => {
    // 2020-01-01 = serial 43831（serial.test と一致）
    expect(cellA2(new Date(2020, 0, 1))).toBe('<c r="A2" s="1"><v>43831</v></c>')
  })

  it('number はそのまま <v>', () => {
    expect(cellA2(42)).toBe('<c r="A2"><v>42</v></c>')
    expect(cellA2(-3.5)).toBe('<c r="A2"><v>-3.5</v></c>')
  })

  it('非有限 number（NaN / Infinity）は空セル', () => {
    expect(cellA2(Number.NaN)).toBe('<c r="A2"/>')
    expect(cellA2(Number.POSITIVE_INFINITY)).toBe('<c r="A2"/>')
  })

  it('Invalid Date は空セル（<v>NaN</v> で xlsx を壊さない）', () => {
    expect(cellA2(new Date('not a date'))).toBe('<c r="A2"/>')
  })

  it('boolean は t="b" で 1 / 0', () => {
    expect(cellA2(true)).toBe('<c r="A2" t="b"><v>1</v></c>')
    expect(cellA2(false)).toBe('<c r="A2" t="b"><v>0</v></c>')
  })

  it('null と空文字は空セル', () => {
    expect(cellA2(null)).toBe('<c r="A2"/>')
    expect(cellA2('')).toBe('<c r="A2"/>')
  })

  it('文字列は inlineStr で xml:space="preserve"（前後空白を保つ）', () => {
    expect(cellA2(' hi ')).toBe(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve"> hi </t></is></c>',
    )
  })

  it('文字列内の & < > はエスケープされる', () => {
    expect(cellA2('a & b < c')).toBe(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve">a &amp; b &lt; c</t></is></c>',
    )
  })
})

describe('columnWidths（8〜60 クランプ・全角2カウント）', () => {
  /** style 有効時の <cols> 内 width 属性を列順に取り出す */
  function widths(headers: string[], rows: Cell[][] = []): number[] {
    const xml = sheetXml(headers, rows, { style: true, utc: false })
    const cols = /<cols>(.*?)<\/cols>/.exec(xml)?.[1] ?? ''
    return [...cols.matchAll(/width="(\d+)"/g)].map((m) => Number(m[1]))
  }

  it('短い列は下限 8 にクランプ', () => {
    expect(widths(['a'])).toEqual([8])
  })

  it('長い列は上限 60 にクランプ', () => {
    expect(widths(['a'.repeat(70)])).toEqual([60])
  })

  it('中間は 表示幅 + 2', () => {
    expect(widths(['a'.repeat(10)])).toEqual([12])
  })

  it('全角は 2 カウント（半角 10 個と全角 5 個が同じ幅）', () => {
    expect(widths(['a'.repeat(10), 'あ'.repeat(5)])).toEqual([12, 12])
  })

  it('データ行の値も幅見積もりに含む', () => {
    expect(widths(['a'], [['x'.repeat(20)]])).toEqual([22])
  })
})

describe('sheetXml の style オプション', () => {
  it('style 有効で freeze pane と cols を出力', () => {
    const xml = sheetXml(['h'], [['v']], { style: true, utc: false })
    expect(xml).toContain('state="frozen"')
    expect(xml).toContain('<cols>')
  })

  it('style 無効では freeze pane も cols も出さない', () => {
    const xml = sheetXml(['h'], [['v']], { style: false, utc: false })
    expect(xml).not.toContain('frozen')
    expect(xml).not.toContain('<cols>')
  })

  it('1 行目はヘッダー、2 行目以降がデータ', () => {
    const xml = sheetXml(['名前'], [['田中']], { style: false, utc: false })
    expect(xml).toContain('<row r="1">')
    expect(xml).toContain('<row r="2">')
  })
})
