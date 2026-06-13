// XML 文字列エスケープ（書き出し用）

// XML 1.0 で禁止された文字。残すと Excel が破損扱い（修復ダイアログ）するため除去する。
// C0 制御文字（tab/LF/CR を除く）に加え、非文字 U+FFFE / U+FFFF も対象。
// biome-ignore lint/suspicious/noControlCharactersInRegex: 禁止制御文字の検出・除去が目的
const ILLEGAL_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g

// 対になっていないサロゲート（単独の上位/下位）。正規の文字を成さず XML 1.0 違反になる。
// 有効なサロゲートペアは保持する（前後に対があるものはどちらの選択肢にも合致しない）
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

/**
 * テキストノード用エスケープ（禁止文字・不対サロゲートを除去し、& < > と CR を実体化）
 */
export function escapeText(s: string): string {
  return s
    .replace(ILLEGAL_XML, '')
    .replace(LONE_SURROGATE, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;')
}

/**
 * 属性値用エスケープ（テキスト用に加えて " も実体化）
 */
export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}
