# 読み取り

> 📖 English version (AI-translated): [read.md](./read.md)

## 関数一覧

| 関数        | 用途            | 引数                         | 戻り値                 |
| ----------- | --------------- | ---------------------------- | ---------------------- |
| `parseFile` | `File` / `Blob` | `File` / `Blob`              | `Promise<ParseResult>` |
| `parse`     | バイト列        | `ArrayBuffer` / `Uint8Array` | `Promise<ParseResult>` |

## 使い方

スキーマを渡さなければ、セルは Excel 上の型（文字列・数値・真偽・日付）のまま `Row` 配列で返る。

第 2 引数は `{ schema?, options? }`。列を型付け・検証する `schema` と、シートや範囲などの取り込み調整 `options`（[ParseOptions](#オプションparseoptions)）を分けて渡す。どちらも省略できる。

### parseFile

`File` / `Blob` を読む。内部で `arrayBuffer()` に展開して `parse` を呼ぶため、挙動は `parse` と同じ。

```ts
import { parseFile } from "web-xlsx";

const result = await parseFile(file);
if (result.ok) {
  console.log(result.data);
  // [{ 名前: "田中太郎", 年齢: 30, 入社日: Date, 在籍: true }, ...]
}
```

### parse

バイト列（`ArrayBuffer` / `Uint8Array`）を読む。

```ts
import { parse } from "web-xlsx";

const result = await parse(bytes);
```

> [!NOTE]
> 列を型付け・検証するスキーマは [スキーマ](./schema.ja.md) を参照。

## ヘッダー無しで読む

ヘッダー行が無い・複数ある・定まらない表は `options.header: false` で読む。ヘッダーを解決せず各行を `Cell[]` として位置で取り込み、1 行目から全て `data` に入る。

```ts
const result = await parse(bytes, { options: { header: false } });
if (result.ok) {
  // result.data: Cell[][]
  console.log(result.data[0]); // 1 行目 → ["名前", "年齢", "入社日"]
  console.log(result.data[1]?.[0]); // 2 行目 1 列目 → "田中太郎"
}
```

各行は列 A（index 0）からシートの最大使用列まで `null` 埋めされ、全行が同じ長さの矩形になる。`range` を渡すと範囲の左端が index 0、右端まで埋まる。

> [!WARNING]
> `options.header: false` は `schema` と併用できない。`headerRow` も無視される。

## オプション（ParseOptions）

取り込みの調整は第 2 引数の `options` に渡す。`parse(bytes, { options: { sheet: 1, range: "A1:D100" } })` のように、`schema` とは別のキーにまとめる。

| オプション      | 既定                    | 説明                                                                                                              |
| --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `sheet`         | 先頭シート              | 読むシートを名前または 0 始まりの index で指定                                                                    |
| `headerRow`     | 最初の非空行            | ヘッダー行の行番号（1 始まり）。0 以下・非整数は `invalid-option`                                                 |
| `range`         | 自動                    | データ範囲を限定。`"A1:D100"`（矩形）/ `"A:D"`（列）/ `"2:100"`（行）。不正なら `invalid-range`                   |
| `skipEmptyRows` | `true`                  | 空行を読み飛ばす                                                                                                  |
| `header`        | （ヘッダーあり）        | `false` でヘッダーを解決せず各行を `Cell[]`（戻り値全体は `Cell[][]`）で返す。`schema` 併用不可・`headerRow` 無視 |
| `utc`           | `false`                 | 日付を UTC 固定で解釈する。既定はローカル時刻。書き出しと同じ値を使うこと                                         |
| `limits`        | 単体 300MB / 全体 600MB | ZIP 解凍サイズの上限（ZIP 爆弾対策）。`maxEntryBytes`（単体）/ `maxTotalBytes`（全体）が上限超過で `too-large`    |

## エラー処理

`ParseResult` は `ok` で分岐する。`ok: false` はファイルが開けなかった場合（壊れている・xlsx でない・対象シートが無い 等）。`ok: true` でも `errors` に行単位の検証エラーが入りうる。

```ts
const result = await parse(bytes, { schema });
if (!result.ok) {
  console.error(result.error.code, result.error.message);
} else {
  await bulkInsert(result.data);
  for (const e of result.errors) console.warn(`${e.row}行目: ${e.message}`);
}
```

### エラーコード

| code                      | 意味                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `not-zip`                 | ZIP として読めない                                                                    |
| `invalid-xlsx`            | 必要なパーツ（workbook / sheet 等）が欠落、または中身が壊れている                     |
| `sheet-not-found`         | 指定したシートが無い                                                                  |
| `invalid-range`           | `range` オプションの形式が不正                                                        |
| `invalid-option`          | オプション/スキーマの指定値が不正（`headerRow` の 0・非整数、スキーマの `prop` 重複） |
| `duplicate-header`        | ヘッダー列名が重複し、列の対応が一意に決まらない                                      |
| `missing-column`          | スキーマの必須列（`required` かつ `defaultValue` 無し）がヘッダーに無い               |
| `unsupported-environment` | `DecompressionStream` 非対応                                                          |
| `too-large`               | 解凍後サイズが上限超過（ZIP 爆弾対策）                                                |
| `read-failed`             | `File` / `Blob` の読み込みに失敗（`parseFile` のみ）                                  |

`ok: true` の `errors` に入る行エラーは、`code`（種別）・`row`（1 始まりの行番号）・`column`（該当列、行全体のエラーなら無し）・`value`（失敗した値）・`message` を持つ。`message` は英語固定なので、表示文言を制御したいときは `code` で分岐する。

#### 行エラーコード（`RowError.code`）

| code          | 意味                                                            |
| ------------- | --------------------------------------------------------------- |
| `required`    | 必須列（`required` かつ `defaultValue` 無し）が空               |
| `non-number`  | `type: 'number'` 列への変換に失敗                               |
| `non-boolean` | `type: 'boolean'` 列への変換に失敗                              |
| `non-date`    | `type: 'date'` 列への変換に失敗                                 |
| `validate`    | ユーザーの `validate` がメッセージを返した（または throw した） |
