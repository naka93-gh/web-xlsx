# web-xlsx

> 📖 This document is an AI-generated translation. The authoritative source is the Japanese version: [README.ja.md](./README.ja.md).

[![npm version](https://img.shields.io/npm/v/web-xlsx.svg)](https://www.npmjs.com/package/web-xlsx)
[![bundle size](https://deno.bundlejs.com/badge?q=web-xlsx,web-xlsx/write)](https://bundlejs.com/?q=web-xlsx,web-xlsx/write)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/web-xlsx?activeTab=dependencies)
[![types](https://img.shields.io/npm/types/web-xlsx.svg)](https://www.npmjs.com/package/web-xlsx)
[![license](https://img.shields.io/npm/l/web-xlsx.svg)](./LICENSE)

A TypeScript xlsx read/write library that works in both browsers and Node.

[See the demo page here.](https://naka93-gh.github.io/web-xlsx-playground/)

## Features

- Small bundle with zero dependencies
- Parse into typed rows from a schema
- Use the same schema for read and write
- Unified return values via a Result type

## Installation

```bash
npm install web-xlsx
pnpm add web-xlsx
bun add web-xlsx
```

- ESM only
- Node.js 22 or later
- Browsers: current versions with deflate-raw support

## Quick Start

For details on each API and its options, see [docs/api/](./docs/api/README.md).

### read

```ts
import { parseFile, defineSchema } from "web-xlsx";

const schema = defineSchema({
  Name: { prop: "name", type: "string", required: true },
  Age: { prop: "age", type: "number" },
  HireDate: { prop: "hireDate", type: "date" },
});

const result = await parseFile(file, { schema });
if (result.ok) {
  console.log(result.data);
  // { name: string; age: number|null; hireDate: Date|null }[]
}
```

### write

```ts
import { build } from "web-xlsx/write";

// Write using the same schema as read (the return value is the same Result as read)
const written = await build(result.data, { schema });
if (written.ok) {
  console.log(written.data); // Uint8Array
}
```

## Limitations

- read: formulas are not evaluated
- read: rejects reading when the header has duplicate column names
- read: a `type: 'number'` column receiving a date-formatted cell yields a "not a number" error (use `type: 'date'` for dates)
- write: only a single sheet with a plain table
- write: extremely large or small numbers may render in exponential notation
- read/write: dates are treated as local time by default
- read/write: a `Date` before 1900-01-01 becomes a negative serial value and shows as `####` in Excel

## Not supported

- read: bulk reading of multiple sheets
- read: expanding merged cells
- read: ZIP64 and encrypted workbooks
- read/write: streaming

## License

MIT
