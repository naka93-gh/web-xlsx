import type {
  InferRow,
  ParseOptions,
  ParseOptionsWithSchema,
  ParseResult,
  Row,
  Schema,
} from './types'

/**
 * xlsx のバイト列をパースして行の配列を返す
 *
 * セルはネイティブ型（`string` / `number` / `boolean` / `Date`）のまま返す
 * 失敗は例外でなく {@link ParseResult} で返す（file 単位の失敗と行単位のエラーを分離）
 *
 * 解凍に `DecompressionStream` を使うため非同期で返す
 *
 * @example
 * ```ts
 * const result = await parse(bytes)
 * if (result.ok) console.log(result.data)
 * ```
 */
export function parse(
  data: ArrayBuffer | Uint8Array,
  options?: ParseOptions,
): Promise<ParseResult<Row>>
/**
 * スキーマを渡すと各列を検証・型付けし、行を {@link InferRow} 型で返す
 * 検証に失敗した行は `data` から除外され `errors` に記録される
 *
 * @example
 * ```ts
 * const schema = {
 *   名前: { prop: 'name', type: 'string', required: true },
 * } satisfies Schema
 * const result = await parse(bytes, { schema })
 * ```
 */
export function parse<S extends Schema>(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptionsWithSchema<S>,
): Promise<ParseResult<InferRow<S>>>
export function parse(
  _data: ArrayBuffer | Uint8Array,
  _options?: ParseOptions,
): Promise<ParseResult<Row>> {
  throw new Error('web-xlsx: parse() is not implemented yet')
}

/**
 * `<input type="file">` で得た `File`（または `Blob`）から xlsx を読む
 *
 * 内部で `arrayBuffer()` に展開して {@link parse} に委譲する
 * 読み込み・パースの失敗はいずれも例外でなく {@link ParseResult} で返す
 *
 * @example
 * ```ts
 * const file = input.files?.[0]
 * if (file) {
 *   const result = await parseFile(file)
 *   if (result.ok) console.log(result.data)
 * }
 * ```
 */
export function parseFile(file: File | Blob, options?: ParseOptions): Promise<ParseResult<Row>>
/**
 * スキーマ付き — 検証・型付けは {@link parse} と同じ
 */
export function parseFile<S extends Schema>(
  file: File | Blob,
  options: ParseOptionsWithSchema<S>,
): Promise<ParseResult<InferRow<S>>>
export function parseFile(_file: File | Blob, _options?: ParseOptions): Promise<ParseResult<Row>> {
  throw new Error('web-xlsx: parseFile() is not implemented yet')
}
