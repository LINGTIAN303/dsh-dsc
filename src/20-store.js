/**
 * 会话与消息的状态与折叠逻辑。
 * 数据形态对齐官方协议：助手消息保存原始内容块，历史请求原样回传 read_link 块。
 */

/** 会话级设置：新会话从 Host 默认值初始化 */
const settings = createStore({
  thinking: true,
  search: true,
  safetyCheck: true,
  model: 'deepseek-flash',
  systemPrompt: '',
  /**
   * 模型来源：'direct' 走 DeepSeek 直连（全特性）；
   * 'pool' 走 DSH 的 ctx.llm（可用任意 provider，搜索由 Host 用 Tavily 实现）。
   */
  source: 'direct',
  /** 模型池模式下选中的 provider 与模型 */
  poolProvider: '',
  poolModel: '',
})

/** 全部会话的摘要（列表用） */
const sessions = createStore({ items: [], ready: false, error: null })

/** 当前打开的会话 */
const active = createStore({ id: null, session: null, streaming: false, error: null })

/** 凭据状态 */
const credential = createStore({ active: null, pluginKey: { configured: false }, account: { signedIn: false }, env: { configured: false } })

/** 界面提示 */
const toast = createStore({ message: null, seq: 0 })

let showToast = (message) => {
  if (!message) return
  toast.set((state) => ({ message, seq: state.seq + 1 }))
}

/** 一次性拉取启动信息 */
async function initApp() {
  try {
    const data = await bootstrap()
    settings.set((state) => ({
      ...state,
      thinking: data.config.defaultThinking,
      search: data.config.defaultSearch,
      safetyCheck: data.config.defaultSafetyCheck,
      model: data.config.defaultModel,
    }))
    credential.set(data.credential)
    sessions.set({ items: data.sessions, ready: true, error: null })
    try {
      const { prompt } = await readSystemPrompt()
      settings.set((state) => ({ ...state, systemPrompt: prompt }))
    } catch {
      // 系统提示词拿不到不影响对话，Host 侧会用内置默认
    }
  } catch (error) {
    sessions.set({ items: [], ready: true, error: error.message })
  }
}

/** 新建会话：只在本地确定 id，第一次发送时才落盘 */
function createSession() {
  const now = Date.now()
  const session = {
    id: newId(),
    title: '',
    createdAt: now,
    updatedAt: now,
    messages: [],
    persisted: false,
  }
  active.set({ id: session.id, session, streaming: false, error: null })
  return session
}

/** 打开历史会话 */
async function openSession(id) {
  if (active.get().streaming) stopStreaming()
  active.set({ id, session: null, streaming: false, error: null })
  try {
    const { session } = await readSession(id)
    active.set({ id, session, streaming: false, error: null })
  } catch (error) {
    active.set({ id, session: null, streaming: false, error: error.message })
  }
}

/** 把会话写回 Host，并同步列表摘要 */
async function persistSession(session) {
  const summary = {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    // pinnedAt 也要进摘要：置顶分组靠它排，丢了会让「置顶」在列表里看似没生效
    pinnedAt: session.pinnedAt,
  }
  sessions.set((state) => {
    const rest = state.items.filter((item) => item.id !== summary.id)
    return { ...state, items: [summary, ...rest].sort((a, b) => b.updatedAt - a.updatedAt) }
  })
  try {
    await saveSession(summarySession(session))
    session.persisted = true
  } catch (error) {
    showToast(error.message)
  }
}

/** 列表只存摘要字段，消息留在会话对象里 */
function summarySession(session) {
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages,
    // 置顶标记：列表摘要靠它排出「置顶」分组，丢了会让置顶看起来没生效
    pinnedAt: session.pinnedAt,
  }
}

async function removeSession(id) {
  try {
    await deleteSession(id)
  } catch (error) {
    showToast(error.message)
    return
  }
  sessions.set((state) => ({ ...state, items: state.items.filter((item) => item.id !== id) }))
  if (active.get().id === id) {
    active.set({ id: null, session: null, streaming: false, error: null })
  }
}

