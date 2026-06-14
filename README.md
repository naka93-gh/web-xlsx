# web-xlsx

[![npm version](https://img.shields.io/npm/v/web-xlsx.svg)](https://www.npmjs.com/package/web-xlsx)
[![bundle size](https://deno.bundlejs.com/badge?q=web-xlsx,web-xlsx/write)](https://bundlejs.com/?q=web-xlsx,web-xlsx/write)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/web-xlsx?activeTab=dependencies)
[![types](https://img.shields.io/npm/types/web-xlsx.svg)](https://www.npmjs.com/package/web-xlsx)
[![license](https://img.shields.io/npm/l/web-xlsx.svg)](./LICENSE)

ブラウザ・Node に対応した TypeScript 製の xlsx read/write ライブラリ。

[デモページはこちら。](https://naka93-gh.github.io/web-xlsx-playground/)

## 特徴

- 外部依存なしの小バンドル
- スキーマ指定で型付きにパース
- read/write で同じスキーマを使用
- Result 型による戻り値統一

## インストール

```bash
npm install web-xlsx
pnpm add web-xlsx
bun add web-xlsx
```

- ESM 専用
- Node.js 22 以上
- ブラウザは deflate-raw 対応の現行版

## Quick Start

各 API とオプションの詳細は [docs/api/](./docs/api/README.md) を参照。

### read

```ts
import { parseFile, defineSchema } from "web-xlsx";

const schema = defineSchema({
  名前: { prop: "name", type: "string", required: true },
  年齢: { prop: "age", type: "number" },
  入社日: { prop: "hireDate", type: "date" },
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

// read と同じスキーマで書き出せる（戻り値は read と同じ Result）
const written = await build(result.data, { schema });
if (written.ok) {
  console.log(written.data); // Uint8Array
}
```

## 制限事項

- read: 数式は評価しない
- read: ヘッダーに同名の列があると読み取りを拒否する
- read: `type: 'number'` 列が日付書式のセルを受けると「数値ではありません」になる（日付は `type: 'date'` で受ける）
- write: 1 シートの素の表のみ
- write: 極端に大きい/小さい数値は指数表記になりうる
- read/write: 日付は既定でローカル時刻として扱う
- read/write: 1900-01-01 より前の `Date` は負のシリアル値になり Excel 上で `####` 表示になる

## 未対応

- read: 複数シートの一括読み込み
- read: 結合セルの展開
- read: ZIP64・暗号化ブック
- read/write: ストリーミング

## ライセンス

MIT
