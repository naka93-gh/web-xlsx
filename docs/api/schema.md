# Schema

> 📖 This document is an AI-generated translation. The authoritative source is the Japanese version: [schema.ja.md](./schema.ja.md).

## Column definition (Column)

Each column has the following fields.

| Field          | Role                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prop`         | Output property name. Parsed rows are keyed by this. Duplicates across columns raise `invalid-option` (both read and build)                                                                                                                            |
| `type`         | Expected type (`'string'` / `'number'` / `'boolean'` / `'date'`). See the conversion rules below                                                                                                                                                       |
| `required`     | When `true`, an empty cell (no input) becomes a row error                                                                                                                                                                                              |
| `defaultValue` | Value substituted for an empty cell. It skips type conversion and `validate` and goes straight to the output, so its type is restricted to the TS type matching the column's `type` (`Date` for `'date'`). Setting it suppresses `required` violations |
| `validate`     | Extra validation. Returning a message string marks the row as an error; `null` passes                                                                                                                                                                  |

## Usage

Define a schema with `defineSchema(...)` and pass it as the second argument (`schema`) of `parse` / `parseFile` / `build`. Wrapping with `defineSchema` preserves the `prop` literals so that `InferRow` infers correctly (a bare `satisfies Schema` widens `prop` to `string`, collapsing the row type into a union of all columns).

```ts
import { parse, defineSchema } from "web-xlsx";

const schema = defineSchema({
  Name: { prop: "name", type: "string", required: true },
  Age: { prop: "age", type: "number" },
  HireDate: { prop: "hireDate", type: "date" },
});

const result = await parse(bytes, { schema });
if (result.ok) {
  // result.data: { name: string; age: number | null; hireDate: Date | null }[]
  for (const e of result.errors)
    console.warn(`Row ${e.row}, ${e.column}: ${e.message}`);
}
```

Rows that fail validation are dropped from `data` and collected in `errors` with their row numbers. This suits bulk imports where you take only the valid rows and surface the failing ones.

## Validation order

Each cell is processed in this order.

1. If the cell is empty (`null` or an empty string), substitute `defaultValue` if present. Otherwise, raise a row error (`code: 'required'`) when `required`, or yield `null` otherwise. Processing stops here
2. Call `validate`. It receives the raw `Cell` before type conversion. Returning a message raises a row error (`code: 'validate'`)
3. Convert to `type`. On failure, raise a row error (`code: 'non-number'` / `'non-boolean'` / `'non-date'` by expected type)

If even one column errors, the whole row is dropped from `data` and pushed onto `errors`. Each row error carries `code` (kind), `row`, `column`, `value`, and `message`. The `message` is fixed in English, so branch on `code` when you need to control the wording (see [Read › Row error codes](./read.md#row-error-codes-rowerrorcode) for the full list).

> [!NOTE]
> If a required column (`required` with no `defaultValue`) is missing from the header, every row would error on it. Rather than producing a flood of row errors, this is returned as a `missing-column` file error (`ok: false`).

## Type conversion rules

| `type`    | Accepted and converted                                                                                                                                                         | Errors out                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `string`  | Every cell. Numeric cells keep their original text (to avoid precision loss on large integer IDs), date cells become ISO 8601 strings, boolean cells become `'true'`/`'false'` | None                                                                        |
| `number`  | Numeric cells, decimal-notation strings (sign, fraction, and exponent allowed; surrounding whitespace ignored)                                                                 | Strings that aren't decimal (including `0x10` etc.), boolean and date cells |
| `boolean` | Boolean cells, `true`/`false`/`1`/`0` (case-insensitive)                                                                                                                       | Anything else                                                               |
| `date`    | Date cells, ISO 8601 strings                                                                                                                                                   | Non-ISO-8601 strings, other types                                           |

> [!NOTE]
> Date strings are accepted only in ISO 8601 (`YYYY-MM-DD` or `YYYY-MM-DDThh:mm[:ss[.sss]][Z|±hh:mm]`). Formats like `YYYY/MM/DD` are not accepted. Strings without a timezone are interpreted as local time by default, or as UTC when `utc: true`.

> [!NOTE]
> A cell with a date format (numFmt) resolves as a date, so a `type: 'number'` column receiving that cell reports "not a number". Take dates with `type: 'date'`.
> Also, a `Date` before 1900-01-01 becomes a negative serial value and shows as `####` in Excel (the value itself is preserved).

## Type inference (InferRow)

When defined with `defineSchema(...)`, you can derive the row type via `InferRow<S>`: `prop` is the key and `type` is the value type. Columns without `required: true` become nullable.

```ts
const schema = defineSchema({
  Name: { prop: "name", type: "string", required: true },
  Age: { prop: "age", type: "number" },
});

type Employee = InferRow<typeof schema>;
// { name: string; age: number | null }
```

`parse` / `parseFile` / `build` use this type when given a schema, so you usually don't need to spell it out.

> [!NOTE]
> A bare `const schema = {...} satisfies Schema` widens `prop` to `string`, which collapses `InferRow`'s key remapping into an index signature and makes the row type a union of all columns. Wrapping with `defineSchema` (an identity function with a `const` type parameter) preserves the literals so inference works correctly.
