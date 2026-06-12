# web-xlsx ドキュメント

ブラウザ・Node に対応した TypeScript 製の xlsx read/write ライブラリ。

| import           | 用途     | 公開                  |
| ---------------- | -------- | --------------------- |
| `web-xlsx`       | 読み取り | `parse` / `parseFile` |
| `web-xlsx/write` | 書き出し | `build`               |

読み取りと書き出しは別エントリなので、読むだけなら書き出しコードはバンドルに含まれない。

- [読み取り](./read.md) — `parse` / `parseFile`、`ParseOptions`、エラー処理
- [書き出し](./write.md) — `build`、`BuildOptions`
- [スキーマ](./schema.md) — 列定義・検証の順序・型変換ルール
- [型リファレンス](./types.md) — 公開型の一覧