async function renameSession(id, title) {
  const current = active.get()
  if (current.id === id && current.session !== null) {
    const next = { ...current.session, title, updatedAt: Date.now() }
    active.set({ ...current, session: next })
    await persistSession(next)
    return
  }
  // 未打开的会话也要能改名：读出整份、改名、写回
  try {
    const { session } = await readSession(id)
    const next = { ...session, title, updatedAt: Date.now() }
    await persistSession(next)
  } catch (error) {
    showToast(error.message)
  }
}

/**
 * 置顶：官方把置顶会话排在列表最前（分组标题「置顶」独占一档）。
 * 本地立即更新摘要排序，再异步读整份写回 pinnedAt 字段。
 * pinnedAt 传 null 即取消置顶。
 */
async function pinSessions(ids, pinnedAt = Date.now()) {
  const pinSet = new Set(ids)
  sessions.set((state) => ({
    ...state,
    items: state.items.map((item) =>
      pinSet.has(item.id) ? { ...item, pinnedAt } : item,
    ),
  }))
  for (const id of ids) {
    try {
      const { session } = await readSession(id)
      await persistSession({ ...session, pinnedAt })
    } catch (error) {
      showToast(error.message)
    }
  }
}

/** 取消置顶：pinnedAt 置 null 并回落普通分组 */
async function unpinSession(id) {
  await pinSessions([id], null)
}

/** 批量删除：逐个走既有的单删路径，任一失败不中断其余 */
async function removeSessions(ids) {
  for (const id of ids) {
    await removeSession(id)
  }
}

/** 让当前会话的更新走一条路径，避免多处 setState 相互覆盖；返回更新后的会话快照 */
function updateActiveSession(update) {
  const current = active.get()
  if (current.session === null) return undefined
  const next = update(current.session)
  if (next === current.session) return next
  active.set({ ...current, session: next })
  return next
}

/**
 * 附件预览地址：按附件 id 存在内存里。
 * blob URL 不能进会话文件——刷新后它的源头已经不存在，图片会变成破图，
 * 而且旧 URL 永远不会被回收。
 */
const previewUrls = new Map()

const rememberPreview = (id, url) => {
  if (url === undefined) return
  const previous = previewUrls.get(id)
  if (previous !== undefined && previous !== url) URL.revokeObjectURL(previous)
  previewUrls.set(id, url)
}

/** 取附件预览地址；没有原件时返回 undefined，界面退回文件名 */
const previewOf = (id) => previewUrls.get(id)

// ---------------- 流式状态机 ----------------

/** 正在进行的流：保存控制器，便于停止 */
let streamController = null

function stopStreaming() {
  streamController?.abort()
  streamController = null
}

/** 把一个流式事件合并进回复；索引映射处理跳过的块 */
function applyEvent(reply, event, now, blockIndexes) {
  const next = reply.status === 'streaming' ? reply : { ...reply, status: 'streaming' }
  switch (event.type) {
    case 'message_start':
      return { ...next, usage: event.message?.usage ?? next.usage }
    case 'content_block_start': {
      blockIndexes.delete(event.index)
      const block = toReplyBlock(event.content_block, now)
      if (block === null) {
        return event.content_block?.type === 'tool_use' ? { ...next, canContinue: false } : next
      }
      blockIndexes.set(event.index, next.blocks.length)
      return { ...next, blocks: [...next.blocks, block] }
    }
    case 'content_block_delta': {
      const index = blockIndexes.get(event.index)
      if (index === undefined) return next
      const { delta } = event
      return updateBlock(next, index, (block) => {
        if (block.type === 'text' && delta.type === 'text_delta') {
          return { ...block, text: block.text + delta.text }
        }
        if (block.type === 'thinking' && delta.type === 'thinking_delta') {
          return { ...block, thinking: block.thinking + delta.thinking }
        }
        if (block.type === 'thinking' && delta.type === 'signature_delta') {
          return { ...block, signature: (block.signature ?? '') + delta.signature }
        }
        if (block.type === 'text' && delta.type === 'citations_delta') {
          return { ...block, citations: [...(block.citations ?? []), delta.citation] }
        }
        return block
      })
    }
    case 'content_block_stop': {
      const index = blockIndexes.get(event.index)
      if (index === undefined) return next
      blockIndexes.delete(event.index)
      return updateBlock(next, index, (block) =>
        block.type === 'thinking' && block.startedAt !== undefined && block.endedAt === undefined
          ? { ...block, endedAt: now }
          : block,
      )
    }
    case 'message_delta':
      return {
        ...next,
        stopReason: event.delta?.stop_reason,
        stopDetails: event.delta?.stop_details,
        title: typeof event.delta?.title === 'string' ? event.delta.title : next.title,
        usage: event.usage ?? next.usage,
      }
    default:
      return next
  }
}

