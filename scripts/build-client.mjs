/**
 * 构建脚本：把 src/*.js 按文件名顺序拼进一个自包含的 client.js，并把 lib/app.css 内联成 STYLES。
 *
 * 为什么不是常规打包：DSH 的客户端模块加载器只接受自包含产物，
 * 同步 require 相对路径的 chunk 会抛错，所以整份客户端必须是单个 factory。
 * 分片只是为了可读与可维护，产物仍然是一个文件。
 *
 * 用法：node .tmp/build-client.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const srcDir = join(root, 'src')
const outFile = join(root, 'lib', 'client.js')
const cssFile = join(root, 'lib', 'app.css')

const parts = readdirSync(srcDir)
  .filter((name) => name.endsWith('.js'))
  .sort()

if (parts.length === 0) throw new Error('src/ 里没有可分片的客户端源码')

const css = readFileSync(cssFile, 'utf8')
const body = parts
  .map((name) => {
    const text = readFileSync(join(srcDir, name), 'utf8').replace(/\s+$/, '')
    return `/* ===== ${name} ===== */\n${text}`
  })
  .join('\n\n')

// CSS 里出现反引号或 ${ 会破坏模板字符串，统一转义
const safeCss = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

const output = `window.__ModuleLoader__.load({
  id: 'dsh-deepseek-app',
  factory(require) {
${body}

/* ===== lib/app.css（构建时内联） ===== */
const STYLES = \`${safeCss}\`

    return { inject: INJECT, apply }
  },
})
`

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, output, 'utf8')
const lines = output.split('\n').length
console.log(`built ${outFile} (${lines} 行, ${parts.length} 片, css ${css.length} 字节)`)
