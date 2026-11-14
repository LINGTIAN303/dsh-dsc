/**
 * 侧栏：对齐官方网页端结构。
 *
 * 官方从上到下是：
 *   品牌行（鲸鱼 + deepseek 字标）——右侧是搜索、收起边栏两枚图标
 *   新对话按钮（胶囊，右侧显示 Ctrl+J）
 *   会话列表（按 昨天 / 30 天内 / 年月 分组）
 *   底部用户区（头像 + 昵称 + 更多菜单）
 *
 * 两处与官方的对应关系：
 *   官方「收起边栏」→ 折叠侧栏（主区左上出现鲸鱼+工具条，可再展开）
 *   品牌行悬停出现的返回箭头 → 回宿主主对话（官方没有这个场景）
 */
function Sider({ collapsed, onToggleCollapse, onOpenSettings, onExit, onNavigate, onSearch }) {
  useLocaleRevision()
  const items = useStore(sessions, (state) => state.items)
  const ready = useStore(sessions, (state) => state.ready)
  const activeId = useStore(active, (state) => state.id)
  const [renaming, setRenaming] = useState(null)
  const [draft, setDraft] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  // 会话行「更多」菜单：存当前展开菜单的会话 id
  const [rowMenu, setRowMenu] = useState(null)
  // 行菜单的 fixed 定位锚点（top / right，视口坐标）；菜单由 portal 渲染到 body
  const [rowMenuAnchor, setRowMenuAnchor] = useState(null)
  // 多选模式：官方在分组标题悬停时给入口，进入后整列变成圆圈选择 + 底部置顶/删除
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())

  const groups = useMemo(() => groupSessions(items), [items])

  useOutsideClick(menuRef, menuOpen, () => setMenuOpen(false))

  // 行菜单点外面关闭：菜单挂在行内，用 document 级监听按最近容器判定
  useEffect(() => {
    if (rowMenu === null) return undefined
    const handler = (event) => {
      if (!event.target.closest?.('.dsa-row-menu') && !event.target.closest?.('.dsa-session-more')) {
        setRowMenu(null)
      }
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [rowMenu])

  const enterSelectMode = () => {
    setSelected(new Set())
    setSelecting(true)
  }

  const exitSelectMode = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const toggleSelect = (id) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 批量置顶：确认后置顶并退出多选（应用内弹窗，对齐官方确认卡） */
  const pinSelected = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await openConfirm({
      title: T('pinConfirm', { count: ids.length }),
      confirmLabel: T('pin'),
    })
    if (!ok) return
    void pinSessions(ids)
    exitSelectMode()
  }

  /** 批量删除：官方弹窗里明确警告「不可恢复」+ 分享链接失效 */
  const deleteSelected = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    const ok = await openConfirm({
      title: T('deleteConfirm', { count: ids.length }),
      body: T('deleteIrreversible'),
      confirmLabel: T('deleteSelected'),
      danger: true,
    })
    if (!ok) return
    void removeSessions(ids)
    exitSelectMode()
  }

  const startRename = (session) => {
    setRenaming(session.id)
    setDraft(session.title || '')
  }

  const commitRename = async (id) => {
    const title = draft.trim()
    setRenaming(null)
    if (title !== '') await renameSession(id, title)
  }

  return h('aside', { className: 'dsa-sider' },
    // 品牌行：鲸鱼 + 字标；右侧搜索与收起边栏
    h('div', { className: 'dsa-sider-top' },
      h('div', { className: 'dsa-brand' },
        h('span', { className: 'dsa-brand-logo' }, h(IconWhaleFill, { size: 26 })),
        h('button', {
          type: 'button',
          className: 'dsa-brand-back',
          title: T('backToConversation'),
          'aria-label': T('backToConversation'),
          onClick: onExit,
        }, h(IconArrowLeftOutline16)),
      ),
      h('div', { className: 'dsa-app-name' }, T('appName')),
      h('span', { className: 'dsa-sider-top-spacer' }),
      h('button', {
        type: 'button',
        className: 'dsa-sider-tool',
        title: T('searchChats'),
        'aria-label': T('searchChats'),
        onClick: onSearch,
      }, h(IconSearchOutline16)),
      h('button', {
        type: 'button',
        className: 'dsa-sider-tool',
        title: T('collapseSidebar'),
        'aria-label': T('collapseSidebar'),
        onClick: onToggleCollapse,
      }, h(IconPanelLeftOutline16)),
    ),

    /*
     * 头部槽位：普通态是「开启新对话」胶囊，多选态换成「选择对话 + 关闭」。
     *
     * 官方实测两者占同一位置（y=70、236×40），是互斥的两种形态，不是上下叠两行。
     *
     * 外面这层 .dsa-sider-head 必须常驻，并自己承担与列表之间的 14px 间距：
     * 间距若挂在按钮上，多选态按钮换成另一个元素后间距随之消失，
     * 列表会整体上抬 14px。官方两态下分组标题都在 y=134、条目都在 y=156，位移恒为 0。
     */
    h('div', { className: 'dsa-sider-head' },
      selecting
        ? h('div', { className: 'dsa-select-head' },
            h('div', { className: 'dsa-select-title' },
              selected.size === 0 ? T('selectTitle') : T('selectedCount', { count: selected.size })),
            h('button', {
              type: 'button',
              className: 'dsa-select-close',
              'aria-label': T('exitSelect'),
              onClick: exitSelectMode,
            }, h(IconCloseOutline16)),
          )
        : h('button', {
            type: 'button',
            className: 'dsa-new-chat',
            'data-kbd': T('newChatShortcut'),
            onClick: () => {
              createSession()
              onNavigate?.()
            },
          },
            h('span', { className: 'dsa-new-chat-icon' }, h(IconNewChatOutline20)),
            h('span', { className: 'dsa-new-chat-label' }, T('newChat')),
          ),
    ),

    /*
     * 会话列表：普通态与多选态**共用同一棵树**，只用属性切换表现。
     *
     * 为什么不能写成 `selecting ? A : B` 两个分支：那是两棵不同的 React 元素树，
     * 切换时 React 会卸载整棵重挂，CSS 过渡来不及开始就已经是新节点了——
     * 表现为「瞬间切换」而不是「平滑切入」。
     * （实测：手动 setAttribute 改同一节点时 margin-left 能从 -30px 平滑补间到 0，
     *  经 React 分支切换则直接跳变，证明问题出在重挂而不是 CSS。）
     *
     * 所以这里只有一个分支：行的 data-selecting 决定圆圈是否滑入，
     * 点击行为也按 selecting 分流。
     */
    h('div', { className: 'dsa-session-list' },
      !ready
        ? h('div', { className: 'dsa-sider-empty' }, '…')
        : items.length === 0 && !selecting
          ? h('div', { className: 'dsa-sider-empty' }, T('sessionsEmpty'))
          : groups.map((group) =>
              h('div', { key: group.key, className: 'dsa-section' },
                h('div', { className: 'dsa-section-title' },
                  group.label,
                  /*
                   * 多选入口只挂在「置顶」分组标题上，且常驻不隐藏。
                   *
                   * 官方实测：只有置顶那一行有这枚按钮（x=226、opacity:1），
                   * 「昨天」「30 天内」「YYYY-MM」等普通分组都没有。
                   * 原因不难推：置顶组在列表最上方、位置稳定，是天然的「列表操作入口」；
                   * 普通分组标题会随滚动移动，挂按钮反而干扰阅读。
                   *
                   * 没有置顶会话时整组不渲染，按钮也就跟着消失——
                   * 这正对应官方「有置顶时才出现」的表现。
                   * 进入多选后这枚按钮要收起（此时它已无意义）。
                   */
                  group.key === 'pinned' && !selecting &&
                    h('button', {
                      type: 'button',
                      className: 'dsa-section-multi',
                      title: T('multiSelect'),
                      'aria-label': T('multiSelect'),
                      onClick: enterSelectMode,
                    }, h(IconMultiSelectOutline16)),
                ),
                    group.items.map((session) =>
                      renaming === session.id
                        ? h('input', {
                            key: session.id,
                            className: 'dsa-rename-input',
                            value: draft,
                            autoFocus: true,
                            onChange: (event) => setDraft(event.target.value),
                            onBlur: () => commitRename(session.id),
                            onKeyDown: (event) => {
                              if (event.key === 'Enter') commitRename(session.id)
                              if (event.key === 'Escape') setRenaming(null)
                            },
                          })
                        : h('div', {
                            key: session.id,
                            className: 'dsa-session-item',
                            'data-active': session.id === activeId ? 'true' : 'false',
                            // 多选态靠这个属性驱动圆圈滑入 / 文字右移，不换树
                            'data-selecting': selecting ? 'true' : undefined,
                            'data-checked': selecting && selected.has(session.id) ? 'true' : undefined,
                            role: selecting ? 'checkbox' : 'button',
                            'aria-checked': selecting ? (selected.has(session.id) ? 'true' : 'false') : undefined,
                            tabIndex: 0,
                            onClick: () => {
                              if (selecting) {
                                toggleSelect(session.id)
                                return
                              }
                              if (session.id !== activeId) openSession(session.id)
                              onNavigate?.()
                            },
                            onKeyDown: (event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return
                              event.preventDefault()
                              if (selecting) {
                                toggleSelect(session.id)
                                return
                              }
                              if (session.id !== activeId) openSession(session.id)
                            },
                            onDoubleClick: () => {
                              // 多选态双击不该触发重命名
                              if (!selecting) startRename(session)
                            },
                          },
                            /*
                             * 普通态也渲染勾选圈（宽度 0、不可见）。
                             * 保留在场是为了让「进入多选态」能过渡：
                             * 条件渲染是挂载瞬间出现，圆圈无法展开、文字被硬挤——
                             * 官方是平滑滑过去（rAF 实测约 200ms 缓出）。
                             */
                            h('span', { className: 'dsa-select-circle' }),
                            h('span', { className: 'dsa-session-title' }, session.title || T('untitled')),
                            // 官方会话行只有一个「更多」按钮（…），点开是完整菜单
                            // 多选态下不渲染它：此时整行是勾选器，行内不该再有别的可点目标
                            !selecting &&
                              h('button', {
                                type: 'button',
                                className: 'dsa-session-more',
                                title: T('more'),
                                'aria-label': T('more'),
                                'aria-expanded': rowMenu === session.id ? 'true' : 'false',
                                onClick: (event) => {
                                  event.stopPropagation()
                                  /*
                                   * 记下按钮位置供 portal 定位（fixed / 视口坐标）。
                                   * 菜单高约 194px，靠近底边时向下开会超出视口，
                                   * 这时改成「底边对齐按钮底边」往上开。
                                   */
                                  const rect = event.currentTarget.getBoundingClientRect()
                                  const menuH = 200
                                  const openUp = rect.bottom + menuH > window.innerHeight
                                  setRowMenuAnchor({
                                    top: openUp ? Math.max(8, rect.bottom - menuH) : rect.bottom,
                                    right: window.innerWidth - rect.right,
                                  })
                                  setRowMenu((current) => (current === session.id ? null : session.id))
                                },
                              }, h(IconEllipsisOutline16)),
                            /*
                             * 下拉菜单：通过 portal 挂到 body，用 fixed 定位。
                             *
                             * 不能留在行内：.dsa-session-list 是 overflow-y:auto 的滚动容器，
                             * 行内 absolute 菜单会被它裁掉——实测最后一行打开时菜单越出 74px，
                             * 下面几项直接看不见。
                             * fixed + portal 完全脱离裁剪链路，任何位置的行都能完整显示。
                             */
                            !selecting && rowMenu === session.id && rowMenuAnchor !== null &&
                              ReactDOM.createPortal(
                                h('div', {
                                  className: 'dsa-row-menu',
                                  role: 'menu',
                                  style: { top: rowMenuAnchor.top, right: rowMenuAnchor.right },
                                  onClick: (event) => event.stopPropagation(),
                                },
                                h('button', {
                                  type: 'button',
                                  className: 'dsa-row-menu-item',
                                  role: 'menuitem',
                                  onClick: () => {
                                    setRowMenu(null)
                                    startRename(session)
                                  },
                                }, h('span', { className: 'dsa-row-menu-icon' }, h(IconEditOutline16)), T('rename')),
                                h('button', {
                                  type: 'button',
                                  className: 'dsa-row-menu-item',
                                  role: 'menuitem',
                                  onClick: () => {
                                    setRowMenu(null)
                                    // 已置顶的会话这里是「取消置顶」，未置顶的是「置顶」
                                    void (session.pinnedAt ? unpinSession(session.id) : pinSessions([session.id]))
                                  },
                                }, h('span', { className: 'dsa-row-menu-icon' }, h(IconPinOutline16)), session.pinnedAt ? T('unpin') : T('pin')),
                                h('button', {
                                  type: 'button',
                                  className: 'dsa-row-menu-item',
                                  role: 'menuitem',
                                  onClick: () => {
                                    setRowMenu(null)
                                    // 本地会话没有公开链接，如实说明而不是假装复制成功
                                    showToast(T('shareUnavailable'))
                                  },
                                }, h('span', { className: 'dsa-row-menu-icon' }, h(IconShareOutline16)), T('share')),
                                h('button', {
                                  type: 'button',
                                  className: 'dsa-row-menu-item',
                                  role: 'menuitem',
                                  onClick: () => {
                                    setRowMenu(null)
                                    enterSelectMode()
                                  },
                                }, h('span', { className: 'dsa-row-menu-icon' }, h(IconMultiSelectOutline16)), T('multiSelect')),
                                h('button', {
                                  type: 'button',
                                  className: 'dsa-row-menu-item',
                                  'data-danger': 'true',
                                  role: 'menuitem',
                                  onClick: async () => {
                                    setRowMenu(null)
                                    const ok = await openConfirm({
                                      title: `${T('deleteChat')}「${session.title || T('untitled')}」？`,
                                      body: T('deleteIrreversible'),
                                      confirmLabel: T('deleteChat'),
                                      danger: true,
                                    })
                                    if (ok) void removeSession(session.id)
                                  },
                                }, h('span', { className: 'dsa-row-menu-icon' }, h(IconTrashOutline16)), T('deleteChat')),
                                ),
                                document.body,
                              ),
                        ),
                      ),
                    ),
                  ),
    ),
    // 多选模式的底部操作条：置顶 | 删除（官方布局，两项左右分布）
    selecting &&
      h('div', { className: 'dsa-select-actions' },
        h('button', {
          type: 'button',
          className: 'dsa-select-action',
          disabled: selected.size === 0,
          onClick: pinSelected,
        },
          h(IconPinOutline16),
          T('pin'),
        ),
        h('span', { className: 'dsa-select-divider' }),
        h('button', {
          type: 'button',
          className: 'dsa-select-action',
          'data-danger': 'true',
          disabled: selected.size === 0,
          onClick: deleteSelected,
        },
          h(IconTrashOutline16),
          T('deleteSelected'),
        ),
      ),

    // 底部用户区：官方是头像 + 昵称 + 更多菜单，这里换成设置入口 + 更多菜单
    !selecting &&
    /*
     * 底部账号控件：整体是一个按钮，点击展开菜单。
     *
     * 官方实测 ._2afd28d：236×44、radius 12px、padding 6px 2px 6px 6px、
     * 左头像 32×32 正圆（x=18）、中名称（x=58）、右展开图标 16×16（x=222 靠右）。
     * 不是「设置按钮 + 更多按钮」两个独立控件——官方是整条可点。
     *
     * 我们没有账号体系，头像位用鲸鱼品牌标记；菜单里保留设置与退出两项
     * （退出是从宿主面板回对话，本来就在侧栏里，放菜单里更贴合官方形态）。
     */
    h('div', { className: 'dsa-sider-footer', ref: menuRef },
      menuOpen &&
        h('div', { className: 'dsa-user-menu', role: 'menu' },
          h('button', {
            type: 'button',
            className: 'dsa-user-menu-item',
            role: 'menuitem',
            onClick: () => {
              setMenuOpen(false)
              onOpenSettings()
            },
          },
            h('span', { className: 'dsa-user-menu-icon' }, h(IconSettingsOutline16)),
            T('menuSettings'),
          ),
          h('button', {
            type: 'button',
            className: 'dsa-user-menu-item',
            role: 'menuitem',
            onClick: () => {
              setMenuOpen(false)
              onExit()
            },
          },
            h('span', { className: 'dsa-user-menu-icon' }, h(IconArrowLeftOutline16)),
            T('menuExit'),
          ),
        ),
      h('button', {
        type: 'button',
        className: 'dsa-account',
        'aria-expanded': menuOpen ? 'true' : 'false',
        'aria-haspopup': 'menu',
        title: T('settings'),
        onClick: () => setMenuOpen((open) => !open),
      },
        h('span', { className: 'dsa-account-avatar' }, h(IconWhaleFill, { size: 18 })),
        h('span', { className: 'dsa-account-name' }, T('accountLocal')),
        // 官方右侧是三点（不在下方展开箭头），靠右固定
        h('span', { className: 'dsa-account-caret' }, h(IconEllipsisOutline16)),
      ),
    ),
  )
}

