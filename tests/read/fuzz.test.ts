// 異常系ファズ／プロパティテスト — 「壊れた入力でも parse は throw せず ParseResult を返す」を保証する。
// 種固定（seeded）なので落ちたケースは seed から再現できる。本体ガードの抜け道を機械的に掘り当てる用途。

import { describe, expect, it } from 'vitest'
import type { ParseOptions, ParseResult, Row, Schema } from '../../src/core/types'
import { parse } from '../../src/read/parse'
import { makeRng, type Rng } from '../helpers/random'
import { buildXlsx } from '../helpers/zip'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/** worksheet XML を差し替えた最小構成の xlsx を組む */
function withSheet(
  sheetXml: string,
  parts?: { workbook?: string | undefined; shared?: string | undefined },
): Promise<Uint8Array> {
  return buildXlsx({
    '_rels/.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':
      parts?.workbook ??
      `<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
    'xl/sharedStrings.xml': parts?.shared ?? `<sst><si><t>名前</t></si><si><t>Alice</t></si></sst>`,
    'xl/worksheets/sheet1.xml': sheetXml,
  })
}

/** parse が throw せず ParseResult の形を満たすことを表明（seed を添えて失敗を再現可能にする） */
async function expectResultShape(
  bytes: ArrayBuffer | Uint8Array,
  opts: ParseOptions & { schema?: Schema },
  label: string,
): Promise<void> {
  let result: ParseResult<Row>
  try {
    result = await parse(bytes, opts)
  } catch (e) {
    throw new Error(`parse が throw した [${label}]: ${e instanceof Error ? e.stack : String(e)}`)
  }
  expect(result, label).toHaveProperty('ok')
  if (result.ok) {
    expect(Array.isArray(result.data), label).toBe(true)
    expect(Array.isArray(result.errors), label).toBe(true)
  } else {
    expect(typeof result.error.code, label).toBe('string')
    expect(typeof result.error.message, label).toBe('string')
  }
}

// --- ランダム素材の生成 ---

const REFS = [
  'A1',
  'B2',
  'AA100',
  'ZZ9999',
  'XFD1048576',
  'A1048576',
  '',
  '1A',
  '@@',
  'A0',
  '-',
  'A99999999999999',
]
const TYPES = ['n', 's', 'b', 'str', 'inlineStr', 'd', 'e', 'x', '']

/** 壊れうる worksheet XML を組み立てる（未終端タグ・属性欠落・巨大参照・不正ネスト混在） */
function randomSheetXml(rng: Rng): string {
  const tags = [
    'worksheet',
    'sheetData',
    'row',
    'c',
    'v',
    'is',
    't',
    'rPh',
    'mergeCells',
    'mergeCell',
    'foo',
    '',
  ]
  const n = rng.int(0, 40)
  let out = ''
  for (let i = 0; i < n; i++) {
    const tag = rng.pick(tags)
    switch (rng.int(0, 7)) {
      case 0:
        out += `<${tag}>`
        break
      case 1:
        out += `</${tag}>`
        break
      case 2: // 属性つき（参照・型をランダムに）
        out += `<${tag} r="${rng.pick(REFS)}" t="${rng.pick(TYPES)}" s="${rng.int(-5, 99)}">`
        break
      case 3: // 自己終端
        out += `<${tag} r="${rng.pick(REFS)}"/>`
        break
      case 4: // 未終端タグ
        out += `<${tag}`
        break
      case 5: // 未終端コメント / CDATA
        out += rng.bool() ? `<!-- ${rng.string(10)}` : `<![CDATA[${rng.string(10)}`
        break
      case 6: // テキスト
        out += rng.string(12)
        break
      case 7: // 生の不等号など
        out += rng.pick(['<', '>', '&', '<<', '/>', '" ', "='"])
        break
    }
  }
  return out
}

/** ネストは正しいが中身が敵対的な worksheet（resolveCell / serialToDate / parseRef を確実に通す） */
function structuredSheetXml(rng: Rng): string {
  const VALUES = [
    '0',
    '1',
    '-1',
    '1e308',
    'NaN',
    '4500000',
    '99999999999',
    'abc',
    '',
    '2020-04-01',
    '٤٥',
    '2020-13-99',
    ' ',
  ]
  const rowCount = rng.int(0, 6)
  let body = ''
  for (let r = 0; r < rowCount; r++) {
    const useRowNum = rng.bool(0.8)
    body += useRowNum ? `<row r="${rng.pick(['1', '2', '1048576', '99999999999', '0'])}">` : '<row>'
    const cellCount = rng.int(0, 5)
    for (let c = 0; c < cellCount; c++) {
      const ref = rng.bool(0.7) ? ` r="${rng.pick(REFS)}"` : ''
      const type = rng.bool(0.8) ? ` t="${rng.pick(TYPES)}"` : ''
      const style = rng.bool(0.4) ? ` s="${rng.int(-2, 99)}"` : ''
      const inner = rng.bool(0.3)
        ? `<is><t>${rng.string(8)}</t></is>`
        : rng.bool()
          ? `<v>${rng.pick(VALUES)}</v>`
          : ''
      body += rng.bool(0.1) ? `<c${ref}${type}${style}/>` : `<c${ref}${type}${style}>${inner}</c>`
    }
    body += '</row>'
  }
  return `<worksheet><sheetData>${body}</sheetData></worksheet>`
}

/** 不正・正常入り混じりの range 文字列 */
function randomRange(rng: Rng): string {
  return rng.pick([
    'A1:D100',
    'A:D',
    '2:100',
    'D100:A1',
    '::',
    'A1:',
    ':5',
    '5:A',
    'A1:D',
    '',
    'ZZ:AA',
    '@@:##',
    '1:1',
  ])
}

/** ランダムな ParseOptions */
function randomOptions(rng: Rng): ParseOptions {
  const opts: ParseOptions = {}
  if (rng.bool(0.4)) opts.range = randomRange(rng)
  if (rng.bool(0.3)) opts.headerRow = rng.int(-2, 8)
  if (rng.bool(0.3)) opts.sheet = rng.bool() ? rng.int(-2, 4) : rng.string(6)
  if (rng.bool(0.3)) opts.skipEmptyRows = rng.bool()
  if (rng.bool(0.3)) opts.utc = rng.bool()
  return opts
}

const ITERS = 250

describe('ファズ: 完全ランダムなバイト列', () => {
  it('どんなバイト列でも throw せず ParseResult を返す', async () => {
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed)
      const bytes = rng.bytes(rng.int(0, 200))
      await expectResultShape(bytes, randomOptions(rng), `random-bytes seed=${seed}`)
    }
  })
})

describe('ファズ: 正常 xlsx のバイト破壊', () => {
  it('バイト反転・切断・ゴミ挿入をしても throw しない', async () => {
    const valid = await withSheet(
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>名前</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c></row></sheetData></worksheet>`,
    )
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed + 10_000)
      const bytes = valid.slice()
      switch (rng.int(0, 2)) {
        case 0: // バイト反転（数か所）
          for (let k = rng.int(1, 8); k > 0 && bytes.length > 0; k--) {
            const idx = rng.int(0, bytes.length - 1)
            bytes[idx] = (bytes[idx] ?? 0) ^ (1 << rng.int(0, 7))
          }
          await expectResultShape(bytes, randomOptions(rng), `flip seed=${seed}`)
          break
        case 1: // 途中で切断
          await expectResultShape(
            bytes.slice(0, rng.int(0, bytes.length)),
            randomOptions(rng),
            `truncate seed=${seed}`,
          )
          break
        case 2: // ゴミ挿入
          await expectResultShape(
            new Uint8Array([
              ...bytes.slice(0, rng.int(0, bytes.length)),
              ...rng.bytes(rng.int(1, 20)),
            ]),
            randomOptions(rng),
            `insert seed=${seed}`,
          )
          break
      }
    }
  })
})

