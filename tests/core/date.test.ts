import { describe, expect, it } from 'vitest'
import { formatIsoDate, parseIsoDate } from '../../src/core/date.js'

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

  it('閏日 2024-02-29 のとき有効な日付を返す', () => {
    const d = parseIsoDate('2024-02-29')
    expect(d?.getMonth()).toBe(1)
    expect(d?.getDate()).toBe(29)
  })

  it('平年の 2-29（2023-02-29）のとき繰り上がるため null を返す', () => {
    expect(parseIsoDate('2023-02-29')).toBeNull()
  })

  it('存在しない 2024-02-30 のとき繰り上がるため null を返す', () => {
    expect(parseIsoDate('2024-02-30')).toBeNull()
  })

  it('存在しない 2020-13-01（月 13）のとき null を返す', () => {
    expect(parseIsoDate('2020-13-01')).toBeNull()
  })

  it('前後の空白はトリムして受理する', () => {
    const d = parseIsoDate('  2020-06-15  ')
    expect(d?.getDate()).toBe(15)
  })
})

describe('parseIsoDate（日時 YYYY-MM-DDThh:mm…）', () => {
  it('TZ 指定なしのときローカル解釈する（壁時計どおり）', () => {
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

  it('範囲外の時刻 25:00 のとき null を返す', () => {
    expect(parseIsoDate('2020-06-15T25:00')).toBeNull()
  })
})

describe('parseIsoDate（utc オプション）', () => {
  it('日付のみは UTC 0:00 として構築する', () => {
    const d = parseIsoDate('2020-01-31', true)
    expect(d?.getTime()).toBe(Date.UTC(2020, 0, 31))
    expect(d?.toISOString()).toBe('2020-01-31T00:00:00.000Z')
  })

  it('日付のみの不正日（2024-02-30）のとき utc でも null を返す', () => {
    expect(parseIsoDate('2024-02-30', true)).toBeNull()
  })

  it('TZ 指定なし日時は UTC として解釈する', () => {
    const d = parseIsoDate('2020-06-15T13:45', true)
    expect(d?.getTime()).toBe(Date.UTC(2020, 5, 15, 13, 45))
  })

  it('TZ 指定ありのときそのオフセットを優先する', () => {
    const d = parseIsoDate('2020-06-15T13:45:00+09:00', true)
    expect(d?.getTime()).toBe(Date.UTC(2020, 5, 15, 4, 45))
  })
})

describe('parseIsoDate（不正形式は null）', () => {
  it('空文字のとき null を返す', () => {
    expect(parseIsoDate('')).toBeNull()
  })

  it('スラッシュ区切りのとき null を返す', () => {
    expect(parseIsoDate('2020/06/15')).toBeNull()
  })

  it('桁数不足（年 2 桁）のとき null を返す', () => {
    expect(parseIsoDate('20-06-15')).toBeNull()
  })

  it('日付のみで T 区切り空（末尾 T）のとき null を返す', () => {
    expect(parseIsoDate('2020-06-15T')).toBeNull()
  })

  it('日時で T でなく空白区切りのとき null を返す', () => {
    expect(parseIsoDate('2020-06-15 13:45')).toBeNull()
  })

  it('数値でないゴミのとき null を返す', () => {
    expect(parseIsoDate('not a date')).toBeNull()
  })
})

describe('formatIsoDate（Date → ISO 8601）', () => {
  it('0:00 のとき日付のみ、時刻ありは秒まで、ミリ秒ありは .sss 付きで出力する', () => {
    expect(formatIsoDate(new Date(2020, 3, 1))).toBe('2020-04-01')
    expect(formatIsoDate(new Date(2020, 3, 1, 9, 30, 5))).toBe('2020-04-01T09:30:05')
    expect(formatIsoDate(new Date(2020, 3, 1, 0, 0, 0, 500))).toBe('2020-04-01T00:00:00.500')
  })

  it('utc 指定のとき UTC の暦日・時刻で出力する', () => {
    expect(formatIsoDate(new Date(Date.UTC(2020, 3, 1)), true)).toBe('2020-04-01')
    expect(formatIsoDate(new Date(Date.UTC(2020, 3, 1, 9, 30, 5)), true)).toBe(
      '2020-04-01T09:30:05',
    )
  })

  it('parseIsoDate と往復が一致する', () => {
    for (const s of ['2020-04-01', '2020-04-01T09:30:05', '1900-01-02', '2099-12-31']) {
      const d = parseIsoDate(s)
      expect(d).not.toBeNull()
      if (d) expect(formatIsoDate(d)).toBe(s)
    }
  })
})
