import { describe, expect, it } from 'vitest'
import { parse } from '../../src/read/parse.js'
import { buildXlsx } from '../helpers/zip.js'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

// 要素名に名前空間プレフィックス（既定 `x:`）を付けた xlsx を組む。
// OOXML の namespace は任意プレフィックスに束縛可能で、Excel 含む一部生成系が
// プレフィックスを出す。属性（r:id 等）はパーサが付きで参照するため触らない。
// prefix を '' にすると現行（プレフィックス無し）の対照ファイルになる
const xlsx = (p: string) =>
  buildXlsx({
    '_rels/.rels': `<${p}Relationships><${p}Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></${p}Relationships>`,
    'xl/workbook.xml': `<${p}workbook><${p}workbookPr date1904="0"/><${p}sheets><${p}sheet name="Sheet1" sheetId="1" r:id="rId1"/></${p}sheets></${p}workbook>`,
    'xl/_rels/workbook.xml.rels': `<${p}Relationships>
      <${p}Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
      <${p}Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>
      <${p}Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
    </${p}Relationships>`,
    'xl/sharedStrings.xml': `<${p}sst><${p}si><${p}t>名前</${p}t></${p}si><${p}si><${p}t>年齢</${p}t></${p}si><${p}si><${p}t>入社日</${p}t></${p}si><${p}si><${p}t>Alice</${p}t></${p}si><${p}si><${p}t>Bob</${p}t></${p}si></${p}sst>`,
    'xl/styles.xml': `<${p}styleSheet><${p}cellXfs count="2"><${p}xf numFmtId="0"/><${p}xf numFmtId="14"/></${p}cellXfs></${p}styleSheet>`,
    'xl/worksheets/sheet1.xml': `<${p}worksheet><${p}sheetData>
      <${p}row r="1"><${p}c r="A1" t="s"><${p}v>0</${p}v></${p}c><${p}c r="B1" t="s"><${p}v>1</${p}v></${p}c><${p}c r="C1" t="s"><${p}v>2</${p}v></${p}c></${p}row>
      <${p}row r="2"><${p}c r="A2" t="s"><${p}v>3</${p}v></${p}c><${p}c r="B2"><${p}v>30</${p}v></${p}c><${p}c r="C2" s="1"><${p}v>43831</${p}v></${p}c></${p}row>
      <${p}row r="3"><${p}c r="A3" t="s"><${p}v>4</${p}v></${p}c><${p}c r="B3"><${p}v>25</${p}v></${p}c><${p}c r="C3" s="1"><${p}v>43922</${p}v></${p}c></${p}row>
    </${p}sheetData></${p}worksheet>`,
  })

describe('名前空間プレフィックス（local-name 照合・サイレント欠落の防止）', () => {
  it('プレフィックス付き xlsx をプレフィックス無しと同一結果でパースする', async () => {
    const prefixed = await parse(await xlsx('x:'))
    const plain = await parse(await xlsx(''))

    expect(plain.ok).toBe(true)
    expect(prefixed.ok).toBe(true)
    if (!prefixed.ok || !plain.ok) return

    // 空配列に黙って化けず、対照と完全一致（workbook/strings/styles/sheet 全経路を通る）
    expect(prefixed.data).toEqual(plain.data)
    expect(prefixed.errors).toEqual(plain.errors)
    expect(prefixed.data).toHaveLength(2)
    expect(prefixed.data[0]?.名前).toBe('Alice')
    expect(prefixed.data[0]?.年齢).toBe(30)
    expect((prefixed.data[0]?.入社日 as Date).getFullYear()).toBe(2020)
  })

  it('プレフィックス付きでもスキーマ・日付・真偽が解決される（styles/strings 経路）', async () => {
    const result = await parse(await xlsx('x:'), { options: { header: false } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // ヘッダー行が空配列にならず矩形で返る
    expect(result.data).toHaveLength(3)
    expect(result.data[0]).toEqual(['名前', '年齢', '入社日'])
    expect(result.data[1]?.[2]).toBeInstanceOf(Date) // numFmt 14（styles 経路）で日付解決
  })
})
