/** 思考与工具步骤的时间线：可折叠标题 + 步骤列表 */
function ReplyArea({ message, view, streaming, hasResponse, onOpenSources, activePanel }) {
  useLocaleRevision()
  const [open, setOpen] = useState(true)
  const titleActive = streaming && !hasResponse
  useTicker(titleActive, 1000)

  if (view.steps.length === 0) return null

  // 没记录请求开关时，按是否有思考内容判断
  const thinking = message.thinking ?? view.steps.some((step) => step.type === 'thinking')
  const title = thinking ? getAreaTitle(view, streaming, Date.now(), hasResponse) : null
  const stopped = !streaming && !hasResponse

  return h('div', { className: 'dsa-reply-area' },
    title !== null &&
      h('div', {
        className: 'dsa-area-title',
        onClick: () => setOpen((value) => !value),
        role: 'button',
        tabIndex: 0,
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen((value) => !value)
          }
        },
      },
        h('span', { className: 'dsa-area-icon', 'data-stopped': stopped ? 'true' : 'false' }, h(IconThinkOutline16)),
        h('span', { className: cx('dsa-area-text', titleActive && 'dsa-shimmer') }, title),
        open ? h(IconChevronDownOutline14) : h(IconChevronRightOutline14),
      ),
    (open || title === null) &&
      h('div', null,
        view.steps.map((step, index) =>
          h(StepItem, {
            key: stepKey(step, index),
            step,
            message,
            sources: view.sources,
            streaming,
            isLast: index === view.steps.length - 1,
            onOpenSources,
            activePanel,
          }),
        ),
      ),
  )
}

const stepKey = (step, index) =>
  step.type === 'thinking' || step.type === 'text' || step.type === 'search' ? step.key : `${step.type}-${index}`

function StepItem({ step, message, sources, streaming, isLast, onOpenSources, activePanel }) {
  switch (step.type) {
    case 'thinking': {
      const lastBlock = step.blocks.at(-1)
      const active = streaming && lastBlock?.startedAt !== undefined && lastBlock?.endedAt === undefined
      return h(ContentItem, { active, isLast },
        h(Markdown, {
          content: step.blocks.map((block) => block.thinking).join(''),
          loading: active,
          disableLink: true,
        }),
      )
    }
    case 'text':
      return h(ContentItem, { active: false, isLast },
        h(Markdown, {
          content: step.markdown,
          loading: streaming && isLast,
          sources,
        }),
      )
    case 'search':
      return h(SearchRow, { step, message, streaming, isLast, onOpenSources, activePanel })
    case 'open':
      return h(OpenRow, { step, sources, isLast, onOpenSources })
    case 'find':
      return h(FindRow, { step, isLast })
    case 'read_link':
      return h(ReadLinkRow, { step, isLast })
    default:
      return null
  }
}

/** 思考或过程性文字：左侧圆点 + 竖线，小号 Markdown */
function ContentItem({ children, active, isLast }) {
  return h('div', { className: 'dsa-step-content', 'data-last': isLast ? 'true' : 'false' },
    h('span', { className: 'dsa-step-dot' },
      h('span', { className: 'dsa-step-dot-inner', 'data-inactive': active ? 'false' : 'true' }),
    ),
    children,
  )
}

/** 搜索：普通搜索显示「已阅读 N 个网页」，边想边搜显示「搜索到 N 个网页」 */
function SearchRow({ step, message, streaming, isLast, onOpenSources, activePanel }) {
  const wip = step.status === 'wip'
  const tick = useTicker(wip && step.queries.length > 1, 2000)
  const count = step.results.length
  const clickable = !wip && count > 0
  const panelKey = `${message.id}-search-${step.key}`
  const failed = step.status === 'failed'
  const interrupted = failed && !streaming && message.status === 'stopped'

  let body
  if (wip) {
    body =
      step.queries.length > 0
        ? [
            h('span', { className: 'dsa-step-intro', key: 'intro' }, T('toolSearchIntro')),
            h('span', { className: 'dsa-step-query', key: `query-${tick}` }, step.queries[tick % step.queries.length]),
          ]
        : h('span', null, T(isImageSearchKind(step.kind) ? 'searching' : 'searching'))
  } else if (interrupted) {
    body = h('span', null, T('searchStopped'))
  } else if (failed) {
    body = h('span', null, T('toolSearchFail'))
  } else if (count === 0) {
    body = h('span', null, T(isDeepSearchKind(step.kind) ? 'toolSearchNoResult' : 'messageSearchNoResult'))
  } else {
    const deep = isDeepSearchKind(step.kind)
    const one = count === 1
    const text = T(
      deep ? (one ? 'toolSearchResultsOne' : 'toolSearchResults') : one ? 'messageSearchResultsOne' : 'messageSearchResults',
      { count },
    )
    body = [h('span', { className: 'dsa-step-summary', key: 'sum' }, text), h(SiteThumbnails, { key: 'thumbs', sources: step.results })]
  }

  return h('div', {
    className: 'dsa-step-row',
    'data-line': isLast ? 'false' : 'true',
    'data-clickable': clickable ? 'true' : 'false',
    'data-active': activePanel === panelKey ? 'true' : 'false',
    onClick: clickable ? () => onOpenSources(panelKey, step.results) : undefined,
    role: clickable ? 'button' : undefined,
    tabIndex: clickable ? 0 : undefined,
    onKeyDown: clickable
      ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpenSources(panelKey, step.results)
          }
        }
      : undefined,
  },
    h('span', { className: cx('dsa-row-icon', 'dsa-row-svg') }, failed ? h(IconSearchWarningOutline16) : h(IconSearchOutline16)),
    ...(Array.isArray(body) ? body : [body]),
  )
}

