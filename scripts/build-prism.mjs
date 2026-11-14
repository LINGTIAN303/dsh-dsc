/**
 * 把 prismjs 裁剪成单个自包含分片 src/45-prism.js。
 *
 * 为什么需要这一步：本插件的客户端必须是单个自包含 factory（DSH 的模块加载器
 * 不接受 require 相对路径的 chunk），而 prismjs 是「核心 + 每语言一个组件文件」的结构。
 * 这里在构建期把核心与选定语言拼起来，产物仍是一段可直接内联的普通脚本。
 *
 * 为什么是这些语言：对齐官方 chat.deepseek.com 实际加载的那一套
 * （plaintext / markup / css / clike / javascript / json + 若干常用扩展），
 * 不是 Prism 全量。语言越多产物越大，而对话里出现的代码极少数才超出这个范围。
 *
 * 用法：node scripts/build-prism.mjs（改动语言列表或升级 prismjs 后重跑）
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const prismDir = join(root, 'node_modules', 'prismjs')
const outFile = join(root, 'src', '45-prism.js')

/*
 * 顺序有意义：clike 是 javascript 的依赖，javascript 是 typescript/jsx 的依赖，
 * markup 要先于其扩展。Prism 组件文件自身不写依赖声明，全靠加载顺序。
 *
 * 只留对话里真会出现的语言。每多一种就多几 KB，全塞进来会让 client.js 明显变大，
 * 而冷门语言退化成不高亮是可接受的降级（代码本身照样看得清）。
 */
const COMPONENTS = [
  'prism-markup', // html / xml / svg
  'prism-css',
  'prism-clike',
  'prism-javascript',
  'prism-typescript',
  'prism-json',
  'prism-python',
  'prism-rust',
  'prism-go',
  'prism-java',
  'prism-bash',
  'prism-sql',
  'prism-yaml',
  'prism-markdown',
]

const core = join(prismDir, 'prism.js')
if (!existsSync(core)) throw new Error('找不到 node_modules/prismjs，先跑 pnpm add prismjs')

const read = (file) => readFileSync(file, 'utf8').replace(/\s+$/, '')

/*
 * prismjs 的核心 prism.js 是未压缩源码（58 KB），而 components/*.min.js 已经是压缩版。
 * 两者混拼会让产物白背一份可压缩的几万字节，所以核心在构建期过一次 terser。
 * 用 pnpm dlx 现场取（不写进 dependencies）：这只是构建期工具，
 * 运行时不需要，写进依赖反而让安装体积白增。
 */
function minifyWithTerser(source) {
  // Windows 上 pnpm 是 .cmd，node 无法直接 spawn，需要 shell；
  // 参数是固定字面量、没有外部输入，拼接风险不存在。
  // 非 Windows 走 shell:false，避免 node 的 DEP0190 警告。
  const isWin = process.platform === 'win32'
  return execFileSync(isWin ? 'pnpm.cmd' : 'pnpm', ['dlx', 'terser', '--compress', '--mangle'], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    shell: isWin,
  })
}

const chunks = [minifyWithTerser(read(core))]
const loaded = []
for (const name of COMPONENTS) {
  const file = join(prismDir, 'components', `${name}.min.js`)
  if (!existsSync(file)) {
    // 缺失就跳过而不是报错：Prism 的语言集合随版本变动，
    // 少一种语言只是少了那种高亮，不该阻断整个构建
    console.warn(`  跳过（不存在）：${name}`)
    continue
  }
  // .min.js 是浏览器直接可用的 IIFE，靠全局 Prism 续挂语言
  chunks.push(read(file))
  loaded.push(name.replace(/^prism-/, ''))
}

/*
 * diff 语言需要 Prism 的 diff 高亮辅助（components/prism-diff.min.js 自带），
 * 但它的「新增/删除行」效果依赖 markup 已注册，这里把顺序保证写进产物注释，
 * 方便以后排查「为什么 diff 只有半截高亮」。
 */
const header = `/*
 * Prism 语法高亮（构建产物，不要手改）。
 *
 * 由 scripts/build-prism.mjs 从 node_modules/prismjs 生成：
 * 核心 + ${loaded.length} 个语言组件（${loaded.join(', ')}）。
 * 与官方 chat.deepseek.com 用的是同一套 Prism、同一批 token 类名
 * （punctuation / property / operator / string / boolean …），
 * 因此暗色配色可以直接照抄官方取值，见 lib/app.css 的 .ds-md-code-block .token 段。
 *
 * 重新生成：node scripts/build-prism.mjs
 */

`

writeFileSync(outFile, header + chunks.join('\n\n') + '\n', 'utf8')
const size = Buffer.byteLength(header + chunks.join('\n\n'))
console.log(`built ${outFile} (${loaded.length} 语言, ${(size / 1024).toFixed(1)} KB)`)