describe('ファズ: 壊れた worksheet XML', () => {
  it('未終端タグ・属性欠落・巨大参照でも throw しない', async () => {
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed + 20_000)
      const bytes = await withSheet(randomSheetXml(rng))
      await expectResultShape(bytes, randomOptions(rng), `sheet-xml seed=${seed}`)
    }
  })
})

describe('ファズ: 構造は正しいが中身が敵対的なセル', () => {
  it('巨大参照・不正型・壊れた値・style 越境でも throw しない', async () => {
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed + 50_000)
      const bytes = await withSheet(structuredSheetXml(rng))
      await expectResultShape(bytes, randomOptions(rng), `structured seed=${seed}`)
    }
  })
})

describe('ファズ: 壊れた workbook / sharedStrings XML', () => {
  it('骨格パーツが壊れていても throw しない', async () => {
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed + 30_000)
      const bytes = await withSheet(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
        {
          workbook: rng.bool() ? randomSheetXml(rng) : undefined,
          shared: rng.bool() ? randomSheetXml(rng) : undefined,
        },
      )
      await expectResultShape(bytes, randomOptions(rng), `skeleton seed=${seed}`)
    }
  })
})

/** ヘッダー行がスキーマ列名に一致するシート（validate / coerce を確実に通すため） */
function sheetForSchema(rng: Rng, headers: string[]): string {
  const VALUES = [
    '0',
    '1',
    '-1',
    '1e308',
    'NaN',
    'abc',
    '2020-04-01',
    '2020-13-99',
    'true',
    'false',
    '٤٥',
    '',
  ]
  const headerCells = headers
    .map((h, i) => `<c r="${String.fromCharCode(65 + i)}1" t="inlineStr"><is><t>${h}</t></is></c>`)
    .join('')
  let body = `<row r="1">${headerCells}</row>`
  const dataRows = rng.int(0, 6)
  for (let r = 0; r < dataRows; r++) {
    const cells = headers
      .map((_, i) =>
        rng.bool(0.8)
          ? `<c r="${String.fromCharCode(65 + i)}${r + 2}" t="${rng.pick(['inlineStr', 'n', 'b', 'str'])}">${rng.bool() ? `<is><t>${rng.pick(VALUES)}</t></is>` : `<v>${rng.pick(VALUES)}</v>`}</c>`
          : '',
      )
      .join('')
    body += `<row r="${r + 2}">${cells}</row>`
  }
  return `<worksheet><sheetData>${body}</sheetData></worksheet>`
}

