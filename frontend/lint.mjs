// ============================================================
// 零依赖静态检查（不引入 eslint / prettier，不新增任何 npm 依赖）
// 运行：npm run lint
// 检查项：
//   1. .vue / .js 中残留的 console.log                       （阻断）
//   2. <n-tab-pane> 误用 title 而非 tab                      （阻断）
//   3. 已废弃的 weekOrder 标识符                            （阻断）
//   4. formatMoney 之外的金额硬编码拼接                      （提示，不阻断，属可选项）
//   5. 所有相对 import 路径是否指向真实文件                  （阻断）
// 发现问题打印文件名与行号并 process.exitCode = 1；否则打印通过数量。
//
// 白名单说明：main.js 的 console.error（运行时异常 / 组件漏注册收集）与
// supabase.js 的 console.warn（未配置环境变量的启动告警）属于必要的错误处理，
// 用 console.error / console.warn 而非 console.log，故保留且不在本检查范围内。
// 若将来确有必要的 console.log，把「文件路径:关键字」登记到下方白名单即可。
// ============================================================
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const SRC = join(ROOT, 'src')

function collect(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return collect(full)
    return /\.(vue|js)$/.test(entry.name) ? [full] : []
  })
}

const files = collect(SRC)
const problems = []
const notes = []
const rel = (file) => relative(ROOT, file).replace(/\\/g, '/')

function fail(file, line, msg) {
  problems.push(`${rel(file)}:${line}  ${msg}`)
}
function note(file, line, msg) {
  notes.push(`${rel(file)}:${line}  ${msg}`)
}

// 确有必要的 console.log 白名单（文件路径:关键字），当前 src 内没有残留
const CONSOLE_LOG_WHITELIST = []

// 相对 import 的 spec 必须以 ./ 或 ../ 开头；裸包名（vue / naive-ui / echarts/* 等）不检查
const IMPORT_SPEC_RE = /(?:from\s+|import\s*\(\s*|import\s+|export\s+[^'"]*?\s+from\s+)['"](\.\.?\/[^'"]+)['"]/g
const IMPORT_EXT = ['.js', '.vue', '.css', '.ts', '.mjs', '.json']

function specExists(file, spec) {
  const base = resolve(dirname(file), spec)
  const candidates = [
    base,
    ...IMPORT_EXT.map((ext) => base + ext),
    join(base, 'index.js'),
    join(base, 'index.vue')
  ]
  return candidates.some((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile()
    } catch {
      return false
    }
  })
}

let checkedImports = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  lines.forEach((lineText, index) => {
    const line = index + 1
    const fileLine = `${rel(file)}:${line}`

    // 1. console.log 残留
    if (/\bconsole\.log\b/.test(lineText)) {
      const whitelisted = CONSOLE_LOG_WHITELIST.some((w) => fileLine.includes(w))
      if (!whitelisted) {
        fail(file, line, '残留 console.log（调试输出应删除；必要错误处理请用 console.error / console.warn）')
      }
    }

    // 2. <n-tab-pane> 误用 title
    for (const m of lineText.matchAll(/<n-tab-pane[^>]*>/g)) {
      if (/\btitle=/.test(m[0]) && !/\btab=/.test(m[0])) {
        fail(file, line, '<n-tab-pane> 应使用 tab 属性，而非组件库不认的 title')
      }
    }

    // 3. 已废弃 weekOrder
    if (/\bweekOrder\b/.test(lineText)) {
      fail(file, line, '已废弃标识符 weekOrder（星期表头不得再按错位的下标取）')
    }

    // 4. 金额硬编码拼接（提示级）：模板字符串里把变量直接拼到「元」前且未用 formatMoney
    //    labels.js 是 formatMoney 自身的实现文件，跳过以免自指误报
    if (!rel(file).endsWith('src/lib/labels.js') &&
        /\$\{[^}]*\}\s*元/.test(lineText) && !/formatMoney/.test(lineText)) {
      note(file, line, '疑似金额硬编码拼接，建议改用 formatMoney() 统一格式化')
    }

    // 5. 相对 import 路径是否指向真实文件
    if (/\b(import|export)\b/.test(lineText)) {
      for (const m of lineText.matchAll(IMPORT_SPEC_RE)) {
        checkedImports++
        if (!specExists(file, m[1])) {
          fail(file, line, `相对 import 指向不存在的文件：${m[1]}`)
        }
      }
    }
  })
}

console.log(`静态检查：扫描 ${files.length} 个 .vue / .js 文件，检查 ${checkedImports} 条相对 import`)
for (const item of notes) console.log(`  [提示] ${item}`)

if (problems.length) {
  for (const item of problems) console.error(`  [失败] ${item}`)
  console.log(`结果：失败，${problems.length} 处阻断问题（${notes.length} 处提示）。规则：4 项阻断 + 1 项提示。`)
  process.exitCode = 1
} else {
  console.log(`结果：通过。5 类规则均无阻断问题；4 项阻断规则检查了 ${files.length} 个文件 / ${checkedImports} 条相对 import，${notes.length} 处提示。`)
}
