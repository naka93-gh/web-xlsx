import { DECL, NS_MAIN } from './consts.js'

/**
 * numFmt 164 = yyyy-mm-dd
 */
export const DATE_STYLE = 1

export const HEADER_STYLE = 2

/**
 * cellXfs の並びを DATE_STYLE / HEADER_STYLE と一致させる（0=既定 / 1=日付 / 2=ヘッダー太字）
 */
export function stylesXml(): string {
  return `${DECL}<styleSheet xmlns="${NS_MAIN}">\
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>\
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>\
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>\
<borders count="1"><border/></borders>\
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>\
<cellXfs count="3">\
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>\
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>\
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>\
</cellXfs>\
</styleSheet>`
}
