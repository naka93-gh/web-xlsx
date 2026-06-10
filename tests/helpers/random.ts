// テスト用: seeded（種固定）の擬似乱数。失敗を再現でき CI でも決定的にするため自前実装（依存ゼロ方針）

/** mulberry32 — 32bit seed の軽量 PRNG */
export function makeRng(seed: number) {
  let s = seed >>> 0
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    /** [0,1) の実数 */
    next,
    /** [min,max] の整数（両端含む） */
    int: (min: number, max: number): number => min + Math.floor(next() * (max - min + 1)),
    /** 配列から 1 要素（空配列は undefined） */
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)] as T,
    /** 確率 p で true */
    bool: (p = 0.5): boolean => next() < p,
    /** 長さ len のランダムバイト列 */
    bytes: (len: number): Uint8Array => {
      const out = new Uint8Array(len)
      for (let i = 0; i < len; i++) out[i] = Math.floor(next() * 256)
      return out
    },
    /** 長さ 0..max のランダム文字列（ASCII 可視 + 制御 + 記号混在） */
    string: (max: number): string => {
      const len = Math.floor(next() * (max + 1))
      let out = ''
      for (let i = 0; i < len; i++) out += String.fromCharCode(Math.floor(next() * 0x80))
      return out
    },
  }
}

export type Rng = ReturnType<typeof makeRng>
