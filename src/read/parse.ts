import { findDuplicateProp, firstDuplicate } from '../core/schema.js'
import type { Cell, FileError, InferRow, Row, Schema } from '../core/types.js'
import { openZip, ZipError } from './io/zip.js'
import type { ResolveContext } from './ooxml/cells.js'
import { RangeFormatError } from './ooxml/range.js'
import {
  OptionError,
  type ReadSheetResult,
  readSheet,
  readSheetArrays,
  type SheetRow,
} from './ooxml/sheet.js'
import { parseSharedStrings } from './ooxml/strings.js'
import { parseStyles, type Styles } from './ooxml/styles.js'
import { openWorkbook, selectSheet } from './ooxml/workbook.js'
import { applySchema } from './schema.js'
import type { ParseArgs, ParseArgsWithSchema, ParseOptions, ParseResult } from './types.js'

const EMPTY_STYLES: Styles = { isDate: () => false }

function toFileError(error: unknown): FileError {
  if (error instanceof ZipError) {
    const code =
      error.code === 'unsupported'
        ? 'unsupported-environment'
        : error.code === 'too-large'
          ? 'too-large'
          : error.code === 'not-zip'
            ? 'not-zip'
            : 'invalid-xlsx' // ZIP は開けたが中身が壊れている/未対応
    return { code, message: error.message }
  }

  // range オプションの形式不正はファイル破損と区別する
  if (error instanceof RangeFormatError) {
    return { code: 'invalid-range', message: error.message }
  }

  // headerRow 等オプションの指定値不正もファイル破損と区別する
  if (error instanceof OptionError) {
    return { code: 'invalid-option', message: error.message }
  }
  return {
    code: 'invalid-xlsx',
    message: error instanceof Error ? error.message : 'Invalid xlsx file',
  }
}

/**
 * 必須列がヘッダーに無いとどの行も required エラーになり有効行がゼロになる
 * 行エラーを量産せずファイル単位の missing-column で早期に返し、列名タイポ等にすぐ気づけるようにする
 * defaultValue 持ちは全行補完で成立し、required 無しは null になるだけなので対象外
 */
function findMissingRequiredHeaders(schema: Schema, headers: string[]): string[] {
  const present = new Set(headers)
  return Object.entries(schema)
    .filter(([h, col]) => col.required && col.defaultValue === undefined && !present.has(h))
    .map(([h]) => h)
}

async function readWorkbookSheet(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions,
): Promise<
  | { ok: true; sheet: ReadSheetResult }
  | { ok: true; arrays: Cell[][] }
  | { ok: false; error: FileError }
> {
  try {
    const zip = await openZip(data, options.limits)
    const workbook = await openWorkbook(zip)
    const sheetRef = selectSheet(workbook, options.sheet)
    if (!sheetRef) {
      return {
        ok: false,
        error: { code: 'sheet-not-found', message: 'Target sheet not found' },
      }
    }

    // 宣言はあるのに本体 XML が無いのは指定ミスでなくファイル側の欠落
    if (!zip.has(sheetRef.path)) {
      return {
        ok: false,
        error: { code: 'invalid-xlsx', message: `Sheet body not found: ${sheetRef.path}` },
      }
    }

    const sharedStrings =
      workbook.sharedStringsPath && zip.has(workbook.sharedStringsPath)
        ? parseSharedStrings(await zip.readText(workbook.sharedStringsPath))
        : []
    const styles =
      workbook.stylesPath && zip.has(workbook.stylesPath)
        ? parseStyles(await zip.readText(workbook.stylesPath))
        : EMPTY_STYLES

    const ctx: ResolveContext = {
      sharedStrings,
      styles,
      date1904: workbook.date1904,
      utc: options.utc ?? false,
    }

    const sheetXml = await zip.readText(sheetRef.path)
    if (options.header === false) {
      return { ok: true, arrays: readSheetArrays(sheetXml, ctx, options) }
    }
    const sheet = readSheet(sheetXml, ctx, options)
    // 同名ヘッダーは Record キー衝突で前列が黙って消えるため、曖昧として明示拒否する
    const duplicate = firstDuplicate(sheet.headers)
    if (duplicate !== undefined) {
      return {
        ok: false,
        error: { code: 'duplicate-header', message: `Duplicate header column: "${duplicate}"` },
      }
    }
    return { ok: true, sheet }
  } catch (error) {
    return { ok: false, error: toFileError(error) }
  }
}

