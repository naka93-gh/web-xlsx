import { describe, expect, it } from 'vitest'
import { workbookXml } from '../../../src/write/ooxml/workbook.js'

/** workbookXml が宣言する sheet 名（name 属性）を取り出す */
function sheetName(name: string): string {
  const xml = workbookXml(name)
  return /<sheet name="(.*?)"/.exec(xml)?.[1] ?? ''
}

describe('sanitizeSheetName（workbookXml 経由）', () => {
  it('通常名はそのまま', () => {
    expect(sheetName('社員一覧')).toBe('社員一覧')
  })

  it('禁止文字 \\ / ? * [ ] : を _ に置換', () => {
    expect(sheetName('a/b\\c?d*e[f]g:h')).toBe('a_b_c_d_e_f_g_h')
  })

  it('31 文字に丸める', () => {
    expect(sheetName('x'.repeat(40))).toBe('x'.repeat(31))
  })

  it('空・空白のみは Sheet1 にフォールバック', () => {
    expect(sheetName('')).toBe('Sheet1')
    expect(sheetName('   ')).toBe('Sheet1')
  })

  it('前後空白は trim される', () => {
    expect(sheetName('  名簿  ')).toBe('名簿')
  })

  it('属性として & と " はエスケープされる', () => {
    // 禁止文字ではないので残り、属性エスケープで実体化される
    expect(sheetName('A&B"C')).toBe('A&amp;B&quot;C')
  })
})
