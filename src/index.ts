// biome-ignore-all assist/source/organizeImports: 役割ごとにグループ分けして読みやすく保つため
//
// web-xlsx 公開 API（読み取り）
// xlsx のバイト列を型付きデータにパースする。書き出しは "web-xlsx/write" を参照

// ───────────────────────────────────────────
// パース関数（エントリポイント）
// ───────────────────────────────────────────
export { parse, parseFile } from './read/parse.js' // バイト列 / File・Blob から読む

// ───────────────────────────────────────────
// オプション
// ───────────────────────────────────────────
export type { ParseArgs, ParseArgsWithSchema, ParseOptions, ZipLimits } from './core/types.js' // parse の第2引数 / 取り込み options / 解凍サイズ上限

// ───────────────────────────────────────────
// スキーマ（型付き取込）
// ───────────────────────────────────────────
export { defineSchema } from './core/schema.js' // prop リテラルを保ち InferRow を正しく narrow させる定義ヘルパ
export type { Schema, Column, ColumnType, InferRow } from './core/types.js' // 列定義と行型の推論

// ───────────────────────────────────────────
// 結果・値
// ───────────────────────────────────────────
export type { ParseResult, Row, Cell } from './core/types.js' // 返り値 / 行 / セル値
export type { RowError, FileError, FileErrorCode } from './core/types.js' // 行単位 / ファイル単位のエラー
