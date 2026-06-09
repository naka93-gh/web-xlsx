# web-xlsx

xlsx を TypeScript で読み書きするライブラリ。Excel ファイルを読み込んで中身を値として扱うことと、データを Excel ファイルとして書き出すことができる。読み取りだけ、書き出しだけ、どちらの用途でも使える。

ブラウザで動かせるデモ: **[naka93-gh.github.io/web-xlsx](https://naka93-gh.github.io/web-xlsx/)**（読み込み・書き出しとも、処理はすべてブラウザ内で完結）

## 特徴

- 依存ゼロでバンドルサイズが小さい
- スキーマを指定すると型付きデータとしてパースできる
- 読み取りに使ったスキーマをそのまま書き出しにも使える
- Result 型を採用し、エラーを詳細に表現できる

## インストール

```bash
pnpm add web-xlsx
```

## 使い方

列ごとに型・必須・既定値・追加検証をスキーマで定義すると、検証済みの型付き行が返る。検証に通らなかった行は `data` から外れ、行番号付きで `errors` に入る。これが主な使い方。

```ts
import { parseFile, type Schema } from 'web-xlsx'

const schema = {
  名前: { prop: 'name', type: 'string', required: true },
  年齢: { prop: 'age', type: 'number' },
  入社日: { prop: 'hireDate', type: 'date' },
} satisfies Schema

const result = await parseFile(file, { schema })
if (result.ok) {
  console.log(result.data) // { name: string; age: number|null; hireDate: Date|null }[]
  for (const e of result.errors) console.warn(`${e.row}行目 ${e.column}: ${e.message}`)
}
```

`type` は `'string' | 'number' | 'boolean' | 'date'` から指定する。

### スキーマなしで読む

スキーマを渡さなければ、セルは Excel 上の型（文字列・数値・真偽・日付）のまま素の行として返る。型付けは不要で中身だけ見たいときに使う。

```ts
import { parseFile } from 'web-xlsx'

const result = await parseFile(file)
if (result.ok) console.log(result.data)
// [{ 名前: '田中太郎', 年齢: 30, 入社日: Date, 在籍: true }, ...]
```

`ArrayBuffer` / `Uint8Array` からは `parse` を使う（解凍に `DecompressionStream` を使うため非同期）。

## 書き出し

行データを xlsx のバイト列（`Uint8Array`）に書き出す。読み取りに使ったスキーマをそのまま渡せて、キーがヘッダー、`prop` で各行の値を引く。

```ts
import { build } from 'web-xlsx/write'

const bytes = await build(rows, { schema })
```

スキーマを渡さなければ、行のキーがそのままヘッダーになり、列順は最初に現れた順になる。

```ts
const bytes = await build([
  { 名前: '田中太郎', 年齢: 30 },
  { 名前: '鈴木花子', 年齢: 25 },
])
```

書き出しは `web-xlsx/write` から import する。読むだけならこのコードはバンドルに含まれない。

各 API とオプションの詳細は [docs/API.md](docs/API.md) を参照。

## 制限事項

- 数式評価とスタイル編集は扱わない。読み取り時、数式セルはキャッシュ値を読む。書き出しは 1 シートの素の表を出力する（数式・複数シートなし）。
- 日付は Asia/Tokyo (JST) 前提でシリアル値を `Date` に変換する。スキーマ `type: 'date'` で文字列セルを受ける場合は ISO 8601（`YYYY-MM-DD` / `YYYY-MM-DDThh:mm[:ss]`）のみ受理し、それ以外は行エラーにする。
- ヘッダー行に同名の列があると列対応が一意に決まらないため、`duplicate-header` で読み取りを拒否する（黙って後勝ち上書きしない）。
- ZIP64・暗号化ブックには未対応。
- ストリーミング、複数シートの一括読み込み、結合セルの値展開は未対応。
- `1e21` のような極端に大きい/小さい数値は書き出し時に指数表記になりうる（Excel は読めるが保存テキストは変わる）。

## ライセンス

MIT
