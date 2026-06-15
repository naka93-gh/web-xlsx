import { describe, expect, it } from 'vitest'
import { crc32 } from '../../../src/write/io/crc32.js'

const enc = new TextEncoder()

describe('crc32', () => {
  it('空入力のとき 0 を返す', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })

  it('"123456789" の既知ベクタのとき 0xCBF43926 を返す', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926)
  })

  it('"The quick brown fox jumps over the lazy dog" のとき 0x414FA339 を返す', () => {
    expect(crc32(enc.encode('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339)
  })

  it('任意入力のとき結果が符号なし 32bit に収まる', () => {
    const crc = crc32(enc.encode('a'))
    expect(crc).toBeGreaterThanOrEqual(0)
    expect(crc).toBeLessThanOrEqual(0xffffffff)
    expect(Number.isInteger(crc)).toBe(true)
  })
})
