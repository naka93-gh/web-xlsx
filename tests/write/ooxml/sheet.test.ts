import { describe, expect, it } from 'vitest'
import type { Cell } from '../../../src/core/types.js'
import { sheetXml } from '../../../src/write/ooxml/sheet.js'

/** 単一データ行の A2 セル XML を取り出す（style 無効でヘッダー装飾を除く） */
function cellA2(value: Cell): string {
  const xml = sheetXml(['h'], [[value]], { style: false, utc: false })
  const m = /<row r="2">(.*?)<\/row>/.exec(xml)
  return m?.[1] ?? ''
}

describe('cellXml の型別分岐', () => {
  it('Date のとき serial 値 + 日付スタイル（s="1"）を出力する', () => {
    // 2020-01-01 = serial 43831（serial.test と一致）
    expect(cellA2(new Date(2020, 0, 1))).toBe('<c r="A2" s="1"><v>43831</v></c>')
  })

  it('number のときそのまま <v> を出力する', () => {
    expect(cellA2(42)).toBe('<c r="A2"><v>42</v></c>')
    expect(cellA2(-3.5)).toBe('<c r="A2"><v>-3.5</v></c>')
  })

  it('非有限 number（NaN / Infinity）のとき空セルを出力する', () => {
    expect(cellA2(Number.NaN)).toBe('<c r="A2"/>')
    expect(cellA2(Number.POSITIVE_INFINITY)).toBe('<c r="A2"/>')
  })

  it('Invalid Date のとき空セルを出力する（<v>NaN</v> で xlsx を壊さない）', () => {
    expect(cellA2(new Date('not a date'))).toBe('<c r="A2"/>')
  })

  it('boolean のとき t="b" で 1 / 0 を出力する', () => {
    expect(cellA2(true)).toBe('<c r="A2" t="b"><v>1</v></c>')
    expect(cellA2(false)).toBe('<c r="A2" t="b"><v>0</v></c>')
  })

  it('null と空文字のとき空セルを出力する', () => {
    expect(cellA2(null)).toBe('<c r="A2"/>')
    expect(cellA2('')).toBe('<c r="A2"/>')
  })

  it('文字列のとき inlineStr で xml:space="preserve" を出力する（前後空白を保つ）', () => {
    expect(cellA2(' hi ')).toBe(
      '<c r="A2" t="inlineStr"><is><t xml:space="preserve"> hi </t></is></c>',
    )
  })

  it('文字列内に & < > があるときエスケープして出力する', () => {
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

  it('短い列のとき下限 8 にクランプする', () => {
    expect(widths(['a'])).toEqual([8])
  })

  it('長い列のとき上限 60 にクランプする', () => {
    expect(widths(['a'.repeat(70)])).toEqual([60])
  })

  it('中間のとき表示幅 + 2 にする', () => {
    expect(widths(['a'.repeat(10)])).toEqual([12])
  })

  it('全角のとき 2 カウントする（半角 10 個と全角 5 個が同じ幅）', () => {
    expect(widths(['a'.repeat(10), 'あ'.repeat(5)])).toEqual([12, 12])
  })

  it('データ行の値があるとき幅見積もりに含める', () => {
    expect(widths(['a'], [['x'.repeat(20)]])).toEqual([22])
  })
})

describe('sheetXml の style オプション', () => {
  it('style 有効のとき freeze pane と cols を出力する', () => {
    const xml = sheetXml(['h'], [['v']], { style: true, utc: false })
    expect(xml).toContain('state="frozen"')
    expect(xml).toContain('<cols>')
  })

  it('style 無効のとき freeze pane も cols も出さない', () => {
    const xml = sheetXml(['h'], [['v']], { style: false, utc: false })
    expect(xml).not.toContain('frozen')
    expect(xml).not.toContain('<cols>')
  })

  it('出力のとき 1 行目をヘッダー、2 行目以降をデータにする', () => {
    const xml = sheetXml(['名前'], [['田中']], { style: false, utc: false })
    expect(xml).toContain('<row r="1">')
    expect(xml).toContain('<row r="2">')
  })
})
