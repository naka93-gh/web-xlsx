// ワークブック構造の解決（_rels/.rels → workbook.xml → workbook.xml.rels）

import { tokenize } from '../io/xml'
import type { ZipArchive } from '../io/zip'

/** 1 シートの解決済み情報 */
export type SheetRef = {
  name: string
  sheetId: number
  /** zip 内の実ファイルパス */
  path: string
}

/** 解決済みワークブック */
export type Workbook = {
  sheets: SheetRef[]
  date1904: boolean
  sharedStringsPath?: string
  stylesPath?: string
}

/** OPC リレーションシップ */
export type Relationship = { id: string; type: string; target: string; mode?: string }

/** .rels から Relationship を取り出す */
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

/** workbook.xml からシート一覧と date1904 を取り出す */
export function parseWorkbookXml(xml: string): {
  sheets: { name: string; sheetId: number; rid: string }[]
  date1904: boolean
} {
  const sheets: { name: string; sheetId: number; rid: string }[] = []
  let date1904 = false
  for (const token of tokenize(xml)) {
    if (token.type !== 'open') continue
    if (token.name === 'workbookPr') {
      const v = token.attrs.date1904
      date1904 = v === '1' || v === 'true'
    } else if (token.name === 'sheet') {
      sheets.push({
        name: token.attrs.name ?? '',
        sheetId: Number.parseInt(token.attrs.sheetId ?? '0', 10),
        rid: token.attrs['r:id'] ?? '',
      })
    }
  }
  return { sheets, date1904 }
}

/** パスのディレクトリ部（末尾スラッシュ込み） */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}

/** baseDir を起点に Target を解決する（先頭スラッシュは package ルート起点） */
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

/** パートに対応する .rels パス（xl/workbook.xml → xl/_rels/workbook.xml.rels） */
function relsPathFor(partPath: string): string {
  const dir = dirOf(partPath)
  return `${dir}_rels/${partPath.slice(dir.length)}.rels`
}

/** Type の末尾で関係種別を判定 */
function findByType(rels: Relationship[], suffix: string): Relationship | undefined {
  return rels.find((r) => r.type.endsWith(suffix))
}

/**
 * ZIP からワークブックを解決する
 *
 * パッケージ関係 → workbook.xml → workbook の関係 をたどり、
 * シートを実ファイルパスに、共有文字列/スタイルのパスも解決する
 */
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
    sheets.push({ name: entry.name, sheetId: entry.sheetId, path: joinPath(baseDir, rel.target) })
  }

  const workbook: Workbook = { sheets, date1904 }
  const sharedStrings = findByType(wbRels, '/sharedStrings')
  if (sharedStrings) workbook.sharedStringsPath = joinPath(baseDir, sharedStrings.target)
  const styles = findByType(wbRels, '/styles')
  if (styles) workbook.stylesPath = joinPath(baseDir, styles.target)
  return workbook
}

/** オプションから対象シートを選ぶ（名前 / index / 既定は先頭） */
export function selectSheet(workbook: Workbook, sheet?: string | number): SheetRef | undefined {
  if (sheet === undefined) return workbook.sheets[0]
  if (typeof sheet === 'number') return workbook.sheets[sheet]
  return workbook.sheets.find((s) => s.name === sheet)
}
