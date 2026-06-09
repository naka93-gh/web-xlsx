import { describe, expect, it } from 'vitest'
import { tokenize, type XmlToken } from '../src/io/xml'

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
})
