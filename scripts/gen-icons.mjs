/**
 * 从官方 chat-demo 的 icons.tsx 抽取指定图标，把 JSX 转成 h() 调用，生成 src/50-icons.js。
 *
 * 做法：先把每个 <path .../> 单独抽出来，再拼成
 *   h('svg', {...}, h('path', {...}), h('path', {...}))
 * 官方图标里只有 <svg> 与若干 <path>，这个简化足够且不会产生歧义。
 *
 * 用法：node .tmp/gen-icons.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const source = readFileSync(join(here, '..', '.tmp', 'chat-demo'), 'src', 'components', 'base', 'icons.tsx'), 'utf8')

const WANTED = [
  'IconSearchOutline16',
  'IconSearchWarningOutline16',
  'IconBrowseOutline16',
  'IconBrowseWarningOutline16',
  'IconThinkOutline16',
  'IconChevronDownOutline14',
  'IconChevronRightOutline14',
  'IconCheckedOutline14',
  'IconCloseFill14',
  'IconCloseOutline16',
  'IconLinkOutline16',
  'IconRightUpOutline14',
  'IconCopyOutline16',
  'IconCheckOutline16',
  'IconSendOutline16',
  'IconStopFill16',
  'IconRefreshOutline16',
  'IconEditOutline16',
  'IconEllipsisOutline16',
  'IconTrashOutline16',
  'IconMicOutline16',
  'IconMicFill16',
  'IconPaperclipOutline16',
  'IconNewChatOutline20',
  'IconSettingsOutline16',
  'IconPlayMediaOutline16',
  'IconWarningOutline16',
  'IconPanelLeftOutline16',
]

/** 属性串转对象字面量；布尔简写按 true */
function attrsToObject(attrs) {
  const props = []
  const re = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|\{([^}]*)\}))?/g
  let match
  while ((match = re.exec(attrs)) !== null) {
    const key = match[1]
    const literal = match[2]
    const expression = match[3]
    const propName = /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
    if (expression !== undefined) props.push(`${propName}: ${expression}`)
    else if (literal !== undefined) props.push(`${propName}: ${JSON.stringify(literal)}`)
    else props.push(`${propName}: true`)
  }
  return `{ ${props.join(', ')} }`
}

const results = []
for (const name of WANTED) {
  const marker = `export const ${name} = () => (`
  const start = source.indexOf(marker)
  if (start < 0) {
    results.push(`const ${name} = () => null /* 官方源里没有这个图标 */`)
    continue
  }
  const bodyStart = start + marker.length
  const end = source.indexOf('\n)', bodyStart)
  const jsx = source.slice(bodyStart, end)

  // svg 开标签
  const svgOpen = /<svg([^>]*)>/.exec(jsx)
  if (svgOpen === null) {
    results.push(`const ${name} = () => null /* 解析失败 */`)
    continue
  }
  const svgProps = attrsToObject(svgOpen[1])

  // 全部自闭合子元素（官方图标只有 path）
  const children = []
  const childRe = /<(\w+)([^>]*?)\/>/g
  let child
  while ((child = childRe.exec(jsx)) !== null) {
    children.push(`h(${JSON.stringify(child[1])}, ${attrsToObject(child[2])})`)
  }
  // 非自闭合的子元素（如有）先按同样的属性转换，内容留空
  const pairedRe = /<(\w+)([^>]*?)>\s*<\/\1>/g
  while ((child = pairedRe.exec(jsx)) !== null) {
    children.push(`h(${JSON.stringify(child[1])}, ${attrsToObject(child[2])})`)
  }

  results.push(
    `/** ${name}：路径来自 DeepSeek 官方 chat-demo */\nconst ${name} = () => h('svg', ${svgProps}${children.map((item) => `,\n  ${item}`).join('')})`,
  )
}

const output = `${results.join('\n\n')}\n`
writeFileSync(join(root, 'src', '50-icons.js'), output, 'utf8')
const empty = (output.match(/\(\) => null/g) ?? []).length
console.log(`wrote src/50-icons.js — ${WANTED.length} 个图标，缺失 ${empty} 个`)