const updateBlock = (reply, index, update) => {
  const block = reply.blocks[index]
  if (block === undefined) return reply
  const blocks = [...reply.blocks]
  blocks[index] = update(block)
  return { ...reply, blocks }
}

/** 事件里的内容块转成存档形状；客户端工具块不保存 */
function toReplyBlock(block, now) {
  switch (block?.type) {
    case 'text':
      return { type: 'text', text: block.text ?? '', citations: block.citations ?? [] }
    case 'thinking':
      return { type: 'thinking', thinking: block.thinking ?? '', signature: block.signature ?? '', startedAt: now }
    case 'server_tool_use':
    case 'web_search_tool_result':
    case 'web_fetch_tool_result':
      return block
    default:
      return null
  }
}

/** 收尾：未结束的思考块补结束时间；被拒答时丢弃已下发的思考与正文 */
function settleReply(reply, status, now, error) {
  return {
    ...reply,
    status,
    error,
    blocks: reply.blocks.flatMap((block) => {
      if (reply.stopReason === 'refusal' && (block.type === 'thinking' || block.type === 'text')) return []
      return block.type === 'thinking' && block.startedAt !== undefined && block.endedAt === undefined
        ? [{ ...block, endedAt: now }]
        : [block]
    }),
  }
}

/** 回复里全部正文，用于复制和判断是否有回答 */
const getReplyText = (reply) =>
  reply.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('')

// ---------------- 请求组装 ----------------

/**
 * 历史里能进上下文的轮次：提问后紧跟有回答的回复才保留。
 * 拒答轮次与服务端模板提示不回传。
 */
function getContextRounds(messages) {
  const rounds = []
  for (let i = 0; i + 1 < messages.length; i += 1) {
    const user = messages[i]
    const reply = messages[i + 1]
    if (user.role === 'user' && isUsableReply(reply)) {
      rounds.push([user, reply])
      i += 1
    }
  }
  return rounds
}

const isUsableReply = (message) =>
  message?.role === 'assistant' &&
  (message.status === 'done' || message.status === 'stopped') &&
  message.stopReason !== 'refusal' &&
  getReplyText(message) !== ''

/** 用户消息转请求体：先文件块后文本块 */
function toUserParam(message) {
  const blocks = message.files
    .filter((file) => file.serverId)
    .map((file) => ({
      type: file.isImage ? 'image' : 'document',
      source: { type: 'file', file_id: file.serverId },
    }))
  if (blocks.length === 0) return { role: 'user', content: message.content }
  return {
    role: 'user',
    content: [...blocks, ...(message.content ? [{ type: 'text', text: message.content }] : [])],
  }
}

/**
 * 助手消息转请求体。历史思考不回传；只保留 read_link 的工具块与结果，
 * 并原样保留 signature，服务端才能把网页拼回上下文。
 */
