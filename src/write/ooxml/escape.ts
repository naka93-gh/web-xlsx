// XML 文字列エスケープ（書き出し用）

// XML 1.0 で禁止された C0 制御文字（tab/LF/CR を除く）。残すと Excel が破損扱いするため除去する
// biome-ignore lint/suspicious/noControlCharactersInRegex: 禁止制御文字の検出・除去が目的
const ILLEGAL_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g

/** テキストノード用エスケープ（禁止制御文字を除去し、& < > と CR を実体化） */
export function escapeText(s: string): string {
  return s
    .replace(ILLEGAL_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;')
}

/** 属性値用エスケープ（テキスト用に加えて " も実体化） */
export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}
