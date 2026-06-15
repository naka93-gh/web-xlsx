// write 専用の公開型（書き出し結果・オプション・第2引数）

import type { FileError, Schema } from '../core/types.js'

// ───────────────────────────────────────────
// 結果
// ───────────────────────────────────────────
/**
 * 書き出し結果 — read の {@link ParseResult} と対称の Result 型
 *
 * - `ok: false` … 書き出せない（スキーマの prop 重複等の設定ミス。{@link FileError}）
 * - `ok: true` … `data` は xlsx のバイト列
 *
 * write は行単位の検証を持たないため `errors` は無い。read と同じく、失敗は
 * 例外でなく戻り値で扱う（`error` の型は read と共通の {@link FileError}）
 */
export type BuildResult = { ok: false; error: FileError } | { ok: true; data: Uint8Array }

// ───────────────────────────────────────────
// オプション
// ───────────────────────────────────────────
/**
 * 書き出しオプション
 */
export type BuildOptions = {
  /** シート名（既定: "Sheet1"） */
  sheetName?: string

  /** 激安スタイル（ヘッダー太字 + 先頭行固定 + 列幅自動）を付ける（既定: true）。`false` で一括無効化。日付の表示書式は値の正しさに必須なので常に有効 */
  style?: boolean

  /** Date を UTC 固定でシリアル値にする（既定: false=ローカルの壁時計）。`parse` の同名オプションと対。読み書きで同じ値を使えば往復は一致する */
  utc?: boolean
}

// ───────────────────────────────────────────
// 第2引数（schema / options）
// ───────────────────────────────────────────
/**
 * build の第2引数
 *
 * 列順・ヘッダーを決める `schema` と、出力調整の `options`（{@link BuildOptions}）を
 * 別キーに分けて渡す。どちらも省略できる
 */
export type BuildArgs = {
  schema?: never
  options?: BuildOptions
}

/**
 * スキーマ付きの第2引数
 */
export type BuildArgsWithSchema<S extends Schema> = {
  schema: S
  options?: BuildOptions
}
