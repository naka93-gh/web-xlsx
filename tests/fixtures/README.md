# 実ファイル fixture

web-xlsx 自身の writer を**通さない**、独立した生成元（[openpyxl]）による本物の
`.xlsx`。ハンドメイドの XML を ZIP に詰める `tests/helpers/zip.ts`（buildXlsx）と違い、
実ファイル特有の構造を持つ:

- `[Content_Types].xml` / `docProps/{core,app}.xml` / `xl/theme` などの完全なパッケージ
- ルート要素の名前空間宣言（`xmlns="…/spreadsheetml/2006/main"`）
- 数値セルの明示的な `t="n"`、真偽の `t="b"`、`numFmt` 由来の日付列
- `<dimension>` / `<sheetViews>` / `<pageMargins>` など付随パーツ

これらを `tests/read/real.test.ts` がパースして値・型・シート選択を検証する。

| ファイル | 主眼 |
|---|---|
| `employees.xlsx` | 型付き取込の主軸。文字列(日本語)・数値・日付(numFmt)・真偽 |
| `multisheet.xlsx` | 名前／index でのシート選択 |
| `edge.xlsx` | テキスト格納 ID(19桁・先頭ゼロ)・前後空白保持・空セル・浮動小数/負数 |

> openpyxl は文字列を inline（`t="inlineStr"`）で書き出すため、共有文字列
> （`sharedStrings.xml`）パスはここでは踏まない。そちらは
> `tests/read/ooxml/strings.test.ts` と `tests/read/parse.test.ts` がカバーする。

## 再生成

バイナリは commit 済みで、テスト実行に Python は不要。中身を変えるときだけ再生成する:

```sh
python3 -m venv .venv
.venv/bin/pip install openpyxl
.venv/bin/python tests/fixtures/generate.py
```

作成/更新日時・ZIP エントリ日時はすべて固定（`generate.py`）なので、再生成しても
バイト単位で同一（差分が出ない）。

## メタデータ（個人情報なし）

実 Excel は保存時に `docProps/core.xml` の `creator`/`lastModifiedBy` に OS/Office の
登録ユーザー名（場合により会社名）を埋め込むため、公開リポジトリへの commit には注意が
いる。openpyxl はそれらを書かず、`creator` は固定文字列 `openpyxl`・`lastModifiedBy` 無し。
生成時刻も上記のとおり固定済みで、個人情報や生成環境は漏れない。

[openpyxl]: https://openpyxl.readthedocs.io/
