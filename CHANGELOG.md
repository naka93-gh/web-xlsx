# Changelog

このプロジェクトの変更点を記録する。形式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、[セマンティックバージョニング](https://semver.org/lang/ja/)を採用する。

## [Unreleased]

## [0.1.0] - 2026-06-10

初回リリース。

### 読み取り

- `parse` / `parseFile` で xlsx をネイティブ型（string / number / boolean / Date）の行として読む
- スキーマを渡すと列を検証・型付けし、`InferRow` で行型を推論。検証に落ちた行は `errors` に分離
- `sheet` / `headerRow` / `range`（矩形・列のみ・行のみ）/ `skipEmptyRows` オプション
- ZIP 解凍上限（`limits`）で ZIP 爆弾を防止
- 同名ヘッダーは `duplicate-header` で明示拒否
- 失敗は例外でなく Result 型（`ParseResult`）で返す

### 書き出し

- `web-xlsx/write` の `build` で行データを xlsx バイト列（Uint8Array）に書き出す
- 読み取りに使ったスキーマをそのまま渡せる
- ヘッダー太字・先頭行固定・列幅自動のスタイルを既定で付与（`style: false` で無効化）

### その他

- 依存ゼロ。ブラウザの `CompressionStream` / `DecompressionStream` を利用
- 読み（`.`）と書き（`./write`）をサブパス分割し、読むだけならバンドルに書き出しを含めない

[Unreleased]: https://github.com/naka93-gh/web-xlsx/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/naka93-gh/web-xlsx/releases/tag/v0.1.0
