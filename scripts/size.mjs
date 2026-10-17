import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

/** 運用 MAX 15KB / 絶対上限 20KB のうち、ゲートは MAX で張る */
const LIMIT = 15 * 1024

const ENTRIES = [
  { label: 'read  (web-xlsx)', entry: 'src/index.ts' },
  { label: 'write (web-xlsx/write)', entry: 'src/write.ts' },
]

/** 設定は package.json の build:min と揃える */
async function measure(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'esm',
    target: 'es2020',
    write: false,
  })
  const code = result.outputFiles[0].contents
  return { min: code.length, gzip: gzipSync(code).length }
}

const rows = []
for (const { label, entry } of ENTRIES) rows.push({ label, ...(await measure(entry)) })

const total = rows.reduce((sum, r) => sum + r.gzip, 0)
const fmt = (n) => `${(n / 1024).toFixed(2)} KB`

for (const r of rows) {
  console.log(
    `${r.label.padEnd(22)} min ${fmt(r.min).padStart(9)}  gzip ${fmt(r.gzip).padStart(9)}`,
  )
}
console.log(
  `合算 (read+write)${' '.repeat(19)}gzip ${fmt(total).padStart(9)}  / LIMIT ${fmt(LIMIT)}`,
)

if (total > LIMIT) {
  console.error(`\n✗ LIMIT 超過: 合算 ${fmt(total)} > ${fmt(LIMIT)}（超過 ${total - LIMIT} B）`)
  process.exit(1)
}
console.log(`\n✓ LIMIT 内（余白 ${fmt(LIMIT - total)}）`)