function toAssistantParam(reply) {
  const unsignedReadLinks = new Set(
    reply.blocks.flatMap((block) =>
      block.type === 'web_fetch_tool_result' &&
      block.kind === 'read_link' &&
      block.content?.type === 'web_fetch_result' &&
      !block.signature?.trim()
        ? [block.tool_use_id]
        : [],
    ),
  )
  const content = []
  let text = null
  for (const block of reply.blocks) {
    if (block.type === 'text') {
      if (text !== null) {
        text.text += block.text
      } else {
        const previous = content.at(-1)
        text = { type: 'text', text: `${previous?.type === 'text' ? '\n\n' : ''}${block.text}` }
        content.push(text)
      }
      continue
    }
    text = null
    if (block.type === 'server_tool_use' && block.kind === 'read_link' && !unsignedReadLinks.has(block.id)) {
      const { type, id, name, input, kind } = block
      content.push({ type, id, name, input, kind })
    } else if (block.type === 'web_fetch_tool_result' && block.kind === 'read_link' && !unsignedReadLinks.has(block.tool_use_id)) {
      content.push(block)
    }
  }
  return { role: 'assistant', content: content.filter((block) => block.type !== 'text' || block.text !== '') }
}

/**
 * 动态层：每次请求现算的上下文块，拼在稳定层之后。
 *
 * 为什么放客户端而不是 Host：这里的信息一半来自客户端状态——
 * 联网开关、文件上传是否可用、界面语言都只存在于浏览器；
 * 交给 Host 拼就得把这些状态一并回传，反而多一层同步。
 *
 * 每个字段都必须有真实来源，不允许写死：
 *   日期     来自本机时钟（用户看到的时间就是它）
 *   工具     与实际声明给 API 的 tools 完全一致，否则模型会假装调用不存在的工具
 *   开关     取自本次请求真正使用的设置
 *   语言     取自界面语言，与提示词里「用用户的语言回答」保持一致
 */
function buildDynamicContext(options) {
  const now = new Date()
  // 用本地时区的年月日，不用 toISOString（那是 UTC，跨时区会差一天）
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  /*
   * 工具表按来源分流。
   *
   * 直连模式：DeepSeek 的服务端工具叫 deepseek_web_search / deepseek_read_url，
   *   与 buildMessages 里 tools 字段逐字对应，改一处必须同时改另一处。
   * 模型池模式：工具名是 web_search / read_url（Host 侧定义的标准 ToolSchema）。
   *   早先这里对池模式也写着 deepseek_* ，但池模式下模型手里根本没有那两个工具，
   *   属于对模型的误导性声明——它会尝试调用不存在的工具然后空转。
   */
  const poolMode = options.source === 'pool'
  const tools = poolMode
    ? options.search
      ? ['web_search', 'read_url']
      : ['read_url']
    : options.search
      ? ['deepseek_web_search', 'deepseek_read_url']
      : ['deepseek_read_url']

  const lines = [
    '<context>',
    `当前日期：${date}`,
    `可用工具：${tools.join(', ')}`,
    // 池模式的联网搜索由模型自主决定是否调用 web_search，措辞与直连一致即可
    `联网搜索：${options.search ? '开启' : '关闭'}`,
    // 附件入口始终在输入区可用，没有开关可关，所以如实写「开启」
    `文件上传：开启`,
    `用户语言：${currentLocale === 'zh' ? '中文' : 'English'}`,
    '</context>',
  ]
  return lines.join('\n')
}

/** 稳定层 + 动态层拼成最终 system。两层之间空一行，便于模型区分规则与事实。 */
function composeSystemPrompt(stablePrompt, options) {
  const stable = String(stablePrompt ?? '').trim()
  const dynamic = buildDynamicContext(options)
  return stable === '' ? dynamic : `${stable}\n\n${dynamic}`
}

