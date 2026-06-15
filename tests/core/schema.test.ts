import { describe, expect, it } from 'vitest'
import { defineSchema, findDuplicateProp, firstDuplicate } from '../../src/core/schema.js'
import type { Schema } from '../../src/core/types.js'

describe('defineSchema', () => {
  it('defineSchema は入力の参照をそのまま返す（実行時は参照を変えない）', () => {
    const input = { 名前: { prop: 'name', type: 'string' } } as const
    expect(defineSchema(input)).toBe(input)
  })
})

describe('firstDuplicate', () => {
  it('重複が無いとき undefined を返す', () => {
    expect(firstDuplicate(['a', 'b', 'c'])).toBeUndefined()
  })

  it('空の並びのとき undefined を返す', () => {
    expect(firstDuplicate([])).toBeUndefined()
  })

  it('重複があるとき最初に重複した値を返す（後発の重複は無視）', () => {
    expect(firstDuplicate(['a', 'b', 'a', 'c', 'b'])).toBe('a')
  })

  it('Iterable（Set 由来でない任意の反復子）のときも重複を返す', () => {
    function* gen(): Iterable<string> {
      yield 'x'
      yield 'y'
      yield 'x'
    }
    expect(firstDuplicate(gen())).toBe('x')
  })
})

describe('findDuplicateProp', () => {
  it('prop が重複する列があるとき その prop を返す', () => {
    const schema: Schema = {
      名前: { prop: 'name', type: 'string' },
      氏名: { prop: 'name', type: 'string' },
    }
    expect(findDuplicateProp(schema)).toBe('name')
  })

  it('列キーが違っても prop が全て一意のとき undefined を返す', () => {
    const schema: Schema = {
      名前: { prop: 'name', type: 'string' },
      年齢: { prop: 'age', type: 'number' },
    }
    expect(findDuplicateProp(schema)).toBeUndefined()
  })

  it('空スキーマのとき undefined を返す', () => {
    expect(findDuplicateProp({})).toBeUndefined()
  })
})
