import { describe, expect, it } from 'vitest'
import { serialToDate } from '../src/ooxml/serial'

describe('serialToDate（1900 日付システム）', () => {
  it('Unix エポック: 25569 → 1970-01-01', () => {
    const d = serialToDate(25569)
    expect(d.getFullYear()).toBe(1970)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('2020-01-01: 43831', () => {
    const d = serialToDate(43831)
    expect(d.getFullYear()).toBe(2020)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('2020-04-01: 43922（閏バグ以降は正しい）', () => {
    const d = serialToDate(43922)
    expect(d.getFullYear()).toBe(2020)
    expect(d.getMonth()).toBe(3)
    expect(d.getDate()).toBe(1)
  })

  it('小数部は時刻になる: 43831.5 → 2020-01-01 12:00', () => {
    const d = serialToDate(43831.5)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(12)
    expect(d.getMinutes()).toBe(0)
  })
})

describe('serialToDate（1904 日付システム）', () => {
  it('シリアル 0 → 1904-01-01', () => {
    const d = serialToDate(0, { date1904: true })
    expect(d.getFullYear()).toBe(1904)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('1900系より 1462 小さいシリアルで同じ日付: 42369 → 2020-01-01', () => {
    const d = serialToDate(43831 - 1462, { date1904: true })
    expect(d.getFullYear()).toBe(2020)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })
})
