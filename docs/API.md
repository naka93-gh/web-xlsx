# web-xlsx API リファレンス

xlsx を TypeScript で読み書きするライブラリ。Excel ファイルを読み込んで中身を値として扱うことと、データを Excel ファイルとして書き出すことができる。読み取りだけ、書き出しだけ、どちらの用途でも使える。依存ゼロで、ブラウザと Node の両方で動く。

エントリは 2 つある。

| import | 用途 | 公開 |
| --- | --- | --- |
| `web-xlsx` | 読み取り | `parse` / `parseFile` |
| `web-xlsx/write` | 書き出し | `build` |

読み取りと書き出しは別エントリなので、読むだけなら書き出しコードはバンドルに含まれない。

## インストールと動作要件

```bash
pnpm add web-xlsx
```

- ESM のみ（CommonJS の `require` は不可）
- Node は 20.12 以上（`deflate-raw` 対応の下限）
- 読み取りは解凍に `DecompressionStream` を使う。非対応環境では `unsupported-environment` で失敗する
- 書き出しは圧縮に `CompressionStream` を使い、非対応環境では無圧縮（stored）で格納する。失敗はしない
- 日付は既定でローカルの壁時計としてシリアル値を `Date` に変換する（`getFullYear()` 等で読む前提。読み書き対称で TZ に依らず往復一致）。`utc: true` で UTC 固定に切り替えられる

## 読み取り

読む関数は 2 つあり、手元のデータの形で選ぶ。`File` / `Blob`（ファイル選択やドラッグ&ドロップ）なら `parseFile`、バイト列（`fetch` や `fs.readFile` の結果）なら `parse`。どちらも処理は同じで、`parseFile` は `arrayBuffer()` に展開して `parse` に委譲するだけ。

失敗は例外ではなく {@link ParseResult} で返す。ファイルが開けない「file 単位の失敗」と、スキーマ検証に落ちた「行単位のエラー」を分けて扱える。

### parse(data, options?)

`ArrayBuffer` / `Uint8Array` から読む。解凍が非同期なので `Promise` を返す。

```ts
function parse(data: ArrayBuffer | Uint8Array, options?: ParseOptions): Promise<ParseResult<Row>>
function parse<S extends Schema>(
  data: ArrayBuffer | Uint8Array,
  options: ParseOptions & { schema: S },
): Promise<ParseResult<InferRow<S>>>
```

スキーマを渡さなければ、セルは Excel 上の型（文字列・数値・真偽・日付）のまま `Row` の配列で返る。

```ts
import { parse } from 'web-xlsx'

const result = await parse(bytes)
if (result.ok) {
  console.log(result.data)
  // [{ 名前: '田中太郎', 年齢: 30, 入社日: Date, 在籍: true }, ...]
}
```

### parseFile(file, options?)

`<input type="file">` で得た `File`（または `Blob`）から読む。内部で `arrayBuffer()` に展開して `parse` に委譲する。

```ts
function parseFile(file: File | Blob, options?: ParseOptions): Promise<ParseResult<Row>>
function parseFile<S extends Schema>(
  file: File | Blob,
  options: ParseOptions & { schema: S },
): Promise<ParseResult<InferRow<S>>>
```

```ts
import { parseFile } from 'web-xlsx'

const file = input.files?.[0]
if (file) {
  const result = await parseFile(file)
  if (result.ok) console.log(result.data)
}
```

### スキーマを渡して読む

`schema` を渡すと各列を検証・型付けし、行を `InferRow<S>` 型で返す。検証に落ちた行は `data` から外れ、行番号付きで `errors` に入る。正常行だけ insert し、エラー行はユーザーに提示する、といった一括取り込みに向く。

```ts
import { parse, type Schema } from 'web-xlsx'

const schema = {
  名前: { prop: 'name', type: 'string', required: true },
  年齢: { prop: 'age', type: 'number' },
  入社日: { prop: 'hireDate', type: 'date' },
} satisfies Schema

const result = await parse(bytes, { schema })
if (result.ok) {
  // result.data: { name: string; age: number | null; hireDate: Date | null }[]
  for (const e of result.errors) console.warn(`${e.row}行目 ${e.column}: ${e.message}`)
}
```

## 書き出し

```ts
import { build } from 'web-xlsx/write'
```

### build(rows, options?)

行データを xlsx バイト列（`Uint8Array`）に書き出す。圧縮が非同期なので `Promise` を返す。

```ts
function build(rows: Row[], options?: BuildOptions): Promise<Uint8Array>
function build<S extends Schema>(
  rows: InferRow<S>[],
  options: BuildOptions & { schema: S },
): Promise<Uint8Array>
```

