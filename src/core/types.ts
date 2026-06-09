// web-xlsx 公開型

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

/**
 * file 単位で読み取りに失敗した理由
 */
export type FileErrorCode =
  | 'not-zip' // ZIP として読めない
  | 'invalid-xlsx' // 必要パーツ(workbook/sheet 等)が欠落
  | 'sheet-not-found' // 指定シートが無い
  | 'invalid-range' // range オプションの形式が不正
  | 'duplicate-header' // ヘッダー列名が重複し列の対応が一意に決まらない
  | 'unsupported-environment' // DecompressionStream 非対応
  | 'too-large' // 解凍サイズが上限超過（ZIP 爆弾対策）

/**
 * file 単位のエラー
 *
 * ファイルがそもそも開けない（壊れている・xlsx でない・対象シートが無い 等）場合に返る
 */
export type FileError = {
  /**
   * 失敗の種別
   */
  code: FileErrorCode
  /**
   * 人が読めるメッセージ
   */
  message: string
}

/**
 * 行単位の検証エラー
 *
 * ファイルは開けたが、特定の行・列がスキーマ検証に通らなかった場合に
 * {@link ParseResult} の `errors` に積まれる
 */
export type RowError = {
  /**
   * 1 始まりの行番号（シート上の実行番号）
   */
  row: number

  /**
   * 該当列のヘッダー名（行全体のエラーなら省略）
   */
  column?: string

  /**
   * 検証に失敗した実際の値
   */
  value?: unknown

  /**
   * 人が読めるメッセージ
   */
  message: string
}

/**
 * パース結果 — file 単位の失敗と行単位のエラーを分離して返す
 *
 * - `ok: false` … ファイルが開けない（{@link FileError}）
 * - `ok: true` … `data` は有効行、`errors` は検証に落ちた行（{@link RowError}）
 *   正常行だけ insert し、エラー行はユーザーに提示する bulk フローに直結する
 *
 * @example
 * ```ts
 * const result = await parse(bytes, { schema })
 * if (!result.ok) {
 *   console.error(result.error.message)
 * } else {
 *   await bulkInsert(result.data)
 *   for (const e of result.errors) console.warn(`${e.row}行目: ${e.message}`)
 * }
 * ```
 */
export type ParseResult<T> =
  | { ok: false; error: FileError }
  | { ok: true; data: T[]; errors: RowError[] }

/**
 * スキーマの列型（`'string'` は生の格納文字列を読む）
 */
export type ColumnType = 'string' | 'number' | 'boolean' | 'date'

/**
 * スキーマの 1 列定義
 */
export type Column = {
  /**
   * 出力プロパティ名
   */
  prop: string

  /**
   * 期待する型（`'string'` は生の格納文字列を読み大整数IDの桁落ちを回避）
   */
  type: ColumnType

  /**
   * 必須なら未入力でエラー
   */
  required?: boolean

  /**
   * 空セル時の補完値
   */
  defaultValue?: unknown

  /**
   * 追加検証（エラーメッセージ or null を返す）
   */
  validate?: (value: Cell) => string | null
}

/**
 * スキーマ — ヘッダー名 → 列定義（{@link Column}）のマップ
 *
 * `satisfies Schema` を付けると {@link InferRow} で行の型を推論できる
 *
 * @example
 * ```ts
 * const schema = {
 *   名前: { prop: 'name', type: 'string', required: true },
 *   年齢: { prop: 'age', type: 'number' },
 * } satisfies Schema
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
 * `prop` をキー、`type` を値の型にマップする（`required: true` でない列は `null` 許容）
 *
 * @example
 * ```ts
 * // { name: string; age: number | null }
 * type Employee = InferRow<typeof schema>
 * ```
 */
export type InferRow<S extends Schema> = {
  [K in keyof S as S[K]['prop']]: PropValue<S[K]>
}

/**
 * パースの共通オプション
 */
export type ParseOptions = {
  /**
   * シート名 or index（既定: 先頭シート）
   */
  sheet?: string | number

  /**
   * ヘッダー行番号（1始まり、既定: 最初の非空行）
   */
  headerRow?: number

  /**
   * データ範囲（既定: 自動）
   *
   * "A1:D100"（矩形）/ "A:D"（列のみ・全行）/ "2:100"（行のみ・全列）に対応する
   * 形式が不正なら `ok:false` の `invalid-range` を返す
   */
  range?: string

  /**
   * 空行をスキップ（既定: true）
   */
  skipEmptyRows?: boolean
}

/**
 * スキーマ付きオプション（高レベル API 用）
 */
export type ParseOptionsWithSchema<S extends Schema> = ParseOptions & { schema: S }
