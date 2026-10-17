// DOMParser が Node に無いため XML トークナイザを自前で持つ

/**
 * `text` の値は実体参照をデコード済みで、空白は保持する
 * 要素名 `name` は名前空間プレフィックスを剥がした local-name、属性名（`attrs` のキー）はプレフィックス付きのまま
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

export function decodeEntities(s: string): string {
  if (s.indexOf('&') === -1) return s
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      // 0x10FFFF 超は fromCodePoint が例外を投げる
      // 0xD800–0xDFFF はデコードすると不対サロゲートになり XML 1.0 違反になる
      // どちらも変換せず元の参照のまま温存する
      if (code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole
      return String.fromCodePoint(code)
    }
    const mapped = NAMED_ENTITIES[body]
    return mapped !== undefined ? mapped : whole
  })
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

/**
 * OOXML の namespace は任意プレフィックスに束縛可能（`x:sheetData` 等）
 * 要素照合を local-name で行うため open/close 双方の name に適用する
 * 属性名（`r:id` / `xml:space` 等）は付きで参照するため剥がさない
 */
function localName(name: string): string {
  const colon = name.indexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

/**
 * 属性値内の `>` を誤検出しないようクォートを考慮する
 */
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
      attrs[attrName] = ''
      j = k
      continue
    }
    k++
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

export function* tokenize(xml: string): Generator<XmlToken> {
  const n = xml.length
  let i = 0

  while (i < n) {
    if (xml[i] !== '<') {
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

    const end = findTagEnd(xml, i + 1)
    if (end === -1) break
    let inner = xml.slice(i + 1, end)
    i = end + 1

    if (inner[0] === '/') {
      yield { type: 'close', name: localName(inner.slice(1).trim()) }
      continue
    }

    let selfClosing = false
    if (inner.endsWith('/')) {
      selfClosing = true
      inner = inner.slice(0, -1)
    }
    const { name, attrs } = parseTag(inner)
    yield { type: 'open', name: localName(name), attrs, selfClosing }
  }
}
