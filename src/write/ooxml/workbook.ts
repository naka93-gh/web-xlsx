// パッケージ骨格の XML 生成（Content_Types / rels / workbook）

import { DECL, NS_MAIN } from './consts'
import { escapeAttr } from './escape'

/** [Content_Types].xml — 同梱パーツの種別宣言 */
export function contentTypesXml(): string {
  return `${DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\
<Default Extension="xml" ContentType="application/xml"/>\
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>\
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>\
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>\
</Types>`
}

/** _rels/.rels — ルートから workbook への関連 */
export function rootRelsXml(): string {
  return `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>\
</Relationships>`
}

/** シート名を Excel の制約（31 文字・禁止文字除去）に丸める */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, '_').trim()
  const safe = cleaned.length > 0 ? cleaned : 'Sheet1'
  return safe.length > 31 ? safe.slice(0, 31) : safe
}

/** xl/workbook.xml — 単一シートを宣言 */
export function workbookXml(sheetName: string): string {
  const name = escapeAttr(sanitizeSheetName(sheetName))
  return `${DECL}<workbook xmlns="${NS_MAIN}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\
<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>\
</workbook>`
}

/** xl/_rels/workbook.xml.rels — workbook から sheet1 / styles への関連 */
export function workbookRelsXml(): string {
  return `${DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>\
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>\
</Relationships>`
}
