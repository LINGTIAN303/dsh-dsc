/** 面板根组件：侧栏 + 主区 + 输入区 + 设置弹窗 */
function DeepSeekPanel({ layout }) {
  useLocaleRevision()
  const theme = useThemeSnapshot()
  const activeState = useStore(active, (state) => state)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [panel, setPanel] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 桌面端侧栏折叠：对齐官方「收起边栏」——收起后主区左上出现鲸鱼+工具条
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const ready = useStore(sessions, (state) => state.ready)
  const booted = useRef(false)
  // 窄于 768px 按移动端布局，与官方的断点一致
  const mobile = useIsMobile()

  // 首次挂载拉一次启动信息
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    void initApp()
  }, [])

  const session = activeState.session

  // 没有打开任何会话时，自动开一个空白会话，界面直接可用
  useEffect(() => {
    if (!ready) return
    if (activeState.id === null && activeState.session === null) createSession()
  }, [ready, activeState.id, activeState.session])

  // 离开面板时停掉正在进行的朗读，否则会在别的界面继续念
  useEffect(() => () => stopReadAloud(), [])

  const onOpenSources = useCallback((key, sources) => {
    setPanel((current) => (current?.key === key ? null : { key, sources }))
  }, [])

  const onCloseSources = useCallback(() => setPanel(null), [])

  /** 退回主对话：layout 的 selectPanel 是切换中央面板的唯一入口 */
  const exitToConversation = useCallback(() => {
    try {
      layout.selectPanel('conversation')
    } catch (error) {
      showToast(`无法返回对话：${error?.message ?? error}`)
    }
  }, [layout])

  // Ctrl+J 新对话，与官方一致
  useEffect(() => {
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        createSession()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return h('div', {
    className: 'dsa-root',
    'data-dsa-dark': theme.dark ? 'true' : 'false',
    'data-dsa-mobile': mobile ? 'true' : 'false',
    'data-dsa-drawer': drawerOpen ? 'true' : 'false',
    // 桌面端折叠态：侧栏隐藏，主区左上角出现鲸鱼 + 浮动工具条（对齐官方收起边栏）
    'data-dsa-collapsed': !mobile && collapsed ? 'true' : 'false',
  },
    // 移动端：侧栏改为抽屉，由顶栏菜单按钮打开；点遮罩或选中会话后关闭
    mobile && drawerOpen &&
      h('div', {
        className: 'dsa-drawer-mask',
        'aria-hidden': true,
        onClick: () => setDrawerOpen(false),
      }),
    h(Sider, {
      collapsed: !mobile && collapsed,
      onToggleCollapse: () => setCollapsed((value) => !value),
      onOpenSettings: () => setSettingsOpen(true),
      onExit: exitToConversation,
      onSearch: () => setSearchOpen(true),
      // 移动端选中会话/新建对话后自动收起抽屉，否则会挡住对话
      onNavigate: mobile ? () => setDrawerOpen(false) : undefined,
    }),
    h('main', { className: 'dsa-main' },
      // 折叠态的浮动工具条：鲸鱼 + 胶囊（展开边栏 / 搜索 / 新对话），
      // 结构对齐官方收起态——整条 fixed 左上，鲸鱼与胶囊间距 16px。
      // 鲸鱼位复用品牌行的悬停机制：默认 Logo，悬停换「返回对话」控件。
      (!mobile && collapsed) &&
        h('div', { className: 'dsa-collapsed-bar' },
          h('div', { className: 'dsa-collapsed-mark' },
            h('span', { className: 'dsa-brand-logo' }, h(IconWhaleFill, { size: 27 })),
            h('button', {
              type: 'button',
              className: 'dsa-brand-back',
              title: T('backToConversation'),
              'aria-label': T('backToConversation'),
              onClick: exitToConversation,
            }, h(IconArrowLeftOutline16)),
          ),
          h('div', { className: 'dsa-toolbar' },
            h('button', {
              type: 'button',
              className: 'dsa-toolbar-button',
              title: T('expandSidebar'),
              'aria-label': T('expandSidebar'),
              onClick: () => setCollapsed(false),
            }, h(IconPanelLeftOutline16)),
            h('button', {
              type: 'button',
              className: 'dsa-toolbar-button',
              title: T('searchChats'),
              'aria-label': T('searchChats'),
              onClick: () => setSearchOpen(true),
            }, h(IconSearchOutline16)),
            h('button', {
              type: 'button',
              className: 'dsa-toolbar-button',
              title: T('newChat'),
              'aria-label': T('newChat'),
              onClick: () => createSession(),
            }, h(IconNewChatOutline20)),
          ),
        ),
      // 移动端顶栏：菜单按钮保留（抽屉入口），桌面端无工具条
      mobile &&
        h('div', { className: 'dsa-toolbar' },
          h('button', {
            type: 'button',
            className: 'dsa-toolbar-button',
            title: T('openSider'),
            'aria-label': T('openSider'),
            onClick: () => setDrawerOpen(true),
          }, h(IconMenuOutline20)),
          h('button', {
            type: 'button',
            className: 'dsa-toolbar-button',
            title: T('searchChats'),
            'aria-label': T('searchChats'),
            onClick: () => setSearchOpen(true),
          }, h(IconSearchOutline16)),
          h('button', {
            type: 'button',
            className: 'dsa-toolbar-button',
            title: T('newChat'),
            'aria-label': T('newChat'),
            onClick: () => createSession(),
          }, h(IconNewChatOutline20)),
        ),
      activeState.error !== null
        ? h('div', { className: 'dsa-loading' }, `${T('loadFailed')}：${activeState.error}`)
        : session === null
          ? h('div', { className: 'dsa-loading' }, '…')
          : h(SessionView, { session, onOpenSources, activePanel: panel, onCloseSources }),
    ),
    settingsOpen && h(SettingsDialog, { onClose: () => setSettingsOpen(false) }),
    searchOpen && h(SearchDialog, { onClose: () => setSearchOpen(false) }),
    h(ConfirmHost),
    h(Toast),
  )
}

/**
 * 应用内确认弹窗：渲染 confirmStore 里待决定的 spec。
 *
 * 对齐官方确认弹窗（用户截图）：居中小卡、标题 + 说明正文、
 * 右下角「取消 / 确认」两枚按钮，确认按钮按危险与否换色。
 * Enter 确认、Escape 取消，焦点默认落在取消上（危险操作先防误触）。
 */
function ConfirmHost() {
  useLocaleRevision()
  const spec = useStore(confirmStore, (state) => state.spec)
  const ref = useRef(null)
  const cancelRef = useRef(null)

  useEffect(() => {
    if (spec === null) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') settleConfirm(false)
      if (event.key === 'Enter') settleConfirm(true)
    }
    document.addEventListener('keydown', onKey)
    cancelRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [spec])

  if (spec === null) return null
  return h('div', {
    className: 'dsa-overlay',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) settleConfirm(false)
    },
  },
    h('section', {
      ref,
      className: 'dsa-confirm',
      role: 'alertdialog',
      'aria-modal': 'true',
      'aria-label': spec.title,
    },
      h('h3', { className: 'dsa-confirm-title' }, spec.title),
      spec.body !== undefined && h('p', { className: 'dsa-confirm-body' }, spec.body),
      h('div', { className: 'dsa-confirm-actions' },
        h('button', {
          ref: cancelRef,
          type: 'button',
          className: 'dsa-confirm-button',
          onClick: () => settleConfirm(false),
        }, spec.cancelLabel ?? T('cancel')),
        h('button', {
          type: 'button',
          className: 'dsa-confirm-button',
          'data-variant': spec.danger ? 'danger' : 'primary',
          onClick: () => settleConfirm(true),
        }, spec.confirmLabel ?? T('confirm')),
      ),
    ),
  )
}

