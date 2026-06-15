# Reading

> 📖 This document is an AI-generated translation. The authoritative source is the Japanese version: [read.ja.md](./read.ja.md).

## Function list

| Function    | Use case        | Argument                     | Return value           |
| ----------- | --------------- | ---------------------------- | ---------------------- |
| `parseFile` | `File` / `Blob` | `File` / `Blob`              | `Promise<ParseResult>` |
| `parse`     | Byte array      | `ArrayBuffer` / `Uint8Array` | `Promise<ParseResult>` |

## Usage

Without a schema, cells are returned as a `Row` array, keeping their Excel types (string, number, boolean, date).

The second argument is `{ schema?, options? }`. Pass the `schema` that types and validates columns separately from the `options` that adjust parsing such as sheet and range ([ParseOptions](#options-parseoptions)). Both are optional.

### parseFile

Reads a `File` / `Blob`. Internally it expands the input via `arrayBuffer()` and calls `parse`, so its behavior matches `parse`.

```ts
import { parseFile } from "web-xlsx";

const result = await parseFile(file);
if (result.ok) {
  console.log(result.data);
  // [{ Name: "John Smith", Age: 30, HireDate: Date, Active: true }, ...]
}
```

### parse

Reads a byte array (`ArrayBuffer` / `Uint8Array`).

```ts
import { parse } from "web-xlsx";

const result = await parse(bytes);
```

> [!NOTE]
> For the schema that types and validates columns, see [Schema](./schema.md).

## Reading without a header

For tables that have no header row, multiple header rows, or no fixed header, read with `options.header: false`. The header is not resolved; each row is parsed positionally as `Cell[]`, and every row from the first one goes into `data`.

```ts
const result = await parse(bytes, { options: { header: false } });
if (result.ok) {
  // result.data: Cell[][]
  console.log(result.data[0]); // row 1 → ["Name", "Age", "HireDate"]
  console.log(result.data[1]?.[0]); // row 2, column 1 → "John Smith"
}
```

Each row is padded with `null` from column A (index 0) up to the sheet's last used column, so every row forms a rectangle of the same length. Passing `range` makes the left edge of the range index 0 and pads up to the right edge.

> [!WARNING]
> `options.header: false` cannot be combined with `schema`. `headerRow` is also ignored.

## Options (ParseOptions)

Parsing adjustments go in the `options` of the second argument. Group them under a key separate from `schema`, as in `parse(bytes, { options: { sheet: 1, range: "A1:D100" } })`.

| Option          | Default                       | Description                                                                                                                                                        |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sheet`         | First sheet                   | The sheet to read, by name or 0-based index                                                                                                                        |
| `headerRow`     | First non-empty row           | The header row number (1-based). Values ≤ 0 or non-integers raise `invalid-option`                                                                                 |
| `range`         | Automatic                     | Limits the data range. `"A1:D100"` (rectangle) / `"A:D"` (columns) / `"2:100"` (rows). Invalid values raise `invalid-range`                                        |
| `skipEmptyRows` | `true`                        | Skips empty rows                                                                                                                                                   |
| `header`        | (header present)              | With `false`, the header is not resolved and each row is returned as `Cell[]` (the result is `Cell[][]`). Cannot be combined with `schema`; `headerRow` is ignored |
| `utc`           | `false`                       | Interprets dates as fixed UTC. The default is local time. Use the same value as when writing                                                                       |
| `limits`        | 300MB per entry / 600MB total | Upper limit on ZIP decompression size (ZIP bomb protection). Exceeding `maxEntryBytes` (per entry) or `maxTotalBytes` (total) raises `too-large`                   |

## Error handling

Branch on `ok` for `ParseResult`. `ok: false` means the file could not be opened (corrupted, not an xlsx, target sheet missing, etc.). Even with `ok: true`, `errors` may contain per-row validation errors.

```ts
const result = await parse(bytes, { schema });
if (!result.ok) {
  console.error(result.error.code, result.error.message);
} else {
  await bulkInsert(result.data);
  for (const e of result.errors) console.warn(`Row ${e.row}: ${e.message}`);
}
```

### Error codes

| code                      | Meaning                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `not-zip`                 | Cannot be read as a ZIP                                                                             |
| `invalid-xlsx`            | A required part (workbook / sheet, etc.) is missing, or its content is corrupted                    |
| `sheet-not-found`         | The specified sheet does not exist                                                                  |
| `invalid-range`           | The `range` option has an invalid format                                                            |
| `invalid-option`          | An option/schema value is invalid (`headerRow` of 0 or non-integer, duplicate `prop` in the schema) |
| `duplicate-header`        | Header column names are duplicated, so column mapping is not uniquely determined                    |
| `missing-column`          | A required schema column (`required` without `defaultValue`) is missing from the header             |
| `unsupported-environment` | `DecompressionStream` is not supported                                                              |
| `too-large`               | Decompressed size exceeds the limit (ZIP bomb protection)                                           |
| `read-failed`             | Failed to read the `File` / `Blob` (`parseFile` only)                                               |

Row errors in `errors` (when `ok: true`) carry `code` (kind), `row` (1-based row number), `column` (the relevant column, absent for whole-row errors), `value` (the failing value), and `message`. Since `message` is always in English, branch on `code` when you want to control the displayed text.

#### Row error codes (`RowError.code`)

| code          | Meaning                                                        |
| ------------- | -------------------------------------------------------------- |
| `required`    | A required column (`required` without `defaultValue`) is empty |
| `non-number`  | Conversion to a `type: 'number'` column failed                 |
| `non-boolean` | Conversion to a `type: 'boolean'` column failed                |
| `non-date`    | Conversion to a `type: 'date'` column failed                   |
| `validate`    | The user's `validate` returned a message (or threw)            |