/** 工具行外壳：左侧图标，右侧可换行内容 */
function ToolRow({ icon, children, isLast }) {
  return h('div', { className: 'dsa-tool-row', 'data-line': isLast ? 'false' : 'true' },
    h('span', { className: cx('dsa-row-icon', 'dsa-tool-icon', 'dsa-row-svg') }, icon),
    h('div', { className: 'dsa-tool-body' }, children),
  )
}

function PageLink({ page }) {
  const failed = page.status === 'failed'
  return h('span', { className: 'dsa-page', 'data-failed': failed ? 'true' : 'false' },
    failed
      ? h('span', { className: 'dsa-page-text', title: T('toolOpenFail') }, page.title || page.url)
      : h('a', { className: 'dsa-page-text', href: page.url, target: '_blank', rel: 'noreferrer' }, page.title || page.url),
    h('span', { className: 'dsa-page-icon' }, h(IconRightUpOutline14)),
  )
}

/** 边想边搜打开的网页 */
function OpenRow({ step, sources, isLast, onOpenSources }) {
  const allFailed = step.pages.every((page) => page.status === 'failed')
  const count = step.pages.length
  const panelKey = `open-${step.pages[0]?.id}`
  return h(ToolRow, { icon: allFailed ? h(IconBrowseWarningOutline16) : h(IconBrowseOutline16), isLast },
    allFailed
      ? T('toolOpenFail')
      : [
          h('span', { className: 'dsa-tool-intro', key: 'intro' }, T(count === 1 ? 'toolOpenOneIntro' : 'toolOpensIntro', { count })),
          ...step.pages.slice(0, 5).map((page) => h(PageLink, { key: page.id, page })),
          count > 5
            ? h('span', {
                key: 'all',
                className: 'dsa-chip',
                onClick: () => onOpenSources(panelKey, sources.filter((source) => step.pages.some((page) => page.url === source.url))),
              }, T('toolOpenViewAll'))
            : null,
        ].filter(Boolean),
  )
}

/** 页内查找 */
function FindRow({ step, isLast }) {
  const allFailed = step.patterns.every((item) => item.status === 'failed')
  return h(ToolRow, { icon: allFailed ? h(IconBrowseWarningOutline16) : h(IconBrowseOutline16), isLast },
    allFailed
      ? T('toolFindFail')
      : [
          h('span', { className: 'dsa-tool-intro', key: 'intro' }, T('toolFindIntro')),
          ...step.patterns.map((item) =>
            h('span', { key: item.id, className: 'dsa-chip', 'data-failed': item.status === 'failed' ? 'true' : 'false' },
              item.status === 'wip'
                ? null
                : h('span', { className: 'dsa-chip-icon' }, item.status === 'failed' ? h(IconCloseFill14) : h(IconCheckedOutline14)),
              h('span', { className: 'dsa-chip-text' }, item.pattern),
            ),
          ),
        ],
  )
}

/** 阅读用户消息里的链接：只展示进行态 */
function ReadLinkRow({ step, isLast }) {
  return h(ToolRow, { icon: h(IconLinkOutline16), isLast },
    h('span', { className: cx('dsa-tool-intro', 'dsa-shimmer') }, T('readingLink')),
    ...step.links.map((link) => h(PageLink, { key: link.id, page: link })),
  )
}

/** 站点图标叠层：搜索结果行右侧最多显示 3 个站点 */
function SiteThumbnails({ sources }) {
  const shown = sources.filter((source) => source.siteIcon).slice(0, 3)
  if (shown.length === 0) return null
  return h('span', { className: 'dsa-site-thumbs' },
    shown.map((source) =>
      h('img', {
        key: source.url,
        className: 'dsa-site-thumb',
        src: source.siteIcon,
        alt: '',
        loading: 'lazy',
        onError: (event) => {
          event.currentTarget.style.display = 'none'
        },
      }),
    ),
  )
}
