import { describe, expect, it } from 'vitest'
import { parseRef, type ResolveContext, resolveCell } from '../../../src/read/ooxml/cells'
import type { Styles } from '../../../src/read/ooxml/styles'

const ctx: ResolveContext = {
  sharedStrings: [],
  styles: { isDate: () => false } as Styles,
  date1904: false,
  utc: false,
}

describe('resolveCell エッジ', () => {
  it('d 型（ISO 日付）はローカル壁時計 0:00 で構築（UTC 解釈ではない）', () => {
    const v = resolveCell({ ref: 'A1', type: 'd', value: '2020-01-01' }, ctx)
    expect(v).toBeInstanceOf(Date)
    const d = v as Date
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2020, 0, 1])
    expect([d.getHours(), d.getMinutes()]).toEqual([0, 0])
  })

  it('d 型で値が無ければ null', () => {
    expect(resolveCell({ ref: 'A1', type: 'd' }, ctx)).toBeNull()
  })

  it('d 型で ISO 以外の形式は null（new Date 丸投げと違い実装依存にしない）', () => {
    expect(resolveCell({ ref: 'A1', type: 'd', value: '2020/01/01' }, ctx)).toBeNull()
    expect(resolveCell({ ref: 'A1', type: 'd', value: 'not a date' }, ctx)).toBeNull()
    expect(resolveCell({ ref: 'A1', type: 'd', value: '2020-02-30' }, ctx)).toBeNull()
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
  it('不正な参照は null', () => {
    expect(parseRef('???')).toBeNull()
    expect(parseRef('')).toBeNull()
    expect(parseRef('A')).toBeNull()
    expect(parseRef('1')).toBeNull()
  })

  it('正常な参照は列(0始まり)・行(1始まり)に分解する', () => {
    expect(parseRef('A1')).toEqual({ col: 0, row: 1 })
    expect(parseRef('B12')).toEqual({ col: 1, row: 12 })
  })
})
