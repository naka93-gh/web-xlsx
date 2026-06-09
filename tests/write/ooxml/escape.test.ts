import { describe, expect, it } from 'vitest'
import { escapeAttr, escapeText } from '../../../src/write/ooxml/escape'

describe('escapeText（テキストノード用）', () => {
  it('& < > と CR を実体化する', () => {
    expect(escapeText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
    expect(escapeText('x\ry')).toBe('x&#13;y')
  })

  it('& を最初に処理し二重エスケープしない', () => {
    expect(escapeText('&lt;')).toBe('&amp;lt;')
  })

  it('" はテキストでは実体化しない', () => {
    expect(escapeText('say "hi"')).toBe('say "hi"')
  })

  it('対象外の文字はそのまま', () => {
    expect(escapeText('日本語 abc 123')).toBe('日本語 abc 123')
  })
})

describe('escapeAttr（属性値用）', () => {
  it('テキスト用に加えて " も実体化する', () => {
    expect(escapeAttr('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c&gt; &amp; d')
  })
})
