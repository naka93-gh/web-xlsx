// OOXML 用の最小 XML トークナイザ（DOMParser が Node に無いため自前で持つ）

/**
 * XML トークン
 *
 * - `open` … 開始タグ（`selfClosing` なら自己終了タグ）
 * - `text` … 要素間のテキスト（実体参照はデコード済み・空白は保持）
 * - `close` … 終了タグ
 */
export type XmlToken =
  | { type: 'open'; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: 'text'; value: string }
  | { type: 'close'; name: string }

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

/**
 * 実体参照をデコードする（定義済み5種＋数値参照 `&#nnn;` / `&#xhh;`）
 */
export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      // Unicode 範囲外（0x10FFFF 超）は fromCodePoint が例外を投げるので元のまま温存
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    const mapped = NAMED_ENTITIES[body]
    return mapped !== undefined ? mapped : whole
  })
}

/** 空白文字か */
function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

/** start 位置のタグ終端 `>` をクォートを考慮して探す（属性値内の `>` を誤検出しない） */
function findTagEnd(xml: string, start: number): number {
  let quote = ''
  for (let k = start; k < xml.length; k++) {
    const ch = xml[k]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return k
    }
  }
  return -1
}

/** タグ内部文字列（`<` `>` を除いた中身）から要素名と属性を取り出す */
function parseTag(inner: string): { name: string; attrs: Record<string, string> } {
  const len = inner.length
  let j = 0
  while (j < len && !isSpace(inner[j] as string)) j++
  const name = inner.slice(0, j)
  const attrs: Record<string, string> = {}

  while (j < len) {
    while (j < len && isSpace(inner[j] as string)) j++
    if (j >= len) break

    let k = j
    while (k < len && inner[k] !== '=' && !isSpace(inner[k] as string)) k++
    const attrName = inner.slice(j, k)

    while (k < len && isSpace(inner[k] as string)) k++
    if (inner[k] !== '=') {
      // 値の無い属性（OOXML ではほぼ出ない）
      attrs[attrName] = ''
      j = k
      continue
    }
    k++ // '=' を飛ばす
    while (k < len && isSpace(inner[k] as string)) k++

    const quote = inner[k]
    let value = ''
    if (quote === '"' || quote === "'") {
      const close = inner.indexOf(quote, k + 1)
      const endAt = close === -1 ? len : close
      value = inner.slice(k + 1, endAt)
      k = close === -1 ? len : close + 1
    } else {
      let m = k
      while (m < len && !isSpace(inner[m] as string)) m++
      value = inner.slice(k, m)
      k = m
    }
    attrs[attrName] = decodeEntities(value)
    j = k
  }

  return { name, attrs }
}

/**
 * XML 文字列をトークン列に分解する
 *
 * XML 宣言・コメント・処理命令・DOCTYPE は読み飛ばす
 * CDATA はそのままテキストとして扱う
 */
export function* tokenize(xml: string): Generator<XmlToken> {
  const n = xml.length
  let i = 0

  while (i < n) {
    if (xml[i] !== '<') {
      // テキスト（次の '<' まで）
      const next = xml.indexOf('<', i)
      const end = next === -1 ? n : next
      const raw = xml.slice(i, end)
      i = end
      if (raw.length > 0) yield { type: 'text', value: decodeEntities(raw) }
      continue
    }

    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4)
      i = end === -1 ? n : end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9)
      const value = xml.slice(i + 9, end === -1 ? n : end)
      i = end === -1 ? n : end + 3
      if (value.length > 0) yield { type: 'text', value }
      continue
    }
    if (xml.startsWith('<?', i)) {
      const end = xml.indexOf('?>', i + 2)
      i = end === -1 ? n : end + 2
      continue
    }
    if (xml.startsWith('<!', i)) {
      const end = findTagEnd(xml, i + 2)
      i = end === -1 ? n : end + 1
      continue
    }

    // 要素（開始 or 終了）
    const end = findTagEnd(xml, i + 1)
    if (end === -1) break
    let inner = xml.slice(i + 1, end)
    i = end + 1

    if (inner[0] === '/') {
      yield { type: 'close', name: inner.slice(1).trim() }
      continue
    }

    let selfClosing = false
    if (inner.endsWith('/')) {
      selfClosing = true
      inner = inner.slice(0, -1)
    }
    const { name, attrs } = parseTag(inner)
    yield { type: 'open', name, attrs, selfClosing }
  }
}
