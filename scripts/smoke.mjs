// dist スモークテスト — バンドラを介さない Node ネイティブ ESM で公開物が動くか
//
// vitest は src を Vite 経由で解決するため、「dist の相対 import が Node で
// 解決できるか」（拡張子の有無）はここでしか検知できない。`pnpm build` 後に実行する。

import { parse } from '../dist/index.js'
import { build } from '../dist/write.js'

const rows = [{ 名前: 'Alice', 年齢: 30, 入社日: new Date(2020, 0, 15) }]
const bytes = await build(rows)
const result = await parse(bytes)

if (!result.ok) throw new Error(`parse 失敗: ${result.error.code} ${result.error.message}`)
const r0 = result.data[0]
if (r0?.名前 !== 'Alice' || r0?.年齢 !== 30 || !(r0?.入社日 instanceof Date)) {
  throw new Error(`往復結果が不一致: ${JSON.stringify(result.data)}`)
}
console.log('✓ dist smoke OK（Node ネイティブ ESM で build → parse 往復一致）')