/**
 * 搜索对话：按标题过滤本地会话。
 *
 * 官方是独立搜索页；这里做成轻量弹窗，因为会话数据本来就在内存里，
 * 走一次弹窗比切一整屏更快，也不会打断当前对话。
 */
function SearchDialog({ onClose }) {
  useLocaleRevision()
  const items = useStore(sessions, (state) => state.items)
  const [query, setQuery] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)

  useOutsideClick(ref, true, onClose)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const keyword = query.trim().toLowerCase()
  const matched = keyword === ''
    ? items.slice(0, 20)
    : items.filter((item) => (item.title || '').toLowerCase().includes(keyword))

  return h('div', {
    className: 'dsa-overlay',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) onClose()
    },
  },
    h('section', { ref, className: 'dsa-search-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('searchChats') },
      h('div', { className: 'dsa-search-field' },
        h('span', { className: 'dsa-search-field-icon' }, h(IconSearchOutline16)),
        h('input', {
          ref: inputRef,
          className: 'dsa-search-input',
          type: 'text',
          placeholder: T('searchPlaceholder'),
          value: query,
          onChange: (event) => setQuery(event.target.value),
        }),
      ),
      h('div', { className: 'dsa-search-results' },
        matched.length === 0
          ? h('div', { className: 'dsa-sider-empty' }, T('searchEmpty'))
          : matched.map((item) =>
              h('button', {
                key: item.id,
                type: 'button',
                className: 'dsa-search-result',
                onClick: () => {
                  void openSession(item.id)
                  onClose()
                },
              },
                h('span', { className: 'dsa-search-result-title' }, item.title || T('untitled')),
              ),
            ),
      ),
    ),
  )
}

