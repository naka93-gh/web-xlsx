import { describe, expect, it } from 'vitest'
import { DATE_STYLE, HEADER_STYLE, stylesXml } from '../../../src/write/ooxml/styles'

const XML = stylesXml()

/** cellXfs 内の <xf .../> を出現順に取り出す（index = cellXfs インデックス） */
function cellXfs(): string[] {
  const block = /<cellXfs count="\d+">(.*?)<\/cellXfs>/s.exec(XML)?.[1] ?? ''
  return block.match(/<xf\b[^>]*\/>/g) ?? []
}

describe('stylesXml', () => {
  it('XML 宣言と styleSheet ルート（main 名前空間）を持つ', () => {
    expect(XML.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true)
    expect(XML).toContain(
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    )
    expect(XML.trimEnd().endsWith('</styleSheet>')).toBe(true)
  })

  it('日付用 numFmt 164 は yyyy-mm-dd', () => {
    expect(XML).toContain('<numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>')
  })

  it('既定(0)・日付・ヘッダーの 3 つの cellXfs を持つ', () => {
    expect(XML).toContain('<cellXfs count="3">')
    expect(cellXfs()).toHaveLength(3)
  })
})

describe('cellXfs インデックス定数の不変条件', () => {
  const xfs = cellXfs()

  it('既定(0)は numFmt なし・標準フォント', () => {
    expect(xfs[0]).toContain('numFmtId="0"')
    expect(xfs[0]).toContain('fontId="0"')
    expect(xfs[0]).not.toContain('applyNumberFormat')
  })

  it('DATE_STYLE は numFmt 164 を applyNumberFormat 付きで指す', () => {
    const xf = xfs[DATE_STYLE]
    expect(xf).toContain('numFmtId="164"')
    expect(xf).toContain('applyNumberFormat="1"')
  })

  it('HEADER_STYLE は太字フォント(fontId=1)を applyFont 付きで指す', () => {
    const xf = xfs[HEADER_STYLE]
    expect(xf).toContain('fontId="1"')
    expect(xf).toContain('applyFont="1"')
  })

  it('DATE_STYLE と HEADER_STYLE は別インデックス', () => {
    expect(DATE_STYLE).not.toBe(HEADER_STYLE)
  })
})

describe('fonts 定義', () => {
  it('fontId=1 は太字(<b/>)', () => {
    // HEADER_STYLE が参照する fontId=1 が実際に太字フォントであること
    const fonts = /<fonts count="\d+">(.*?)<\/fonts>/s.exec(XML)?.[1] ?? ''
    const list = fonts.match(/<font>.*?<\/font>/gs) ?? []
    expect(list).toHaveLength(2)
    expect(list[1]).toContain('<b/>')
    expect(list[0]).not.toContain('<b/>')
  })
})