/**
 * 按官方口径分组：置顶 / 昨天 / 30 天内 / 更早的按月分。
 *
 * 官方列表里置顶会话独占一档排在最前；「昨天」之后是「30 天内」，
 * 再往后是「2026-10」这种年月。
 */
function groupSessions(items) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const within30 = startOfToday - 30 * 24 * 60 * 60 * 1000

  const pinned = { key: 'pinned', label: T('pinned'), items: [] }
  const yesterday = { key: 'yesterday', label: T('yesterday'), items: [] }
  const recent = { key: 'recent', label: T('within30Days'), items: [] }
  // 更早的按月归档，键用 YYYY-MM，标签也用 YYYY-MM（与官方一致）
  const months = new Map()

  for (const session of items) {
    const time = session.updatedAt || session.createdAt || 0
    if (session.pinnedAt !== undefined && session.pinnedAt !== null) {
      pinned.items.push(session)
      continue
    }
    if (time >= startOfYesterday) {
      yesterday.items.push(session)
      continue
    }
    if (time >= within30) {
      recent.items.push(session)
      continue
    }
    const date = new Date(time)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!months.has(key)) months.set(key, { key, label: key, items: [] })
    months.get(key).items.push(session)
  }

  const buckets = [pinned, yesterday, recent, ...months.values()]
  return buckets.filter((bucket) => bucket.items.length > 0)
}
