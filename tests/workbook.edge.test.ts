import { describe, expect, it } from 'vitest'
import { openWorkbook, selectSheet } from '../src/workbook'
import { openZip } from '../src/zip'
import { buildXlsx } from './helpers/zip'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

describe('openWorkbook エッジ', () => {
  it('officeDocument 関係が無ければ xl/workbook.xml にフォールバック', async () => {
    const wb = await openWorkbook(
      await openZip(
        await buildXlsx({
          '_rels/.rels': '<Relationships/>',
          'xl/workbook.xml':
            '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
          'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
        }),
      ),
    )
    expect(wb.sheets[0]?.path).toBe('xl/worksheets/sheet1.xml')
    expect(wb.sharedStringsPath).toBeUndefined()
    expect(wb.stylesPath).toBeUndefined()
  })

  it('workbook.xml.rels が無ければシート解決は空', async () => {
    const wb = await openWorkbook(
      await openZip(
        await buildXlsx({
          '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
          'xl/workbook.xml':
            '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
        }),
      ),
    )
    expect(wb.sheets).toEqual([])
  })

  it('External な関係のシートは除外', async () => {
    const wb = await openWorkbook(
      await openZip(
        await buildXlsx({
          '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
          'xl/workbook.xml':
            '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
          'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="x" TargetMode="External"/></Relationships>`,
        }),
      ),
    )
    expect(wb.sheets).toEqual([])
  })

  it('絶対パス Target（先頭スラッシュ）を解決', async () => {
    const wb = await openWorkbook(
      await openZip(
        await buildXlsx({
          '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="/xl/workbook.xml"/></Relationships>`,
          'xl/workbook.xml':
            '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>',
          'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="/xl/worksheets/sheet1.xml"/></Relationships>`,
        }),
      ),
    )
    expect(wb.sheets[0]?.path).toBe('xl/worksheets/sheet1.xml')
  })

  it('selectSheet: index 範囲外は undefined', () => {
    expect(selectSheet({ sheets: [], date1904: false }, 0)).toBeUndefined()
  })
})