スキーマ無しでは、行のキーがそのままヘッダーになり、列順は全行を通して最初に現れた順になる。

```ts
const bytes = await build([
  { 名前: '田中太郎', 年齢: 30, 入社日: new Date(2020, 3, 1) },
  { 名前: '鈴木花子', 年齢: 25 },
])
```

スキーマを渡すと、スキーマのキー順が列順、キーがヘッダー、各行の値は `prop` で引く。読み取りに使ったスキーマをそのまま書き出しにも使える。

```ts
const bytes = await build(rows, { schema })
```

`Cell`（`string` / `number` / `boolean` / `Date` / `null`）以外の値は文字列化して文字列セルにする。`undefined` / `null` は空セルになる。

ブラウザでダウンロードさせる例。

```ts
const bytes = await build(rows, { schema })
const blob = new Blob([bytes], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'export.xlsx'
a.click()
URL.revokeObjectURL(url)
```

## スキーマ

スキーマはヘッダー名から列定義へのマップ（`Record<string, Column>`）。読み取りでは検証・型付けに、書き出しでは列順とヘッダーの決定に使う。

```ts
type Column = {
  prop: string
  type: 'string' | 'number' | 'boolean' | 'date'
  required?: boolean
  defaultValue?: Cell
  validate?: (value: Cell) => string | null
}
```

| フィールド | 役割 |
| --- | --- |
| `prop` | 出力プロパティ名。読み取り後の行はこのキーを持つ |
| `type` | 期待する型。下の変換ルールを参照 |
| `required` | `true` で未入力（空セル）を行エラーにする |
| `defaultValue` | 空セルのときに補う値。指定すると `required` 違反にならず、検証も飛ばす |
| `validate` | 追加検証。エラーメッセージ文字列を返すとその行をエラーにし、`null` で通過 |

### 検証の順序

各セルは次の順で処理する。

1. 空セル（`null` または空文字）なら、`defaultValue` があればそれを入れる。無ければ `required` の場合は行エラー、それ以外は `null`。ここで打ち切る
2. `validate` を呼ぶ。`validate` は型変換**前**の生の `Cell` を受け取る。メッセージを返したら行エラー
3. `type` への変換。失敗したら行エラー

1 列でもエラーになると、その行は丸ごと `data` から外れて `errors` に積まれる。

### 型変換ルール

| `type` | 受理して変換するもの | エラーになるもの |
| --- | --- | --- |
| `string` | 全セル。数値セルは元テキストを使い、大整数 ID の桁落ちを防ぐ | なし |
| `number` | 数値セル、数値に解釈できる文字列 | 数値にならない文字列 |
| `boolean` | 真偽セル、`true`/`false`/`1`/`0`（大文字小文字無視） | それ以外 |
| `date` | 日付セル、ISO 8601 文字列 | ISO 8601 でない文字列、その他の型 |

`date` の文字列は ISO 8601 のみ受理する（`YYYY-MM-DD` または `YYYY-MM-DDThh:mm[:ss[.sss]][Z|±hh:mm]`）。`YYYY/MM/DD` などは受理しない。タイムゾーン指定の無い文字列は既定でローカル時刻、`utc: true` では UTC として解釈する。

### InferRow による型推論

スキーマに `satisfies Schema` を付けると、`InferRow<S>` で行の型を引ける。`prop` がキー、`type` が値の型。`required: true` でない列は `null` 許容になる。

```ts
const schema = {
  名前: { prop: 'name', type: 'string', required: true },
  年齢: { prop: 'age', type: 'number' },
} satisfies Schema

type Employee = InferRow<typeof schema>
// { name: string; age: number | null }
```

`parse` / `parseFile` / `build` はスキーマを渡すとこの型を使うので、明示的に書く必要は普段ない。

## オプション

### ParseOptions

```ts
type ParseOptions = {
  sheet?: string | number
  headerRow?: number
  range?: string
  skipEmptyRows?: boolean
  utc?: boolean
  limits?: ZipLimits
}

type ZipLimits = {
  maxEntryBytes?: number
  maxTotalBytes?: number
}
```

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `sheet` | 先頭シート | 読むシートを名前または 0 始まりの index で指定 |
| `headerRow` | 最初の非空行 | ヘッダー行の行番号（1 始まり） |
| `range` | 自動 | データ範囲を限定。`"A1:D100"`（矩形）/ `"A:D"`（列のみ・全行）/ `"2:100"`（行のみ・全列）。形式が不正なら `invalid-range` |
| `skipEmptyRows` | `true` | 空行を読み飛ばす |
| `utc` | `false` | 日付を UTC 固定で解釈する。既定はローカルの壁時計（`getFullYear()` で読む）、`true` で `getUTCFullYear()` / `toISOString()` がその暦日になる。書き出しと同じ値を使うこと |
| `limits` | 単体 300MB / 全体 600MB | ZIP 解凍サイズの上限（ZIP 爆弾対策）。`maxEntryBytes`（単体エントリ）/ `maxTotalBytes`（アーカイブ全体）を上限超過すると `too-large`。正規の巨大ファイルを扱う場合は緩める、より厳しく絞る、いずれにも使える |

