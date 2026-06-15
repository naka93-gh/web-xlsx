# 書き出し

> 📖 English version (AI-translated): [write.md](./write.md)

## 関数一覧

| 関数    | 用途            | 引数    | 戻り値                 |
| ------- | --------------- | ------- | ---------------------- |
| `build` | 行データ → xlsx | `Row[]` | `Promise<BuildResult>` |

## 使い方

行データを xlsx バイト列に書き出す。圧縮が非同期なので `Promise` を返す。失敗は例外でなく `BuildResult`（read の `ParseResult` と対称の Result）で返り、`ok` で分岐する。`ok: true` のとき `data` が `Uint8Array`。

第 2 引数は `{ schema?, options? }`。列順とヘッダーを決める `schema` と、シート名などの出力調整 `options`（[BuildOptions](#オプションbuildoptions)）を分けて渡す。どちらも省略できる。

### スキーマあり

スキーマを渡すと、キー順が列順、キーがヘッダー、各行の値は `prop` で引く。read に使ったスキーマをそのまま使える（詳細は [スキーマ](./schema.ja.md)）。

```ts
import { build } from "web-xlsx/write";

const result = await build(rows, { schema });
if (result.ok) {
  // result.data: Uint8Array
}
```

### スキーマ無し

行のキーがそのままヘッダーになり、列順は全行を通して最初に現れた順になる。

```ts
import { build } from "web-xlsx/write";

const result = await build([
  { 名前: "田中太郎", 年齢: 30, 入社日: new Date(2020, 3, 1) },
  { 名前: "鈴木花子", 年齢: 25 },
]);
```

> [!NOTE]
> `Cell`（`string` / `number` / `boolean` / `Date` / `null`）以外の値は文字列化して文字列セルにする。`undefined` / `null` は空セルになる。

## オプション（BuildOptions）

出力の調整は第 2 引数の `options` に渡す。`build(rows, { options: { sheetName: "社員" } })` のように、`schema` とは別のキーにまとめる。

| オプション  | 既定       | 説明                                                                                            |
| ----------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `sheetName` | `"Sheet1"` | 出力シート名                                                                                    |
| `style`     | `true`     | ヘッダー太字・先頭行固定・列幅自動を付ける。`false` で無効化。日付の表示書式は常に有効          |
| `utc`       | `false`    | `Date` を UTC 固定でシリアル値にする。`parse` の `utc` と対で、読み書きで同じ値なら往復一致する |

## エラー処理

`BuildResult` は `ok` で分岐する。`ok: false` はスキーマの設定ミスなどで書き出せなかった場合で、`error` は read と共通の `FileError`（`code` / `message`）。write は行単位の検証を持たないため、read のような `errors` 配列は無い。

```ts
const result = await build(rows, { schema });
if (!result.ok) {
  console.error(result.error.code, result.error.message);
} else {
  save(result.data);
}
```

### エラーコード

| code             | 意味                                                 |
| ---------------- | ---------------------------------------------------- |
| `invalid-option` | スキーマの指定値が不正（複数列が同じ `prop` を持つ） |

## ブラウザでダウンロードさせる

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
