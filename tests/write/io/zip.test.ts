import { describe, expect, it } from 'vitest'
import { openZip } from '../../../src/read/io/zip'
import { buildZip } from '../../../src/write/io/zip'

const enc = new TextEncoder()

describe('buildZip（→ openZip でラウンドトリップ）', () => {
  it('単一エントリを書いて読み戻せる', async () => {
    const bytes = await buildZip([{ name: 'hello.txt', data: enc.encode('こんにちは world') }])
    const zip = await openZip(bytes)
    expect(zip.has('hello.txt')).toBe(true)
    expect(await zip.readText('hello.txt')).toBe('こんにちは world')
  })

  it('複数エントリを書いて全部読み戻せる', async () => {
    const bytes = await buildZip([
      { name: 'a.txt', data: enc.encode('alpha') },
      { name: 'dir/b.xml', data: enc.encode('<r>beta</r>') },
      { name: 'c.txt', data: enc.encode('') },
    ])
    const zip = await openZip(bytes)
    expect(await zip.readText('a.txt')).toBe('alpha')
    expect(await zip.readText('dir/b.xml')).toBe('<r>beta</r>')
    expect(await zip.readText('c.txt')).toBe('')
  })

  it('圧縮で縮む大きいデータも一致する', async () => {
    const big = 'A'.repeat(10_000)
    const bytes = await buildZip([{ name: 'big.txt', data: enc.encode(big) }])
    // 繰り返しデータは deflate で元より小さくなるはず
    expect(bytes.length).toBeLessThan(10_000)
    const zip = await openZip(bytes)
    expect(await zip.readText('big.txt')).toBe(big)
  })

  it('空のエントリ集合でも壊れない（空アーカイブ）', async () => {
    const bytes = await buildZip([])
    expect(bytes.length).toBe(22) // EOCD のみ
  })
})
