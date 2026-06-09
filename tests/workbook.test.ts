import { describe, expect, it } from 'vitest'
import { openWorkbook, parseRels, parseWorkbookXml, selectSheet } from '../src/workbook'
import { openZip } from '../src/zip'
import { buildXlsx } from './helpers/zip'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

describe('parseRels', () => {
  it('Relationship を取り出す', () => {
    const xml = `<Relationships>
      <Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>
      <Relationship Id="rId2" Type="${REL}/hyperlink" Target="http://x" TargetMode="External"/>
    </Relationships>`
    const rels = parseRels(xml)
    expect(rels).toHaveLength(2)
    expect(rels[0]).toEqual({
      id: 'rId1',
      type: `${REL}/officeDocument`,
      target: 'xl/workbook.xml',
    })
    expect(rels[1]?.mode).toBe('External')
  })
})

describe('parseWorkbookXml', () => {
  it('シートと date1904 を読む', () => {
    const xml = `<workbook><workbookPr date1904="1"/><sheets>
      <sheet name="A" sheetId="1" r:id="rId1"/>
      <sheet name="B" sheetId="2" r:id="rId2"/>
    </sheets></workbook>`
    const { sheets, date1904 } = parseWorkbookXml(xml)
    expect(date1904).toBe(true)
    expect(sheets).toEqual([
      { name: 'A', sheetId: 1, rid: 'rId1' },
      { name: 'B', sheetId: 2, rid: 'rId2' },
    ])
  })

  it('date1904 が無ければ false', () => {
    expect(parseWorkbookXml('<workbook><sheets/></workbook>').date1904).toBe(false)
  })
})

const files = () => ({
  '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  'xl/workbook.xml': `<workbook><workbookPr date1904="0"/><sheets>
    <sheet name="従業員" sheetId="1" r:id="rId1"/>
    <sheet name="部署" sheetId="2" r:id="rId2"/>
  </sheets></workbook>`,
  'xl/_rels/workbook.xml.rels': `<Relationships>
    <Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
    <Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/>
    <Relationship Id="rId3" Type="${REL}/styles" Target="styles.xml"/>
    <Relationship Id="rId4" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>
  </Relationships>`,
})

describe('openWorkbook', () => {
  it('シートを実ファイルパスに解決し、共有文字列/スタイルも解決', async () => {
    const wb = await openWorkbook(await openZip(await buildXlsx(files())))
    expect(wb.date1904).toBe(false)
    expect(wb.sheets).toEqual([
      { name: '従業員', sheetId: 1, path: 'xl/worksheets/sheet1.xml' },
      { name: '部署', sheetId: 2, path: 'xl/worksheets/sheet2.xml' },
    ])
    expect(wb.stylesPath).toBe('xl/styles.xml')
    expect(wb.sharedStringsPath).toBe('xl/sharedStrings.xml')
  })

  it('selectSheet: 既定は先頭・index・名前', async () => {
    const wb = await openWorkbook(await openZip(await buildXlsx(files())))
    expect(selectSheet(wb)?.name).toBe('従業員')
    expect(selectSheet(wb, 1)?.name).toBe('部署')
    expect(selectSheet(wb, '部署')?.path).toBe('xl/worksheets/sheet2.xml')
    expect(selectSheet(wb, '無い')).toBeUndefined()
  })
})
