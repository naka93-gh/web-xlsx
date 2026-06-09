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

  it('XML 禁止の制御文字を除去する', () => {
    expect(escapeText('a\x00b\x08c\x0bd\x0ce\x1ff')).toBe('abcdef')
    expect(escapeText('\x00\x01\x02')).toBe('')
  })

  it('tab/LF は許可文字なので残す（CR のみ実体化）', () => {
    expect(escapeText('a\tb\nc')).toBe('a\tb\nc')
  })
})

describe('escapeAttr（属性値用）', () => {
  it('テキスト用に加えて " も実体化する', () => {
    expect(escapeAttr('a "b" <c> & d')).toBe('a &quot;b&quot; &lt;c&gt; &amp; d')
  })
})
