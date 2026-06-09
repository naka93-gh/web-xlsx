import { describe, expect, it } from 'vitest'
import { colName, columnToIndex } from '../../src/core/a1'

describe('columnToIndex（列文字 → 0 始まりインデックス）', () => {
  it('1 文字', () => {
    expect(columnToIndex('A')).toBe(0)
    expect(columnToIndex('Z')).toBe(25)
  })

  it('境界 Z↔AA', () => {
    expect(columnToIndex('AA')).toBe(26)
    expect(columnToIndex('AB')).toBe(27)
    expect(columnToIndex('AZ')).toBe(51)
    expect(columnToIndex('BA')).toBe(52)
  })

  it('3 文字（ZZ↔AAA・ABZ）', () => {
    expect(columnToIndex('ZZ')).toBe(701)
    expect(columnToIndex('AAA')).toBe(702)
    expect(columnToIndex('ABZ')).toBe(753)
  })

  it('小文字も受ける', () => {
    expect(columnToIndex('aa')).toBe(26)
  })
})

describe('colName（0 始まりインデックス → 列文字）', () => {
  it('境界', () => {
    expect(colName(0)).toBe('A')
    expect(colName(25)).toBe('Z')
    expect(colName(26)).toBe('AA')
    expect(colName(701)).toBe('ZZ')
    expect(colName(702)).toBe('AAA')
    expect(colName(753)).toBe('ABZ')
  })
})

describe('往復変換', () => {
  it('colName(columnToIndex(x)) === x を境界含め満たす', () => {
    for (const x of ['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA', 'ABZ', 'XFD']) {
      expect(colName(columnToIndex(x))).toBe(x)
    }
  })

  it('columnToIndex(colName(i)) === i を連続範囲で満たす', () => {
    for (let i = 0; i < 1000; i++) {
      expect(columnToIndex(colName(i))).toBe(i)
    }
  })
})
