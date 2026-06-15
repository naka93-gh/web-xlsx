// read 専用の公開型（取込結果・行エラー・オプション・第2引数）

import type { FileError, Schema } from '../core/types.js'

// ───────────────────────────────────────────
// 行単位エラー
// ───────────────────────────────────────────
/**
 * 行単位エラーの種別（`message` の文言に依らずプログラムで分岐・多言語化するためのコード）
 *
 * - `required` … 必須列（{@link RowError.column}）が空
 * - `non-number` / `non-boolean` / `non-date` … 列の `type` への変換に失敗（期待型ごと）
 * - `validate` … ユーザーの `validate` がメッセージを返した（または throw した）
 */
export type RowErrorCode = 'required' | 'non-number' | 'non-boolean' | 'non-date' | 'validate'

/**
 * 行単位の検証エラー
 *
 * ファイルは開けたが、特定の行・列がスキーマ検証に通らなかった場合に
 * {@link ParseResult} の `errors` に積まれる
 */
export type RowError = {
  /** 失敗の種別（{@link RowErrorCode}）。`message` に依らない分岐・多言語化に使う */
  code: RowErrorCode

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

// ───────────────────────────────────────────
// 結果
// ───────────────────────────────────────────
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

// ───────────────────────────────────────────
// オプション
// ───────────────────────────────────────────
/**
 * ZIP 解凍サイズの上限設定（ZIP 爆弾対策）
 *
 * 省略した項目は既定値（単体 300MB / 全体 600MB）が使われる
 */
export type ZipLimits = {
  /**
   * 単体エントリの解凍サイズ上限（バイト）
   */
  maxEntryBytes?: number

  /**
   * アーカイブ全体の累積解凍サイズ上限（バイト）
   */
  maxTotalBytes?: number
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

  /**
   * `false` でヘッダーを解決せず `Cell[][]`（配列 of 配列）を返す
   *
   * 各行は列A(index 0)からシートの最大使用列まで（欠落セルは `null`）で矩形化される。
   * `schema` とは併用不可（型で排他）。`headerRow` は無視される
   */
  header?: false

  /**
   * 日付を UTC 固定で解釈する（既定: false=ローカルの壁時計）
   *
   * `false` だと返る `Date` はローカル 0:00 で組まれ、`getFullYear()` 等で暦日を読む。
   * `true` だと UTC 0:00 で組まれ `getUTCFullYear()` / `toISOString()` が暦日になる。
   * 書き出し（`build`）と読み取りで同じ値を使えば往復は一致する
   */
  utc?: boolean

  /**
   * ZIP 解凍サイズの上限（既定: 単体 300MB / 全体 600MB）
   *
   * 巨大ファイルを正規に扱う場合に緩める、より厳しく絞る、いずれにも使える
   */
  limits?: ZipLimits
}

// ───────────────────────────────────────────
// 第2引数（schema / options）
// ───────────────────────────────────────────
/**
 * parse / parseFile の第2引数
 *
 * 型付け・検証の `schema` と、取り込み調整の `options`（{@link ParseOptions}）を
 * 別キーに分けて渡す。どちらも省略できる
 */
export type ParseArgs = {
  schema?: never
  options?: ParseOptions
}

/**
 * スキーマ付きの第2引数
 *
 * header:false（Cell[][]）と schema 検証は両立しないため、options から header を除く
 */
export type ParseArgsWithSchema<S extends Schema> = {
  schema: S
  options?: Omit<ParseOptions, 'header'>
}
