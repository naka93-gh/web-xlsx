/**
 * `new Date(string)` に丸投げしない
 * 形式の許容範囲が実装依存で、日付のみの ISO は UTC 0:00 解釈になり TZ で暦日がずれる
 * 形式を ISO に限定し、{@link serialToDate} と揃えて日付のみを 0:00 として組み立てる
 */
export function parseIsoDate(text: string, utc = false): Date | null {
  const s = text.trim()

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (dateOnly) {
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    const d = utc ? new Date(Date.UTC(year, month - 1, day)) : new Date(year, month - 1, day)
    // 2024-02-30 等は Date が翌月へ繰り上げるので、構築後に各要素を照合して弾く
    const y = utc ? d.getUTCFullYear() : d.getFullYear()
    const mo = utc ? d.getUTCMonth() : d.getMonth()
    const dy = utc ? d.getUTCDate() : d.getDate()
    if (y === year && mo === month - 1 && dy === day) return d
    return null
  }

  // TZ 指定の無い日時は ECMAScript の仕様上ローカル解釈で一意に決まる
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) {
    const hasTz = /(Z|[+-]\d{2}:\d{2})$/.test(s)
    const d = new Date(utc && !hasTz ? `${s}Z` : s)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return null
}

export function formatIsoDate(date: Date, utc = false): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')

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
  const day = `${pad(c.y, 4)}-${pad(c.mo)}-${pad(c.d)}`
  if (c.h === 0 && c.mi === 0 && c.s === 0 && c.ms === 0) return day
  const time = `${pad(c.h)}:${pad(c.mi)}:${pad(c.s)}`
  return c.ms === 0 ? `${day}T${time}` : `${day}T${time}.${pad(c.ms, 3)}`
}
