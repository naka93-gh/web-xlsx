# スキーマ

## 列定義（Column）

各列は次のフィールドを持つ。

| フィールド     | 役割                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prop`         | 出力プロパティ名。読み取り後の行はこのキーを持つ                                                                                                                      |
| `type`         | 期待する型（`'string'` / `'number'` / `'boolean'` / `'date'`）。下の変換ルールを参照                                                                                  |
| `required`     | `true` で未入力（空セル）を行エラーにする                                                                                                                             |
| `defaultValue` | 空セルのときに補う値。型変換・`validate` を通さず出力に入るため、型は列の `type` に対応する TS 型（`'date'` なら `Date`）に限定。指定すると `required` 違反にならない |
| `validate`     | 追加検証。メッセージ文字列を返すとその行をエラーに、`null` で通過                                                                                                     |

## 使い方

スキーマを定義して `parse` / `parseFile` / `build` の第 2 引数（`schema`）に渡す。

```ts
import { parse, type Schema } from "web-xlsx";

const schema = {
  名前: { prop: "name", type: "string", required: true },
  年齢: { prop: "age", type: "number" },
  入社日: { prop: "hireDate", type: "date" },
} satisfies Schema;

const result = await parse(bytes, { schema });
if (result.ok) {
  // result.data: { name: string; age: number | null; hireDate: Date | null }[]
  for (const e of result.errors)
    console.warn(`${e.row}行目 ${e.column}: ${e.message}`);
}
```

検証に落ちた行は `data` から外れ、行番号付きで `errors` に入る。正常行だけ取り込み、エラー行は提示する、といった一括取り込みに使える。

## 検証の順序

各セルは次の順で処理する。

1. 空セル（`null` または空文字）なら、`defaultValue` があればそれを入れる。無ければ `required` の場合は行エラー、それ以外は `null`。ここで打ち切る
2. `validate` を呼ぶ。型変換前の生の `Cell` を受け取る。メッセージを返したら行エラー
3. `type` へ変換。失敗したら行エラー

1 列でもエラーになると、その行は丸ごと `data` から外れて `errors` に積まれる。

> [!NOTE]
> 必須列（`required` かつ `defaultValue` 無し）がヘッダーに存在しないと、全行が必須エラーになるため、行エラーを量産せず `missing-column` のファイルエラー（`ok: false`）で返す。

## 型変換ルール

| `type`    | 受理して変換するもの                                                                                              | エラーになるもの                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `string`  | 全セル。数値セルは元テキスト（大整数 ID の桁落ち防止）、日付セルは ISO 8601 文字列、真偽セルは `'true'`/`'false'` | なし                                                     |
| `number`  | 数値セル、10 進表記の文字列（符号・小数・指数可、前後空白は無視）                                                 | 10 進にならない文字列（`0x10` 等を含む）、真偽・日付セル |
| `boolean` | 真偽セル、`true`/`false`/`1`/`0`（大文字小文字無視）                                                              | それ以外                                                 |
| `date`    | 日付セル、ISO 8601 文字列                                                                                         | ISO 8601 でない文字列、その他の型                        |

> [!NOTE]
> `date` の文字列は ISO 8601 のみ受理する（`YYYY-MM-DD` または `YYYY-MM-DDThh:mm[:ss[.sss]][Z|±hh:mm]`）。`YYYY/MM/DD` などは受理しない。タイムゾーン指定の無い文字列は既定でローカル時刻、`utc: true` では UTC として解釈する。

## 型推論（InferRow）

スキーマに `satisfies Schema` を付けると、`InferRow<S>` で行の型を引ける。`prop` がキー、`type` が値の型。`required: true` でない列は `null` 許容になる。

```ts
const schema = {
  名前: { prop: "name", type: "string", required: true },
  年齢: { prop: "age", type: "number" },
} satisfies Schema;

type Employee = InferRow<typeof schema>;
// { name: string; age: number | null }
```

`parse` / `parseFile` / `build` はスキーマを渡すとこの型を使うので、普段は明示不要。
