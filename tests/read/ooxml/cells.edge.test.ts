import { describe, expect, it } from 'vitest'
import { parseRef, type ResolveContext, resolveCell } from '../../../src/read/ooxml/cells'
import type { Styles } from '../../../src/read/ooxml/styles'

const ctx: ResolveContext = {
  sharedStrings: [],
  styles: { isDate: () => false } as Styles,
  date1904: false,
}

describe('resolveCell エッジ', () => {
  it('d 型（ISO 日付文字列）は Date', () => {
    const v = resolveCell({ ref: 'A1', type: 'd', value: '2020-01-01' }, ctx)
    expect(v).toBeInstanceOf(Date)
  })

  it('d 型で値が無ければ null', () => {
    expect(resolveCell({ ref: 'A1', type: 'd' }, ctx)).toBeNull()
  })

  it('s 型で値が無ければ null', () => {
    expect(resolveCell({ ref: 'A1', type: 's' }, ctx)).toBeNull()
  })

  it('s 型で index が数値でなければ null', () => {
    expect(resolveCell({ ref: 'A1', type: 's', value: 'x' }, ctx)).toBeNull()
  })

  it('b 型で値が無ければ null', () => {
    expect(resolveCell({ ref: 'A1', type: 'b' }, ctx)).toBeNull()
  })

  it('str 型で値が無ければ null', () => {
    expect(resolveCell({ ref: 'A1', type: 'str' }, ctx)).toBeNull()
  })

  it('数値として解釈できない無印セルは null', () => {
    expect(resolveCell({ ref: 'A1', value: 'abc' }, ctx)).toBeNull()
  })
})

describe('parseRef エッジ', () => {
  it('不正な参照は {0,0}', () => {
    expect(parseRef('???')).toEqual({ col: 0, row: 0 })
  })
})
