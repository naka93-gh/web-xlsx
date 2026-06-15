# web-xlsx Documentation

> 📖 This document is an AI-generated translation. The authoritative source is the Japanese version: [README.ja.md](./README.ja.md).

A TypeScript xlsx read/write library that works in both the browser and Node.

| import           | Purpose | Exports               |
| ---------------- | ------- | --------------------- |
| `web-xlsx`       | Reading | `parse` / `parseFile` |
| `web-xlsx/write` | Writing | `build`               |

Reading and writing are separate entry points, so the writing code is never bundled when you only need to read.

- [Reading](./read.md) — `parse` / `parseFile`, `ParseOptions`, error handling
- [Writing](./write.md) — `build`, `BuildOptions`
- [Schema](./schema.md) — column definitions, validation order, type-conversion rules
