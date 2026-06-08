// セルスタイル（xl/styles.xml）の解析 — セルが日付書式かを判定する

import { tokenize } from './xml'

/** 開いたスタイル表 */
export interface Styles {
  /** セルの s 属性（cellXfs のインデックス）が日付書式を指すか */
  isDate(styleIndex: number): boolean
}

/**
 * 日付/時刻の builtin numFmtId
 *
 * 14–22 は欧文の日時、27–36・50–58 は東アジア（和暦など）の日時
 * 45–47 は経過時間。37–44(通貨/数値) や 48(指数)・49(文字) は含めない
 */
const BUILTIN_DATE_IDS = new Set<number>([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51,
  52, 53, 54, 55, 56, 57, 58,
])

/** 書式コードからリテラル/装飾を除去する（クォート・エスケープ・[...]・_x・*x） */
function stripFormat(code: string): string {
  let out = ''
  let i = 0
  while (i < code.length) {
    const ch = code[i]
    if (ch === '"') {
      const end = code.indexOf('"', i + 1)
      i = end === -1 ? code.length : end + 1
    } else if (ch === '\\' || ch === '_' || ch === '*') {
      i += 2 // 次の1文字はリテラル/装飾なので飛ばす
    } else if (ch === '[') {
      const end = code.indexOf(']', i + 1)
      i = end === -1 ? code.length : end + 1
    } else {
      out += ch
      i++
    }
  }
  return out
}

/** カスタム書式コードが日付/時刻か（y/m/d/h/s トークンを含むか） */
function isDateFormatCode(code: string): boolean {
  return /[ymdhs]/.test(stripFormat(code).toLowerCase())
}

/**
 * styles.xml を解析し、スタイルインデックスから日付判定できる表を返す
 */
export function parseStyles(xml: string): Styles {
  const customCodes = new Map<number, string>()
  const cellXfNumFmtIds: number[] = []

  let inNumFmts = false
  let inCellXfs = false

  for (const token of tokenize(xml)) {
    if (token.type === 'open') {
      if (token.name === 'numFmts') {
        if (!token.selfClosing) inNumFmts = true
      } else if (token.name === 'cellXfs') {
        if (!token.selfClosing) inCellXfs = true
      } else if (token.name === 'numFmt' && inNumFmts) {
        const id = Number.parseInt(token.attrs.numFmtId ?? '', 10)
        if (Number.isFinite(id)) customCodes.set(id, token.attrs.formatCode ?? '')
      } else if (token.name === 'xf' && inCellXfs) {
        const raw = token.attrs.numFmtId
        cellXfNumFmtIds.push(raw !== undefined ? Number.parseInt(raw, 10) : 0)
      }
    } else if (token.type === 'close') {
      if (token.name === 'numFmts') inNumFmts = false
      else if (token.name === 'cellXfs') inCellXfs = false
    }
  }

  const isDateNumFmt = (numFmtId: number): boolean => {
    const code = customCodes.get(numFmtId)
    return code !== undefined ? isDateFormatCode(code) : BUILTIN_DATE_IDS.has(numFmtId)
  }

  const dateFlags = cellXfNumFmtIds.map(isDateNumFmt)
  return { isDate: (styleIndex) => dateFlags[styleIndex] ?? false }
}
