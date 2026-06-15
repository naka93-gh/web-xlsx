# Write

> 📖 This document is an AI-generated translation. The authoritative source is the Japanese version: [write.ja.md](./write.ja.md).

## Function list

| Function | Purpose         | Argument | Return value           |
| -------- | --------------- | -------- | ---------------------- |
| `build`  | row data → xlsx | `Row[]`  | `Promise<BuildResult>` |

## Usage

Writes row data into xlsx bytes. Because compression is asynchronous, it returns a `Promise`. Failures come back not as exceptions but as a `BuildResult` (a Result type symmetric to read's `ParseResult`), and you branch on `ok`. When `ok: true`, `data` holds a `Uint8Array`.

The second argument is `{ schema?, options? }`. Pass the `schema` that decides column order and headers separately from `options`, which adjusts output such as the sheet name ([BuildOptions](#options-buildoptions)). Both are optional.

### With a schema

When you pass a schema, key order becomes column order, keys become headers, and each row's values are looked up via `prop`. You can reuse the same schema you used for read (see [Schema](./schema.md) for details).

```ts
import { build } from "web-xlsx/write";

const result = await build(rows, { schema });
if (result.ok) {
  // result.data: Uint8Array
}
```

### Without a schema

Each row's keys become headers as-is, and column order follows the order in which keys first appear across all rows.

```ts
import { build } from "web-xlsx/write";

const result = await build([
  { Name: "John Smith", Age: 30, HireDate: new Date(2020, 3, 1) },
  { Name: "Jane Doe", Age: 25 },
]);
```

> [!NOTE]
> Values other than `Cell` (`string` / `number` / `boolean` / `Date` / `null`) are stringified into string cells. `undefined` / `null` become empty cells.

## Options (BuildOptions)

Pass output adjustments through `options` in the second argument. Group them under a key separate from `schema`, like `build(rows, { options: { sheetName: "Employees" } })`.

| Option      | Default    | Description                                                                                                                    |
| ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `sheetName` | `"Sheet1"` | Output sheet name                                                                                                              |
| `style`     | `true`     | Adds bold headers, a frozen top row, and automatic column widths. Set `false` to disable. Date display formatting is always on |
| `utc`       | `false`    | Serializes `Date` values using fixed UTC. Paired with `parse`'s `utc`, so equal values round-trip across read and write        |

## Error handling

Branch on `ok` for `BuildResult`. `ok: false` means the write failed, for example due to a schema misconfiguration, and `error` is the `FileError` (`code` / `message`) shared with read. Since write has no per-row validation, there is no `errors` array like read has.

```ts
const result = await build(rows, { schema });
if (!result.ok) {
  console.error(result.error.code, result.error.message);
} else {
  save(result.data);
}
```

### Error codes

| code             | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `invalid-option` | Invalid schema value (multiple columns share the same `prop`) |

## Triggering a download in the browser

```ts
import { build } from "web-xlsx/write";

const result = await build(rows, { schema });
if (result.ok) {
  const blob = new Blob([result.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
```
