import { describe, expect, it } from 'vitest'
import { columnToIndex, parseRef, type ResolveContext, resolveCell } from '../src/ooxml/cells'
import type { Styles } from '../src/ooxml/styles'

const dateStyles: Styles = { isDate: () => true }
const numStyles: Styles = { isDate: () => false }

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  sharedStrings: ['Alice', 'Bob'],
  styles: numStyles,
  date1904: false,
  ...over,
})

describe('resolveCell', () => {
  it('共有文字列', () => {
    expect(resolveCell({ ref: 'A1', type: 's', value: '1' }, ctx())).toBe('Bob')
  })

  it('共有文字列の範囲外は null', () => {
    expect(resolveCell({ ref: 'A1', type: 's', value: '9' }, ctx())).toBeNull()
  })

  it('inline 文字列', () => {
    expect(resolveCell({ ref: 'A1', type: 'inlineStr', inlineText: 'inline' }, ctx())).toBe(
      'inline',
    )
  })

  it('数式の文字列結果', () => {
    expect(resolveCell({ ref: 'A1', type: 'str', value: 'result' }, ctx())).toBe('result')
  })

  it('真偽値', () => {
    expect(resolveCell({ ref: 'A1', type: 'b', value: '1' }, ctx())).toBe(true)
    expect(resolveCell({ ref: 'A1', type: 'b', value: '0' }, ctx())).toBe(false)
  })

  it('エラーセルは null', () => {
    expect(resolveCell({ ref: 'A1', type: 'e', value: '#N/A' }, ctx())).toBeNull()
  })

  it('数値（無印）', () => {
    expect(resolveCell({ ref: 'A1', value: '42.5' }, ctx())).toBe(42.5)
  })

  it('日付スタイルの数値は Date', () => {
    const v = resolveCell({ ref: 'A1', value: '43831', style: 0 }, ctx({ styles: dateStyles }))
    expect(v).toBeInstanceOf(Date)
    expect((v as Date).getFullYear()).toBe(2020)
  })

  it('日付スタイルでも 1904 系を尊重', () => {
    const v = resolveCell(
      { ref: 'A1', value: String(43831 - 1462), style: 0 },
      ctx({ styles: dateStyles, date1904: true }),
    )
    expect((v as Date).getFullYear()).toBe(2020)
  })

  it('空セルは null', () => {
    expect(resolveCell({ ref: 'A1' }, ctx())).toBeNull()
    expect(resolveCell({ ref: 'A1', value: '' }, ctx())).toBeNull()
  })
})

describe('A1 参照ユーティリティ', () => {
  it('columnToIndex', () => {
    expect(columnToIndex('A')).toBe(0)
    expect(columnToIndex('Z')).toBe(25)
    expect(columnToIndex('AA')).toBe(26)
    expect(columnToIndex('AB')).toBe(27)
    expect(columnToIndex('BA')).toBe(52)
  })

  it('parseRef', () => {
    expect(parseRef('A1')).toEqual({ col: 0, row: 1 })
    expect(parseRef('B12')).toEqual({ col: 1, row: 12 })
    expect(parseRef('AA100')).toEqual({ col: 26, row: 100 })
  })
})
