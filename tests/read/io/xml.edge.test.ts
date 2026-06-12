import { describe, expect, it } from 'vitest'
import { tokenize, type XmlToken } from '../../../src/read/io/xml.js'

const collect = (xml: string): XmlToken[] => [...tokenize(xml)]

describe('tokenize エッジ', () => {
  it('DOCTYPE を読み飛ばす', () => {
    const tokens = collect('<!DOCTYPE note><a/>')
    expect(tokens).toEqual([{ type: 'open', name: 'a', attrs: {}, selfClosing: true }])
  })

  it('未終端タグは打ち切る', () => {
    expect(collect('<a x="1"')).toEqual([])
  })

  it('未終端コメントは末尾まで読み飛ばす', () => {
    expect(collect('<a/><!-- unclosed')).toEqual([
      { type: 'open', name: 'a', attrs: {}, selfClosing: true },
    ])
  })

  it('未終端 CDATA は末尾まで取り込む', () => {
    expect(collect('<a><![CDATA[tail')).toContainEqual({ type: 'text', value: 'tail' })
  })

  it('値の無い属性は空文字列', () => {
    const [tok] = collect('<input disabled/>')
    expect(tok).toMatchObject({ name: 'input', attrs: { disabled: '' } })
  })

  it('クォート無しの属性値も読む', () => {
    const [tok] = collect('<c x=1 y=2/>')
    expect(tok).toMatchObject({ attrs: { x: '1', y: '2' } })
  })

  it('要素名は名前空間プレフィックスを剥がし local-name にする', () => {
    expect(collect('<x:sheetData></x:sheetData>')).toEqual([
      { type: 'open', name: 'sheetData', attrs: {}, selfClosing: false },
      { type: 'close', name: 'sheetData' },
    ])
  })

  it('属性名のプレフィックスは保持する（r:id / xml:space 等）', () => {
    const [tok] = collect('<x:c r:id="rId1" xml:space="preserve"/>')
    expect(tok).toMatchObject({
      name: 'c',
      attrs: { 'r:id': 'rId1', 'xml:space': 'preserve' },
    })
  })
})