describe('ファズ: 敵対的スキーマ（throw する validate 含む）', () => {
  it('validate が throw しても parse は throw せず行エラーに落とす', async () => {
    const TYPES_COL = ['string', 'number', 'boolean', 'date'] as const
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed + 60_000)
      const headers = ['名前', '年齢', '在籍']
      const bytes = await withSheet(sheetForSchema(rng, headers))
      // 各列にランダムな型・required・throw しうる validate を割り当てる
      const schema: Schema = {}
      for (const header of headers) {
        schema[header] = {
          prop: header,
          type: rng.pick(TYPES_COL),
          required: rng.bool(0.3),
          ...(rng.bool(0.6) && {
            validate: () => {
              if (rng.bool(0.5)) throw new Error(`boom ${rng.string(4)}`)
              return rng.bool() ? 'ng' : null
            },
          }),
        }
      }
      await expectResultShape(bytes, { schema }, `schema seed=${seed}`)
    }
  })
})

describe('ファズ: 不正な range 文字列', () => {
  it('どんな range でも throw せず（不正なら invalid-range）返す', async () => {
    const valid = await withSheet(
      `<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>h</t></is></c></row></sheetData></worksheet>`,
    )
    for (let seed = 0; seed < ITERS; seed++) {
      const rng = makeRng(seed + 40_000)
      await expectResultShape(valid, { range: randomRange(rng) }, `range seed=${seed}`)
    }
  })
})
