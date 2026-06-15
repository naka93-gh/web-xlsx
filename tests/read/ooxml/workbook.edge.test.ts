import { describe, expect, it } from 'vitest'
import { openZip } from '../../../src/read/io/zip.js'
import { openWorkbook, selectSheet } from '../../../src/read/ooxml/workbook.js'
import { buildXlsx } from '../../helpers/zip.js'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

describe('openWorkbook エッジ', () => {
  it('officeDocument 関係が無いとき xl/workbook.xml にフォールバックする', async () => {
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

  it('workbook.xml.rels が無いときシート解決は空になる', async () => {
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

  it('External な関係のシートを除外する', async () => {
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

  it('絶対パス Target（先頭スラッシュ）を解決する', async () => {
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

  it('selectSheet: index 範囲外のとき undefined を返す', () => {
    expect(selectSheet({ sheets: [], date1904: false }, 0)).toBeUndefined()
  })
})
