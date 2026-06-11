import { describe, expect, it } from 'vitest'
import { parseStyles } from '../../../src/read/ooxml/styles.js'

// 代表的な styles.xml: cellStyleXfs(無視されるべき) と cellXfs を持つ
const XML = `<styleSheet>
  <numFmts count="3">
    <numFmt numFmtId="164" formatCode="yyyy-mm-dd"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
    <numFmt numFmtId="176" formatCode="[$-411]ge\\.m\\.d;@"/>
  </numFmts>
  <cellStyleXfs count="1"><xf numFmtId="14"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0"/>
    <xf numFmtId="14"/>
    <xf numFmtId="2"/>
    <xf numFmtId="164"/>
    <xf numFmtId="165"/>
    <xf numFmtId="176"/>
    <xf numFmtId="48"/>
  </cellXfs>
</styleSheet>`

describe('parseStyles', () => {
  const styles = parseStyles(XML)

  it('builtin の日付ID(14)は日付', () => {
    expect(styles.isDate(1)).toBe(true)
  })

  it('General(0)・0.00(2)・指数(48)は日付でない', () => {
    expect(styles.isDate(0)).toBe(false)
    expect(styles.isDate(2)).toBe(false)
    expect(styles.isDate(6)).toBe(false)
  })

  it('カスタム日付書式(yyyy-mm-dd)は日付', () => {
    expect(styles.isDate(3)).toBe(true)
  })

  it('カスタム数値書式(#,##0.00)は日付でない', () => {
    expect(styles.isDate(4)).toBe(false)
  })

  it('和暦のカスタム書式([$-411]ge.m.d)は日付', () => {
    expect(styles.isDate(5)).toBe(true)
  })

  it('cellStyleXfs の xf は cellXfs の索引に混入しない', () => {
    // index 0 は cellXfs の General であって cellStyleXfs の 14 ではない
    expect(styles.isDate(0)).toBe(false)
  })

  it('範囲外のインデックスは日付でない', () => {
    expect(styles.isDate(99)).toBe(false)
  })
})

describe('parseStyles（numFmts 無し）', () => {
  it('cellXfs だけでも builtin 判定が効く', () => {
    const styles = parseStyles('<styleSheet><cellXfs><xf numFmtId="22"/></cellXfs></styleSheet>')
    expect(styles.isDate(0)).toBe(true)
  })
})
