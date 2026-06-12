import { describe, expect, it, vi } from 'vitest'
import type { Cell, Schema } from '../../src/core/types.js'
import { parse, parseFile } from '../../src/read/parse.js'
import { buildXlsx } from '../helpers/zip.js'

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
    const result = await parse(await xlsx(), { options: { sheet: 'Sheet1' } })
    expect(result.ok && result.data).toHaveLength(2)
  })

  it('存在しないシートは sheet-not-found', async () => {
    const result = await parse(await xlsx(), { options: { sheet: '無い' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('sheet-not-found')
  })

  it('ZIP でないバイト列は not-zip', async () => {
    const result = await parse(new TextEncoder().encode('not a zip'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('not-zip')
  })

  it('不正な range は invalid-range（ファイル破損と区別する）', async () => {
    const result = await parse(await xlsx(), { options: { range: 'A1:D' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-range')
  })

  it('シートは宣言されているが本体 XML が欠落は invalid-xlsx', async () => {
    // worksheets/sheet1.xml を意図的に含めない（rels だけ参照が残る）
    const bytes = await buildXlsx({
      '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    })
    const result = await parse(bytes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-xlsx')
  })

  it('同名ヘッダー列がある場合は duplicate-header（後勝ち上書きで黙ってデータが消えるのを防ぐ）', async () => {
    const bytes = await buildXlsx({
      '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      // A1/B1 が同じ "名前"（Excel のコピペで起こりうる）
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>名前</t></is></c><c r="B1" t="inlineStr"><is><t>名前</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c><c r="B2" t="inlineStr"><is><t>Bob</t></is></c></row>
      </sheetData></worksheet>`,
    })
    const result = await parse(bytes)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('duplicate-header')
      expect(result.error.message).toContain('名前')
    }
  })

  it('__proto__ / constructor 列名でも行データが消えない（prototype セッター回避）', async () => {
    const bytes = await buildXlsx({
      '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      // 信頼できないアップロードに __proto__ / constructor というヘッダーが混ざるケース
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>__proto__</t></is></c><c r="B1" t="inlineStr"><is><t>constructor</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>x</t></is></c><c r="B2" t="inlineStr"><is><t>y</t></is></c></row>
      </sheetData></worksheet>`,
    })
    const result = await parse(bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.data).toHaveLength(1)
    const row = result.data[0] as Record<string, Cell>
    // own プロパティとして値が残り、空行スキップで消えない
    expect(Object.keys(row).sort()).toEqual(['__proto__', 'constructor'])
    const protoKey = '__proto__'
    const ctorKey = 'constructor'
    expect(row[protoKey]).toBe('x')
    expect(row[ctorKey]).toBe('y')
  })

  it('schema の prop が __proto__ でも結果に残る', async () => {
    const bytes = await buildXlsx({
      '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      'xl/worksheets/sheet1.xml': `<worksheet><sheetData>
        <row r="1"><c r="A1" t="inlineStr"><is><t>名前</t></is></c></row>
        <row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c></row>
      </sheetData></worksheet>`,
    })
    const schema = { 名前: { prop: '__proto__', type: 'string' } } satisfies Schema
    const result = await parse(bytes, { schema })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const row = result.data[0] as Record<string, Cell>
    const protoKey = '__proto__'
    expect(row[protoKey]).toBe('Alice')
  })

  it('ZIP は開けるが中身破損（中央ディレクトリ不正）は invalid-xlsx', async () => {
    // EOCD は見つかるが cdOffset 先に CDH シグネチャが無い ZIP を組む
    const bytes = new Uint8Array(8 + 22) // [壊れた CD 領域][EOCD]
    const view = new DataView(bytes.buffer)
    view.setUint32(8, 0x06054b50, true) // EOCD シグネチャ
    view.setUint16(8 + 10, 1, true) // 総エントリ数 = 1
    view.setUint32(8 + 16, 0, true) // cdOffset = 0（先頭はゼロ埋めで CDH 不一致）
    const result = await parse(bytes)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-xlsx')
  })

  it('limits オプションが openZip に渡り上限超過で too-large', async () => {
    // 既定上限なら通る正規 xlsx を、極小上限で弾けることで橋渡しを確認する
    const result = await parse(await xlsx(), { options: { limits: { maxTotalBytes: 1 } } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('too-large')
  })

  it('deflate-raw 非対応環境は unsupported-environment（破損 invalid-xlsx に化けない）', async () => {
    // 正規 xlsx を先に組んでから、展開器の構築だけを失敗させる
    const bytes = await xlsx()
    class Broken {
      constructor() {
        throw new TypeError("Unsupported compression format: 'deflate-raw'")
      }
    }
    vi.stubGlobal('DecompressionStream', Broken)
    try {
      const result = await parse(bytes)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('unsupported-environment')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('parseFile', () => {
  it('Blob から読める', async () => {
    const bytes = await xlsx()
    const blob = new Blob([bytes])
    const result = await parseFile(blob)
    expect(result.ok && result.data[0]?.名前).toBe('Alice')
  })

  it('読み込みに失敗したら read-failed（ファイル破損と区別する）', async () => {
    const bad = { arrayBuffer: () => Promise.reject(new Error('boom')) } as unknown as Blob
    const result = await parseFile(bad)
    expect(!result.ok && result.error.code).toBe('read-failed')
  })
})

describe('parse（header:false / 配列 of 配列）', () => {
  it('ヘッダーを解決せずヘッダー行も含めて Cell[][] で返す', async () => {
    const result = await parse(await xlsx(), { options: { header: false } })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.errors).toEqual([])
    // ヘッダー行もデータとして 3 行・幅 3 の矩形
    expect(result.data).toHaveLength(3)
    expect(result.data[0]).toEqual(['名前', '年齢', '入社日'])
    expect(result.data[1]?.[0]).toBe('Alice')
    expect(result.data[1]?.[1]).toBe(30)
    expect(result.data[1]?.[2]).toBeInstanceOf(Date)
    expect(result.data[2]?.[0]).toBe('Bob')
  })

  it('戻り値の data は Cell[][] 型に推論される', async () => {
    const result = await parse(await xlsx(), { options: { header: false } })
    if (result.ok) {
      // Cell[][] へ代入できる = Row[] ではない（ヘッダー無しの戻り型）
      const data: Cell[][] = result.data
      expect(Array.isArray(data[0])).toBe(true)
    }
  })

  it('schema との併用は型エラー（排他）', async () => {
    const schema = { 名前: { prop: 'name', type: 'string' } } satisfies Schema
    // @ts-expect-error header:false と schema は併用できない
    await parse(await xlsx(), { schema, options: { header: false } })
  })

  it('parseFile でも header:false が使える', async () => {
    const blob = new Blob([await xlsx()])
    const result = await parseFile(blob, { options: { header: false } })
    expect(result.ok && result.data[0]).toEqual(['名前', '年齢', '入社日'])
  })
})
