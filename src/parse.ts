import type { ResolveContext } from './cells'
import { applySchema } from './schema'
import { readSheet, type SheetRow } from './sheet'
import { parseSharedStrings } from './strings'
import { parseStyles, type Styles } from './styles'
import type {
  FileError,
  InferRow,
  ParseOptions,
  ParseOptionsWithSchema,
  ParseResult,
  Row,
  Schema,
} from './types'
import { openWorkbook, selectSheet } from './workbook'
import { openZip, ZipError } from './zip'

const EMPTY_STYLES: Styles = { isDate: () => false }

/** 例外を FileError に変換する */
function toFileError(error: unknown): FileError {
  if (error instanceof ZipError) {
    const code = error.code === 'unsupported' ? 'unsupported-environment' : 'not-zip'
    return { code, message: error.message }
  }
  return {
    code: 'invalid-xlsx',
    message: error instanceof Error ? error.message : '不正な xlsx です',
  }
}

type SheetData = { headers: string[]; rows: SheetRow[] }

/** zip → workbook → sheet までを通し、シート行を取り出す */
async function readWorkbookSheet(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions,
): Promise<{ ok: true; sheet: SheetData } | { ok: false; error: FileError }> {
  try {
    const zip = await openZip(data)
    const workbook = await openWorkbook(zip)
    const sheetRef = selectSheet(workbook, options.sheet)
    if (!sheetRef || !zip.has(sheetRef.path)) {
      return {
        ok: false,
        error: { code: 'sheet-not-found', message: '対象シートが見つかりません' },
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

    const ctx: ResolveContext = { sharedStrings, styles, date1904: workbook.date1904 }
    const sheet = readSheet(await zip.readText(sheetRef.path), ctx, options)
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
export async function parse(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions & { schema?: Schema } = {},
): Promise<ParseResult<Row>> {
  const result = await readWorkbookSheet(data, options)
  if (!result.ok) return result

  if (options.schema) {
    const { data, errors } = applySchema(result.sheet.rows, options.schema)
    return { ok: true, data: data as Row[], errors }
  }

  return { ok: true, data: result.sheet.rows.map(toRow), errors: [] }
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
export async function parseFile(
  file: File | Blob,
  options: ParseOptions & { schema?: Schema } = {},
): Promise<ParseResult<Row>> {
  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    return { ok: false, error: { code: 'invalid-xlsx', message: 'ファイルを読み込めませんでした' } }
  }
  return parse(buffer, options)
}
