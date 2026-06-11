import { describe, expect, it } from 'vitest'
import { decodeEntities, tokenize, type XmlToken } from '../../../src/read/io/xml.js'

const collect = (xml: string): XmlToken[] => [...tokenize(xml)]

describe('decodeEntities', () => {
  it('定義済み実体', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe(
      `a & b <c> "d" 'e'`,
    )
  })

  it('数値参照（10進・16進）', () => {
    expect(decodeEntities('&#65;&#x42;')).toBe('AB')
  })

  it('未知の実体はそのまま残す', () => {
    expect(decodeEntities('&unknown;')).toBe('&unknown;')
  })

  it('Unicode 範囲（0x10FFFF）の境界はデコードする', () => {
    expect(decodeEntities('&#x10FFFF;')).toBe(String.fromCodePoint(0x10ffff))
  })

  it('範囲外コードポイントは例外を投げず元のまま残す', () => {
    // fromCodePoint が RangeError を投げる値（0x110000 超）でクラッシュしない
    expect(() => decodeEntities('&#x110000;')).not.toThrow()
    expect(decodeEntities('&#x110000;')).toBe('&#x110000;')
    expect(decodeEntities('&#1114112;')).toBe('&#1114112;')
  })
})

describe('tokenize', () => {
  it('開始・自己終了・テキスト・終了', () => {
    const tokens = collect('<a x="1"><b/>text</a>')
    expect(tokens).toEqual([
      { type: 'open', name: 'a', attrs: { x: '1' }, selfClosing: false },
      { type: 'open', name: 'b', attrs: {}, selfClosing: true },
      { type: 'text', value: 'text' },
      { type: 'close', name: 'a' },
    ])
  })

  it('属性のデコードと空白保持', () => {
    const tokens = collect('<t xml:space="preserve"> a &amp; b </t>')
    expect(tokens[0]).toEqual({
      type: 'open',
      name: 't',
      attrs: { 'xml:space': 'preserve' },
      selfClosing: false,
    })
    expect(tokens[1]).toEqual({ type: 'text', value: ' a & b ' })
  })

  it('接頭辞つき属性', () => {
    const [tok] = collect('<sheet name="S1" r:id="rId1"/>')
    expect(tok).toEqual({
      type: 'open',
      name: 'sheet',
      attrs: { name: 'S1', 'r:id': 'rId1' },
      selfClosing: true,
    })
  })

  it('属性値内のスラッシュで自己終了を誤判定しない', () => {
    const [tok] = collect('<Relationship Target="worksheets/sheet1.xml"/>')
    expect(tok).toMatchObject({
      name: 'Relationship',
      attrs: { Target: 'worksheets/sheet1.xml' },
      selfClosing: true,
    })
  })

  it('属性値内の > でタグ終端を誤検出しない（カスタム書式）', () => {
    const [tok] = collect('<numFmt numFmtId="164" formatCode="[>0]0;[<0]-0"/>')
    expect(tok).toMatchObject({
      name: 'numFmt',
      attrs: { numFmtId: '164', formatCode: '[>0]0;[<0]-0' },
      selfClosing: true,
    })
  })

  it('XML 宣言・コメント・処理命令を読み飛ばす', () => {
    const tokens = collect('<?xml version="1.0"?><!--c--><a>x</a>')
    expect(tokens).toEqual([
      { type: 'open', name: 'a', attrs: {}, selfClosing: false },
      { type: 'text', value: 'x' },
      { type: 'close', name: 'a' },
    ])
  })

  it('CDATA はテキストとして扱う', () => {
    const tokens = collect('<a><![CDATA[<x>&y]]></a>')
    expect(tokens[1]).toEqual({ type: 'text', value: '<x>&y' })
  })

  it('共有文字列のリッチテキスト構造', () => {
    const tokens = collect('<si><r><t>Hello </t></r><r><t>World</t></r></si>')
    const texts = tokens.filter((t): t is Extract<XmlToken, { type: 'text' }> => t.type === 'text')
    expect(texts.map((t) => t.value).join('')).toBe('Hello World')
  })
})
