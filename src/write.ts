// biome-ignore-all assist/source/organizeImports: 役割ごとにグループ分けして読みやすく保つため
//
// web-xlsx 公開 API（書き出し / "web-xlsx/write"）
// 行データを xlsx のバイト列に書き出す。読み取りは "web-xlsx" を参照

// ───────────────────────────────────────────
// 書き出し関数（エントリポイント）
// ───────────────────────────────────────────
export { build } from './write/build.js' // 行配列 → xlsx バイト列

// ───────────────────────────────────────────
// オプション
// ───────────────────────────────────────────
export type { BuildArgs, BuildArgsWithSchema, BuildOptions } from './write/types.js' // build の第2引数 / 出力 options

// ───────────────────────────────────────────
// スキーマ（読み取りと共用）
// ───────────────────────────────────────────
export { defineSchema } from './core/schema.js' // prop リテラルを保ち InferRow を正しく narrow させる定義ヘルパ
export type { Schema, Column, ColumnType, InferRow } from './core/types.js' // 列定義と行型の推論

// ───────────────────────────────────────────
// 結果・値
// ───────────────────────────────────────────
export type { BuildResult } from './write/types.js' // 返り値（xlsx バイト列）
export type { Row, Cell } from './core/types.js' // 行 / セル値
export type { FileError, FileErrorCode } from './core/types.js' // 書き出し失敗（read と共通）
