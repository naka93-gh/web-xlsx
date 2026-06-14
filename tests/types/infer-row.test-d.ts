// InferRow の narrow を型レベルで固定する回帰ガード（`tsc --noEmit` で検査・vitest 対象外）
//
// 背景: `{...} satisfies Schema` は `prop` を `string` へ widen させ、InferRow のキー再割り当てが
// index signature に潰れて全列の値が union 化する。defineSchema（const 型パラメータ）はこれを防ぐ。

import { defineSchema } from '../../src/core/schema.js'
import type { InferRow, Schema } from '../../src/core/types.js'

// 型の完全一致を判定するヘルパ
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const expectType = <_T extends true>(): void => {}

// ── defineSchema は列ごとに正しく narrow する ──
const schema = defineSchema({
  名前: { prop: 'name', type: 'string', required: true },
  年齢: { prop: 'age', type: 'number' },
  入社日: { prop: 'hiredAt', type: 'date' },
  在籍: { prop: 'active', type: 'boolean', required: true },
})

type Row = InferRow<typeof schema>
// required は非 null、それ以外は | null。列ごとに型が対応する（union に潰れない）
expectType<
  Equal<Row, { name: string; age: number | null; hiredAt: Date | null; active: boolean }>
>()

// ── 個別アクセスでも narrow している（union 潰れの直接検出）──
declare const row: Row
const _name: string = row.name
const _age: number | null = row.age
// @ts-expect-error name は string なので number は代入できない（union に潰れていれば通ってしまう）
const _nameWrong: number = row.name

// ── 既知の落とし穴: 素の satisfies は prop が widen して潰れる（defineSchema を使う理由の記録）──
const widened = {
  名前: { prop: 'name', type: 'string', required: true },
  年齢: { prop: 'age', type: 'number' },
} satisfies Schema
type WidenedRow = InferRow<typeof widened>
declare const wrow: WidenedRow
// prop が string に潰れて name の値が全列 union になるため string に代入できない
// （将来 TS の挙動変化でここが通るようになったら directive 未使用エラーで気づける）
// @ts-expect-error
const _widenedBroken: string = wrow.name

export { _age, _name, _nameWrong, _widenedBroken, schema }
