/** 消息列表、用户消息、助手消息与来源面板 */

function MessageList({ session, streaming, footer, onOpenSources, activePanel, onCloseSources }) {
  const scrollRef = useRef(null)
  const stickRef = useRef(true)
  // 内容变化时保持贴底，除非用户主动向上滚
  const lastCount = useRef(0)
  const total = session.messages.reduce(
    (sum, message) => sum + (message.role === 'assistant' ? message.blocks.length : 1),
    0,
  )

  const onScroll = useCallback(() => {
    const node = scrollRef.current
    if (node === null) return
    stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (node === null) return
    if (stickRef.current || total !== lastCount.current) {
      node.scrollTop = node.scrollHeight
    }
    lastCount.current = total
  }, [total, session.id])

  useEffect(() => {
    stickRef.current = true
    const node = scrollRef.current
    if (node !== null) node.scrollTop = node.scrollHeight
  }, [session.id])

  return h('div', { className: 'dsa-content' },
    h('div', { className: 'dsa-scroll', ref: scrollRef, onScroll },
      h('div', { className: 'dsa-column' },
        session.messages.map((message, index) =>
          message.role === 'user'
            ? h(UserMessage, { key: message.id, message, isFirst: index === 0 })
            : h(AssistantMessage, {
                key: message.id,
                message,
                // 只有最后一条可能在流式增长；其余消息内容不变，不该跟着重渲染
                streaming: streaming && index === session.messages.length - 1,
                isLast: index === session.messages.length - 1,
                session,
                onOpenSources,
                activePanel,
              }),
        ),
        h('div', { style: { height: 8 } }),
      ),
      footer,
    ),
    activePanel !== null && h(SourcePanel, { sources: activePanel.sources, onClose: onCloseSources }),
  )
}

const UserMessage = memo(function UserMessage({ message, isFirst }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const streaming = useStore(active, (state) => state.streaming)
  const canEdit = !streaming

  const submit = async () => {
    const text = draft.trim()
    setEditing(false)
    if (text === message.content) return
    const session = active.get().session
    if (session === null) return
    // 编辑即重发：截断到这条提问之前，再用新内容发一轮
    const index = session.messages.findIndex((item) => item.id === message.id)
    if (index < 0) return
    const trimmed = { ...session, messages: session.messages.slice(0, index) }
    active.set({ ...active.get(), session: trimmed })
    await sendMessage(trimmed, text, message.files)
  }

  return h('div', { className: 'dsa-user', 'data-first': isFirst ? 'true' : 'false' },
    message.files.length > 0 &&
      h('div', { className: 'dsa-user-files' },
        message.files.map((file) =>
          h(FileCard, { key: file.id, file }),
        ),
      ),
    editing
      ? h('div', { className: 'dsa-user-editor' },
          h('div', { className: 'dsa-composer dsa-user-editor-box' },
            h('textarea', {
              className: 'dsa-user-editor-input',
              value: draft,
              autoFocus: true,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                // Enter 保存、Shift+Enter 换行、Escape 取消，与主流对话产品的编辑态一致
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
                if (event.key === 'Escape') setEditing(false)
              },
              rows: 1,
            }),
          ),
          h('div', { className: 'dsa-user-editor-actions' },
            h('button', { type: 'button', className: 'dsa-button', onClick: () => setEditing(false) }, T('cancel')),
            h('button', { type: 'button', className: 'dsa-button', 'data-variant': 'primary', onClick: submit }, T('save')),
          ),
        )
      : h('div', { className: 'dsa-user-bubble' }, message.content),
    !editing &&
      h('div', { className: 'dsa-user-actions' },
        canEdit &&
          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            title: T('edit'),
            'aria-label': T('edit'),
            onClick: () => {
              setDraft(message.content)
              setEditing(true)
            },
          }, h(IconEditOutline16)),
        h('button', {
          type: 'button',
          className: 'dsa-action-button',
          title: T('copy'),
          'aria-label': T('copy'),
          onClick: () => copyText(message.content),
        }, h(IconCopyOutline16)),
      ),
  )
})

