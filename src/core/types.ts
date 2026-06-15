// web-xlsx の読み書き共有の公開型（値・行・スキーマ・file 単位エラー）
//
// read 専用型は read/types.ts、write 専用型は write/types.ts に置く

// ───────────────────────────────────────────
// 値・行
// ───────────────────────────────────────────
/**
 * セルのネイティブ値
 *
 * 文字列・数値・真偽はそのまま、日付セル（シリアル値）は `Date`、
 * 空セル・エラーセルは `null` で表す
 */
export type Cell = string | number | boolean | Date | null

/**
 * 低レベル（スキーマ無し）の 1 行
 *
 * キーはヘッダー名、値は {@link Cell}
 */
export type Row = Record<string, Cell>

// ───────────────────────────────────────────
// エラー（file 単位 / 行単位）
// ───────────────────────────────────────────
/**
 * file 単位で読み取りに失敗した理由
 */
export type FileErrorCode =
  | 'not-zip' // ZIP として読めない
  | 'invalid-xlsx' // 必要パーツ(workbook/sheet 等)が欠落
  | 'sheet-not-found' // 指定シートが無い
  | 'invalid-range' // range オプションの形式が不正
  | 'invalid-option' // オプション/スキーマの指定値が不正（headerRow の非整数・スキーマ prop 重複 等）
  | 'duplicate-header' // ヘッダー列名が重複し列の対応が一意に決まらない
  | 'missing-column' // スキーマの必須列（required・defaultValue 無し）がヘッダーに無い
  | 'unsupported-environment' // DecompressionStream 非対応
  | 'too-large' // 解凍サイズが上限超過（ZIP 爆弾対策）
  | 'read-failed' // File/Blob の読み込みに失敗（parseFile のみ）

/**
 * file 単位のエラー
 *
 * ファイルがそもそも開けない（壊れている・xlsx でない・対象シートが無い 等）場合に返る
 */
export type FileError = {
  /** 失敗の種別 */
  code: FileErrorCode
  /** 人が読めるメッセージ */
  message: string
}

// ───────────────────────────────────────────
// スキーマ（列定義と行型の推論）
// ───────────────────────────────────────────
/**
 * スキーマの列型（`'string'` は生の格納文字列を読む）
 */
export type ColumnType = 'string' | 'number' | 'boolean' | 'date'

/**
 * 列定義の本体（`type` ごとに `defaultValue` の型が決まる）
 */
type ColumnOf<T extends ColumnType, V> = {
  /** 出力プロパティ名 */
  prop: string

  /** 期待する型（`'string'` は生の格納文字列を読み大整数IDの桁落ちを回避） */
  type: T

  /** 必須なら未入力でエラー */
  required?: boolean

  /** 空セル時の補完値（列の `type` に対応する型のみ）。型変換・`validate` を通さずそのまま出力行に入るため、{@link InferRow} が主張する型と実体を一致させる目的で型を限定する */
  defaultValue?: V

  /** 追加検証（エラーメッセージ or null を返す） */
  validate?: (value: Cell) => string | null
}

/**
 * スキーマの 1 列定義
 *
 * `defaultValue` は `type` に対応する TS 型に限定される
 * （例: `type: 'date'` なら `Date`。文字列を渡すとコンパイルエラー）
 */
export type Column =
  | ColumnOf<'string', string>
  | ColumnOf<'number', number>
  | ColumnOf<'boolean', boolean>
  | ColumnOf<'date', Date>

/**
 * スキーマ — ヘッダー名 → 列定義（{@link Column}）のマップ
 *
 * `defineSchema(...)` で包むと `prop` のリテラルが保たれ {@link InferRow} で行の型を正しく推論できる
 *
 * @example
 * ```ts
 * const schema = defineSchema({
 *   名前: { prop: 'name', type: 'string', required: true },
 *   年齢: { prop: 'age', type: 'number' },
 * })
 * ```
 */
export type Schema = Record<string, Column>

/**
 * ColumnType → TS 型
 */
type CellTypeOf<C extends Column> = C['type'] extends 'string'
  ? string
  : C['type'] extends 'number'
    ? number
    : C['type'] extends 'boolean'
      ? boolean
      : C['type'] extends 'date'
        ? Date
        : never

/**
 * required でなければ null 許容
 */
type PropValue<C extends Column> = C extends { required: true }
  ? CellTypeOf<C>
  : CellTypeOf<C> | null

/**
 * スキーマから行の型を推論する
 *
 * @example
 * ```ts
 * // { name: string; age: number | null }
 * type Employee = InferRow<typeof schema>
 * ```
 */
export type InferRow<S extends Schema> = {
  -readonly [K in keyof S as S[K]['prop']]: PropValue<S[K]>
}
