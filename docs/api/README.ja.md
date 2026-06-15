# web-xlsx ドキュメント

> 📖 English version (AI-translated): [README.md](./README.md)

ブラウザ・Node に対応した TypeScript 製の xlsx read/write ライブラリ。

| import           | 用途     | 公開                  |
| ---------------- | -------- | --------------------- |
| `web-xlsx`       | 読み取り | `parse` / `parseFile` |
| `web-xlsx/write` | 書き出し | `build`               |

読み取りと書き出しは別エントリなので、読むだけなら書き出しコードはバンドルに含まれない。

- [読み取り](./read.ja.md) — `parse` / `parseFile`、`ParseOptions`、エラー処理
- [書き出し](./write.ja.md) — `build`、`BuildOptions`
- [スキーマ](./schema.ja.md) — 列定義・検証の順序・型変換ルール
