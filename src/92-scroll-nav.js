/**
 * 会话右侧的「对话目录导航条」。
 *
 * 官方不是原生滚动条，而是一条自绘的固定导航：每个用户提问一行短横，
 * 悬停或聚焦时向右展开面板显示提问全文，当前所在轮次亮蓝并放大 1.5 倍。
 * 规格取自官方 main.css（._189b4a0 等），见 docs/details/架构/deepseek-app.md。
 *
 * 结构（官方同名层级，改成插件前缀）：
 *   .dsa-scroll-nav            34×300 固定右侧，translateY(-50%) 垂直居中
 *     .dsa-scroll-nav-bg       背景板 rgba(21,21,23,.6) + blur(5px)，圆角 16
 *     .dsa-scroll-nav-panel    展开面板，fit-content，展开态 240px 宽
 *       .dsa-scroll-nav-item   每轮 30px 高，右侧对齐
 *         .dsa-scroll-nav-text 提问摘要，默认 opacity 0，展开后才显示
 *         .dsa-scroll-nav-dash 8×2 短线，当前轮次 scale(1.5)
 */

/** 当前视口顶部对应哪一轮：取「穿过顶部参考线」的最后一个用户消息 */
function useActiveRound(scrollRef, count) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller === null || count === 0) return undefined

    const compute = () => {
      const nodes = [...scroller.querySelectorAll('.dsa-user')]
      if (nodes.length === 0) return
      // 参考线取容器顶部往下 1/3：滚到一半时判断落在哪一轮，和官方观感一致
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3
      let found = 0
      for (let i = 0; i < nodes.length; i += 1) {
        if (nodes[i].getBoundingClientRect().top <= line) found = i
      }
      setIndex(found)
    }

    compute()
    scroller.addEventListener('scroll', compute, { passive: true })
    const observer = new ResizeObserver(compute)
    observer.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', compute)
      observer.disconnect()
    }
  }, [scrollRef, count])

  return index
}

/**
 * 对话目录导航。
 * scrollRef 指向 .dsa-scroll，题目内容从它的 DOM 里按 .dsa-user 顺序读取——
 * 消息数据里用户消息和助手消息是分开的，用 DOM 顺序天然对齐「第几轮」。
 */
function ScrollNav({ scrollRef, messages }) {
  const [open, setOpen] = useState(false)
  const [texts, setTexts] = useState([])
  const index = useActiveRound(scrollRef, messages.length)

  // 每轮提问的文字：读 DOM 而不是 messages，因为 DOM 里已含文件卡片等渲染结果
  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller === null) return
    const nodes = [...scroller.querySelectorAll('.dsa-user')]
    setTexts(
      nodes.map((node) => {
        // 文件卡片不算提问正文，取纯文字气泡
        const bubble = node.querySelector('.dsa-user-bubble')
        const raw = (bubble ?? node).textContent ?? ''
        return raw.trim().replace(/\s+/g, ' ')
      }),
    )
  }, [scrollRef, messages])

  const jump = (target) => {
    const scroller = scrollRef.current
    if (scroller === null) return
    const nodes = [...scroller.querySelectorAll('.dsa-user')]
    const node = nodes[target]
    if (node === undefined) return
    // 滚到该轮顶部再上移一点，避免提问紧贴容器边缘
    const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 16
    scroller.scrollTo({ top, behavior: 'smooth' })
  }

  /*
   * 面板自身的滚动边界：轮次超出 300px 高时列表要能滚，
   * 上下两片 32px 渐隐遮罩只在对应方向确实还有内容时出现，
   * 否则顶部第一条会被遮罩压暗，看起来像「第一条永远是灰的」。
   */
  const listRef = useRef(null)
  const [edges, setEdges] = useState({ scrollable: false, atTop: true, atBottom: true })

  useEffect(() => {
    const list = listRef.current
    if (list === null || !open) return undefined
    const measure = () => {
      const scrollable = list.scrollHeight > list.clientHeight + 1
      setEdges({
        scrollable,
        atTop: list.scrollTop <= 1,
        atBottom: list.scrollTop + list.clientHeight >= list.scrollHeight - 1,
      })
    }
    measure()
    list.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => {
      list.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [open, texts])

  if (messages.length === 0) return null

  return h('div', {
    className: 'dsa-scroll-nav',
    'data-open': open ? 'true' : 'false',
    'data-scrollable': edges.scrollable ? 'true' : 'false',
    'data-at-top': edges.atTop ? 'true' : 'false',
    'data-at-bottom': edges.atBottom ? 'true' : 'false',
    onMouseEnter: () => setOpen(true),
    onMouseLeave: () => setOpen(false),
  },
    h('div', { className: 'dsa-scroll-nav-bg' }),
    h('div', { className: 'dsa-scroll-nav-panel' },
      h('div', { className: 'dsa-scroll-nav-list', ref: listRef },
        texts.map((text, i) =>
          h('div', {
            key: i,
            className: 'dsa-scroll-nav-item',
            'data-active': i === index ? 'true' : 'false',
            onClick: () => jump(i),
            title: text,
          },
            h('div', { className: 'dsa-scroll-nav-text' }, text),
            h('div', { className: 'dsa-scroll-nav-mark' },
              h('div', { className: 'dsa-scroll-nav-dash' }),
            ),
          ),
        ),
      ),
    ),
  )
}
