import { describe, expect, it } from 'vitest'
import { parseRange, RangeFormatError } from '../../../src/read/ooxml/range.js'

const INF = Number.POSITIVE_INFINITY

describe('parseRange', () => {
  it('矩形 "A1:D100" を 0 始まり列・1 始まり行で返す', () => {
    expect(parseRange('A1:D100')).toEqual({ minCol: 0, maxCol: 3, minRow: 1, maxRow: 100 })
  })

  it('列のみ "A:D" のとき全行を返す（行は 1〜∞）', () => {
    expect(parseRange('A:D')).toEqual({ minCol: 0, maxCol: 3, minRow: 1, maxRow: INF })
  })

  it('行のみ "2:100" のとき全列を返す（列は 0〜∞）', () => {
    expect(parseRange('2:100')).toEqual({ minCol: 0, maxCol: INF, minRow: 2, maxRow: 100 })
  })

  it('単一端点 "B2" のとき始点=終点の 1 セル範囲を返す', () => {
    expect(parseRange('B2')).toEqual({ minCol: 1, maxCol: 1, minRow: 2, maxRow: 2 })
  })

  it('逆順 "D100:A1" は min/max に正規化する', () => {
    expect(parseRange('D100:A1')).toEqual({ minCol: 0, maxCol: 3, minRow: 1, maxRow: 100 })
  })

  it('列文字は小文字でも受け付ける', () => {
    expect(parseRange('a1:d2')).toEqual({ minCol: 0, maxCol: 3, minRow: 1, maxRow: 2 })
  })

  it('上限ちょうどの列 "XFD" は通す（列 index 16383）', () => {
    expect(parseRange('A1:XFD1')).toEqual({ minCol: 0, maxCol: 16383, minRow: 1, maxRow: 1 })
  })

  it('XFD 超の列のとき RangeFormatError を投げる（矩形化の巨大確保を防ぐ）', () => {
    expect(() => parseRange('A1:XFE1')).toThrow(RangeFormatError)
    expect(() => parseRange('A:ZZZZZZZ')).toThrow(RangeFormatError)
  })

  it('コロン過多 "A1:B2:C3" は黙って丸めず不正として弾く', () => {
    expect(() => parseRange('A1:B2:C3')).toThrow(RangeFormatError)
  })

  it('開始・終了で次元が食い違う "A1:D" のとき不正として弾く', () => {
    expect(() => parseRange('A1:D')).toThrow(RangeFormatError)
    expect(() => parseRange('A:D1')).toThrow(RangeFormatError)
  })

  it('解析不能な文字列・空文字のとき不正として弾く', () => {
    expect(() => parseRange('???')).toThrow(RangeFormatError)
    expect(() => parseRange('1A:2')).toThrow(RangeFormatError)
    expect(() => parseRange('')).toThrow(RangeFormatError)
  })
})

describe('RangeFormatError', () => {
  it('Error を継承し name を持つ', () => {
    const e = new RangeFormatError('x')
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('RangeFormatError')
  })
})
