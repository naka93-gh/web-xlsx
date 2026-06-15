import { describe, expect, it } from 'vitest'
import { columnToIndex, indexToColumn } from '../../src/core/a1.js'

describe('columnToIndex（列文字 → 0 始まりインデックス）', () => {
  it('1 文字のとき 0 始まりの値を返す', () => {
    expect(columnToIndex('A')).toBe(0)
    expect(columnToIndex('Z')).toBe(25)
  })

  it('境界 Z↔AA のとき連続した値を返す', () => {
    expect(columnToIndex('AA')).toBe(26)
    expect(columnToIndex('AB')).toBe(27)
    expect(columnToIndex('AZ')).toBe(51)
    expect(columnToIndex('BA')).toBe(52)
  })

  it('3 文字（ZZ↔AAA・ABZ）のとき桁上がりを正しく数える', () => {
    expect(columnToIndex('ZZ')).toBe(701)
    expect(columnToIndex('AAA')).toBe(702)
    expect(columnToIndex('ABZ')).toBe(753)
  })

  it('小文字のときも大文字と同じ値を返す', () => {
    expect(columnToIndex('aa')).toBe(26)
  })
})

describe('indexToColumn（0 始まりインデックス → 列文字）', () => {
  it('境界のとき対応する列文字を返す', () => {
    expect(indexToColumn(0)).toBe('A')
    expect(indexToColumn(25)).toBe('Z')
    expect(indexToColumn(26)).toBe('AA')
    expect(indexToColumn(701)).toBe('ZZ')
    expect(indexToColumn(702)).toBe('AAA')
    expect(indexToColumn(753)).toBe('ABZ')
  })
})

describe('往復変換', () => {
  it('列文字から戻すとき境界含め元の列文字に一致する', () => {
    for (const x of ['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA', 'ABZ', 'XFD']) {
      expect(indexToColumn(columnToIndex(x))).toBe(x)
    }
  })

  it('インデックスから戻すとき連続範囲で元のインデックスに一致する', () => {
    for (let i = 0; i < 1000; i++) {
      expect(columnToIndex(indexToColumn(i))).toBe(i)
    }
  })
})