const AssistantMessage = memo(function AssistantMessage({ message, streaming, isLast, session, onOpenSources, activePanel }) {
  useLocaleRevision()
  const view = useMemo(() => buildReplyView(message, streaming && isLast), [message, streaming, isLast])
  const hasResponse = view.answer !== null
  const busy = message.status === 'pending' || message.status === 'streaming'
  const [reading, setReading] = useState(false)
  const [copied, setCopied] = useState(false)
  // 喜欢/不喜欢是纯前端态度标记：官方也不落库到消息本身，切会话即丢，这里保持一致
  const [feedback, setFeedback] = useState(null)
  const refused = message.stopReason === 'refusal'

  const answerText = view.answer?.text ?? ''

  // 切走这个会话就停掉朗读，否则会在后台继续念别的对话
  useEffect(() => () => stopReadAloud(), [])

  const onRead = async () => {
    if (reading) {
      stopReadAloud()
      setReading(false)
      return
    }
    if (answerText.trim() === '') return
    setReading(true)
    try {
      await speak(answerText)
    } catch (error) {
      showToast(error.message)
    } finally {
      setReading(false)
    }
  }

  return h('div', { className: 'dsa-assistant' },
    h(ReplyArea, {
      message,
      view,
      streaming: streaming && isLast,
      hasResponse,
      onOpenSources,
      activePanel: activePanel?.key ?? null,
    }),

    busy && !hasResponse && view.steps.length === 0
      ? h('div', { className: 'dsa-waiting' },
          h('span', { className: 'dsa-waiting-dot' }),
          h('span', { className: 'dsa-waiting-dot' }),
          h('span', { className: 'dsa-waiting-dot' }),
        )
      : null,

    refused
      ? h('div', { className: 'dsa-error' }, h(IconWarningOutline16), h('span', null, T('refused')))
      : view.answer !== null
        ? h(Markdown, {
            content: view.answer.markdown,
            citations: view.sources,
            loading: busy,
            onCitation: (index) => {
              const source = view.sources.find((item) => item.index === index)
              if (source !== undefined) onOpenSources(`cite-${message.id}-${index}`, [source])
            },
          })
        : null,

    message.error !== undefined
      ? h('div', { className: 'dsa-error' },
          h(IconWarningOutline16),
          h('span', null, message.error.message || T('sendFailed')),
          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            onClick: () => {
              void regenerate(session, message.id)
            },
          }, T('retry')),
        )
      : null,

    message.status === 'stopped' && !hasResponse
      ? h('div', { className: 'dsa-error', style: { color: 'var(--dsw-alias-label-tertiary)' } },
          h('span', null, T('stopGenerating')),
        )
      : null,

    /*
     * 消息末尾操作栏。顺序与官方一致：复制 / 重新生成 / 喜欢 / 不喜欢 / 朗读 / 分享。
     * 官方 ._965abe9 是 6 枚 28×28 胶囊按钮、gap 10px、颜色 label-tertiary；
     * 外面那层 ._0a3d93b 是 padding 12/0/10、left:-6px、可换行。
     *
     * 「N 个网页」胶囊在官方是独立于操作栏的一行（margin-top:16px 挂在正文之后），
     * 所以这里也放在操作栏之外，不要塞进去——塞进去会被 6 枚图标挤到换行。
     */
    view.searchResults.length > 0 &&
      h(SearchSummaryPill, {
        key: 'pill',
        results: view.searchResults,
        onClick: () => onOpenSources(`all-${message.id}`, view.searchResults),
      }),

    !busy &&
      h('div', { className: 'dsa-assistant-actions' },
        hasResponse && h(VersionSwitcher, { message, session }),
        hasResponse && h('div', { className: 'dsa-action-row' },
          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            'aria-label': copied ? T('copied') : T('copy'),
            onClick: async () => {
              await copyText(answerText)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            },
          }, copied ? h(IconCheckOutline16) : h(IconCopyOutline16)),

          !streaming &&
            h('button', {
              type: 'button',
              className: 'dsa-action-button',
              'aria-label': T('regenerate'),
              onClick: () => {
                void regenerate(session, message.id)
              },
            }, h(IconRefreshOutline16)),

          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            'data-active': feedback === 'like' ? 'true' : undefined,
            'aria-label': T('like'),
            'aria-pressed': feedback === 'like',
            onClick: () => setFeedback(feedback === 'like' ? null : 'like'),
          }, h(IconLikeOutline16)),

          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            'data-active': feedback === 'dislike' ? 'true' : undefined,
            'aria-label': T('dislike'),
            'aria-pressed': feedback === 'dislike',
            onClick: () => setFeedback(feedback === 'dislike' ? null : 'dislike'),
          }, h(IconDislikeOutline16)),

          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            'data-active': reading ? 'true' : undefined,
            'aria-label': reading ? T('stopReading') : T('readAloud'),
            onClick: onRead,
          }, reading ? h(IconStopFill16) : h(IconPlayMediaOutline16)),

          h('button', {
            type: 'button',
            className: 'dsa-action-button',
            'aria-label': T('share'),
            onClick: () => showToast(T('shareUnavailable')),
          }, h(IconShareOutline16)),
        ),
      ),
  )
})

