import { describe, expect, it } from 'vitest'
import { dateToSerial, serialToDate } from '../../src/core/serial'

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

describe('dateToSerial（serialToDate の逆）', () => {
  it('2020-01-01 → 43831', () => {
    expect(dateToSerial(new Date(2020, 0, 1))).toBe(43831)
  })

  it('1970-01-01 → 25569', () => {
    expect(dateToSerial(new Date(1970, 0, 1))).toBe(25569)
  })

  it('時刻は小数部に: 2020-01-01 12:00 → 43831.5', () => {
    expect(dateToSerial(new Date(2020, 0, 1, 12, 0))).toBeCloseTo(43831.5, 9)
  })

  it('1904 系: 2020-01-01 → 43831 - 1462', () => {
    expect(dateToSerial(new Date(2020, 0, 1), { date1904: true })).toBe(43831 - 1462)
  })

  it('serialToDate と往復一致する（整数日）', () => {
    for (const serial of [25569, 43831, 43922, 50000]) {
      expect(dateToSerial(serialToDate(serial))).toBe(serial)
    }
  })

  it('serialToDate と往復一致する（時刻つき・ミリ秒丸め内）', () => {
    const d = new Date(2024, 5, 15, 9, 30, 45)
    const back = serialToDate(dateToSerial(d))
    expect(back.getTime()).toBe(d.getTime())
  })
})

describe('utc オプション（TZ 非依存で暦日が一致）', () => {
  it('serialToDate(utc): 43831 → UTC 2020-01-01 0:00', () => {
    const d = serialToDate(43831, { utc: true })
    expect(d.getTime()).toBe(Date.UTC(2020, 0, 1))
    expect(d.toISOString()).toBe('2020-01-01T00:00:00.000Z')
  })

  it('serialToDate(utc): 小数部は UTC 時刻に', () => {
    const d = serialToDate(43831.5, { utc: true })
    expect(d.getUTCHours()).toBe(12)
    expect(d.getUTCDate()).toBe(1)
  })

  it('dateToSerial(utc): UTC 2020-01-01 → 43831', () => {
    expect(dateToSerial(new Date(Date.UTC(2020, 0, 1)), { utc: true })).toBe(43831)
  })

  it('dateToSerial(utc): UTC 時刻が小数部に', () => {
    expect(dateToSerial(new Date(Date.UTC(2020, 0, 1, 12)), { utc: true })).toBeCloseTo(43831.5, 9)
  })

  it('utc 同士で往復一致する（時刻つき）', () => {
    const d = new Date(Date.UTC(2024, 5, 15, 9, 30, 45))
    const back = serialToDate(dateToSerial(d, { utc: true }), { utc: true })
    expect(back.getTime()).toBe(d.getTime())
  })

  it('utc は date1904 と併用できる: シリアル 0 → UTC 1904-01-01', () => {
    const d = serialToDate(0, { date1904: true, utc: true })
    expect(d.getTime()).toBe(Date.UTC(1904, 0, 1))
  })
})
