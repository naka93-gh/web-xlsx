/**
 * Excel のシリアル値を `Date` に変換する
 *
 * 1900 日付システムでは閏バグ（存在しない 1900-02-29）を吸収するため起点を
 * 1899-12-30 とする。この都合で 1900-01・02 月のシリアルは 1 日ずれるが、
 * 実データに出る 1900-03 以降は正しい
 *
 * カレンダー日付は UTC で計算し、ローカル（JST 前提）の壁時計として `Date` を組み立てる
 * ため、整数シリアルは TZ に依らずその暦日になる
 */

const MS_PER_DAY = 86_400_000

/** 1900 系の起点（閏バグ補正済み） */
const EPOCH_1900_UTC = Date.UTC(1899, 11, 30)

/** 1904 系の起点（シリアル 0 = 1904-01-01） */
const EPOCH_1904_UTC = Date.UTC(1904, 0, 1)

/**
 * シリアル値（日数。小数部は時刻）を `Date` に変換する
 *
 * @param serial Excel のシリアル値
 * @param options `date1904` を true にすると 1904 日付システムで解釈する
 */
export function serialToDate(serial: number, options?: { date1904?: boolean }): Date {
  const base = options?.date1904 ? EPOCH_1904_UTC : EPOCH_1900_UTC
  const whole = Math.floor(serial)
  const frac = serial - whole

  // 暦日は UTC で確定（TZ の影響を受けない）
  const utcDay = new Date(base + whole * MS_PER_DAY)
  const localMidnight = new Date(utcDay.getUTCFullYear(), utcDay.getUTCMonth(), utcDay.getUTCDate())

  const msOfDay = Math.round(frac * MS_PER_DAY)
  return new Date(localMidnight.getTime() + msOfDay)
}
