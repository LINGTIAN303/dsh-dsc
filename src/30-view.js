/**
 * 由回复的内容块推导界面结构：思考与工具步骤的时间线、带引用角标的正文、可引用来源列表。
 * 纯计算，不改动内容块（它们要原样回传）。
 */

const deepSearchKinds = new Set(['deep_search', 'deep_image_search'])
const imageSearchKinds = new Set(['image_search', 'deep_image_search'])

const isDeepSearchKind = (kind) => deepSearchKinds.has(kind)
const isImageSearchKind = (kind) => imageSearchKinds.has(kind)

/** 站点名：优先服务端给的，没有就退回域名 */
const getSiteName = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const getStatus = (result, streaming) => {
  if (result === undefined) return streaming ? 'wip' : 'failed'
  if (result.type === 'web_search_tool_result') {
    return result.content.some((item) => item.type === 'web_search_tool_result_error') ? 'failed' : 'done'
  }
  return result.content?.type === 'web_fetch_result' ? 'done' : 'failed'
}

const mergeStatus = (statuses) =>
  statuses.includes('wip') ? 'wip' : statuses.every((status) => status === 'failed') ? 'failed' : 'done'

/** 来源登记：同一 URL 只编号一次，按首次出现顺序 */
class SourceRegistry {
  constructor() {
    this.list = []
    this.byUrl = new Map()
  }

  add(url, title, publishedAt, metadata) {
    const siteName = metadata?.site_name?.trim() || getSiteName(url)
    const snippet = metadata?.snippet?.trim() || null
    const siteIcon = metadata?.site_icon?.trim() || null
    const existing = this.byUrl.get(url)
    if (existing !== undefined) {
      // 同一网页可能先被打开、后返回更完整的元数据；只补空缺，不覆盖已有信息
      if (existing.title === url && title) existing.title = title
      if (existing.siteName === getSiteName(url)) existing.siteName = siteName
      existing.publishedAt ||= publishedAt
      existing.snippet ||= snippet
      existing.siteIcon ||= siteIcon
      return existing
    }
    const source = {
      url,
      title: title || url,
      siteName,
      publishedAt,
      snippet,
      siteIcon,
      index: this.list.length + 1,
    }
    this.list.push(source)
    this.byUrl.set(url, source)
    return source
  }
}

/**
 * 文本块拼成一份 markdown：服务端在挂过引用的块之后另起新块，引用位置即块尾。
 * 引用后的空白仍留在被引用块里，所以角标插在块尾空白之前。
 */
function joinTextBlocks(blocks, registry) {
  let markdown = ''
  let text = ''
  for (const block of blocks) {
    text += block.text
    const indexes = new Set()
    for (const citation of block.citations ?? []) {
      indexes.add(registry.add(citation.url, citation.title, null).index)
    }
    const body = indexes.size > 0 ? block.text.replace(/\s+$/, '') : block.text
    markdown += body
    for (const index of indexes) markdown += `[citation:${index}]`
    markdown += block.text.slice(body.length)
  }
  return { markdown, text }
}

