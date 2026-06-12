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
export type { BuildArgs, BuildArgsWithSchema, BuildOptions } from './write/build.js' // build の第2引数 / 出力 options

// ───────────────────────────────────────────
// スキーマ（読み取りと共用）
// ───────────────────────────────────────────
export type { Schema, Column, ColumnType, InferRow } from './core/types.js' // 列定義と行型の推論

// ───────────────────────────────────────────
// 値
// ───────────────────────────────────────────
export type { Row, Cell } from './core/types.js' // 行 / セル値
