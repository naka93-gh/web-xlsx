import { describe, expect, it } from 'vitest'
import { columnToIndex } from '../../../src/core/a1.js'
import { parseRef, type ResolveContext, resolveCell } from '../../../src/read/ooxml/cells.js'
import type { Styles } from '../../../src/read/ooxml/styles.js'

const dateStyles: Styles = { isDate: () => true }
const numStyles: Styles = { isDate: () => false }

const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({
  sharedStrings: ['Alice', 'Bob'],
  styles: numStyles,
  date1904: false,
  utc: false,
  ...over,
})

describe('resolveCell', () => {
  it('共有文字列を解決する', () => {
    expect(resolveCell({ type: 's', value: '1' }, ctx())).toBe('Bob')
  })

  it('共有文字列の範囲外のとき null を返す', () => {
    expect(resolveCell({ type: 's', value: '9' }, ctx())).toBeNull()
  })

  it('inline 文字列を解決する', () => {
    expect(resolveCell({ type: 'inlineStr', inlineText: 'inline' }, ctx())).toBe('inline')
  })

  it('数式の文字列結果を返す', () => {
    expect(resolveCell({ type: 'str', value: 'result' }, ctx())).toBe('result')
  })

  it('真偽値を解決する', () => {
    expect(resolveCell({ type: 'b', value: '1' }, ctx())).toBe(true)
    expect(resolveCell({ type: 'b', value: '0' }, ctx())).toBe(false)
  })

  it('エラーセルのとき null を返す', () => {
    expect(resolveCell({ type: 'e', value: '#N/A' }, ctx())).toBeNull()
  })

  it('数値（無印）を返す', () => {
    expect(resolveCell({ value: '42.5' }, ctx())).toBe(42.5)
  })

  it('日付スタイルの数値のとき Date を返す', () => {
    const v = resolveCell({ value: '43831', style: 0 }, ctx({ styles: dateStyles }))
    expect(v).toBeInstanceOf(Date)
    expect((v as Date).getFullYear()).toBe(2020)
  })

  it('日付スタイルのとき 1904 系を尊重する', () => {
    const v = resolveCell(
      { value: String(43831 - 1462), style: 0 },
      ctx({ styles: dateStyles, date1904: true }),
    )
    expect((v as Date).getFullYear()).toBe(2020)
  })

  it('空セルのとき null を返す', () => {
    expect(resolveCell({}, ctx())).toBeNull()
    expect(resolveCell({ value: '' }, ctx())).toBeNull()
  })
})

describe('A1 参照ユーティリティ', () => {
  it('columnToIndex は列を index へ変換する', () => {
    expect(columnToIndex('A')).toBe(0)
    expect(columnToIndex('Z')).toBe(25)
    expect(columnToIndex('AA')).toBe(26)
    expect(columnToIndex('AB')).toBe(27)
    expect(columnToIndex('BA')).toBe(52)
  })

  it('parseRef は A1 参照を col/row へ分解する', () => {
    expect(parseRef('A1')).toEqual({ col: 0, row: 1 })
    expect(parseRef('B12')).toEqual({ col: 1, row: 12 })
    expect(parseRef('AA100')).toEqual({ col: 26, row: 100 })
  })
})
