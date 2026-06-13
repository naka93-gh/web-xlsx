/**
 * Excel のシリアル値を `Date` に変換する
 *
 * 1900 日付システムでは閏バグ（存在しない 1900-02-29）を吸収するため起点を
 * 1899-12-30 とする。この都合で 1900-01・02 月のシリアルは 1 日ずれるが、
 * 実データに出る 1900-03 以降は正しい
 *
 * シリアル値に TZ の概念は無いため、`Date` への写し方を `utc` オプションで選べる:
 * - 既定（false）: ローカルの壁時計としてその暦日を組む。`getFullYear()` 等で読む前提
 * - true: UTC 固定。`getUTCFullYear()` や `toISOString()` でその暦日になる
 *
 * いずれも read／write で同じ設定を使えば往復は一致する（混在させると 1 日ずれる）
 */

const MS_PER_DAY = 86_400_000

/**
 * 1900 系の起点（閏バグ補正済み）
 */
const EPOCH_1900_UTC = Date.UTC(1899, 11, 30)

/**
 * 1904 系の起点（シリアル 0 = 1904-01-01）
 */
const EPOCH_1904_UTC = Date.UTC(1904, 0, 1)

/**
 * シリアル値（日数。小数部は時刻）を `Date` に変換する
 *
 * @param serial Excel のシリアル値
 * @param options `date1904` で 1904 日付システム、`utc` で UTC 固定解釈にする
 */
export function serialToDate(
  serial: number,
  options?: { date1904?: boolean; utc?: boolean },
): Date {
  const base = options?.date1904 ? EPOCH_1904_UTC : EPOCH_1900_UTC
  const whole = Math.floor(serial)
  const frac = serial - whole
  const msOfDay = Math.round(frac * MS_PER_DAY)
  const instant = base + whole * MS_PER_DAY

  // UTC 固定: 起点が UTC 0:00 なので getUTC* / toISOString がその暦日になる
  if (options?.utc) return new Date(instant + msOfDay)

  // ローカル: 暦日を UTC で確定し、ローカルの壁時計 0:00 として組み直す
  const utcDay = new Date(instant)
  const localMidnight = new Date(utcDay.getUTCFullYear(), utcDay.getUTCMonth(), utcDay.getUTCDate())
  return new Date(localMidnight.getTime() + msOfDay)
}

/**
 * `Date` を Excel のシリアル値に変換する（{@link serialToDate} の逆）
 *
 * `utc` に応じてローカル壁時計 / UTC のどちらの暦日・時刻を読むかを切り替える。
 * 暦日は起点との日数差を取るため、どちらでも TZ に依らずその日のシリアルになる
 *
 * @param date 変換対象の `Date`
 * @param options `date1904` で 1904 日付システム、`utc` で UTC 固定解釈にする
 */
export function dateToSerial(date: Date, options?: { date1904?: boolean; utc?: boolean }): number {
  const base = options?.date1904 ? EPOCH_1904_UTC : EPOCH_1900_UTC

  // utc に応じてローカル壁時計 / UTC のどちらの暦日・時刻を読むか選ぶ
  const c = options?.utc
    ? {
        y: date.getUTCFullYear(),
        mo: date.getUTCMonth(),
        d: date.getUTCDate(),
        ms:
          date.getUTCHours() * 3_600_000 +
          date.getUTCMinutes() * 60_000 +
          date.getUTCSeconds() * 1_000 +
          date.getUTCMilliseconds(),
      }
    : {
        y: date.getFullYear(),
        mo: date.getMonth(),
        d: date.getDate(),
        ms:
          date.getHours() * 3_600_000 +
          date.getMinutes() * 60_000 +
          date.getSeconds() * 1_000 +
          date.getMilliseconds(),
      }

  // 暦日を UTC に写して起点との日数差を取る
  const whole = Math.round((Date.UTC(c.y, c.mo, c.d) - base) / MS_PER_DAY)
  return whole + c.ms / MS_PER_DAY
}
