import { describe, expect, it } from 'vitest'
import { parseIsoDate } from '../../src/core/date'

describe('parseIsoDate（日付のみ YYYY-MM-DD）', () => {
  it('ローカルの壁時計 0:00 として構築する（TZ で暦日がずれない）', () => {
    const d = parseIsoDate('2020-01-31')
    expect(d).not.toBeNull()
    if (!d) return
    expect(d.getFullYear()).toBe(2020)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(31)
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(0)
  })

  it('閏日 2024-02-29 は有効', () => {
    const d = parseIsoDate('2024-02-29')
    expect(d?.getMonth()).toBe(1)
    expect(d?.getDate()).toBe(29)
  })

  it('平年の 2-29（2023-02-29）は繰り上がるため null', () => {
    expect(parseIsoDate('2023-02-29')).toBeNull()
  })

  it('存在しない 2024-02-30 は繰り上がるため null', () => {
    expect(parseIsoDate('2024-02-30')).toBeNull()
  })

  it('存在しない 2020-13-01（月 13）は null', () => {
    expect(parseIsoDate('2020-13-01')).toBeNull()
  })

  it('前後の空白はトリムして受理する', () => {
    const d = parseIsoDate('  2020-06-15  ')
    expect(d?.getDate()).toBe(15)
  })
})

describe('parseIsoDate（日時 YYYY-MM-DDThh:mm…）', () => {
  it('TZ 指定なしはローカル解釈（壁時計どおり）', () => {
    const d = parseIsoDate('2020-06-15T13:45')
    expect(d).not.toBeNull()
    if (!d) return
    expect(d.getFullYear()).toBe(2020)
    expect(d.getHours()).toBe(13)
    expect(d.getMinutes()).toBe(45)
  })

  it('秒・ミリ秒付きも受理する', () => {
    const d = parseIsoDate('2020-06-15T13:45:30.500')
    expect(d?.getSeconds()).toBe(30)
    expect(d?.getMilliseconds()).toBe(500)
  })

  it('Z 付きは UTC として解釈する', () => {
    const d = parseIsoDate('2020-06-15T13:45:00Z')
    expect(d?.getTime()).toBe(Date.UTC(2020, 5, 15, 13, 45, 0))
  })

  it('オフセット付きは指定オフセットを反映する', () => {
    // +09:00 の 13:45 は UTC 04:45
    const d = parseIsoDate('2020-06-15T13:45:00+09:00')
    expect(d?.getTime()).toBe(Date.UTC(2020, 5, 15, 4, 45, 0))
  })

  it('範囲外の時刻 25:00 は null', () => {
    expect(parseIsoDate('2020-06-15T25:00')).toBeNull()
  })
})

describe('parseIsoDate（不正形式は null）', () => {
  it('空文字', () => {
    expect(parseIsoDate('')).toBeNull()
  })

  it('スラッシュ区切り', () => {
    expect(parseIsoDate('2020/06/15')).toBeNull()
  })

  it('桁数不足（年 2 桁）', () => {
    expect(parseIsoDate('20-06-15')).toBeNull()
  })

  it('日付のみで T 区切り空（末尾 T）', () => {
    expect(parseIsoDate('2020-06-15T')).toBeNull()
  })

  it('日時で T でなく空白区切り', () => {
    expect(parseIsoDate('2020-06-15 13:45')).toBeNull()
  })

  it('数値でないゴミ', () => {
    expect(parseIsoDate('not a date')).toBeNull()
  })
})
