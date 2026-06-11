import type {
  Cell,
  FileError,
  InferRow,
  ParseOptions,
  ParseOptionsWithSchema,
  ParseResult,
  Row,
  Schema,
} from '../core/types.js'
import { openZip, ZipError } from './io/zip.js'
import type { ResolveContext } from './ooxml/cells.js'
import {
  RangeFormatError,
  type ReadSheetResult,
  readSheet,
  readSheetArrays,
  type SheetRow,
} from './ooxml/sheet.js'
import { parseSharedStrings } from './ooxml/strings.js'
import { parseStyles, type Styles } from './ooxml/styles.js'
import { openWorkbook, selectSheet } from './ooxml/workbook.js'
import { applySchema } from './schema.js'

const EMPTY_STYLES: Styles = { isDate: () => false }

/** 例外を FileError に変換する */
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
  return {
    code: 'invalid-xlsx',
    message: error instanceof Error ? error.message : '不正な xlsx です',
  }
}

/**
 * スキーマの必須列（required かつ defaultValue 無し）のうちヘッダーに無いものを返す
 *
 * 該当列はどの行も「必須です」になり有効行がゼロになるため、行エラーの量産でなく
 * ファイル単位の missing-column で早期に返す（列名タイポ等をすぐ気づけるように）。
 * defaultValue 持ちは全行補完で成立し、required 無しは null になるだけなので対象外
 */
function findMissingRequiredHeaders(schema: Schema, headers: string[]): string[] {
  const present = new Set(headers)
  return Object.entries(schema)
    .filter(([h, col]) => col.required && col.defaultValue === undefined && !present.has(h))
    .map(([h]) => h)
}

/** ヘッダー配列の最初の重複名を返す（無ければ undefined） */
function findDuplicateHeader(headers: string[]): string | undefined {
  const seen = new Set<string>()
  for (const h of headers) {
    if (seen.has(h)) return h
    seen.add(h)
  }
  return undefined
}

/** zip → workbook → sheet までを通し、シート行を取り出す */
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
    // 指定シートが workbook に無い（ユーザー指定ミス等）→ sheet-not-found
    if (!sheetRef) {
      return {
        ok: false,
        error: { code: 'sheet-not-found', message: '対象シートが見つかりません' },
      }
    }
    // シートは宣言されているが本体 XML がアーカイブに無い → 必要パーツ欠落
    if (!zip.has(sheetRef.path)) {
      return {
        ok: false,
        error: { code: 'invalid-xlsx', message: `シート本体が見つかりません: ${sheetRef.path}` },
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
    // ヘッダー無しモードはヘッダー解決・重複検査をせず Cell[][] を返す
    if (options.header === false) {
      return { ok: true, arrays: readSheetArrays(sheetXml, ctx, options) }
    }
    const sheet = readSheet(sheetXml, ctx, options)
    // 同名ヘッダーは Record キー衝突で前列が黙って消えるため、曖昧として明示拒否する
    const duplicate = findDuplicateHeader(sheet.headers)
    if (duplicate !== undefined) {
      return {
        ok: false,
        error: { code: 'duplicate-header', message: `ヘッダー列が重複しています: "${duplicate}"` },
      }
    }
    return { ok: true, sheet }
  } catch (error) {
    return { ok: false, error: toFileError(error) }
  }
}

/** SheetRow を低レベルの Row（値のみ）へ変換する */
function toRow(row: SheetRow): Row {
  const out: Row = {}
  for (const key of Object.keys(row.cells)) {
    out[key] = row.cells[key]?.value ?? null
  }
  return out
}

// オーバーロードは「具体的 → 一般的」の順に並べる。既定の Row オーバーロードは
// options が任意の ParseOptions を受けるため最も緩い。header:false は header が
// ParseOptions のメンバなので、Row より前に置かないと Row 側へ吸われる
// （schema は schema が ParseOptions に無く excess-property で弾かれるため順序自由）。
/**
 * `header: false` でヘッダーを解決せず、行を `Cell[][]`（配列 of 配列）で返す
 * 位置で取り込むモード。`schema` とは併用できない
 *
 * @example
 * ```ts
 * const result = await parse(bytes, { header: false })
 * if (result.ok) console.log(result.data[0][0]) // 1行目1列目
 * ```
 */
export function parse(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions & { header: false; schema?: never },
): Promise<ParseResult<Cell[]>>
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
export async function parse(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions & { schema?: Schema } = {},
): Promise<ParseResult<Row | Cell[]>> {
  const result = await readWorkbookSheet(data, options)
  if (!result.ok) return result
  if ('arrays' in result) return { ok: true, data: result.arrays, errors: [] }

  if (options.schema) {
    const missing = findMissingRequiredHeaders(options.schema, result.sheet.headers)
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: 'missing-column',
          message: `スキーマの必須列がヘッダーにありません: ${missing.map((h) => `"${h}"`).join(', ')}`,
        },
      }
    }
    const { data, errors } = applySchema(result.sheet.rows, options.schema, options.utc ?? false)
    return { ok: true, data: data as Row[], errors }
  }

  return { ok: true, data: result.sheet.rows.map(toRow), errors: [] }
}

// オーバーロード順は {@link parse} と同じ理由で「header:false → schema → 既定」にする
/**
 * ヘッダー無し（`Cell[][]`）— {@link parse} の `header: false` と同じ
 */
export function parseFile(
  file: File | Blob,
  options: ParseOptions & { header: false; schema?: never },
): Promise<ParseResult<Cell[]>>
/**
 * スキーマ付き — 検証・型付けは {@link parse} と同じ
 */
export function parseFile<S extends Schema>(
  file: File | Blob,
  options: ParseOptionsWithSchema<S>,
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
export function parseFile(file: File | Blob, options?: ParseOptions): Promise<ParseResult<Row>>
export async function parseFile(
  file: File | Blob,
  options: ParseOptions & { schema?: Schema } = {},
): Promise<ParseResult<Row | Cell[]>> {
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    // ファイル破損（invalid-xlsx）とは別事象なので読み込み失敗として区別する
    return { ok: false, error: { code: 'read-failed', message: 'ファイルを読み込めませんでした' } }
  }
  return parse(buffer, options)
}
