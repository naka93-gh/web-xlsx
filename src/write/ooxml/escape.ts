// XML 文字列エスケープ（書き出し用）

/** テキストノード用エスケープ（& < > と、念のため CR を実体化） */
export function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;')
}

/** 属性値用エスケープ（テキスト用に加えて " も実体化） */
export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;')
}
