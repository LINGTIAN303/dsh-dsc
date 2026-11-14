/**
 * 自带的 Markdown 渲染。
 * 平台的共享模块表里没有 marked / remark，插件 bundle 又不能同步 require 相对 chunk，
 * 所以这里只实现对话里真实会出现的语法：标题、段落、列表、引用、代码块、行内代码、
 * 强调、链接、分割线、表格，以及服务端插入的 [citation:N] 角标。
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (char) => ESCAPES[char])

/** 行内：先保护行内代码，再处理强调与链接，最后恢复代码 */
function renderInline(text, options) {
  const codes = []
  let out = String(text).replace(/`([^`\n]+)`/g, (match, code) => {
    codes.push(`<code class="ds-md-code">${escapeHtml(code)}</code>`)
    return `\u0000${codes.length - 1}\u0000`
  })

  out = escapeHtml(out)

  // 引用角标：服务端在文本块末尾插入 [citation:N]
  if (options?.citations) {
    out = out.replace(/\[citation:(\d+)\]/g, (match, index) => {
      const source = options.citations[Number(index)]
      if (source === undefined) return ''
      return `<button type="button" class="ds-md-citation" data-citation="${index}">${index}</button>`
    })
  }

  // 图片与链接；链接交给宿主打开，不在这里直接跳转
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (match, alt, src) => {
    if (!/^https?:/i.test(src)) return match
    return `<img class="ds-md-image" src="${src}" alt="${alt}" loading="lazy" />`
  })
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    if (!/^(https?:|mailto:)/i.test(href)) return match
    const title = options?.disableLink ? '' : ` target="_blank" rel="noreferrer"`
    return `<a class="ds-md-link" href="${href}"${title}>${label}</a>`
  })
  // 裸链接
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)）]+)/g, (match, prefix, href) => {
    if (options?.disableLink) return match
    return `${prefix}<a class="ds-md-link" href="${href}" target="_blank" rel="noreferrer">${href}</a>`
  })

  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')

  return out.replace(/\u0000(\d+)\u0000/g, (match, index) => codes[Number(index)])
}

/** 表格：| a | b | 与分隔行 | --- | --- | */
function isTableDivider(line) {
  return /^\s*\|?[\s:-]*-[\s|:-]*\|?\s*$/.test(line) && line.includes('-')
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim())
  const header = cells(rows[0])
  const body = rows.slice(2).map(cells)
  const head = header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')
  const rest = body
    .map((row) => `<tr>${header.map((_, index) => `<td>${renderInline(row[index] ?? '')}</td>`).join('')}</tr>`)
    .join('')
  return `<div class="ds-md-table-wrap"><table class="ds-md-table"><thead><tr>${head}</tr></thead><tbody>${rest}</tbody></table></div>`
}

/** 代码块：保留原文，标注语言 */
/**
 * 代码块：语言名在左，复制 / 下载在右。
 *
 * 复制与下载按钮走 data-* 属性 + 事件委托（见 Markdown 组件），
 * 因为这里是字符串拼 HTML，不能挂 React 事件。
 * 代码正文用 <code> 包住，复制时直接取它的 textContent，拿到的就是原文（已解码实体）。
 *
 * 结构对齐官方 .md-code-block：外层圆角容器 + 独立 banner（无边框），
 * banner 内左侧语言名、右侧「复制 / 下载」两枚胶囊按钮（图标 + 文字）。
 *
 * 高亮用 Prism（见 src/45-prism.js）：官方 chat.deepseek.com 用的就是它，
 * token 类名完全一致（punctuation / property / operator / string / boolean …），
 * 所以配色能直接照抄官方取值。
 * 没有 Prism 或语言不认识时退回纯文本——高亮是增强，不该让代码块渲染失败。
 */
function renderCodeBlock(language, code) {
  const lang = language.trim()
  const label = lang === '' ? '' : `<span class="ds-md-code-lang">${escapeHtml(lang)}</span>`
  return (
    `<div class="ds-md-code-block">` +
    `<div class="ds-md-code-bar">${label}` +
    `<div class="ds-md-code-actions">` +
    `<button type="button" class="ds-md-code-copy" data-copy-code="" aria-label="复制代码">` +
    CODE_ICON_COPY +
    `<span class="ds-md-code-copy-label">复制</span>` +
    `</button>` +
    `<button type="button" class="ds-md-code-copy" data-download-code="" aria-label="下载代码">` +
    CODE_ICON_DOWNLOAD +
    `<span class="ds-md-code-copy-label">下载</span>` +
    `</button>` +
    `</div></div>` +
    `<pre><code class="language-${escapeHtml(lang || 'plaintext')}">${highlightCode(code, lang)}</code></pre>` +
    `</div>`
  )
}

/**
 * 用 Prism 把代码转成带 token 的 HTML。
 *
 * 语言名先做一次规范化与别名映射（对话里常见 js / ts / py / sh / yml 这类简写），
 * Prism 找不到对应语法就原样转义输出，不抛错。
 * 注意不能把未知语言交给 Prism——它的 highlight 会抛「语法不存在」。
 */
function highlightCode(code, language) {
  const prism = globalThis.Prism
  if (prism === undefined || typeof prism.highlight !== 'function') return escapeHtml(code)
  const grammarName = prismLanguageOf(language)
  if (grammarName === null) return escapeHtml(code)
  try {
    return prism.highlight(code, prism.languages[grammarName], grammarName)
  } catch {
    // Prism 在个别畸形输入上会抛错；高亮失败退回纯文本，不影响阅读与复制
    return escapeHtml(code)
  }
}

/** 语言名 → Prism 语法名；无法识别返回 null */
function prismLanguageOf(language) {
  const key = language.trim().toLowerCase()
  if (key === '') return null
  const alias = PRISM_ALIASES[key] ?? key
  const prism = globalThis.Prism
  if (prism?.languages === undefined) return null
  return prism.languages[alias] === undefined ? null : alias
}

/*
 * 对话里高频出现的简写 → Prism 语法名。
 * Prism 自带一部分别名（js / ts / py…），这里只补它没有的写法，
 * 以及把「人类习惯」映射到产物里实际打包了的那门语法。
 */
const PRISM_ALIASES = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  htm: 'markup',
  vue: 'markup',
  jsonc: 'json',
  json5: 'json',
  node: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  golang: 'go',
  rs: 'rust',
  kt: 'kotlin',
  md: 'markdown',
  py: 'python',
}

/*
 * 代码块 banner 里的两枚图标，path 抄自官方代码块的「复制 / 下载」按钮。
 * 16×16 视框、currentColor 填充，与消息操作栏那套同一绘制风格。
 */
const CODE_ICON_COPY =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z" fill="currentColor"></path>' +
  '</svg>'

const CODE_ICON_DOWNLOAD =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M15.3695 11.411L15.1234 12.8866C14.8869 14.3042 13.6603 15.3436 12.223 15.3436H3.77673C2.33958 15.3434 1.1128 14.3042 0.876343 12.8866L0.630249 11.411L2.05408 11.1747L2.29919 12.6493C2.41973 13.3713 3.04475 13.9001 3.77673 13.9003H12.223C12.9551 13.9002 13.58 13.3713 13.7006 12.6493L13.9457 11.1747L15.3695 11.411ZM8.72205 8.994C8.77717 8.93934 8.83792 8.88106 8.90271 8.81627L12.4828 5.23424L13.5043 6.25572L9.92224 9.8358C9.6395 10.1185 9.38763 10.3732 9.15857 10.5575C8.91892 10.7503 8.63953 10.9224 8.2865 10.9784C8.09711 11.0083 7.90363 11.0083 7.71423 10.9784C7.36106 10.9224 7.0809 10.7503 6.84119 10.5575C6.61215 10.3732 6.36022 10.1185 6.07751 9.8358L2.49646 6.25572L3.51697 5.23424L7.09705 8.81627C7.16219 8.88142 7.22331 8.94006 7.27869 8.99498V1.3065H8.72205V8.994Z" fill="currentColor"></path>' +
  '</svg>'

/**
 * 主渲染函数。
 * @param markdown 原始 Markdown
 * @param options.citations 按编号排列的来源列表（1 起）
 */
function renderMarkdown(markdown, options) {
  const lines = String(markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const html = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    // 代码块
    const fence = /^\s*(```|~~~)(.*)$/.exec(line)
    if (fence !== null) {
      const marker = fence[1]
      const language = fence[2] ?? ''
      const body = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith(marker)) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      html.push(renderCodeBlock(language, body.join('\n')))
      continue
    }

    if (line.trim() === '') {
      index += 1
      continue
    }

    // 分割线
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      html.push('<hr class="ds-md-hr" />')
      index += 1
      continue
    }

    // 标题
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading !== null) {
      const level = heading[1].length
      html.push(`<h${level} class="ds-md-h${level}">${renderInline(heading[2], options)}</h${level}>`)
      index += 1
      continue
    }

    // 表格
    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const rows = [line, lines[index + 1]]
      index += 2
      while (index < lines.length && lines[index].includes('|') && lines[index].trim() !== '') {
        rows.push(lines[index])
        index += 1
      }
      html.push(renderTable(rows))
      continue
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const body = []
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        body.push(lines[index].replace(/^\s*>\s?/, ''))
        index += 1
      }
      html.push(`<blockquote class="ds-md-quote">${renderMarkdown(body.join('\n'), options)}</blockquote>`)
      continue
    }

    // 列表（有序 / 无序，支持一层缩进续行）
    const listMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (listMatch !== null) {
      const ordered = /\d/.test(listMatch[2])
      const items = []
      let current = null
      while (index < lines.length) {
        const itemMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[index])
        if (itemMatch !== null) {
          if (current !== null) items.push(current)
          current = [itemMatch[3]]
          index += 1
          continue
        }
        // 续行：缩进且不是空行
        if (current !== null && /^\s{2,}\S/.test(lines[index])) {
          current.push(lines[index].trim())
          index += 1
          continue
        }
        break
      }
      if (current !== null) items.push(current)
      const tag = ordered ? 'ol' : 'ul'
      const body = items
        .map((item) => `<li>${renderInline(item.join(' '), options)}</li>`)
        .join('')
      html.push(`<${tag} class="ds-md-${tag}">${body}</${tag}>`)
      continue
    }

    // 段落：连续非空行合并
    const paragraph = []
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !/^\s*(```|~~~)/.test(lines[index]) &&
      !/^#{1,6}\s/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !/^(\s*)([-*+]|\d+[.)])\s+/.test(lines[index]) &&
      !/^\s*([-*_])\s*(\1\s*){2,}$/.test(lines[index])
    ) {
      paragraph.push(lines[index])
      index += 1
    }
    if (paragraph.length > 0) {
      html.push(`<p class="ds-md-p">${renderInline(paragraph.join('\n'), options).replace(/\n/g, '<br />')}</p>`)
    }
  }

  return html.join('')
}

/**
 * 渲染成 React 元素。用 dangerouslySetInnerHTML 是因为 HTML 由本文件的
 * renderInline / renderMarkdown 逐段转义生成，用户与模型文本都经过了 escapeHtml。
 * 点击引用角标与链接通过事件委托处理。
 */
function Markdown({ content, citations, disableLink, onCitation, loading }) {
  const ref = useRef(null)
  const [preview, setPreview] = useState(null)
  const hoverTimer = useRef(null)
  const leaveTimer = useRef(null)
  const html = useMemo(
    () => renderMarkdown(content, { citations: citations === undefined ? undefined : byIndex(citations), disableLink }),
    [content, citations, disableLink],
  )

  // 引用角标的悬停预览：与官方同参数（进入 300ms、离开 100ms）。
  // 用 portal 挂到 body：消息区是滚动容器，卡片放在里面会被 overflow 裁掉。
  useEffect(() => {
    const node = ref.current
    if (node === null || citations === undefined) return undefined
    const sources = byIndex(citations)

    const clearTimers = () => {
      if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
      if (leaveTimer.current !== null) clearTimeout(leaveTimer.current)
      hoverTimer.current = null
      leaveTimer.current = null
    }

    const enter = (event) => {
      const chip = event.target.closest('[data-citation]')
      if (chip === null) return
      const index = Number(chip.getAttribute('data-citation'))
      const source = sources[index]
      if (source === undefined) return
      clearTimers()
      // 移到另一个角标时立刻换内容，不重新等 300ms
      hoverTimer.current = setTimeout(() => {
        const rect = chip.getBoundingClientRect()
        setPreview({ index, source, anchor: rect })
      }, preview === null ? 300 : 0)
    }

    const leave = (event) => {
      const chip = event.target.closest('[data-citation]')
      if (chip === null) return
      clearTimers()
      leaveTimer.current = setTimeout(() => setPreview(null), 100)
    }

    node.addEventListener('mouseover', enter)
    node.addEventListener('mouseout', leave)
    return () => {
      clearTimers()
      node.removeEventListener('mouseover', enter)
      node.removeEventListener('mouseout', leave)
    }
  }, [citations, preview])

  // 滚动时收起预览，否则卡片会浮在错误位置
  useEffect(() => {
    if (preview === null) return undefined
    const scroller = ref.current?.closest('.dsa-scroll')
    if (scroller === null || scroller === undefined) return undefined
    const hide = () => setPreview(null)
    scroller.addEventListener('scroll', hide, { passive: true })
    return () => scroller.removeEventListener('scroll', hide)
  }, [preview])

  useEffect(() => {
    const node = ref.current
    if (node === null) return undefined
    const handler = (event) => {
      // 代码块下载：把代码存成本地文件，扩展名按 banner 上的语言名推断
      const downloadButton = event.target.closest('[data-download-code]')
      if (downloadButton !== null) {
        event.preventDefault()
        const block = downloadButton.closest('.ds-md-code-block')
        const code = block?.querySelector('code')?.textContent ?? ''
        if (code === '') return
        const lang = block?.querySelector('.ds-md-code-lang')?.textContent?.trim() ?? ''
        downloadText(code, `snippet.${codeExtensionOf(lang)}`)
        return
      }
      // 代码块复制：从同级的 <code> 取原文，成功后把标签临时改成「已复制」
      const copyButton = event.target.closest('[data-copy-code]')
      if (copyButton !== null) {
        event.preventDefault()
        const block = copyButton.closest('.ds-md-code-block')
        const code = block?.querySelector('code')?.textContent ?? ''
        if (code === '') return
        void copyText(code).then((ok) => {
          if (!ok) {
            showToast(T('copyFailed'))
            return
          }
          const label = copyButton.querySelector('.ds-md-code-copy-label')
          if (label === null) return
          const original = label.textContent
          label.textContent = T('copied')
          copyButton.setAttribute('data-copied', '')
          setTimeout(() => {
            // 组件可能已被替换（流式更新），回写前确认节点还在文档里
            if (!copyButton.isConnected) return
            label.textContent = original
            copyButton.removeAttribute('data-copied')
          }, 1500)
        })
        return
      }
      if (onCitation === undefined) return
      const button = event.target.closest('[data-citation]')
      if (button === null) return
      event.preventDefault()
      onCitation(Number(button.getAttribute('data-citation')))
    }
    node.addEventListener('click', handler)
    return () => node.removeEventListener('click', handler)
  }, [onCitation])

  return h(React.Fragment, null,
    h('div', {
      ref,
      className: cx('ds-md', loading && 'ds-md-loading'),
      dangerouslySetInnerHTML: { __html: html },
    }),
    preview !== null && h(CitationPreview, {
      preview,
      onOpen: () => {
        setPreview(null)
        onCitation?.(preview.index)
      },
    }),
  )
}

/**
 * 引用预览卡：显示来源标题、站点与摘要，底部可点进侧栏看全文。
 *
 * 定位用 fixed + 视口坐标：消息区是滚动容器，absolute 会被裁掉。
 * 卡片默认在角标下方；下方放不下就翻到上方（与官方 anchored 的做法一致）。
 */
function CitationPreview({ preview, onOpen }) {
  useLocaleRevision()
  const { source, anchor } = preview
  const ref = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    const node = ref.current
    if (node === null) return
    const card = node.getBoundingClientRect()
    const gap = 6
    const margin = 12
    const below = anchor.bottom + gap
    const above = anchor.top - gap - card.height
    // 下方放得下就放下方，否则翻到上方；两边都放不下时贴着可视区底部
    const top = below + card.height <= window.innerHeight - margin
      ? below
      : above >= margin
        ? above
        : Math.max(margin, window.innerHeight - margin - card.height)
    // 水平居中对齐角标，并夹在视口内
    const centered = anchor.left + anchor.width / 2 - card.width / 2
    const left = Math.min(Math.max(margin, centered), window.innerWidth - margin - card.width)
    setPos({ top, left })
  }, [anchor])

  const title = source.title || source.url || ''
  const host = (() => {
    try {
      return new URL(source.url).hostname
    } catch {
      return ''
    }
  })()

  return ReactDOM.createPortal(
    h('div', {
      ref,
      className: 'dsa-citation-card',
      role: 'dialog',
      'aria-label': T('citationPreview'),
      style: pos === null ? { visibility: 'hidden', top: 0, left: 0 } : { top: pos.top, left: pos.left },
      onMouseDown: (event) => event.preventDefault(),
    },
      h('div', { className: 'dsa-citation-card-head' },
        h('span', { className: 'dsa-citation-card-index' }, String(preview.index)),
        h('div', { className: 'dsa-citation-card-meta' },
          h('div', { className: 'dsa-citation-card-title' }, title),
          host !== '' && h('div', { className: 'dsa-citation-card-host' }, host),
        ),
      ),
      source.snippet !== undefined && source.snippet !== '' &&
        h('div', { className: 'dsa-citation-card-snippet' }, source.snippet),
      h('button', {
        type: 'button',
        className: 'dsa-citation-card-open',
        onClick: onOpen,
      }, T('openSource')),
    ),
    document.body,
  )
}

/** 来源列表按 1 起的编号建索引，供 [citation:N] 取用 */
const byIndex = (sources) => {
  const list = []
  for (const source of sources) list[source.index] = source
  return list
}
