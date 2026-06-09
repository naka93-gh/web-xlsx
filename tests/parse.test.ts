import { describe, expect, it } from 'vitest'
import { parse, parseFile } from '../src/parse'
import { buildXlsx } from './helpers/zip'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const xlsx = () =>
  buildXlsx({
    '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook><workbookPr date1904="0"/><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships>
      <Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/>
      <Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
    </Relationships>`,
    'xl/sharedStrings.xml': `<sst><si><t>名前</t></si><si><t>年齢</t></si><si><t>Alice</t></si><si><t>Bob</t></si></sst>`,
    'xl/styles.xml': `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>入社日</t></is></c></row>
      <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>30</v></c><c r="C2" s="1"><v>43831</v></c></row>
      <row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>25</v></c><c r="C3" s="1"><v>43922</v></c></row>
    </sheetData></worksheet>`,
  })

describe('parse（低レベル E2E）', () => {
  it('実 xlsx をパースして行を返す', async () => {
    const result = await parse(await xlsx())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.errors).toEqual([])
    expect(result.data).toHaveLength(2)
    expect(result.data[0]?.名前).toBe('Alice')
    expect(result.data[0]?.年齢).toBe(30)
    expect(result.data[0]?.入社日).toBeInstanceOf(Date)
    expect((result.data[0]?.入社日 as Date).getFullYear()).toBe(2020)
    expect(result.data[1]?.名前).toBe('Bob')
  })

  it('sheet オプション（名前指定）', async () => {
    const result = await parse(await xlsx(), { sheet: 'Sheet1' })
    expect(result.ok && result.data).toHaveLength(2)
  })

  it('存在しないシートは sheet-not-found', async () => {
    const result = await parse(await xlsx(), { sheet: '無い' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('sheet-not-found')
  })

  it('ZIP でないバイト列は not-zip', async () => {
    const result = await parse(new TextEncoder().encode('not a zip'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-zip')
  })
})

describe('parseFile', () => {
  it('Blob から読める', async () => {
    const bytes = await xlsx()
    const blob = new Blob([bytes])
    const result = await parseFile(blob)
    expect(result.ok && result.data[0]?.名前).toBe('Alice')
  })
})
