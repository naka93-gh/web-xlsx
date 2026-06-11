import { describe, expect, it } from 'vitest'
import { parseStyles } from '../../../src/read/ooxml/styles.js'

const styleSheet = (xfs: string, numFmts = '') =>
  `<styleSheet>${numFmts}<cellXfs>${xfs}</cellXfs></styleSheet>`

describe('parseStyles エッジ', () => {
  it('装飾(_ , *)・クォート付きの日付書式を判定', () => {
    const numFmts = `<numFmts>
      <numFmt numFmtId="164" formatCode="yyyy&quot;年&quot;m&quot;月&quot;d&quot;日&quot;"/>
      <numFmt numFmtId="165" formatCode="_(* #,##0_)"/>
    </numFmts>`
    const styles = parseStyles(styleSheet('<xf numFmtId="164"/><xf numFmtId="165"/>', numFmts))
    expect(styles.isDate(0)).toBe(true) // 日付（クォート内リテラルを除いても y/m/d が残る）
    expect(styles.isDate(1)).toBe(false) // 数値書式（装飾を除くと y/m/d/h/s 無し）
  })

  it('numFmtId 未指定の xf は General 扱い（日付でない）', () => {
    const styles = parseStyles(styleSheet('<xf/>'))
    expect(styles.isDate(0)).toBe(false)
  })

  it('未終端の角括弧でも壊れない', () => {
    const numFmts = '<numFmts><numFmt numFmtId="166" formatCode="[未終端"/></numFmts>'
    const styles = parseStyles(styleSheet('<xf numFmtId="166"/>', numFmts))
    expect(styles.isDate(0)).toBe(false)
  })
})
