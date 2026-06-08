import { describe, expect, it } from 'vitest'
import { parseSharedStrings } from '../src/strings'

const sst = (inner: string) => `<sst count="0" uniqueCount="0">${inner}</sst>`

describe('parseSharedStrings', () => {
  it('単一 <t> を index 順に読む', () => {
    const xml = sst('<si><t>Alice</t></si><si><t>Bob</t></si>')
    expect(parseSharedStrings(xml)).toEqual(['Alice', 'Bob'])
  })

  it('xml:space="preserve" の空白を保持', () => {
    const xml = sst('<si><t xml:space="preserve"> 前後空白 </t></si>')
    expect(parseSharedStrings(xml)).toEqual([' 前後空白 '])
  })

  it('リッチテキストの複数ランを連結', () => {
    const xml = sst('<si><r><t>Hello </t></r><r><rPr/><t>World</t></r></si>')
    expect(parseSharedStrings(xml)).toEqual(['Hello World'])
  })

  it('ふりがな <rPh> 内のテキストは除外', () => {
    const xml = sst(
      '<si><r><t>関西</t><rPh sb="0" eb="2"><t>カンサイ</t></rPh></r><phoneticPr fontId="1"/></si>',
    )
    expect(parseSharedStrings(xml)).toEqual(['関西'])
  })

  it('実体参照はデコードされる', () => {
    const xml = sst('<si><t>a &amp; b &lt; c</t></si>')
    expect(parseSharedStrings(xml)).toEqual(['a & b < c'])
  })

  it('空の <si> は空文字列', () => {
    const xml = sst('<si><t></t></si><si/><si><t>x</t></si>')
    expect(parseSharedStrings(xml)).toEqual(['', '', 'x'])
  })
})
