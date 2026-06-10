# Changelog

## 0.2.0

日付の TZ 解釈オプションと堅牢性の強化。

- 日付の `utc` オプションを追加（`parse` / `build`）。既定はローカル壁時計で 0.1.0 と互換、`true` で UTC 固定。読み書きで揃えれば往復一致する
- スキーマの `validate` が例外を投げても `parse` を止めず、その行を `errors` に落とすようにした
- 異常系のファズ／プロパティテストを追加し、壊れた入力でも `parse` が throw しないことを保証
- CI を Node 20.19 / 22 / 24 マトリクス化し、バンドルサイズ上限（gzip 10KB）を CI で強制

## 0.1.0

初回リリース。xlsx を型付きスキーマで読み書きする、依存ゼロ・極小ライブラリ。

- `parse` / `parseFile` で xlsx をネイティブ型（string / number / boolean / Date）の行として読む
- スキーマで列を検証・型付けし、`InferRow` で行型を推論。検証に落ちた行は `errors` に分離
- `sheet` / `headerRow` / `range` / `skipEmptyRows` オプション、ZIP 爆弾対策の `limits`
- 失敗は例外でなく Result 型（`ParseResult`）で返す
- `web-xlsx/write` の `build` で行データを xlsx バイト列に書き出す（スキーマ共用・既定スタイル付き）
- 読み（`.`）と書き（`./write`）をサブパス分割。Web 標準の `CompressionStream` / `DecompressionStream` を利用
