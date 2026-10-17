import { tokenize } from '../io/xml.js'
import type { ZipArchive } from '../io/zip.js'

export type SheetRef = {
  name: string
  path: string
}

export type Workbook = {
  sheets: SheetRef[]
  date1904: boolean
  sharedStringsPath?: string
  stylesPath?: string
}

export type Relationship = { id: string; type: string; target: string; mode?: string }

export function parseRels(xml: string): Relationship[] {
  const rels: Relationship[] = []
  for (const token of tokenize(xml)) {
    if (token.type === 'open' && token.name === 'Relationship') {
      const rel: Relationship = {
        id: token.attrs.Id ?? '',
        type: token.attrs.Type ?? '',
        target: token.attrs.Target ?? '',
      }
      if (token.attrs.TargetMode !== undefined) rel.mode = token.attrs.TargetMode
      rels.push(rel)
    }
  }
  return rels
}

export function parseWorkbookXml(xml: string): {
  sheets: { name: string; rid: string }[]
  date1904: boolean
} {
  const sheets: { name: string; rid: string }[] = []
  let date1904 = false
  for (const token of tokenize(xml)) {
    if (token.type !== 'open') continue
    if (token.name === 'workbookPr') {
      const v = token.attrs.date1904
      date1904 = v === '1' || v === 'true'
    } else if (token.name === 'sheet') {
      sheets.push({
        name: token.attrs.name ?? '',
        rid: token.attrs['r:id'] ?? '',
      })
    }
  }
  return { sheets, date1904 }
}

function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}

/**
 * 先頭スラッシュの Target は package ルート起点
 */
function joinPath(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const out: string[] = []
  for (const part of (baseDir + target).split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/**
 * OPC の規約で xl/workbook.xml の rels は xl/_rels/workbook.xml.rels に置かれる
 */
function relsPathFor(partPath: string): string {
  const dir = dirOf(partPath)
  return `${dir}_rels/${partPath.slice(dir.length)}.rels`
}

function findByType(rels: Relationship[], suffix: string): Relationship | undefined {
  return rels.find((r) => r.type.endsWith(suffix))
}

export async function openWorkbook(zip: ZipArchive): Promise<Workbook> {
  const rootRels = parseRels(await zip.readText('_rels/.rels'))
  const office = findByType(rootRels, '/officeDocument')
  const workbookPath = office ? joinPath('', office.target) : 'xl/workbook.xml'

  const { sheets: entries, date1904 } = parseWorkbookXml(await zip.readText(workbookPath))

  const baseDir = dirOf(workbookPath)
  const relsPath = relsPathFor(workbookPath)
  const wbRels = zip.has(relsPath) ? parseRels(await zip.readText(relsPath)) : []
  const relById = new Map(wbRels.map((r) => [r.id, r]))

  const sheets: SheetRef[] = []
  for (const entry of entries) {
    const rel = relById.get(entry.rid)
    if (!rel || rel.mode === 'External') continue
    sheets.push({ name: entry.name, path: joinPath(baseDir, rel.target) })
  }

  const workbook: Workbook = { sheets, date1904 }
  const sharedStrings = findByType(wbRels, '/sharedStrings')
  if (sharedStrings) workbook.sharedStringsPath = joinPath(baseDir, sharedStrings.target)
  const styles = findByType(wbRels, '/styles')
  if (styles) workbook.stylesPath = joinPath(baseDir, styles.target)
  return workbook
}

export function selectSheet(workbook: Workbook, sheet?: string | number): SheetRef | undefined {
  if (sheet === undefined) return workbook.sheets[0]
  if (typeof sheet === 'number') return workbook.sheets[sheet]
  return workbook.sheets.find((s) => s.name === sheet)
}