function toRow(row: SheetRow): Row {
  // __proto__ 等の列名が prototype セッターに吸われて消えるのを防ぐ
  const out: Row = Object.create(null)
  for (const key of Object.keys(row.cells)) {
    out[key] = row.cells[key]?.value ?? null
  }
  return out
}

// オーバーロードは「具体的 → 一般的」の順に並べる
// 既定の Row オーバーロードは options が任意の ParseOptions を受けるため最も緩い
// header:false は header が ParseOptions のメンバなので、Row より前に置かないと Row 側へ吸われる
// schema は ParseArgsWithSchema が options から header を除くため排他になる
/**
 * `options.header: false` でヘッダーを解決せず、行を `Cell[][]`（配列 of 配列）で返す
 * 位置で取り込むモードで、`schema` とは併用できない
 *
 * @example
 * ```ts
 * const result = await parse(bytes, { options: { header: false } })
 * if (result.ok) console.log(result.data[0][0]) // 1行目1列目
 * ```
 */
export function parse(
  data: ArrayBuffer | Uint8Array,
  args: { schema?: never; options: ParseOptions & { header: false } },
): Promise<ParseResult<Cell[]>>
/**
 * スキーマを渡すと各列を検証・型付けし、行を {@link InferRow} 型で返す
 * 検証に失敗した行は `data` から除外され `errors` に記録される
 *
 * @example
 * ```ts
 * const schema = defineSchema({
 *   名前: { prop: 'name', type: 'string', required: true },
 * })
 * const result = await parse(bytes, { schema })
 * ```
 */
export function parse<const S extends Schema>(
  data: ArrayBuffer | Uint8Array,
  args: ParseArgsWithSchema<S>,
): Promise<ParseResult<InferRow<S>>>
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
export function parse(data: ArrayBuffer | Uint8Array, args?: ParseArgs): Promise<ParseResult<Row>>
export async function parse(
  data: ArrayBuffer | Uint8Array,
  args: { schema?: Schema; options?: ParseOptions } = {},
): Promise<ParseResult<Row | Cell[]>> {
  const { schema, options = {} } = args

  const result = await readWorkbookSheet(data, options)
  if (!result.ok) return result
  if ('arrays' in result) return { ok: true, data: result.arrays, errors: [] }

  if (schema) {
    const dupProp = findDuplicateProp(schema)
    if (dupProp !== undefined) {
      return {
        ok: false,
        error: {
          code: 'invalid-option',
          message: `Duplicate schema prop: "${dupProp}"`,
        },
      }
    }
    const missing = findMissingRequiredHeaders(schema, result.sheet.headers)
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: 'missing-column',
          message: `Required schema column(s) missing from header: ${missing.map((h) => `"${h}"`).join(', ')}`,
        },
      }
    }
    const { data, errors } = applySchema(result.sheet.rows, schema, options.utc ?? false)
    return { ok: true, data: data as Row[], errors }
  }

  return { ok: true, data: result.sheet.rows.map(toRow), errors: [] }
}

// オーバーロード順は {@link parse} と同じ理由で「header:false → schema → 既定」にする
/**
 * ヘッダー無し（`Cell[][]`）— {@link parse} の `options.header: false` と同じ
 */
export function parseFile(
  file: File | Blob,
  args: { schema?: never; options: ParseOptions & { header: false } },
): Promise<ParseResult<Cell[]>>
/**
 * スキーマ付き — 検証・型付けは {@link parse} と同じ
 */
export function parseFile<const S extends Schema>(
  file: File | Blob,
  args: ParseArgsWithSchema<S>,
): Promise<ParseResult<InferRow<S>>>
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
export function parseFile(file: File | Blob, args?: ParseArgs): Promise<ParseResult<Row>>
export async function parseFile(
  file: File | Blob,
  args: { schema?: Schema; options?: ParseOptions } = {},
): Promise<ParseResult<Row | Cell[]>> {
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    // ファイル破損（invalid-xlsx）とは別事象なので読み込み失敗として区別する
    return { ok: false, error: { code: 'read-failed', message: 'Failed to read the file' } }
  }

  // impl シグネチャ同士は直接呼べないので、schema の有無で型付きオーバーロードへ振り分ける
  // exactOptionalPropertyTypes 下では options: undefined を明示できないためキーごと省く
  const { schema, options } = args
  if (schema) return parse(buffer, options ? { schema, options } : { schema })
  return options ? parse(buffer, { options }) : parse(buffer)
}