スキーマを渡す場合は `{ schema, ...ParseOptions }` のように同じオブジェクトに混ぜる。

### BuildOptions

```ts
type BuildOptions = {
  sheetName?: string
  style?: boolean
  utc?: boolean
}
```

| オプション | 既定 | 説明 |
| --- | --- | --- |
| `sheetName` | `"Sheet1"` | 出力シート名 |
| `style` | `true` | ヘッダー太字・先頭行固定・列幅自動を付ける。`false` で無効化。日付の表示書式は値の正しさに必須なので常に有効 |
| `utc` | `false` | `Date` を UTC 固定でシリアル値にする。`parse` の `utc` と対で、読み書きで同じ値を使えば往復一致する |

## エラー処理

`ParseResult` は成功と失敗で形が分かれる。

```ts
type ParseResult<T> =
  | { ok: false; error: FileError }
  | { ok: true; data: T[]; errors: RowError[] }
```

`ok` で分岐する。`ok: false` はファイルが開けなかった場合（壊れている・xlsx でない・対象シートが無い 等）。`ok: true` でも `errors` に行単位の検証エラーが入りうる。

```ts
const result = await parse(bytes, { schema })
if (!result.ok) {
  console.error(result.error.code, result.error.message)
} else {
  await bulkInsert(result.data)
  for (const e of result.errors) console.warn(`${e.row}行目: ${e.message}`)
}
```

### FileError

```ts
type FileError = { code: FileErrorCode; message: string }
```

| `code` | 意味 |
| --- | --- |
| `not-zip` | ZIP として読めない |
| `invalid-xlsx` | 必要なパーツ（workbook / sheet 等）が欠落、または中身が壊れている |
| `sheet-not-found` | 指定したシートが無い |
| `invalid-range` | `range` オプションの形式が不正 |
| `duplicate-header` | ヘッダー列名が重複し、列の対応が一意に決まらない（黙って後勝ちにせず拒否する） |
| `unsupported-environment` | `DecompressionStream` 非対応 |
| `too-large` | 解凍後サイズが上限超過（ZIP 爆弾対策） |

### RowError

```ts
type RowError = {
  row: number      // 1 始まりの行番号
  column?: string  // 該当列のヘッダー名（行全体のエラーなら無し）
  value?: unknown  // 検証に失敗した実際の値
  message: string
}
```

## 型リファレンス

`web-xlsx` から型をエクスポートしている。

| 型 | 説明 |
| --- | --- |
| `Cell` | セルのネイティブ値。`string \| number \| boolean \| Date \| null` |
| `Row` | スキーマ無しの 1 行。`Record<string, Cell>` |
| `Column` | スキーマの 1 列定義 |
| `ColumnType` | `'string' \| 'number' \| 'boolean' \| 'date'` |
| `Schema` | ヘッダー名 → `Column` のマップ |
| `InferRow<S>` | スキーマから推論した行の型 |
| `ParseOptions` | 読み取りオプション |
| `ZipLimits` | ZIP 解凍サイズの上限設定 |
| `ParseResult<T>` | 読み取り結果 |
| `FileError` / `FileErrorCode` | file 単位の失敗 |
| `RowError` | 行単位の検証エラー |

書き出し側の `BuildOptions` は `web-xlsx/write` からエクスポートする。`Cell` / `Row` / `Column` / `ColumnType` / `Schema` / `InferRow` は両エントリから取れる。

## 制限事項

- 読み取りは数式を評価しない。数式セルはキャッシュ値を読む
- 日付は既定でローカルの壁時計としてシリアル値を変換する（`utc: true` で UTC 固定）
- ヘッダー行に同名の列があると `duplicate-header` で読み取りを拒否する
- ZIP64・暗号化ブックには未対応
- ストリーミング、複数シートの一括読み込み、結合セルの値展開は未対応
- 書き出しはスタイル・数式・複数シートを持たない 1 シートの素の表を出力する
- 極端に大きい/小さい数値（`1e21` 等）は書き出し時に指数表記になりうる（Excel は読めるが保存テキストは変わる）