/** 组装整轮请求的 messages */
function buildMessages(session, question, systemPrompt, options) {
  const messages = []
  for (const [user, reply] of getContextRounds(session.messages)) {
    if (!user.content && user.files.filter((file) => file.serverId).length === 0) continue
    messages.push(toUserParam(user), toAssistantParam(reply))
  }
  messages.push(toUserParam(question))
  const common = {
    system: composeSystemPrompt(systemPrompt, options),
    messages,
    thinking: { type: options.thinking ? 'enabled' : 'disabled' },
  }

  // 模型池模式：DeepSeek 的专属字段（tools / safety_check / title）一律不发——
  // 那些是直连协议里的服务端能力，走 ctx.llm 时无意义，发了只会被忽略或报错。
  //
  // 池模式的工具链由 Host 侧组装（lib/llm-api.js 的 TOOL_SCHEMAS）：
  // web_search / read_url 以标准 ToolSchema 交给模型，由模型自己决定搜不搜。
  // 这里只把「搜索总开关」和「是否走工具链」传过去——
  // toolLoop:false 会退回旧的「Host 先搜一轮再注入」行为。
  if (options.source === 'pool') {
    return {
      ...common,
      provider: options.poolProvider,
      model: options.poolModel,
      search: options.search === true,
      toolLoop: true,
    }
  }

  return {
    ...common,
    model: options.model,
    // 深度思考时由 web_search 提供边想边搜，两种模式共用同一个工具声明。
    // 这份列表必须与 buildDynamicContext 里的「可用工具」保持一致。
    tools: options.search
      ? [{ type: 'deepseek_web_search', name: 'deepseek_web_search' }, { type: 'deepseek_read_url', name: 'deepseek_read_url' }]
      : [{ type: 'deepseek_read_url', name: 'deepseek_read_url' }],
    ...(options.safetyCheck ? { safety_check: { level: 'high' } } : {}),
    title: { enabled: true },
  }
}

/**
 * 发送一轮：先落用户消息，再流式填充助手回复。
 *
 * 流式过程中用户可以切换会话，所以这里不能依赖 active：
 * 回复只写进本次会话的快照（latest），落盘也用这份快照，
 * 否则切换后收尾会把「当前会话」当成被流式的那一个，旧会话的回复永远停在 pending。
 *
 * @param session 当前会话
 * @param content 用户输入文本
 * @param files 已上传完成的附件
 */
/**
 * 发送一轮消息。
 * @param options.reuseTurn 重试场景：提问已经在上文里，不再追加用户消息，
 *   直接把这条待填充的回复留在原位继续流式。
 */
async function sendMessage(session, content, files, options) {
  const now = Date.now()
  const sessionId = session.id
  const reuseTurn = options?.reuseTurn === true
  // 附件里的预览地址是浏览器内存 URL，不能进会话文件
  const persistedFiles = files.map(({ previewUrl, ...rest }) => {
    if (previewUrl !== undefined) rememberPreview(rest.id, previewUrl)
    return rest
  })
  const userMessage = { id: newId(), role: 'user', content, files: persistedFiles, createdAt: now }
  const reply = {
    id: newId(),
    role: 'assistant',
    createdAt: now,
    model: settings.get().model,
    thinking: settings.get().thinking,
    search: settings.get().search,
    status: 'pending',
    canContinue: true,
    blocks: [],
  }

  // 重试时复用的是已归档那条消息本身：它已经被清空成 pending 状态
  const existing = reuseTurn
    ? session.messages.filter((message) => message.role === 'assistant').at(-1)
    : undefined
  const replyMessage = existing ?? reply

  // latest 是这次请求唯一的真相来源，与 active 是否还在这个会话无关
  let latest = updateActiveSession((current) => ({
    ...current,
    title: current.title || deriveTitle(content, files),
    updatedAt: now,
    messages: reuseTurn ? current.messages : [...current.messages, userMessage, reply],
  }))
  if (latest === undefined || latest.id !== sessionId) {
    // 起手时就已经不在这个会话，直接放弃这一轮
    latest = reuseTurn ? session : { ...session, messages: [...session.messages, userMessage, reply] }
  }
  await persistSession(latest)

  const state = settings.get()
  const body = buildMessages(latest, userMessage, state.systemPrompt, state)
  const controller = new AbortController()
  streamController = controller
  if (active.get().id === sessionId) active.set({ ...active.get(), streaming: true, error: null })

  const blockIndexes = new Map()
  let finished = false
  try {
    // 按当前模型来源选路由；两条路由返回的 SSE 格式相同，下面的事件处理不用区分
    const route = state.source === 'pool' ? 'pool.messages' : 'messages'
    for await (const event of streamMessages(body, controller.signal, route)) {
      latest = applyToSession(latest, replyMessage.id, (message) => applyEvent(message, event, Date.now(), blockIndexes))
      // 服务端在 message_delta 里给了会话标题，优先用它覆盖本地截取的标题
      const serverTitle = latest.messages.find((message) => message.id === replyMessage.id)?.title
      if (typeof serverTitle === 'string' && serverTitle !== '' && serverTitle !== latest.title) {
        latest = { ...latest, title: serverTitle }
      }
      // 只有仍停留在该会话时才回写界面，避免把内容画到别的会话上
      if (active.get().id === sessionId) updateActiveSession(() => latest)
    }
    finished = true
  } catch (error) {
    const aborted = controller.signal.aborted
    latest = applyToSession(latest, replyMessage.id, (message) =>
      settleReply(message, aborted ? 'stopped' : 'error', Date.now(), aborted ? undefined : { message: error.message }),
    )
  } finally {
    if (finished) {
      latest = applyToSession(latest, replyMessage.id, (message) => settleReply(message, 'done', Date.now(), undefined))
    }
    streamController = null
    latest = { ...latest, updatedAt: Date.now() }
    // 落盘用的是被流式的那份快照，不是「当前打开」的会话
    await persistSession(latest)
    if (active.get().id === sessionId) {
      active.set({ ...active.get(), session: latest, streaming: false })
    }
  }
}