/** 主入口：把一条助手消息推导成界面需要的结构 */
function buildReplyView(reply, streaming) {
  const results = new Map()
  for (const block of reply.blocks) {
    if (block.type === 'web_search_tool_result' || block.type === 'web_fetch_tool_result') {
      results.set(block.tool_use_id, block)
    }
  }

  const registry = new SourceRegistry()
  const searchResults = []
  const steps = []
  const mergedSearch = new Map()
  let mergedThinking = null
  let pendingText = []

  // 先登记来源：编号按搜索结果与打开网页在回复中出现的顺序，与正文引用无关
  for (const block of reply.blocks) {
    if (block.type !== 'server_tool_use') continue
    const result = results.get(block.id)
    if (result?.type === 'web_search_tool_result') {
      for (const item of result.content) {
        if (item.type === 'web_search_result') {
          const source = registry.add(item.url, item.title, item.page_age, item)
          if (!searchResults.includes(source)) searchResults.push(source)
        }
      }
    } else if (
      result?.type === 'web_fetch_tool_result' &&
      result.content?.type === 'web_fetch_result' &&
      block.kind === 'deep_search'
    ) {
      registry.add(result.content.url, result.content.content?.title, result.content.published_at)
    }
  }

  const flushPreamble = () => {
    if (pendingText.length === 0) return
    const { markdown } = joinTextBlocks(pendingText, registry)
    if (markdown.trim()) steps.push({ type: 'text', key: `text-${pendingText[0].index}`, markdown })
    pendingText = []
  }

  reply.blocks.forEach((block, index) => {
    if (block.type !== 'thinking') mergedThinking = null
    if (block.type === 'text') {
      pendingText.push({ index, text: block.text, citations: block.citations })
      return
    }
    if (block.type === 'thinking') {
      // 相邻思考块共用一个圆点与 Markdown；原始块与签名不变
      if (mergedThinking !== null) mergedThinking.blocks.push(block)
      else if (block.thinking) {
        flushPreamble()
        mergedThinking = { type: 'thinking', key: `thinking-${index}`, blocks: [block] }
        steps.push(mergedThinking)
      }
      return
    }
    if (block.type !== 'server_tool_use') return

    const result = results.get(block.id)
    // 只有签名、没有明文 URL 的网页仍用于请求，但没有可展示的链接
    if (
      block.input?.action === 'read_link' &&
      !block.input.url &&
      !(result?.type === 'web_fetch_tool_result' && result.content?.type === 'web_fetch_result' && result.content.url)
    ) {
      return
    }
    flushPreamble()
    const { kind, input } = block
    const status = getStatus(result, streaming)
    const last = steps.at(-1)

    if (input?.action === 'search') {
      const { queries } = input
      const found =
        result?.type === 'web_search_tool_result'
          ? result.content.flatMap((item) =>
              item.type === 'web_search_result'
                ? [registry.add(item.url, item.title, item.page_age, item)]
                : [],
            )
          : []
      // 普通搜索按种类聚合到首次出现的位置；边想边搜只合并相邻同种类的调用
      const target = isDeepSearchKind(kind)
        ? last?.type === 'search' && last.kind === kind
          ? last
          : null
        : mergedSearch.get(kind)
      if (target !== null && target !== undefined) {
        target.queries.push(...queries)
        target.results.push(...found.filter((source) => !target.results.includes(source)))
        target.status = mergeStatus([target.status, status])
      } else {
        const step = { type: 'search', key: block.id, kind, queries: [...queries], results: found, status }
        steps.push(step)
        if (!isDeepSearchKind(kind)) mergedSearch.set(kind, step)
      }
      return
    }

    const fetched = result?.type === 'web_fetch_tool_result' ? result.content : null
    const page = {
      id: block.id,
      url: input?.url || (fetched?.type === 'web_fetch_result' ? fetched.url : ''),
      title: (fetched?.type === 'web_fetch_result' ? fetched.content?.title : null) || input?.url || '',
      status,
    }
    if (input?.action === 'read_link') {
      // 阅读链接只展示进行态；成功或失败后隐藏，原始结果仍保留用于后续请求
      if (status !== 'wip') return
      if (last?.type === 'read_link') last.links.push(page)
      else steps.push({ type: 'read_link', links: [page] })
    } else if (input?.action === 'open_page') {
      if (last?.type === 'open') last.pages.push(page)
      else steps.push({ type: 'open', pages: [page] })
    } else {
      const item = { id: block.id, pattern: input?.pattern ?? '', status }
      if (last?.type === 'find') last.patterns.push(item)
      else steps.push({ type: 'find', patterns: [item] })
    }
  })

  const answer = pendingText.length > 0 ? joinTextBlocks(pendingText, registry) : null
  return {
    steps,
    answer: answer !== null && answer.text !== '' ? answer : null,
    sources: registry.list,
    searchResults,
  }
}

/** 思考总用时（秒）：各思考块之和，至少 1 秒 */
function getTotalThinkingSeconds(steps, now) {
  let total = 0
  for (const step of steps) {
    if (step.type !== 'thinking') continue
    for (const block of step.blocks) {
      if (block.elapsedSeconds !== undefined) {
        total += block.elapsedSeconds * 1000
        continue
      }
      if (block.startedAt === undefined) return null
      total += (block.endedAt ?? now) - block.startedAt
    }
  }
  return Math.max(1, Math.round(total / 1000))
}

/** 折叠区标题：有回答显示用时，进行中显示当前动作 */
function getAreaTitle(view, streaming, now, hasResponse) {
  if (hasResponse) {
    const count = getTotalThinkingSeconds(view.steps, now)
    if (count === null) return T('thinking')
    return T('thoughtFor', { count })
  }
  if (!streaming) return T('thoughtStopped')
  const last = view.steps.at(-1)
  if (last?.type === 'search' && last.status === 'wip') {
    return T(isImageSearchKind(last.kind) ? 'searching' : 'deepSearching')
  }
  if (
    (last?.type === 'open' && last.pages.some((page) => page.status === 'wip')) ||
    (last?.type === 'find' && last.patterns.some((item) => item.status === 'wip'))
  ) {
    return T('browsing')
  }
  if (last?.type === 'read_link' && last.links.some((link) => link.status === 'wip')) return T('readingLink')
  return T('thinkingInProgress')
}