/**
 * 「N 个网页」来源胶囊。
 *
 * 官方 .f93f59e4 规格：fit-content、margin-top:16px、padding 4px 10px 4px 4px、
 * 圆角 100px、1px 边框 border-l2、背景 bg-base、cursor pointer；
 * 内部 ._287b564 是 4 枚 16px 圆形站点图标横向叠放（后一枚 margin-left:-4px），
 * 图标再叠一圈 1px 底色描边形成分隔；右侧文字 14px/24px、margin-left:6px。
 *
 * 站点图标直接用搜索 API 返回的 source.siteIcon（形如
 * https://cdn.deepseek.com/site-icons/<host>），与推理段 SiteThumbnails 同一套数据、
 * 同一个 CDN，直连即可——实测该 CDN 在页面里能正常加载（naturalWidth=16）。
 * 不要自己从 source.url 拼域名：API 给的 host 与 url 的 host 不一定相同
 * （搜索结果常指向静态资源域名，但站点图标按站点注册），拼出来就是空白。
 * 没有 siteIcon 或加载失败时回落到首字母。
 */
const SearchSummaryPill = memo(function SearchSummaryPill({ results, onClick }) {
  useLocaleRevision()
  const shown = results.slice(0, 4)
  const label = T('sourcesCount', { count: results.length })
  return h('button', {
    type: 'button',
    className: 'dsa-sources-pill',
    onClick,
  },
    h('span', { className: 'dsa-sources-logos' },
      shown.map((source, index) =>
        h('span', { key: index, className: 'dsa-sources-logo' },
          source.siteIcon !== null && source.siteIcon !== undefined &&
            h('img', {
              src: source.siteIcon,
              alt: '',
              loading: 'lazy',
              // 加载失败就把图摘掉，露出下面的首字母兜底
              onError: (event) => { event.currentTarget.remove() },
            }),
          h('span', { className: 'dsa-sources-fallback' },
            (source.siteName || source.title || '?').trim().charAt(0).toUpperCase()),
        ),
      ),
    ),
    h('span', { className: 'dsa-sources-count' }, label),
  )
})

/**
 * 版本切换器：「‹ 2/3 ›」。只有重新生成过才出现。
 *
 * 为什么不用下拉：官方就是左右箭头形式，且版本数通常只有 2~3 个，
 * 箭头比下拉少一次点击。版本为 1 时整个组件返回 null，不占位。
 */
const VersionSwitcher = memo(function VersionSwitcher({ message, session }) {
  useLocaleRevision()
  const info = versionInfo(message)
  if (info === null || info.count <= 1) return null
  const { count, index } = info
  return h('div', { className: 'dsa-version-switcher' },
    h('button', {
      type: 'button',
      className: 'dsa-version-arrow',
      disabled: index <= 1,
      title: T('versionPrev'),
      'aria-label': T('versionPrev'),
      onClick: () => {
        void switchVersion(session, message.id, index - 2)
      },
    }, h(IconChevronRightOutline14, { style: { transform: 'rotate(180deg)' } })),
    h('span', { className: 'dsa-version-label' }, `${index}/${count}`),
    h('button', {
      type: 'button',
      className: 'dsa-version-arrow',
      disabled: index >= count,
      title: T('versionNext'),
      'aria-label': T('versionNext'),
      onClick: () => {
        void switchVersion(session, message.id, index)
      },
    }, h(IconChevronRightOutline14)),
  )
})