/** 在不改动 active 的前提下，对一份会话快照里的某条回复做变换 */
function applyToSession(session, messageId, transform) {
  const index = session.messages.findIndex((message) => message.id === messageId)
  if (index < 0) return session
  const messages = [...session.messages]
  const before = messages[index]
  const after = transform(before)
  // 多版本消息：流式回写只改消息字段，必须把同一份内容同步进 versions[activeVersion]，
  // 否则切走再切回来会看到旧快照，且落盘后版本数据与界面不一致。
  messages[index] = after.versions === undefined ? after : syncActiveVersion(after)
  return { ...session, messages }
}

/** 把消息字段的当前内容写回它对应的版本槽位 */
function syncActiveVersion(message) {
  const versions = message.versions
  if (versions === undefined) return message
  const slot = message.activeVersion ?? versions.length - 1
  if (versions[slot] === undefined) return message
  const next = [...versions]
  next[slot] = currentSnapshot(message)
  return { ...message, versions: next }
}

/** 标题：取第一句，最多 40 字；没有文字时用附件名 */
function deriveTitle(content, files) {
  const text = content.trim().replace(/\s+/g, ' ')
  if (text !== '') return text.length > 40 ? `${text.slice(0, 40)}…` : text
  const first = files[0]
  return first ? first.name : ''
}

/**
 * 重新生成：保留旧回答，在同一条消息里开新版本。
 *
 * 早先的做法是 slice(0, index) 把旧回答直接删掉——用户重试一次不满意，
 * 原来的回答就永久丢了。
 *
 * 版本模型（关键设计）：一条回复 = 一个「当前版本」（就是消息自己的 blocks/status/...）
 * + 一个 versions 数组（存归档的冻结快照）。这样做而不是「一条版本一条消息」，是因为：
 *   1. 上下文构造按「一问一答」配对（getContextRounds），多插一条回复会把配对打乱；
 *   2. 新版本要重新走完整流式状态机，塞进快照里会立刻过期。
 * 归档后把当前字段清空重新流式，流式路径一行都不用改。
 */
async function regenerate(session, replyId) {
  const index = session.messages.findIndex((message) => message.id === replyId)
  if (index < 1) return
  const question = session.messages[index - 1]
  if (question?.role !== 'user') return

  // 先把当前这版归档，再清空当前字段让 sendMessage 重新填充
  const archived = archiveCurrentVersion(session.messages[index])
  const prepared = {
    ...session,
    messages: session.messages.map((message) => (message.id === replyId ? archived : message)),
  }
  active.set({ ...active.get(), session: prepared })
  await sendMessage(prepared, question.content, question.files, { reuseTurn: true })
}