/**
 * 会话页：一条竖向流，消息区自己滚动，输入区始终吸底。
 * 空会话时把欢迎语放滚动区中间，而不是另起一套绝对定位布局——
 * 那样输入区会被 flex 居中挤到可视区外。
 */
function SessionView({ session, onOpenSources, activePanel, onCloseSources }) {
  const streaming = useStore(active, (state) => state.streaming)
  const empty = session.messages.length === 0
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const stickRef = useRef(true)

  const onScroll = useCallback(() => {
    const node = scrollRef.current
    if (node === null) return
    stickRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }, [])

  // 贴底跟随内容高度，而不是跟随「块数量」：
  // 块数量不变时高度也会变（Markdown 排版、图片加载、字体回退），
  // 只按数量触发会停在半途，看起来就是「没有滚到底」。
  useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (scroller === null || content === null || empty) return undefined
    const follow = () => {
      if (stickRef.current) scroller.scrollTop = scroller.scrollHeight
    }
    const observer = new ResizeObserver(follow)
    observer.observe(content)
    // 首帧先贴一次底
    follow()
    return () => observer.disconnect()
  }, [empty, session.id])

  // 切换会话时重置为贴底
  useEffect(() => {
    stickRef.current = true
    const node = scrollRef.current
    if (node !== null) node.scrollTop = node.scrollHeight
  }, [session.id])

  return h(React.Fragment, null,
    /*
     * 三栏：消息栏 | 来源面板。
     *
     * composer 必须放在 .dsa-scroll 的兄弟位置、且和它同属 .dsa-body 的左侧栏，
     * 不能提到 .dsa-body 外面——一旦提到外面，面板挤压时消息列变窄而 composer 不动，
     * 两者轴线就错开（表现为「会话被挤到中间、输入栏还停在原位」）。
     *
     * 官方实测（面板关闭 → 打开，视口 1603）：可用区宽 1254 → 864（少 390），
     * 消息列 x 556 → 361、输入栏 x 545 → 350，两者都左移 195 = 390/2，
     * 即右栏是挤压布局，居中的内容随之位移。
     */
    h('div', { className: 'dsa-body' },
      h('div', { className: 'dsa-main-column' },
        /*
         * 顶部标题行（有消息时才有）：左侧会话标题，右侧分享。
         *
         * 官方实测：容器高 60px、标题块 padding 8px 12px / 14px 500 / 圆角 22px，
         * 分享按钮 34×34 全圆角靠右。空态没有这一行——官方首页只有一句问候。
         * 它和消息列同处 .dsa-main-column，所以右栏打开时会一起被挤压。
         */
        !empty &&
          h('div', { className: 'dsa-session-header' },
            h('div', { className: 'dsa-session-header-title', title: session.title }, session.title),
            h('button', {
              type: 'button',
              className: 'dsa-session-header-share',
              title: T('share'),
              'aria-label': T('share'),
              onClick: () => showToast(T('shareUnavailable')),
            }, h(IconShareOutline16)),
          ),
        h('div', {
          className: cx('dsa-scroll', empty && 'dsa-scroll-empty'),
          ref: scrollRef,
          onScroll,
        },
          empty
            ? h('div', { className: 'dsa-welcome-inner' },
                h('div', { className: 'dsa-greeting' },
                  // 空态标题左端复用品牌行那只鲸鱼：同一份官方几何，只换尺寸与颜色
                  h('span', { className: 'dsa-greeting-mark' }, h(IconWhaleFill, { size: 34 })),
                  h('span', { className: 'dsa-greeting-text' }, T('emptyTitle')),
                ),
                // 官方空态：composer 紧跟问候语下方，与它同属一组垂直居中，
                // 不是吸底（实测 composer 底距视口底 347px）。有消息后才切吸底。
                h('div', { className: 'dsa-welcome-composer' }, h(Composer, { session })),
              )
            : h('div', { className: 'dsa-column', ref: contentRef },
                session.messages.map((message, index) =>
                  message.role === 'user'
                    ? h(UserMessage, { key: message.id, message, isFirst: index === 0 })
                    : h(AssistantMessage, {
                        key: message.id,
                        message,
                        streaming,
                        isLast: index === session.messages.length - 1,
                        session,
                        onOpenSources,
                        activePanel,
                      }),
                ),
                h('div', { style: { height: 8 } }),
              ),
        ),
        // 吸底 composer 只在有消息时渲染；空态那份在上面 welcome 区里。
        // 它在 .dsa-main-column 内，跟着消息列一起被右栏挤压。
        !empty && h(Composer, { session }),
        // 对话目录导航条：官方固定在视口右侧（不跟随消息列居中），
        // 所以放在 .dsa-main-column 内但其自身是 position:fixed。
        !empty && h(ScrollNav, { scrollRef, messages: session.messages }),
      ),
      activePanel !== null &&
        h(SourcePanel, { sources: activePanel.sources, onClose: onCloseSources }),
    ),
  )
}

/**
 * 是否按移动端布局：窄于 768px（与官方断点一致）。
 * 用 matchMedia 而不是监听 resize：只在跨过断点时触发一次，窗口拖动时不抖。
 */
function useIsMobile() {
  const query = useMemo(
    () => (typeof window === 'undefined' ? null : window.matchMedia('not all and (min-width: 768px)')),
    [],
  )
  const [mobile, setMobile] = useState(() => query?.matches ?? false)
  useEffect(() => {
    if (query === null) return undefined
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [query])
  return mobile
}

/** 读宿主主题快照，判断当前是不是暗色 */
function useThemeSnapshot() {
  const [snapshot, setSnapshot] = useState(() => readTheme())
  useEffect(() => {
    const update = () => setSnapshot(readTheme())
    update()
    // 宿主切换主题时会改动 body 上的 data-ds-dark-theme，用观察器跟随
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class', 'style'] })
    return () => observer.disconnect()
  }, [])
  return snapshot
}

function readTheme() {
  return { dark: document.body.hasAttribute('data-ds-dark-theme') }
}