/** 来源面板：搜索结果的完整列表 */
function SourcePanel({ sources, onClose }) {  useLocaleRevision()
  return h('aside', { className: 'dsa-source-panel' },
    h('div', { className: 'dsa-source-header' },
      h('span', { className: 'dsa-source-title' }, T('sources')),
      h('button', { type: 'button', className: 'dsa-icon-button', onClick: onClose, 'aria-label': T('close') },
        h(IconCloseOutline16),
      ),
    ),
    h('div', { className: 'dsa-source-list' },
      sources.map((source) =>
        h('a', {
          key: source.url,
          className: 'dsa-source-item',
          href: source.url,
          target: '_blank',
          rel: 'noreferrer',
        },
          h('div', { className: 'dsa-source-meta' },
            source.siteIcon !== null
              ? h('img', {
                  className: 'dsa-source-icon',
                  src: source.siteIcon,
                  alt: '',
                  loading: 'lazy',
                  onError: (event) => {
                    event.currentTarget.style.visibility = 'hidden'
                  },
                })
              : null,
            h('span', { className: 'dsa-source-site' }, source.siteName || getSiteName(source.url)),
            h('span', { className: 'dsa-source-divider' }),
            h('span', { className: 'dsa-source-date' }, formatDate(source.publishedAt)),
            h('span', { style: { flex: 1 } }),
            h('span', { className: 'dsa-source-index' }, String(source.index)),
          ),
          h('div', { className: 'dsa-source-headline' }, source.title),
          source.snippet !== null && h('div', { className: 'dsa-source-snippet' }, source.snippet),
        ),
      ),
    ),
  )
}

/** 附件卡片：图片显示缩略图，文档显示文件名 */
function FileCard({ file }) {
  const url = previewOf(file.id)
  return h('div', {
    className: 'dsa-attachment',
    title: `${file.name}${file.size ? ` · ${formatSize(file.size)}` : ''}`,
    style: { cursor: 'default' },
  },
    file.isImage && url !== undefined
      ? h('img', { src: url, alt: file.name })
      : h('div', { className: 'dsa-attachment-name' }, file.name),
  )
}

/** 日期：能解析就按月日显示，解析不了原样截断 */
function formatDate(value) {
  if (typeof value !== 'string' || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 复制到剪贴板；失败时退回 textarea 方案，返回是否成功 */
async function copyText(text) {  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 非安全上下文（http）或权限被拒时会走到这里，退回旧方案
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** 触发一次本地下载：把文本存成文件，不需要宿主或服务端参与 */
function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // 立刻回收会打断部分浏览器的下载启动，推到下一轮事件循环
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * 语言名 → 文件扩展名。
 * 只覆盖常见别名；认不出来就用 .txt，不猜成编程语言扩展名。
 */
const CODE_EXTENSIONS = {
  javascript: 'js', js: 'js', jsx: 'jsx', typescript: 'ts', ts: 'ts', tsx: 'tsx',
  python: 'py', py: 'py', rust: 'rs', go: 'go', java: 'java', kotlin: 'kt',
  c: 'c', 'c++': 'cpp', cpp: 'cpp', 'c#': 'cs', csharp: 'cs', php: 'php',
  ruby: 'rb', swift: 'swift', shell: 'sh', sh: 'sh', bash: 'sh', zsh: 'sh',
  powershell: 'ps1', ps1: 'ps1', sql: 'sql', json: 'json', yaml: 'yml', yml: 'yml',
  xml: 'xml', html: 'html', css: 'css', scss: 'scss', less: 'less', md: 'md',
  markdown: 'md', toml: 'toml', ini: 'ini', dockerfile: 'dockerfile', makefile: 'makefile',
}

function codeExtensionOf(lang) {
  return CODE_EXTENSIONS[lang.toLowerCase()] ?? 'txt'
}
