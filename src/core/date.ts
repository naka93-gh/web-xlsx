// ISO 8601 文字列の厳密パース・整形（read 系で共有）

/**
 * 文字列を ISO 8601 として厳密にパースする（不正・非対応形式は null）
 *
 * `new Date(string)` 丸投げは形式の許容範囲が実装依存で、日付のみ ISO は UTC 0:00
 * 解釈になり TZ で暦日がずれる。そこで形式を ISO に限定し、{@link serialToDate} と
 * 揃えて日付のみを 0:00 として組み立てる（`utc` で UTC / ローカルを切り替える）
 *
 * @param text パース対象の文字列
 * @param utc true で日付のみ・TZ 無し日時を UTC として解釈する（既定はローカル）
 */
export function parseIsoDate(text: string, utc = false): Date | null {
  const s = text.trim()

  // 日付のみ（YYYY-MM-DD）: 0:00 として構築
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const d = utc ? new Date(Date.UTC(year, month - 1, day)) : new Date(year, month - 1, day)
    // 2024-02-30 等の繰り上がりを弾く（構築後に各要素が一致するか確認）
    const y = utc ? d.getUTCFullYear() : d.getFullYear()
    const mo = utc ? d.getUTCMonth() : d.getMonth()
    const dy = utc ? d.getUTCDate() : d.getDate()
    if (y === year && mo === month - 1 && dy === day) return d
    return null
  }

  // 日時（YYYY-MM-DDTHH:mm[:ss[.sss]][Z|±hh:mm]）: TZ 指定が無ければ仕様上ローカル解釈で一意
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) {
    // utc 指定かつ TZ 指定が無ければ UTC として読む（末尾 Z を補う）
    const hasTz = /(Z|[+-]\d{2}:\d{2})$/.test(s)
    const d = new Date(utc && !hasTz ? `${s}Z` : s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

/**
 * `Date` を ISO 8601 文字列にする（{@link parseIsoDate} の逆）
 *
 * 時刻が 0:00:00.000 なら日付のみ（`YYYY-MM-DD`）、それ以外は秒まで
 * （ミリ秒があれば `.sss` も）出す。`utc` でどちらの暦日・時刻を読むかを選ぶ
 */
export function formatIsoDate(date: Date, utc = false): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')

  // utc に応じてローカル壁時計 / UTC のどちらの暦日・時刻を読むか選ぶ
  const c = utc
    ? {
        y: date.getUTCFullYear(),
        mo: date.getUTCMonth() + 1,
        d: date.getUTCDate(),
        h: date.getUTCHours(),
        mi: date.getUTCMinutes(),
        s: date.getUTCSeconds(),
        ms: date.getUTCMilliseconds(),
      }
    : {
        y: date.getFullYear(),
        mo: date.getMonth() + 1,
        d: date.getDate(),
        h: date.getHours(),
        mi: date.getMinutes(),
        s: date.getSeconds(),
        ms: date.getMilliseconds(),
      }
  // 時刻が 0:00:00.000 なら日付のみ、あれば秒（ミリ秒があれば .sss）まで出す
  const day = `${pad(c.y, 4)}-${pad(c.mo)}-${pad(c.d)}`
  if (c.h === 0 && c.mi === 0 && c.s === 0 && c.ms === 0) return day
  const time = `${pad(c.h)}:${pad(c.mi)}:${pad(c.s)}`
  return c.ms === 0 ? `${day}T${time}` : `${day}T${time}.${pad(c.ms, 3)}`
}