/**
 * 把消息的当前内容压成快照并归档，为即将到来的新回答腾出当前槽位。
 *
 * 版本模型的唯一约定（务必按它理解下面所有下标）：
 *   **versions 是完整版本列表，activeVersion 指向当前版，versions[activeVersion] 与消息字段一致。**
 *
 * 归档做两件事：把当前版快照写进它自己的槽位（历史保真），再追加一个空槽给新回答，
 * 指针移到新槽。之后流式回写经 applyToSession → syncActiveVersion 自动同步该槽，
 * 所以流式路径本身不需要感知版本。
 */
function archiveCurrentVersion(message) {
  const snapshot = currentSnapshot(message)
  const previous = message.versions ?? []
  const slot = message.activeVersion ?? previous.length - 1
  // 先把当前版写进它的槽位（首版时 previous 为空，需要新建一格）
  const history = previous.length === 0 ? [snapshot] : previous.map((version, index) => (index === slot ? snapshot : version))
  // 再追加一格空槽给新回答
  const versions = [
    ...history,
    { blocks: [], status: 'pending', createdAt: Date.now() },
  ]
  return {
    ...message,
    versions,
    activeVersion: versions.length - 1,
    blocks: [],
    status: 'pending',
    stopReason: undefined,
    stopDetails: undefined,
    error: undefined,
    usage: undefined,
    createdAt: Date.now(),
  }
}

/**
 * 切换某条回复显示的版本。
 *
 * versions 与消息字段是一一对应的：切换只做「当前字段同步回旧槽 + 目标槽读到字段」，
 * 数组长度和顺序都不变，所以反复切换不会产生重复版本。
 */
async function switchVersion(session, messageId, nextIndex) {
  const message = session.messages.find((item) => item.id === messageId)
  const versions = message?.versions
  if (versions === undefined) return
  const current = message.activeVersion ?? versions.length - 1
  if (nextIndex === current || nextIndex < 0 || nextIndex >= versions.length) return

  const target = versions[nextIndex]
  if (target === undefined) return
  // 先把当前字段写回它自己的槽位，避免切走后丢掉正在显示的这版
  const synced = versions.map((version, index) => (index === current ? currentSnapshot(message) : version))
  const updated = {
    ...message,
    versions: synced,
    activeVersion: nextIndex,
    blocks: target.blocks,
    status: target.status,
    stopReason: target.stopReason,
    stopDetails: target.stopDetails,
    error: target.error,
    usage: target.usage,
    createdAt: target.createdAt,
  }
  const next = applyToSession(session, messageId, () => updated)
  updateActiveSession(() => next)
  await persistSession(next)
}

/** 当前字段这一版的快照，字段与 archiveCurrentVersion 保持一致 */
function currentSnapshot(message) {
  return {
    blocks: message.blocks ?? [],
    status: message.status,
    stopReason: message.stopReason,
    stopDetails: message.stopDetails,
    error: message.error,
    usage: message.usage,
    title: message.title,
    createdAt: message.createdAt,
  }
}

/**
 * 这条回复有几个版本、当前显示第几个（1 起），用于界面上的切换器。
 * 恒等式：版本总数 === versions.length（含正在生成的空槽）。
 */
function versionInfo(message) {
  const versions = message?.versions
  if (versions === undefined || versions.length === 0) return null
  const index = message.activeVersion ?? versions.length - 1
  return { count: versions.length, index: index + 1 }
}

/** 附件分类：需要版面解析的交给 rich_layout_recognition，其余走 user_data */
const RICH_LAYOUT_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff'])

const extensionOf = (name) => {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

const isImageFile = (file) => file.type.startsWith('image/') || IMAGE_EXTENSIONS.has(extensionOf(file.name))

/** 上传一个附件，返回可直接进请求的引用 */
async function attachFile(file) {
  const image = isImageFile(file)
  const purpose = image ? null : RICH_LAYOUT_EXTENSIONS.has(extensionOf(file.name)) ? 'rich_layout_recognition' : 'user_data'
  const object = await uploadFile(file, purpose)
  return {
    id: newId(),
    serverId: object.id,
    name: object.filename || file.name,
    size: object.size_bytes ?? file.size,
    isImage: image,
    mimeType: object.mime_type || file.type,
  }
}
