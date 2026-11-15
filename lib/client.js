window.__ModuleLoader__.load({
  id: 'dsh-dsc',
  factory(require) {
/* ===== 00-runtime.js ===== */
const React = require('react')
const ReactDOM = require('react-dom')
const h = React.createElement
const { memo, useCallback, useEffect, useMemo, useRef, useState } = React

/** 客户端要用的宿主服务；缺任何一个都不会激活，避免在半残环境里报错 */
const INJECT = ['slots', 'layout', 'locale', 'theme']

/** 类名拼接：只保留真值 */
const cx = (...values) => values.filter(Boolean).join(' ')

/** 稳定 id：会话与消息都不需要和宿主对齐，本地唯一即可 */
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * 极简订阅式 store：React 18 的 useSyncExternalStore 读快照，
 * 状态不可变更新，避免外部库依赖。
 */
function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get: () => state,
    set(update) {
      const next = typeof update === 'function' ? update(state) : update
      if (next === state) return
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** 从 store 里选一片状态；选择函数应返回稳定引用或原始值 */
function useStore(store, select) {
  return React.useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  )
}

/** 每秒推进一次的 tick，用于思考用时与搜索词轮播 */
function useTicker(active, interval = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setTick((value) => value + 1), interval)
    return () => clearInterval(timer)
  }, [active, interval])
}

/** 点击外部关闭：锚定弹层的通用行为 */
function useOutsideClick(ref, active, onClose) {
  useEffect(() => {
    if (!active) return undefined
    const handler = (event) => {
      if (ref.current !== null && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [ref, active, onClose])
}

/** 记住用户选的麦克风：只存 deviceId，不涉及隐私内容 */
const MIC_STORAGE_KEY = 'dsh-deepseek-chat:mic'

function readPreferredMic() {
  try {
    return localStorage.getItem(MIC_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writePreferredMic(deviceId) {
  try {
    if (deviceId === '') localStorage.removeItem(MIC_STORAGE_KEY)
    else localStorage.setItem(MIC_STORAGE_KEY, deviceId)
  } catch {
    // 存储不可用时只影响下次记忆，不影响本次录音
  }
}

/**
 * 应用内确认弹窗：替代 window.confirm。
 * 原生弹窗样式与官方视觉完全脱节（系统灰窗 + 「确定/取消」按钮），
 * 官方确认弹窗是应用内浮层：深色圆角卡 + 主色/危险色按钮。
 * openConfirm({ title, body, confirmLabel, danger }) 返回 Promise<boolean>。
 */
const confirmStore = createStore({ spec: null, seq: 0 })

function openConfirm(spec) {
  return new Promise((resolve) => {
    confirmStore.set({ spec, seq: confirmStore.get().seq + 1 })
    confirmStore.__resolve = resolve
  })
}

function settleConfirm(result) {
  const state = confirmStore.get()
  if (state.spec === null) return
  confirmStore.set({ spec: null, seq: state.seq })
  confirmStore.__resolve?.(result)
}

/* ===== 05-i18n.js ===== */
/**
 * 界面文案。中文为准，英文兜底；宿主 locale 变化时通过 T() 重新取名。
 * 宿主 locale 服务负责读当前语言，这里只保存两份字典。
 */
const DICT = {
  zh: {
    panelLabel: 'DeepSeek',
    appName: 'DeepSeek',
    newChat: '开启新对话',
    openSider: '打开侧边栏',
    modelSource: '模型来源',
    sourceDirect: 'DeepSeek 直连',
    sourcePool: 'DSH 模型池',
    sourceDirectHint: '使用 DeepSeek 官方接口，支持联网搜索、内容安全、服务端标题等全部特性。',
    sourcePoolHint: '复用 DSH 已配置的模型与凭据，可用其他厂商模型；联网搜索由下方搜索渠道提供，不含内容安全校验。',
    poolProvider: '服务提供方',
    poolModel: '模型',
    poolNoSearchKey: '当前搜索渠道还没有可用的 Key：联网搜索会失败。请在下方搜索设置里配置，或换一个渠道。',
    poolNoProxy: 'Tavily 需要代理才能访问：请在下方搜索设置里填写代理地址，例如 127.0.0.1:7897。',
    searchChannel: '搜索渠道',
    searchChannelHint: '模型池模式的联网搜索由这里选定的服务提供。DeepSeek 官方搜索复用上面的 DeepSeek 凭据，国内直连。',
    searchProxy: '搜索代理',
    searchProxyHint: '只有 Tavily 需要代理（其域名在本机无法直接解析）。留空表示直连。',
    searchProxyPlaceholder: '例如 127.0.0.1:7897',
    searchKeyReady: '已就绪',
    searchKeyMissing: '缺少 Key',
    searchNeedsProxy: '需要代理',
    settingsSaved: '已保存',
    settingsGeneral: '通用设置',
    settingsAccount: '账号管理',
    settingsData: '数据管理',
    settingsAbout: '服务协议',
    dataSessions: '历史对话',
    dataSessionsDesc: '会话保存在本机的 Host 目录里，换浏览器或清缓存都不会丢失。',
    dataClearAll: '删除所有对话',
    dataClearAllDesc: '删除后无法恢复，请确认已经不再需要这些对话。',
    dataClearAllAction: '删除',
    dataClearConfirm: '确定删除所有对话？此操作无法撤销。',
    aboutBody1: '这是运行在 DeepSeek Harness 面板里的 DeepSeek 界面复刻实现，不是 DeepSeek 官方客户端。界面与交互对齐官方网页端，模型调用走 DeepSeek 官方接口或你已配置的模型来源。',
    aboutBody2: 'API Key 只保存在本机的 DSH 凭据里，不会写进浏览器，也不会随会话文件落盘。联网搜索在模型池模式下由你选择的搜索渠道提供。',
    untitled: '新对话',
    emptyTitle: '你好，有什么我能帮你的吗？',
    placeholder: '给 DeepSeek 发送消息',
    today: '今天',
    yesterday: '昨天',
    within30Days: '30 天内',
    earlier: '更早',
    searchChats: '搜索对话',
    searchPlaceholder: '搜索对话',
    searchEmpty: '没有匹配的对话',
    collapseSidebar: '收起边栏',
    expandSidebar: '打开边栏',
    multiSelect: '多选',
    selectTitle: '选择对话',
    selectedCount: '已选择 {count} 个对话',
    pin: '置顶',
    deleteSelected: '删除',
    pinConfirm: '将选择的 {count} 个对话置顶？',
    deleteConfirm: '删除选择的 {count} 个对话？删除后，对话将不可恢复。',
    selectSession: '选择对话',
    exitSelect: '退出多选',
    pinned: '置顶',
    unpin: '取消置顶',
    share: '分享',
    more: '更多',
    shareUnavailable: '这个实现是本地会话，没有可分享的公开链接',
    deleteIrreversible: '删除后，对话将不可恢复。',
    confirm: '确定',
    menuSettings: '系统设置',
    menuExit: '返回对话',
    accountLocal: '本机账号',
    newChatShortcut: 'Ctrl + J',
    thinking: '深度思考',
    search: '智能搜索',
    send: '发送',
    stop: '停止',
    thinkingInProgress: '正在思考',
    searching: '正在搜索',
    readingLink: '正在阅读链接',
    browsing: '正在浏览网页',
    thoughtFor: '已思考（用时 {count} 秒）',
    thoughtStopped: '已停止思考',
    deepSearching: '正在搜索网页',
    toolSearchIntro: '正在搜索',
    toolSearchResults: '搜索到 {count} 个网页',
    toolSearchResultsOne: '搜索到 1 个网页',
    messageSearchResults: '已阅读 {count} 个网页',
    messageSearchResultsOne: '已阅读 1 个网页',
    toolSearchNoResult: '没有找到相关网页',
    messageSearchNoResult: '没有找到相关网页',
    toolSearchFail: '搜索失败',
    searchStopped: '搜索已停止',
    toolOpensIntro: '浏览 {count} 个页面',
    toolOpenOneIntro: '浏览 1 个页面',
    toolOpenViewAll: '查看全部',
    toolOpenFail: '网页打开失败',
    toolFindIntro: '查找',
    toolFindFail: '查找失败',
    reading: '正在阅读',
    copy: '复制',
    copied: '已复制',
    readAloud: '朗读',
    stopReading: '停止朗读',
    regenerate: '重新生成',
    like: '喜欢',
    dislike: '不喜欢',
    versionPrev: '上一个版本',
    versionNext: '下一个版本',
    copyCode: '复制代码',
    copyFailed: '复制失败，请手动选择后复制',
    citationPreview: '来源预览',
    openSource: '在侧栏中打开',
    edit: '编辑',
    save: '保存',
    cancel: '取消',
    retry: '重试',
    sources: '来源',
    sourcesCount: '{count} 个网页',
    close: '关闭',
    settings: '设置',
    apiKey: 'API Key',
    apiKeyPlaceholder: '填入 DeepSeek API Key',
    apiKeyHint: '只保存在本机的 DSH 凭据里，不写进浏览器，也不会显示完整值。',
    apiKeyEmpty: '输入框是空的，没有可保存的内容。要删除已保存的 Key 请点「清除」。',
    save2: '保存',
    clear: '清除',
    verify: '校验',
    verifying: '校验中…',
    verified: '校验通过',
    credentialActivePlugin: '当前使用插件自有的 API Key',
    credentialActiveAccount: '当前使用已登录的 DeepSeek 账号',
    credentialActiveEnv: '当前使用环境变量里的 DEEPSEEK_API_KEY',
    credentialMissing: '还没有可用的凭据，请填写 API Key',
    voiceInput: '语音输入',
    recording: '正在录音，再点一次结束',
    recordingLimit: '已到 120 秒上限，自动结束录音',
    microphone: '麦克风',
    microphoneDefault: '系统默认设备',
    microphoneDevice: '麦克风',
    microphoneHint: '如果录音提示「静音轨道」，多半是系统默认选到了虚拟声卡，在这里换一个真实麦克风。',
    backToConversation: '返回对话',
    transcribing: '正在识别…',
    attach: '上传文件',
    attachHint: '支持 PDF、Word、PowerPoint 与图片',
    deleteChat: '删除',
    rename: '重命名',
    welcomeTip: '内容由 AI 生成，请仔细甄别',
    sendFailed: '发送失败',
    stopGenerating: '已停止生成',
    emptyAnswer: '没有返回内容',
    refused: '这个回答被内容安全策略拦截了',
    newChatTip: '新对话',
    thinkingOn: '已开启深度思考',
    thinkingOff: '已关闭深度思考',
    searchOn: '已开启智能搜索',
    searchOff: '已关闭智能搜索',
    needKey: '请先在设置里填写 DeepSeek API Key',
    loadFailed: '加载失败',
    sessionsEmpty: '还没有对话',
  },
  en: {
    panelLabel: 'DeepSeek',
    appName: 'DeepSeek',
    newChat: 'New chat',
    openSider: 'Open sidebar',
    modelSource: 'Model source',
    sourceDirect: 'DeepSeek direct',
    sourcePool: 'DSH model pool',
    sourceDirectHint: 'Uses the official DeepSeek API with web search, safety check, and server-side titles.',
    sourcePoolHint: 'Reuses models and credentials configured in DSH, including other vendors. Web search comes from the channel below; no safety check.',
    poolProvider: 'Provider',
    poolModel: 'Model',
    poolNoSearchKey: 'The selected search channel has no key, so web search will fail. Configure it below or pick another channel.',
    poolNoProxy: 'Tavily requires a proxy. Set the proxy address below, e.g. 127.0.0.1:7897.',
    searchChannel: 'Search channel',
    searchChannelHint: 'Model pool web search is served by this channel. DeepSeek official search reuses the DeepSeek credential above and works without a proxy.',
    searchProxy: 'Search proxy',
    searchProxyHint: 'Only Tavily needs a proxy — its domain cannot be resolved locally. Leave empty to connect directly.',
    searchProxyPlaceholder: 'e.g. 127.0.0.1:7897',
    searchKeyReady: 'Ready',
    searchKeyMissing: 'No key',
    searchNeedsProxy: 'Proxy needed',
    settingsSaved: 'Saved',
    settingsGeneral: 'General',
    settingsAccount: 'Account',
    settingsData: 'Data',
    settingsAbout: 'About',
    dataSessions: 'Conversations',
    dataSessionsDesc: 'Conversations are stored in this machine’s Host directory, so clearing the browser cache will not lose them.',
    dataClearAll: 'Delete all conversations',
    dataClearAllDesc: 'This cannot be undone. Make sure you no longer need them.',
    dataClearAllAction: 'Delete',
    dataClearConfirm: 'Delete all conversations? This cannot be undone.',
    aboutBody1: 'This is a DeepSeek interface replica running inside a DeepSeek Harness panel, not an official DeepSeek client. The interface follows the official web app; model calls go to the official DeepSeek API or whichever model source you configured.',
    aboutBody2: 'The API key is stored only in this machine’s DSH credentials — never in the browser, never in the conversation file. In model pool mode, web search is provided by the search channel you pick.',
    untitled: 'New chat',
    emptyTitle: 'Hi, how can I help you today?',
    placeholder: 'Message DeepSeek',
    today: 'Today',
    yesterday: 'Yesterday',
    within30Days: 'Last 30 days',
    earlier: 'Earlier',
    searchChats: 'Search chats',
    searchPlaceholder: 'Search chats',
    searchEmpty: 'No matching chats',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Open sidebar',
    multiSelect: 'Select',
    selectTitle: 'Select chats',
    selectedCount: '{count} selected',
    pin: 'Pin',
    deleteSelected: 'Delete',
    pinConfirm: 'Pin {count} selected chats?',
    deleteConfirm: 'Delete {count} selected chats? They cannot be recovered.',
    selectSession: 'Select chats',
    exitSelect: 'Exit selection',
    pinned: 'Pinned',
    unpin: 'Unpin',
    share: 'Share',
    more: 'More',
    shareUnavailable: 'Chats here are local, so there is no public share link',
    deleteIrreversible: 'Deleted chats cannot be recovered.',
    confirm: 'OK',
    menuSettings: 'Settings',
    menuExit: 'Back to chat',
    accountLocal: 'Local account',
    newChatShortcut: 'Ctrl + J',
    thinking: 'DeepThink',
    search: 'Search',
    send: 'Send',
    stop: 'Stop',
    thinkingInProgress: 'Thinking',
    searching: 'Searching',
    readingLink: 'Reading link',
    browsing: 'Browsing',
    thoughtFor: 'Thought for {count}s',
    thoughtStopped: 'Thought stopped',
    deepSearching: 'Searching the web',
    toolSearchIntro: 'Searching',
    toolSearchResults: 'Found {count} pages',
    toolSearchResultsOne: 'Found 1 page',
    messageSearchResults: 'Read {count} pages',
    messageSearchResultsOne: 'Read 1 page',
    toolSearchNoResult: 'No matching pages',
    messageSearchNoResult: 'No matching pages',
    toolSearchFail: 'Search failed',
    searchStopped: 'Search stopped',
    toolOpensIntro: 'Browsed {count} pages',
    toolOpenOneIntro: 'Browsed 1 page',
    toolOpenViewAll: 'View all',
    toolOpenFail: 'Could not open the page',
    toolFindIntro: 'Find',
    toolFindFail: 'Find failed',
    reading: 'Reading',
    copy: 'Copy',
    copied: 'Copied',
    readAloud: 'Read aloud',
    stopReading: 'Stop reading',
    regenerate: 'Regenerate',
    like: 'Like',
    dislike: 'Dislike',
    versionPrev: 'Previous version',
    versionNext: 'Next version',
    copyCode: 'Copy code',
    copyFailed: 'Copy failed. Select the text and copy manually.',
    citationPreview: 'Source preview',
    openSource: 'Open in side panel',
    edit: 'Edit',
    save: 'Save',
    cancel: 'Cancel',
    retry: 'Retry',
    sources: 'Sources',
    sourcesCount: '{count} pages',
    close: 'Close',
    settings: 'Settings',
    apiKey: 'API key',
    apiKeyPlaceholder: 'Enter your DeepSeek API key',
    apiKeyHint: 'Stored in this machine’s DSH credentials, never in the browser, and never shown in full.',
    apiKeyEmpty: 'The field is empty, so there is nothing to save. Use Clear to remove the stored key.',
    save2: 'Save',
    clear: 'Clear',
    verify: 'Verify',
    verifying: 'Verifying…',
    verified: 'Verified',
    credentialActivePlugin: 'Using this plugin’s own API key',
    credentialActiveAccount: 'Using the signed-in DeepSeek account',
    credentialActiveEnv: 'Using DEEPSEEK_API_KEY from the environment',
    credentialMissing: 'No credential yet — enter an API key',
    voiceInput: 'Voice input',
    recording: 'Recording — tap again to stop',
    recordingLimit: 'Reached the 120-second limit; recording stopped',
    microphone: 'Microphone',
    microphoneDefault: 'System default',
    microphoneDevice: 'Microphone',
    microphoneHint: 'If recording reports a silent track, the system default is probably a virtual device; pick a real microphone here.',
    backToConversation: 'Back to chat',
    transcribing: 'Transcribing…',
    attach: 'Upload a file',
    attachHint: 'PDF, Word, PowerPoint, and images',
    deleteChat: 'Delete',
    rename: 'Rename',
    welcomeTip: 'AI-generated content may be inaccurate',
    sendFailed: 'Failed to send',
    stopGenerating: 'Generation stopped',
    emptyAnswer: 'No content returned',
    refused: 'This answer was blocked by the content safety check',
    newChatTip: 'New chat',
    thinkingOn: 'DeepThink on',
    thinkingOff: 'DeepThink off',
    searchOn: 'Search on',
    searchOff: 'Search off',
    needKey: 'Enter your DeepSeek API key in Settings first',
    loadFailed: 'Failed to load',
    sessionsEmpty: 'No conversations yet',
  },
}

let currentLocale = 'zh'

/** 跟随宿主语言：只要语言以 zh 开头就按中文走，其余按英文 */
function setLocale(localeId) {
  const next = String(localeId ?? '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  if (next !== currentLocale) {
    currentLocale = next
    localeListeners.forEach((listener) => listener())
  }
}

const localeListeners = new Set()

/** 语言切换时触发重渲染；组件里调用一次即可 */
function useLocaleRevision() {
  const [, force] = useState(0)
  useEffect(() => {
    const listener = () => force((value) => value + 1)
    localeListeners.add(listener)
    return () => localeListeners.delete(listener)
  }, [])
}

/** 取文案并按 {name} 占位符替换参数 */
function T(key, params) {
  const text = DICT[currentLocale][key] ?? DICT.zh[key] ?? key
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  )
}

/* ===== 10-api.js ===== */
/** 面板与 Host 之间唯一的通信入口；浏览器从不接触 DeepSeek 的密钥 */
/**
 * 路由必须基于 document.baseURI 拼接，且不能带前导斜杠。
 * 桌面端页面以 file:// 加载，绝对路径会指向文件系统根目录，请求根本到不了 Host；
 * 浏览器端的页面可能挂在子路径下，也只有相对 baseURI 才正确。
 */
const BASE = new URL('api/deepseek-chat', document.baseURI)

/** 拼出一条完整路由；path 里可以带子路径，如 files.upload */
const url = (path) => new URL(path, `${BASE.href}/`).href

/** 统一错误：把 Host 或上游返回的 message 提出来 */
class AppError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AppError'
    this.status = status
  }
}

/**
 * 发一次请求并处理网络层失败。
 * 网络失败（连不上、被 CSP 拦、URL 解析不到 Host）原始报错只有 "Failed to fetch"，
 * 看不出打到了哪个地址，所以这里补上 URL 与错误名，排查时能直接定位。
 */
async function request(input, init) {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    const reason = error?.name === 'TypeError' ? '无法连接 Host' : error?.message ?? String(error)
    throw new AppError(`${reason}（${input}）`)
  }
}

const readError = async (response) => {
  const text = await response.text().catch(() => '')
  if (text === '') return `HTTP ${response.status}`
  try {
    const body = JSON.parse(text)
    return body?.error?.message || body?.message || `HTTP ${response.status}`
  } catch {
    return text.slice(0, 300)
  }
}

const getJson = async (path, init) => {
  const response = await request(url(path), init)
  if (!response.ok) throw new AppError(await readError(response), response.status)
  return response.json()
}

const postJson = async (path, body, signal) => {
  const response = await request(url(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal,
  })
  if (!response.ok) throw new AppError(await readError(response), response.status)
  return response.json()
}

/** 启动信息：配置默认值、凭据状态、会话摘要 */
const bootstrap = () => getJson('bootstrap')

const listSessions = () => getJson('sessions')

const readSession = (id) => postJson('session.read', { id })

const saveSession = (session) => postJson('session.save', { session })

const deleteSession = (id) => postJson('session.delete', { id })

const readCredential = () => getJson('credential')

const saveCredential = (apiKey) => postJson('credential.save', { apiKey })

const verifyCredential = (apiKey) => postJson('credential.verify', { apiKey })

const readSystemPrompt = () => getJson('system-prompt')

/** 自检：Host 侧看到凭据服务了吗 */
const diagnoseHost = () => getJson('diagnose')

/** 模型池：宿主里可用的 provider 与模型 */
const readPoolProviders = () => getJson('pool.providers')

/** 搜索渠道设置：当前渠道、可选渠道清单、代理地址 */
const readSearchSettings = () => getJson('search.settings')

/** 保存搜索渠道设置；provider / proxy 传空串表示回到插件配置的默认值 */
const saveSearchSettings = (body) => postJson('search.save', body)

/**
 * 上传附件到 Files API。
 * 必须解析的文档用 rich_layout_recognition，能读出图；纯文本类用 user_data。
 */
const uploadFile = async (file, purpose, signal) => {
  const form = new FormData()
  if (purpose) form.append('purpose', purpose)
  form.append('file', file)
  const response = await request(url('files.upload'), { method: 'POST', body: form, signal })
  if (!response.ok) throw new AppError(await readError(response), response.status)
  return response.json()
}

const deleteFile = (id) => postJson('files.delete', { id })

/**
 * 发起一轮对话，逐个产出流式事件。
 *
 * 两条路由，客户端对返回的事件格式无感（Host 已把模型池转成同样的 SSE）：
 *   messages       直连 DeepSeek，全特性
 *   pool.messages  走 DSH 的 ctx.llm，可用任意 provider，搜索由 Host 自己实现
 *
 * @param route 由调用方按当前模型来源决定
 */
async function* streamMessages(body, signal, route = 'messages') {
  const response = await request(url(route), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) throw new AppError(await readError(response), response.status)
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw new AppError('服务端没有返回事件流', response.status)
  }
  for await (const { event, data } of readSse(response.body, signal)) {
    let payload
    try {
      payload = JSON.parse(data)
    } catch {
      if (event !== 'error') continue
    }
    if (payload?.error?.message) throw new AppError(payload.error.message)
    if (event === 'error') throw new AppError(typeof data === 'string' ? data : '流式响应出错')
    if (payload?.type) yield payload
    if (payload?.type === 'message_stop') return
  }
  throw new AppError('连接提前结束')
}

/** SSE 解析：按空行切帧，冒号开头是保活注释 */
async function* readSse(stream, signal) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      if (signal?.aborted) return
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const parsed = parseFrame(frame)
        if (parsed !== undefined) yield parsed
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
}

function parseFrame(frame) {
  let event = ''
  const data = []
  for (const rawLine of frame.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (line === '' || line.startsWith(':')) continue
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return undefined
  return { event, data: data.join('\n') }
}

/** 朗读：拿回音频 blob，交给浏览器播放 */
const synthesize = async (text, voiceId, signal) => {
  const response = await request(url('tts'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, voiceId }),
    signal,
  })
  if (!response.ok) throw new AppError(await readError(response), response.status)
  return response.blob()
}

/** 语音输入：把录音切成 WAV 交给 ASR 转写 */
const transcribe = async (blob, signal) => {
  const form = new FormData()
  form.append('file', blob, 'speech.wav')
  const response = await request(url('asr'), { method: 'POST', body: form, signal })
  if (!response.ok) throw new AppError(await readError(response), response.status)
  const payload = await response.json()
  return typeof payload?.text === 'string' ? payload.text : ''
}

/* ===== 20-store.js ===== */
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

/* ===== 30-view.js ===== */
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

/* ===== 40-markdown.js ===== */
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

/* ===== 45-prism.js ===== */
/*
 * Prism 语法高亮（构建产物，不要手改）。
 *
 * 由 scripts/build-prism.mjs 从 node_modules/prismjs 生成：
 * 核心 + 14 个语言组件（markup, css, clike, javascript, typescript, json, python, rust, go, java, bash, sql, yaml, markdown）。
 * 与官方 chat.deepseek.com 用的是同一套 Prism、同一批 token 类名
 * （punctuation / property / operator / string / boolean …），
 * 因此暗色配色可以直接照抄官方取值，见 lib/app.css 的 .ds-md-code-block .token 段。
 *
 * 重新生成：node scripts/build-prism.mjs
 */

var _self="undefined"!=typeof window?window:"undefined"!=typeof WorkerGlobalScope&&self instanceof WorkerGlobalScope?self:{},Prism=function(e){var t=/(?:^|\s)lang(?:uage)?-([\w-]+)(?=\s|$)/i,n=0,a={},r={manual:e.Prism&&e.Prism.manual,disableWorkerMessageHandler:e.Prism&&e.Prism.disableWorkerMessageHandler,util:{encode:function e(t){return t instanceof s?new s(t.type,e(t.content),t.alias):Array.isArray(t)?t.map(e):t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/\u00a0/g," ")},type:function(e){return Object.prototype.toString.call(e).slice(8,-1)},objId:function(e){return e.__id||Object.defineProperty(e,"__id",{value:++n}),e.__id},clone:function e(t,n){var a,s;switch(n=n||{},r.util.type(t)){case"Object":if(s=r.util.objId(t),n[s])return n[s];for(var i in a={},n[s]=a,t)t.hasOwnProperty(i)&&(a[i]=e(t[i],n));return a;case"Array":return s=r.util.objId(t),n[s]?n[s]:(a=[],n[s]=a,t.forEach(function(t,r){a[r]=e(t,n)}),a);default:return t}},getLanguage:function(e){for(;e;){var n=t.exec(e.className);if(n)return n[1].toLowerCase();e=e.parentElement}return"none"},setLanguage:function(e,n){e.className=e.className.replace(RegExp(t,"gi"),""),e.classList.add("language-"+n)},currentScript:function(){if("undefined"==typeof document)return null;if(document.currentScript&&"SCRIPT"===document.currentScript.tagName)return document.currentScript;try{throw new Error}catch(a){var e=(/at [^(\r\n]*\((.*):[^:]+:[^:]+\)$/i.exec(a.stack)||[])[1];if(e){var t=document.getElementsByTagName("script");for(var n in t)if(t[n].src==e)return t[n]}return null}},isActive:function(e,t,n){for(var a="no-"+t;e;){var r=e.classList;if(r.contains(t))return!0;if(r.contains(a))return!1;e=e.parentElement}return!!n}},languages:{plain:a,plaintext:a,text:a,txt:a,extend:function(e,t){var n=r.util.clone(r.languages[e]);for(var a in t)n[a]=t[a];return n},insertBefore:function(e,t,n,a){var s=(a=a||r.languages)[e],i={};for(var o in s)if(s.hasOwnProperty(o)){if(o==t)for(var l in n)n.hasOwnProperty(l)&&(i[l]=n[l]);n.hasOwnProperty(o)||(i[o]=s[o])}var u=a[e];return a[e]=i,r.languages.DFS(r.languages,function(t,n){n===u&&t!=e&&(this[t]=i)}),i},DFS:function e(t,n,a,s){s=s||{};var i=r.util.objId;for(var o in t)if(t.hasOwnProperty(o)){n.call(t,o,t[o],a||o);var l=t[o],u=r.util.type(l);"Object"!==u||s[i(l)]?"Array"!==u||s[i(l)]||(s[i(l)]=!0,e(l,n,o,s)):(s[i(l)]=!0,e(l,n,null,s))}}},plugins:{},highlightAll:function(e,t){r.highlightAllUnder(document,e,t)},highlightAllUnder:function(e,t,n){var a={callback:n,container:e,selector:'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'};r.hooks.run("before-highlightall",a),a.elements=Array.prototype.slice.apply(a.container.querySelectorAll(a.selector)),r.hooks.run("before-all-elements-highlight",a);for(var s,i=0;s=a.elements[i++];)r.highlightElement(s,!0===t,a.callback)},highlightElement:function(t,n,a){var s=r.util.getLanguage(t),i=r.languages[s];r.util.setLanguage(t,s);var o=t.parentElement;o&&"pre"===o.nodeName.toLowerCase()&&r.util.setLanguage(o,s);var l={element:t,language:s,grammar:i,code:t.textContent};function u(e){l.highlightedCode=e,r.hooks.run("before-insert",l),l.element.innerHTML=l.highlightedCode,r.hooks.run("after-highlight",l),r.hooks.run("complete",l),a&&a.call(l.element)}if(r.hooks.run("before-sanity-check",l),(o=l.element.parentElement)&&"pre"===o.nodeName.toLowerCase()&&!o.hasAttribute("tabindex")&&o.setAttribute("tabindex","0"),!l.code)return r.hooks.run("complete",l),void(a&&a.call(l.element));if(r.hooks.run("before-highlight",l),l.grammar)if(n&&e.Worker){var g=new Worker(r.filename);g.onmessage=function(e){u(e.data)},g.postMessage(JSON.stringify({language:l.language,code:l.code,immediateClose:!0}))}else u(r.highlight(l.code,l.grammar,l.language));else u(r.util.encode(l.code))},highlight:function(e,t,n){var a={code:e,grammar:t,language:n};if(r.hooks.run("before-tokenize",a),!a.grammar)throw new Error('The language "'+a.language+'" has no grammar.');return a.tokens=r.tokenize(a.code,a.grammar),r.hooks.run("after-tokenize",a),s.stringify(r.util.encode(a.tokens),a.language)},tokenize:function(e,t){var n=t.rest;if(n){for(var a in n)t[a]=n[a];delete t.rest}var r=new l;return u(r,r.head,e),o(e,r,t,r.head,0),function(e){var t=[],n=e.head.next;for(;n!==e.tail;)t.push(n.value),n=n.next;return t}(r)},hooks:{all:{},add:function(e,t){var n=r.hooks.all;n[e]=n[e]||[],n[e].push(t)},run:function(e,t){var n=r.hooks.all[e];if(n&&n.length)for(var a,s=0;a=n[s++];)a(t)}},Token:s};function s(e,t,n,a){this.type=e,this.content=t,this.alias=n,this.length=0|(a||"").length}function i(e,t,n,a){e.lastIndex=t;var r=e.exec(n);if(r&&a&&r[1]){var s=r[1].length;r.index+=s,r[0]=r[0].slice(s)}return r}function o(e,t,n,a,l,c){for(var d in n)if(n.hasOwnProperty(d)&&n[d]){var p=n[d];p=Array.isArray(p)?p:[p];for(var m=0;m<p.length;++m){if(c&&c.cause==d+","+m)return;var h=p[m],f=h.inside,v=!!h.lookbehind,b=!!h.greedy,y=h.alias;if(b&&!h.pattern.global){var F=h.pattern.toString().match(/[imsuy]*$/)[0];h.pattern=RegExp(h.pattern.source,F+"g")}for(var x=h.pattern||h,k=a.next,w=l;k!==t.tail&&!(c&&w>=c.reach);w+=k.value.length,k=k.next){var A=k.value;if(t.length>e.length)return;if(!(A instanceof s)){var P,$=1;if(b){if(!(P=i(x,w,e,v))||P.index>=e.length)break;var S=P.index,E=P.index+P[0].length,_=w;for(_+=k.value.length;S>=_;)_+=(k=k.next).value.length;if(w=_-=k.value.length,k.value instanceof s)continue;for(var j=k;j!==t.tail&&(_<E||"string"==typeof j.value);j=j.next)$++,_+=j.value.length;$--,A=e.slice(w,_),P.index-=w}else if(!(P=i(x,0,A,v)))continue;S=P.index;var C=P[0],L=A.slice(0,S),z=A.slice(S+C.length),O=w+A.length;c&&O>c.reach&&(c.reach=O);var T=k.prev;if(L&&(T=u(t,T,L),w+=L.length),g(t,T,$),k=u(t,T,new s(d,f?r.tokenize(C,f):C,y,C)),z&&u(t,k,z),$>1){var M={cause:d+","+m,reach:O};o(e,t,n,k.prev,w,M),c&&M.reach>c.reach&&(c.reach=M.reach)}}}}}}function l(){var e={value:null,prev:null,next:null},t={value:null,prev:e,next:null};e.next=t,this.head=e,this.tail=t,this.length=0}function u(e,t,n){var a=t.next,r={value:n,prev:t,next:a};return t.next=r,a.prev=r,e.length++,r}function g(e,t,n){for(var a=t.next,r=0;r<n&&a!==e.tail;r++)a=a.next;t.next=a,a.prev=t,e.length-=r}if(e.Prism=r,s.stringify=function e(t,n){if("string"==typeof t)return t;if(Array.isArray(t)){var a="";return t.forEach(function(t){a+=e(t,n)}),a}var s={type:t.type,content:e(t.content,n),tag:"span",classes:["token",t.type],attributes:{},language:n},i=t.alias;i&&(Array.isArray(i)?Array.prototype.push.apply(s.classes,i):s.classes.push(i)),r.hooks.run("wrap",s);var o="";for(var l in s.attributes)o+=" "+l+'="'+(s.attributes[l]||"").replace(/"/g,"&quot;")+'"';return"<"+s.tag+' class="'+s.classes.join(" ")+'"'+o+">"+s.content+"</"+s.tag+">"},!e.document)return e.addEventListener?(r.disableWorkerMessageHandler||e.addEventListener("message",function(t){var n=JSON.parse(t.data),a=n.language,s=n.code,i=n.immediateClose;e.postMessage(r.highlight(s,r.languages[a],a)),i&&e.close()},!1),r):r;var c=r.util.currentScript();function d(){r.manual||r.highlightAll()}if(c&&(r.filename=c.src,c.hasAttribute("data-manual")&&(r.manual=!0)),!r.manual){var p=document.readyState;"loading"===p||"interactive"===p&&c&&c.defer?document.addEventListener("DOMContentLoaded",d):window.requestAnimationFrame?window.requestAnimationFrame(d):window.setTimeout(d,16)}return r}(_self);
/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 *
 * @license MIT <https://opensource.org/licenses/MIT>
 * @author Lea Verou <https://lea.verou.me>
 * @namespace
 * @public
 */"undefined"!=typeof module&&module.exports&&(module.exports=Prism),"undefined"!=typeof global&&(global.Prism=Prism),Prism.languages.markup={comment:{pattern:/<!--(?:(?!<!--)[\s\S])*?-->/,greedy:!0},prolog:{pattern:/<\?[\s\S]+?\?>/,greedy:!0},doctype:{pattern:/<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,greedy:!0,inside:{"internal-subset":{pattern:/(^[^\[]*\[)[\s\S]+(?=\]>$)/,lookbehind:!0,greedy:!0,inside:null},string:{pattern:/"[^"]*"|'[^']*'/,greedy:!0},punctuation:/^<!|>$|[[\]]/,"doctype-tag":/^DOCTYPE/i,name:/[^\s<>'"]+/}},cdata:{pattern:/<!\[CDATA\[[\s\S]*?\]\]>/i,greedy:!0},tag:{pattern:/<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,greedy:!0,inside:{tag:{pattern:/^<\/?[^\s>\/]+/,inside:{punctuation:/^<\/?/,namespace:/^[^\s>\/:]+:/}},"special-attr":[],"attr-value":{pattern:/=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,inside:{punctuation:[{pattern:/^=/,alias:"attr-equals"},{pattern:/^(\s*)["']|["']$/,lookbehind:!0}]}},punctuation:/\/?>/,"attr-name":{pattern:/[^\s>\/]+/,inside:{namespace:/^[^\s>\/:]+:/}}}},entity:[{pattern:/&[\da-z]{1,8};/i,alias:"named-entity"},/&#x?[\da-f]{1,8};/i]},Prism.languages.markup.tag.inside["attr-value"].inside.entity=Prism.languages.markup.entity,Prism.languages.markup.doctype.inside["internal-subset"].inside=Prism.languages.markup,Prism.hooks.add("wrap",function(e){"entity"===e.type&&(e.attributes.title=e.content.replace(/&amp;/,"&"))}),Object.defineProperty(Prism.languages.markup.tag,"addInlined",{value:function(e,t){var n={};n["language-"+t]={pattern:/(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,lookbehind:!0,inside:Prism.languages[t]},n.cdata=/^<!\[CDATA\[|\]\]>$/i;var a={"included-cdata":{pattern:/<!\[CDATA\[[\s\S]*?\]\]>/i,inside:n}};a["language-"+t]={pattern:/[\s\S]+/,inside:Prism.languages[t]};var r={};r[e]={pattern:RegExp(/(<__[^>]*>)(?:<!\[CDATA\[(?:[^\]]|\](?!\]>))*\]\]>|(?!<!\[CDATA\[)[\s\S])*?(?=<\/__>)/.source.replace(/__/g,function(){return e}),"i"),lookbehind:!0,greedy:!0,inside:a},Prism.languages.insertBefore("markup","cdata",r)}}),Object.defineProperty(Prism.languages.markup.tag,"addAttribute",{value:function(e,t){Prism.languages.markup.tag.inside["special-attr"].push({pattern:RegExp(/(^|["'\s])/.source+"(?:"+e+")"+/\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))/.source,"i"),lookbehind:!0,inside:{"attr-name":/^[^\s=]+/,"attr-value":{pattern:/=[\s\S]+/,inside:{value:{pattern:/(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,lookbehind:!0,alias:[t,"language-"+t],inside:Prism.languages[t]},punctuation:[{pattern:/^=/,alias:"attr-equals"},/"|'/]}}}})}}),Prism.languages.html=Prism.languages.markup,Prism.languages.mathml=Prism.languages.markup,Prism.languages.svg=Prism.languages.markup,Prism.languages.xml=Prism.languages.extend("markup",{}),Prism.languages.ssml=Prism.languages.xml,Prism.languages.atom=Prism.languages.xml,Prism.languages.rss=Prism.languages.xml,function(e){var t=/(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;e.languages.css={comment:/\/\*[\s\S]*?\*\//,atrule:{pattern:RegExp("@[\\w-](?:"+/[^;{\s"']|\s+(?!\s)/.source+"|"+t.source+")*?"+/(?:;|(?=\s*\{))/.source),inside:{rule:/^@[\w-]+/,"selector-function-argument":{pattern:/(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,lookbehind:!0,alias:"selector"},keyword:{pattern:/(^|[^\w-])(?:and|not|only|or)(?![\w-])/,lookbehind:!0}}},url:{pattern:RegExp("\\burl\\((?:"+t.source+"|"+/(?:[^\\\r\n()"']|\\[\s\S])*/.source+")\\)","i"),greedy:!0,inside:{function:/^url/i,punctuation:/^\(|\)$/,string:{pattern:RegExp("^"+t.source+"$"),alias:"url"}}},selector:{pattern:RegExp("(^|[{}\\s])[^{}\\s](?:[^{};\"'\\s]|\\s+(?![\\s{])|"+t.source+")*(?=\\s*\\{)"),lookbehind:!0},string:{pattern:t,greedy:!0},property:{pattern:/(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,lookbehind:!0},important:/!important\b/i,function:{pattern:/(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,lookbehind:!0},punctuation:/[(){};:,]/},e.languages.css.atrule.inside.rest=e.languages.css;var n=e.languages.markup;n&&(n.tag.addInlined("style","css"),n.tag.addAttribute("style","css"))}(Prism),Prism.languages.clike={comment:[{pattern:/(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,lookbehind:!0,greedy:!0},{pattern:/(^|[^\\:])\/\/.*/,lookbehind:!0,greedy:!0}],string:{pattern:/(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,greedy:!0},"class-name":{pattern:/(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,lookbehind:!0,inside:{punctuation:/[.\\]/}},keyword:/\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,boolean:/\b(?:false|true)\b/,function:/\b\w+(?=\()/,number:/\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,operator:/[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,punctuation:/[{}[\];(),.:]/},Prism.languages.javascript=Prism.languages.extend("clike",{"class-name":[Prism.languages.clike["class-name"],{pattern:/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,lookbehind:!0}],keyword:[{pattern:/((?:^|\})\s*)catch\b/,lookbehind:!0},{pattern:/(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,lookbehind:!0}],function:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,number:{pattern:RegExp(/(^|[^\w$])/.source+"(?:"+/NaN|Infinity/.source+"|"+/0[bB][01]+(?:_[01]+)*n?/.source+"|"+/0[oO][0-7]+(?:_[0-7]+)*n?/.source+"|"+/0[xX][\dA-Fa-f]+(?:_[\dA-Fa-f]+)*n?/.source+"|"+/\d+(?:_\d+)*n/.source+"|"+/(?:\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\.\d+(?:_\d+)*)(?:[Ee][+-]?\d+(?:_\d+)*)?/.source+")"+/(?![\w$])/.source),lookbehind:!0},operator:/--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/}),Prism.languages.javascript["class-name"][0].pattern=/(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/,Prism.languages.insertBefore("javascript","keyword",{regex:{pattern:RegExp(/((?:^|[^$\w\xA0-\uFFFF."'\])\s]|\b(?:return|yield))\s*)/.source+/\//.source+"(?:"+/(?:\[(?:[^\]\\\r\n]|\\.)*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}/.source+"|"+/(?:\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.|\[(?:[^[\]\\\r\n]|\\.)*\])*\])*\]|\\.|[^/\\\[\r\n])+\/[dgimyus]{0,7}v[dgimyus]{0,7}/.source+")"+/(?=(?:\s|\/\*(?:[^*]|\*(?!\/))*\*\/)*(?:$|[\r\n,.;:})\]]|\/\/))/.source),lookbehind:!0,greedy:!0,inside:{"regex-source":{pattern:/^(\/)[\s\S]+(?=\/[a-z]*$)/,lookbehind:!0,alias:"language-regex",inside:Prism.languages.regex},"regex-delimiter":/^\/|\/$/,"regex-flags":/^[a-z]+$/}},"function-variable":{pattern:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,alias:"function"},parameter:[{pattern:/(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,lookbehind:!0,inside:Prism.languages.javascript},{pattern:/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,lookbehind:!0,inside:Prism.languages.javascript},{pattern:/(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,lookbehind:!0,inside:Prism.languages.javascript},{pattern:/((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,lookbehind:!0,inside:Prism.languages.javascript}],constant:/\b[A-Z](?:[A-Z_]|\dx?)*\b/}),Prism.languages.insertBefore("javascript","string",{hashbang:{pattern:/^#!.*/,greedy:!0,alias:"comment"},"template-string":{pattern:/`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,greedy:!0,inside:{"template-punctuation":{pattern:/^`|`$/,alias:"string"},interpolation:{pattern:/((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,lookbehind:!0,inside:{"interpolation-punctuation":{pattern:/^\$\{|\}$/,alias:"punctuation"},rest:Prism.languages.javascript}},string:/[\s\S]+/}},"string-property":{pattern:/((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,lookbehind:!0,greedy:!0,alias:"property"}}),Prism.languages.insertBefore("javascript","operator",{"literal-property":{pattern:/((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,lookbehind:!0,alias:"property"}}),Prism.languages.markup&&(Prism.languages.markup.tag.addInlined("script","javascript"),Prism.languages.markup.tag.addAttribute(/on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)/.source,"javascript")),Prism.languages.js=Prism.languages.javascript,function(){if(void 0!==Prism&&"undefined"!=typeof document){Element.prototype.matches||(Element.prototype.matches=Element.prototype.msMatchesSelector||Element.prototype.webkitMatchesSelector);var e={js:"javascript",py:"python",rb:"ruby",ps1:"powershell",psm1:"powershell",sh:"bash",bat:"batch",h:"c",tex:"latex"},t="data-src-status",n="loading",a="loaded",r="pre[data-src]:not(["+t+'="'+a+'"]):not(['+t+'="'+n+'"])';Prism.hooks.add("before-highlightall",function(e){e.selector+=", "+r}),Prism.hooks.add("before-sanity-check",function(s){var i=s.element;if(i.matches(r)){s.code="",i.setAttribute(t,n);var o=i.appendChild(document.createElement("CODE"));o.textContent="Loading…";var l=i.getAttribute("data-src"),u=s.language;if("none"===u){var g=(/\.(\w+)$/.exec(l)||[,"none"])[1];u=e[g]||g}Prism.util.setLanguage(o,u),Prism.util.setLanguage(i,u);var c=Prism.plugins.autoloader;c&&c.loadLanguages(u),function(e,t,n){var a=new XMLHttpRequest;a.open("GET",e,!0),a.onreadystatechange=function(){4==a.readyState&&(a.status<400&&a.responseText?t(a.responseText):a.status>=400?n("✖ Error "+a.status+" while fetching file: "+a.statusText):n("✖ Error: File does not exist or is empty"))},a.send(null)}(l,function(e){i.setAttribute(t,a);var n=function(e){var t=/^\s*(\d+)\s*(?:(,)\s*(?:(\d+)\s*)?)?$/.exec(e||"");if(t){var n=Number(t[1]),a=t[2],r=t[3];return a?r?[n,Number(r)]:[n,void 0]:[n,n]}}(i.getAttribute("data-range"));if(n){var r=e.split(/\r\n?|\n/g),s=n[0],l=null==n[1]?r.length:n[1];s<0&&(s+=r.length),s=Math.max(0,Math.min(s-1,r.length)),l<0&&(l+=r.length),l=Math.max(0,Math.min(l,r.length)),e=r.slice(s,l).join("\n"),i.hasAttribute("data-start")||i.setAttribute("data-start",String(s+1))}o.textContent=e,Prism.highlightElement(o)},function(e){i.setAttribute(t,"failed"),o.textContent=e})}}),Prism.plugins.fileHighlight={highlight:function(e){for(var t,n=(e||document).querySelectorAll(r),a=0;t=n[a++];)Prism.highlightElement(t)}};var s=!1;Prism.fileHighlight=function(){s||(console.warn("Prism.fileHighlight is deprecated. Use `Prism.plugins.fileHighlight.highlight` instead."),s=!0),Prism.plugins.fileHighlight.highlight.apply(this,arguments)}}}();


Prism.languages.markup={comment:{pattern:/<!--(?:(?!<!--)[\s\S])*?-->/,greedy:!0},prolog:{pattern:/<\?[\s\S]+?\?>/,greedy:!0},doctype:{pattern:/<!DOCTYPE(?:[^>"'[\]]|"[^"]*"|'[^']*')+(?:\[(?:[^<"'\]]|"[^"]*"|'[^']*'|<(?!!--)|<!--(?:[^-]|-(?!->))*-->)*\]\s*)?>/i,greedy:!0,inside:{"internal-subset":{pattern:/(^[^\[]*\[)[\s\S]+(?=\]>$)/,lookbehind:!0,greedy:!0,inside:null},string:{pattern:/"[^"]*"|'[^']*'/,greedy:!0},punctuation:/^<!|>$|[[\]]/,"doctype-tag":/^DOCTYPE/i,name:/[^\s<>'"]+/}},cdata:{pattern:/<!\[CDATA\[[\s\S]*?\]\]>/i,greedy:!0},tag:{pattern:/<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/,greedy:!0,inside:{tag:{pattern:/^<\/?[^\s>\/]+/,inside:{punctuation:/^<\/?/,namespace:/^[^\s>\/:]+:/}},"special-attr":[],"attr-value":{pattern:/=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/,inside:{punctuation:[{pattern:/^=/,alias:"attr-equals"},{pattern:/^(\s*)["']|["']$/,lookbehind:!0}]}},punctuation:/\/?>/,"attr-name":{pattern:/[^\s>\/]+/,inside:{namespace:/^[^\s>\/:]+:/}}}},entity:[{pattern:/&[\da-z]{1,8};/i,alias:"named-entity"},/&#x?[\da-f]{1,8};/i]},Prism.languages.markup.tag.inside["attr-value"].inside.entity=Prism.languages.markup.entity,Prism.languages.markup.doctype.inside["internal-subset"].inside=Prism.languages.markup,Prism.hooks.add("wrap",(function(a){"entity"===a.type&&(a.attributes.title=a.content.replace(/&amp;/,"&"))})),Object.defineProperty(Prism.languages.markup.tag,"addInlined",{value:function(a,e){var s={};s["language-"+e]={pattern:/(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,lookbehind:!0,inside:Prism.languages[e]},s.cdata=/^<!\[CDATA\[|\]\]>$/i;var t={"included-cdata":{pattern:/<!\[CDATA\[[\s\S]*?\]\]>/i,inside:s}};t["language-"+e]={pattern:/[\s\S]+/,inside:Prism.languages[e]};var n={};n[a]={pattern:RegExp("(<__[^>]*>)(?:<!\\[CDATA\\[(?:[^\\]]|\\](?!\\]>))*\\]\\]>|(?!<!\\[CDATA\\[)[^])*?(?=</__>)".replace(/__/g,(function(){return a})),"i"),lookbehind:!0,greedy:!0,inside:t},Prism.languages.insertBefore("markup","cdata",n)}}),Object.defineProperty(Prism.languages.markup.tag,"addAttribute",{value:function(a,e){Prism.languages.markup.tag.inside["special-attr"].push({pattern:RegExp("(^|[\"'\\s])(?:"+a+")\\s*=\\s*(?:\"[^\"]*\"|'[^']*'|[^\\s'\">=]+(?=[\\s>]))","i"),lookbehind:!0,inside:{"attr-name":/^[^\s=]+/,"attr-value":{pattern:/=[\s\S]+/,inside:{value:{pattern:/(^=\s*(["']|(?!["'])))\S[\s\S]*(?=\2$)/,lookbehind:!0,alias:[e,"language-"+e],inside:Prism.languages[e]},punctuation:[{pattern:/^=/,alias:"attr-equals"},/"|'/]}}}})}}),Prism.languages.html=Prism.languages.markup,Prism.languages.mathml=Prism.languages.markup,Prism.languages.svg=Prism.languages.markup,Prism.languages.xml=Prism.languages.extend("markup",{}),Prism.languages.ssml=Prism.languages.xml,Prism.languages.atom=Prism.languages.xml,Prism.languages.rss=Prism.languages.xml;

!function(s){var e=/(?:"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"|'(?:\\(?:\r\n|[\s\S])|[^'\\\r\n])*')/;s.languages.css={comment:/\/\*[\s\S]*?\*\//,atrule:{pattern:RegExp("@[\\w-](?:[^;{\\s\"']|\\s+(?!\\s)|"+e.source+")*?(?:;|(?=\\s*\\{))"),inside:{rule:/^@[\w-]+/,"selector-function-argument":{pattern:/(\bselector\s*\(\s*(?![\s)]))(?:[^()\s]|\s+(?![\s)])|\((?:[^()]|\([^()]*\))*\))+(?=\s*\))/,lookbehind:!0,alias:"selector"},keyword:{pattern:/(^|[^\w-])(?:and|not|only|or)(?![\w-])/,lookbehind:!0}}},url:{pattern:RegExp("\\burl\\((?:"+e.source+"|(?:[^\\\\\r\n()\"']|\\\\[^])*)\\)","i"),greedy:!0,inside:{function:/^url/i,punctuation:/^\(|\)$/,string:{pattern:RegExp("^"+e.source+"$"),alias:"url"}}},selector:{pattern:RegExp("(^|[{}\\s])[^{}\\s](?:[^{};\"'\\s]|\\s+(?![\\s{])|"+e.source+")*(?=\\s*\\{)"),lookbehind:!0},string:{pattern:e,greedy:!0},property:{pattern:/(^|[^-\w\xA0-\uFFFF])(?!\s)[-_a-z\xA0-\uFFFF](?:(?!\s)[-\w\xA0-\uFFFF])*(?=\s*:)/i,lookbehind:!0},important:/!important\b/i,function:{pattern:/(^|[^-a-z0-9])[-a-z0-9]+(?=\()/i,lookbehind:!0},punctuation:/[(){};:,]/},s.languages.css.atrule.inside.rest=s.languages.css;var t=s.languages.markup;t&&(t.tag.addInlined("style","css"),t.tag.addAttribute("style","css"))}(Prism);

Prism.languages.clike={comment:[{pattern:/(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,lookbehind:!0,greedy:!0},{pattern:/(^|[^\\:])\/\/.*/,lookbehind:!0,greedy:!0}],string:{pattern:/(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,greedy:!0},"class-name":{pattern:/(\b(?:class|extends|implements|instanceof|interface|new|trait)\s+|\bcatch\s+\()[\w.\\]+/i,lookbehind:!0,inside:{punctuation:/[.\\]/}},keyword:/\b(?:break|catch|continue|do|else|finally|for|function|if|in|instanceof|new|null|return|throw|try|while)\b/,boolean:/\b(?:false|true)\b/,function:/\b\w+(?=\()/,number:/\b0x[\da-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:e[+-]?\d+)?/i,operator:/[<>]=?|[!=]=?=?|--?|\+\+?|&&?|\|\|?|[?*/~^%]/,punctuation:/[{}[\];(),.:]/};

Prism.languages.javascript=Prism.languages.extend("clike",{"class-name":[Prism.languages.clike["class-name"],{pattern:/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$A-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\.(?:constructor|prototype))/,lookbehind:!0}],keyword:[{pattern:/((?:^|\})\s*)catch\b/,lookbehind:!0},{pattern:/(^|[^.]|\.\.\.\s*)\b(?:as|assert(?=\s*\{)|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally(?=\s*(?:\{|$))|for|from(?=\s*(?:['"]|$))|function|(?:get|set)(?=\s*(?:[#\[$\w\xA0-\uFFFF]|$))|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,lookbehind:!0}],function:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,number:{pattern:RegExp("(^|[^\\w$])(?:NaN|Infinity|0[bB][01]+(?:_[01]+)*n?|0[oO][0-7]+(?:_[0-7]+)*n?|0[xX][\\dA-Fa-f]+(?:_[\\dA-Fa-f]+)*n?|\\d+(?:_\\d+)*n|(?:\\d+(?:_\\d+)*(?:\\.(?:\\d+(?:_\\d+)*)?)?|\\.\\d+(?:_\\d+)*)(?:[Ee][+-]?\\d+(?:_\\d+)*)?)(?![\\w$])"),lookbehind:!0},operator:/--|\+\+|\*\*=?|=>|&&=?|\|\|=?|[!=]==|<<=?|>>>?=?|[-+*/%&|^!=<>]=?|\.{3}|\?\?=?|\?\.?|[~:]/}),Prism.languages.javascript["class-name"][0].pattern=/(\b(?:class|extends|implements|instanceof|interface|new)\s+)[\w.\\]+/,Prism.languages.insertBefore("javascript","keyword",{regex:{pattern:RegExp("((?:^|[^$\\w\\xA0-\\uFFFF.\"'\\])\\s]|\\b(?:return|yield))\\s*)/(?:(?:\\[(?:[^\\]\\\\\r\n]|\\\\.)*\\]|\\\\.|[^/\\\\\\[\r\n])+/[dgimyus]{0,7}|(?:\\[(?:[^[\\]\\\\\r\n]|\\\\.|\\[(?:[^[\\]\\\\\r\n]|\\\\.|\\[(?:[^[\\]\\\\\r\n]|\\\\.)*\\])*\\])*\\]|\\\\.|[^/\\\\\\[\r\n])+/[dgimyus]{0,7}v[dgimyus]{0,7})(?=(?:\\s|/\\*(?:[^*]|\\*(?!/))*\\*/)*(?:$|[\r\n,.;:})\\]]|//))"),lookbehind:!0,greedy:!0,inside:{"regex-source":{pattern:/^(\/)[\s\S]+(?=\/[a-z]*$)/,lookbehind:!0,alias:"language-regex",inside:Prism.languages.regex},"regex-delimiter":/^\/|\/$/,"regex-flags":/^[a-z]+$/}},"function-variable":{pattern:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)\s*=>))/,alias:"function"},parameter:[{pattern:/(function(?:\s+(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*)?\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\))/,lookbehind:!0,inside:Prism.languages.javascript},{pattern:/(^|[^$\w\xA0-\uFFFF])(?!\s)[_$a-z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*=>)/i,lookbehind:!0,inside:Prism.languages.javascript},{pattern:/(\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*=>)/,lookbehind:!0,inside:Prism.languages.javascript},{pattern:/((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*)\(\s*|\]\s*\(\s*)(?!\s)(?:[^()\s]|\s+(?![\s)])|\([^()]*\))+(?=\s*\)\s*\{)/,lookbehind:!0,inside:Prism.languages.javascript}],constant:/\b[A-Z](?:[A-Z_]|\dx?)*\b/}),Prism.languages.insertBefore("javascript","string",{hashbang:{pattern:/^#!.*/,greedy:!0,alias:"comment"},"template-string":{pattern:/`(?:\\[\s\S]|\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}|(?!\$\{)[^\\`])*`/,greedy:!0,inside:{"template-punctuation":{pattern:/^`|`$/,alias:"string"},interpolation:{pattern:/((?:^|[^\\])(?:\\{2})*)\$\{(?:[^{}]|\{(?:[^{}]|\{[^}]*\})*\})+\}/,lookbehind:!0,inside:{"interpolation-punctuation":{pattern:/^\$\{|\}$/,alias:"punctuation"},rest:Prism.languages.javascript}},string:/[\s\S]+/}},"string-property":{pattern:/((?:^|[,{])[ \t]*)(["'])(?:\\(?:\r\n|[\s\S])|(?!\2)[^\\\r\n])*\2(?=\s*:)/m,lookbehind:!0,greedy:!0,alias:"property"}}),Prism.languages.insertBefore("javascript","operator",{"literal-property":{pattern:/((?:^|[,{])[ \t]*)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?=\s*:)/m,lookbehind:!0,alias:"property"}}),Prism.languages.markup&&(Prism.languages.markup.tag.addInlined("script","javascript"),Prism.languages.markup.tag.addAttribute("on(?:abort|blur|change|click|composition(?:end|start|update)|dblclick|error|focus(?:in|out)?|key(?:down|up)|load|mouse(?:down|enter|leave|move|out|over|up)|reset|resize|scroll|select|slotchange|submit|unload|wheel)","javascript")),Prism.languages.js=Prism.languages.javascript;

!function(e){e.languages.typescript=e.languages.extend("javascript",{"class-name":{pattern:/(\b(?:class|extends|implements|instanceof|interface|new|type)\s+)(?!keyof\b)(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*(?:\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>)?/,lookbehind:!0,greedy:!0,inside:null},builtin:/\b(?:Array|Function|Promise|any|boolean|console|never|number|string|symbol|unknown)\b/}),e.languages.typescript.keyword.push(/\b(?:abstract|declare|is|keyof|readonly|require)\b/,/\b(?:asserts|infer|interface|module|namespace|type)\b(?=\s*(?:[{_$a-zA-Z\xA0-\uFFFF]|$))/,/\btype\b(?=\s*(?:[\{*]|$))/),delete e.languages.typescript.parameter,delete e.languages.typescript["literal-property"];var s=e.languages.extend("typescript",{});delete s["class-name"],e.languages.typescript["class-name"].inside=s,e.languages.insertBefore("typescript","function",{decorator:{pattern:/@[$\w\xA0-\uFFFF]+/,inside:{at:{pattern:/^@/,alias:"operator"},function:/^[\s\S]+/}},"generic-function":{pattern:/#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*\s*<(?:[^<>]|<(?:[^<>]|<[^<>]*>)*>)*>(?=\s*\()/,greedy:!0,inside:{function:/^#?(?!\s)[_$a-zA-Z\xA0-\uFFFF](?:(?!\s)[$\w\xA0-\uFFFF])*/,generic:{pattern:/<[\s\S]+/,alias:"class-name",inside:s}}}}),e.languages.ts=e.languages.typescript}(Prism);

Prism.languages.json={property:{pattern:/(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,lookbehind:!0,greedy:!0},string:{pattern:/(^|[^\\])"(?:\\.|[^\\"\r\n])*"(?!\s*:)/,lookbehind:!0,greedy:!0},comment:{pattern:/\/\/.*|\/\*[\s\S]*?(?:\*\/|$)/,greedy:!0},number:/-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,punctuation:/[{}[\],]/,operator:/:/,boolean:/\b(?:false|true)\b/,null:{pattern:/\bnull\b/,alias:"keyword"}},Prism.languages.webmanifest=Prism.languages.json;

Prism.languages.python={comment:{pattern:/(^|[^\\])#.*/,lookbehind:!0,greedy:!0},"string-interpolation":{pattern:/(?:f|fr|rf)(?:("""|''')[\s\S]*?\1|("|')(?:\\.|(?!\2)[^\\\r\n])*\2)/i,greedy:!0,inside:{interpolation:{pattern:/((?:^|[^{])(?:\{\{)*)\{(?!\{)(?:[^{}]|\{(?!\{)(?:[^{}]|\{(?!\{)(?:[^{}])+\})+\})+\}/,lookbehind:!0,inside:{"format-spec":{pattern:/(:)[^:(){}]+(?=\}$)/,lookbehind:!0},"conversion-option":{pattern:/![sra](?=[:}]$)/,alias:"punctuation"},rest:null}},string:/[\s\S]+/}},"triple-quoted-string":{pattern:/(?:[rub]|br|rb)?("""|''')[\s\S]*?\1/i,greedy:!0,alias:"string"},string:{pattern:/(?:[rub]|br|rb)?("|')(?:\\.|(?!\1)[^\\\r\n])*\1/i,greedy:!0},function:{pattern:/((?:^|\s)def[ \t]+)[a-zA-Z_]\w*(?=\s*\()/g,lookbehind:!0},"class-name":{pattern:/(\bclass\s+)\w+/i,lookbehind:!0},decorator:{pattern:/(^[\t ]*)@\w+(?:\.\w+)*/m,lookbehind:!0,alias:["annotation","punctuation"],inside:{punctuation:/\./}},keyword:/\b(?:_(?=\s*:)|and|as|assert|async|await|break|case|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|match|nonlocal|not|or|pass|print|raise|return|try|while|with|yield)\b/,builtin:/\b(?:__import__|abs|all|any|apply|ascii|basestring|bin|bool|buffer|bytearray|bytes|callable|chr|classmethod|cmp|coerce|compile|complex|delattr|dict|dir|divmod|enumerate|eval|execfile|file|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|intern|isinstance|issubclass|iter|len|list|locals|long|map|max|memoryview|min|next|object|oct|open|ord|pow|property|range|raw_input|reduce|reload|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|unichr|unicode|vars|xrange|zip)\b/,boolean:/\b(?:False|None|True)\b/,number:/\b0(?:b(?:_?[01])+|o(?:_?[0-7])+|x(?:_?[a-f0-9])+)\b|(?:\b\d+(?:_\d+)*(?:\.(?:\d+(?:_\d+)*)?)?|\B\.\d+(?:_\d+)*)(?:e[+-]?\d+(?:_\d+)*)?j?(?!\w)/i,operator:/[-+%=]=?|!=|:=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/,punctuation:/[{}[\];(),.:]/},Prism.languages.python["string-interpolation"].inside.interpolation.inside.rest=Prism.languages.python,Prism.languages.py=Prism.languages.python;

!function(e){for(var a="/\\*(?:[^*/]|\\*(?!/)|/(?!\\*)|<self>)*\\*/",t=0;t<2;t++)a=a.replace(/<self>/g,(function(){return a}));a=a.replace(/<self>/g,(function(){return"[^\\s\\S]"})),e.languages.rust={comment:[{pattern:RegExp("(^|[^\\\\])"+a),lookbehind:!0,greedy:!0},{pattern:/(^|[^\\:])\/\/.*/,lookbehind:!0,greedy:!0}],string:{pattern:/b?"(?:\\[\s\S]|[^\\"])*"|b?r(#*)"(?:[^"]|"(?!\1))*"\1/,greedy:!0},char:{pattern:/b?'(?:\\(?:x[0-7][\da-fA-F]|u\{(?:[\da-fA-F]_*){1,6}\}|.)|[^\\\r\n\t'])'/,greedy:!0},attribute:{pattern:/#!?\[(?:[^\[\]"]|"(?:\\[\s\S]|[^\\"])*")*\]/,greedy:!0,alias:"attr-name",inside:{string:null}},"closure-params":{pattern:/([=(,:]\s*|\bmove\s*)\|[^|]*\||\|[^|]*\|(?=\s*(?:\{|->))/,lookbehind:!0,greedy:!0,inside:{"closure-punctuation":{pattern:/^\||\|$/,alias:"punctuation"},rest:null}},"lifetime-annotation":{pattern:/'\w+/,alias:"symbol"},"fragment-specifier":{pattern:/(\$\w+:)[a-z]+/,lookbehind:!0,alias:"punctuation"},variable:/\$\w+/,"function-definition":{pattern:/(\bfn\s+)\w+/,lookbehind:!0,alias:"function"},"type-definition":{pattern:/(\b(?:enum|struct|trait|type|union)\s+)\w+/,lookbehind:!0,alias:"class-name"},"module-declaration":[{pattern:/(\b(?:crate|mod)\s+)[a-z][a-z_\d]*/,lookbehind:!0,alias:"namespace"},{pattern:/(\b(?:crate|self|super)\s*)::\s*[a-z][a-z_\d]*\b(?:\s*::(?:\s*[a-z][a-z_\d]*\s*::)*)?/,lookbehind:!0,alias:"namespace",inside:{punctuation:/::/}}],keyword:[/\b(?:Self|abstract|as|async|await|become|box|break|const|continue|crate|do|dyn|else|enum|extern|final|fn|for|if|impl|in|let|loop|macro|match|mod|move|mut|override|priv|pub|ref|return|self|static|struct|super|trait|try|type|typeof|union|unsafe|unsized|use|virtual|where|while|yield)\b/,/\b(?:bool|char|f(?:32|64)|[ui](?:8|16|32|64|128|size)|str)\b/],function:/\b[a-z_]\w*(?=\s*(?:::\s*<|\())/,macro:{pattern:/\b\w+!/,alias:"property"},constant:/\b[A-Z_][A-Z_\d]+\b/,"class-name":/\b[A-Z]\w*\b/,namespace:{pattern:/(?:\b[a-z][a-z_\d]*\s*::\s*)*\b[a-z][a-z_\d]*\s*::(?!\s*<)/,inside:{punctuation:/::/}},number:/\b(?:0x[\dA-Fa-f](?:_?[\dA-Fa-f])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*|(?:(?:\d(?:_?\d)*)?\.)?\d(?:_?\d)*(?:[Ee][+-]?\d+)?)(?:_?(?:f32|f64|[iu](?:8|16|32|64|size)?))?\b/,boolean:/\b(?:false|true)\b/,punctuation:/->|\.\.=|\.{1,3}|::|[{}[\];(),:]/,operator:/[-+*\/%!^]=?|=[=>]?|&[&=]?|\|[|=]?|<<?=?|>>?=?|[@?]/},e.languages.rust["closure-params"].inside.rest=e.languages.rust,e.languages.rust.attribute.inside.string=e.languages.rust.string}(Prism);

Prism.languages.go=Prism.languages.extend("clike",{string:{pattern:/(^|[^\\])"(?:\\.|[^"\\\r\n])*"|`[^`]*`/,lookbehind:!0,greedy:!0},keyword:/\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go(?:to)?|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/,boolean:/\b(?:_|false|iota|nil|true)\b/,number:[/\b0(?:b[01_]+|o[0-7_]+)i?\b/i,/\b0x(?:[a-f\d_]+(?:\.[a-f\d_]*)?|\.[a-f\d_]+)(?:p[+-]?\d+(?:_\d+)*)?i?(?!\w)/i,/(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.\d[\d_]*)(?:e[+-]?[\d_]+)?i?(?!\w)/i],operator:/[*\/%^!=]=?|\+[=+]?|-[=-]?|\|[=|]?|&(?:=|&|\^=?)?|>(?:>=?|=)?|<(?:<=?|=|-)?|:=|\.\.\./,builtin:/\b(?:append|bool|byte|cap|close|complex|complex(?:64|128)|copy|delete|error|float(?:32|64)|u?int(?:8|16|32|64)?|imag|len|make|new|panic|print(?:ln)?|real|recover|rune|string|uintptr)\b/}),Prism.languages.insertBefore("go","string",{char:{pattern:/'(?:\\.|[^'\\\r\n]){0,10}'/,greedy:!0}}),delete Prism.languages.go["class-name"];

!function(e){var n=/\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|exports|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|module|native|new|non-sealed|null|open|opens|package|permits|private|protected|provides|public|record(?!\s*[(){}[\]<>=%~.:,;?+\-*/&|^])|requires|return|sealed|short|static|strictfp|super|switch|synchronized|this|throw|throws|to|transient|transitive|try|uses|var|void|volatile|while|with|yield)\b/,t="(?:[a-z]\\w*\\s*\\.\\s*)*(?:[A-Z]\\w*\\s*\\.\\s*)*",s={pattern:RegExp("(^|[^\\w.])"+t+"[A-Z](?:[\\d_A-Z]*[a-z]\\w*)?\\b"),lookbehind:!0,inside:{namespace:{pattern:/^[a-z]\w*(?:\s*\.\s*[a-z]\w*)*(?:\s*\.)?/,inside:{punctuation:/\./}},punctuation:/\./}};e.languages.java=e.languages.extend("clike",{string:{pattern:/(^|[^\\])"(?:\\.|[^"\\\r\n])*"/,lookbehind:!0,greedy:!0},"class-name":[s,{pattern:RegExp("(^|[^\\w.])"+t+"[A-Z]\\w*(?=\\s+\\w+\\s*[;,=()]|\\s*(?:\\[[\\s,]*\\]\\s*)?::\\s*new\\b)"),lookbehind:!0,inside:s.inside},{pattern:RegExp("(\\b(?:class|enum|extends|implements|instanceof|interface|new|record|throws)\\s+)"+t+"[A-Z]\\w*\\b"),lookbehind:!0,inside:s.inside}],keyword:n,function:[e.languages.clike.function,{pattern:/(::\s*)[a-z_]\w*/,lookbehind:!0}],number:/\b0b[01][01_]*L?\b|\b0x(?:\.[\da-f_p+-]+|[\da-f_]+(?:\.[\da-f_p+-]+)?)\b|(?:\b\d[\d_]*(?:\.[\d_]*)?|\B\.\d[\d_]*)(?:e[+-]?\d[\d_]*)?[dfl]?/i,operator:{pattern:/(^|[^.])(?:<<=?|>>>?=?|->|--|\+\+|&&|\|\||::|[?:~]|[-+*/%&|^!=<>]=?)/m,lookbehind:!0},constant:/\b[A-Z][A-Z_\d]+\b/}),e.languages.insertBefore("java","string",{"triple-quoted-string":{pattern:/"""[ \t]*[\r\n](?:(?:"|"")?(?:\\.|[^"\\]))*"""/,greedy:!0,alias:"string"},char:{pattern:/'(?:\\.|[^'\\\r\n]){1,6}'/,greedy:!0}}),e.languages.insertBefore("java","class-name",{annotation:{pattern:/(^|[^.])@\w+(?:\s*\.\s*\w+)*/,lookbehind:!0,alias:"punctuation"},generics:{pattern:/<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&)|<(?:[\w\s,.?]|&(?!&))*>)*>)*>)*>/,inside:{"class-name":s,keyword:n,punctuation:/[<>(),.:]/,operator:/[?&|]/}},import:[{pattern:RegExp("(\\bimport\\s+)"+t+"(?:[A-Z]\\w*|\\*)(?=\\s*;)"),lookbehind:!0,inside:{namespace:s.inside.namespace,punctuation:/\./,operator:/\*/,"class-name":/\w+/}},{pattern:RegExp("(\\bimport\\s+static\\s+)"+t+"(?:\\w+|\\*)(?=\\s*;)"),lookbehind:!0,alias:"static",inside:{namespace:s.inside.namespace,static:/\b\w+$/,punctuation:/\./,operator:/\*/,"class-name":/\w+/}}],namespace:{pattern:RegExp("(\\b(?:exports|import(?:\\s+static)?|module|open|opens|package|provides|requires|to|transitive|uses|with)\\s+)(?!<keyword>)[a-z]\\w*(?:\\.[a-z]\\w*)*\\.?".replace(/<keyword>/g,(function(){return n.source}))),lookbehind:!0,inside:{punctuation:/\./}}})}(Prism);

!function(e){var t="\\b(?:BASH|BASHOPTS|BASH_ALIASES|BASH_ARGC|BASH_ARGV|BASH_CMDS|BASH_COMPLETION_COMPAT_DIR|BASH_LINENO|BASH_REMATCH|BASH_SOURCE|BASH_VERSINFO|BASH_VERSION|COLORTERM|COLUMNS|COMP_WORDBREAKS|DBUS_SESSION_BUS_ADDRESS|DEFAULTS_PATH|DESKTOP_SESSION|DIRSTACK|DISPLAY|EUID|GDMSESSION|GDM_LANG|GNOME_KEYRING_CONTROL|GNOME_KEYRING_PID|GPG_AGENT_INFO|GROUPS|HISTCONTROL|HISTFILE|HISTFILESIZE|HISTSIZE|HOME|HOSTNAME|HOSTTYPE|IFS|INSTANCE|JOB|LANG|LANGUAGE|LC_ADDRESS|LC_ALL|LC_IDENTIFICATION|LC_MEASUREMENT|LC_MONETARY|LC_NAME|LC_NUMERIC|LC_PAPER|LC_TELEPHONE|LC_TIME|LESSCLOSE|LESSOPEN|LINES|LOGNAME|LS_COLORS|MACHTYPE|MAILCHECK|MANDATORY_PATH|NO_AT_BRIDGE|OLDPWD|OPTERR|OPTIND|ORBIT_SOCKETDIR|OSTYPE|PAPERSIZE|PATH|PIPESTATUS|PPID|PS1|PS2|PS3|PS4|PWD|RANDOM|REPLY|SECONDS|SELINUX_INIT|SESSION|SESSIONTYPE|SESSION_MANAGER|SHELL|SHELLOPTS|SHLVL|SSH_AUTH_SOCK|TERM|UID|UPSTART_EVENTS|UPSTART_INSTANCE|UPSTART_JOB|UPSTART_SESSION|USER|WINDOWID|XAUTHORITY|XDG_CONFIG_DIRS|XDG_CURRENT_DESKTOP|XDG_DATA_DIRS|XDG_GREETER_DATA_DIR|XDG_MENU_PREFIX|XDG_RUNTIME_DIR|XDG_SEAT|XDG_SEAT_PATH|XDG_SESSION_DESKTOP|XDG_SESSION_ID|XDG_SESSION_PATH|XDG_SESSION_TYPE|XDG_VTNR|XMODIFIERS)\\b",a={pattern:/(^(["']?)\w+\2)[ \t]+\S.*/,lookbehind:!0,alias:"punctuation",inside:null},n={bash:a,environment:{pattern:RegExp("\\$"+t),alias:"constant"},variable:[{pattern:/\$?\(\([\s\S]+?\)\)/,greedy:!0,inside:{variable:[{pattern:/(^\$\(\([\s\S]+)\)\)/,lookbehind:!0},/^\$\(\(/],number:/\b0x[\dA-Fa-f]+\b|(?:\b\d+(?:\.\d*)?|\B\.\d+)(?:[Ee]-?\d+)?/,operator:/--|\+\+|\*\*=?|<<=?|>>=?|&&|\|\||[=!+\-*/%<>^&|]=?|[?~:]/,punctuation:/\(\(?|\)\)?|,|;/}},{pattern:/\$\((?:\([^)]+\)|[^()])+\)|`[^`]+`/,greedy:!0,inside:{variable:/^\$\(|^`|\)$|`$/}},{pattern:/\$\{[^}]+\}/,greedy:!0,inside:{operator:/:[-=?+]?|[!\/]|##?|%%?|\^\^?|,,?/,punctuation:/[\[\]]/,environment:{pattern:RegExp("(\\{)"+t),lookbehind:!0,alias:"constant"}}},/\$(?:\w+|[#?*!@$])/],entity:/\\(?:[abceEfnrtv\\"]|O?[0-7]{1,3}|U[0-9a-fA-F]{8}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,2})/};e.languages.bash={shebang:{pattern:/^#!\s*\/.*/,alias:"important"},comment:{pattern:/(^|[^"{\\$])#.*/,lookbehind:!0},"function-name":[{pattern:/(\bfunction\s+)[\w-]+(?=(?:\s*\(?:\s*\))?\s*\{)/,lookbehind:!0,alias:"function"},{pattern:/\b[\w-]+(?=\s*\(\s*\)\s*\{)/,alias:"function"}],"for-or-select":{pattern:/(\b(?:for|select)\s+)\w+(?=\s+in\s)/,alias:"variable",lookbehind:!0},"assign-left":{pattern:/(^|[\s;|&]|[<>]\()\w+(?:\.\w+)*(?=\+?=)/,inside:{environment:{pattern:RegExp("(^|[\\s;|&]|[<>]\\()"+t),lookbehind:!0,alias:"constant"}},alias:"variable",lookbehind:!0},parameter:{pattern:/(^|\s)-{1,2}(?:\w+:[+-]?)?\w+(?:\.\w+)*(?=[=\s]|$)/,alias:"variable",lookbehind:!0},string:[{pattern:/((?:^|[^<])<<-?\s*)(\w+)\s[\s\S]*?(?:\r?\n|\r)\2/,lookbehind:!0,greedy:!0,inside:n},{pattern:/((?:^|[^<])<<-?\s*)(["'])(\w+)\2\s[\s\S]*?(?:\r?\n|\r)\3/,lookbehind:!0,greedy:!0,inside:{bash:a}},{pattern:/(^|[^\\](?:\\\\)*)"(?:\\[\s\S]|\$\([^)]+\)|\$(?!\()|`[^`]+`|[^"\\`$])*"/,lookbehind:!0,greedy:!0,inside:n},{pattern:/(^|[^$\\])'[^']*'/,lookbehind:!0,greedy:!0},{pattern:/\$'(?:[^'\\]|\\[\s\S])*'/,greedy:!0,inside:{entity:n.entity}}],environment:{pattern:RegExp("\\$?"+t),alias:"constant"},variable:n.variable,function:{pattern:/(^|[\s;|&]|[<>]\()(?:add|apropos|apt|apt-cache|apt-get|aptitude|aspell|automysqlbackup|awk|basename|bash|bc|bconsole|bg|bzip2|cal|cargo|cat|cfdisk|chgrp|chkconfig|chmod|chown|chroot|cksum|clear|cmp|column|comm|composer|cp|cron|crontab|csplit|curl|cut|date|dc|dd|ddrescue|debootstrap|df|diff|diff3|dig|dir|dircolors|dirname|dirs|dmesg|docker|docker-compose|du|egrep|eject|env|ethtool|expand|expect|expr|fdformat|fdisk|fg|fgrep|file|find|fmt|fold|format|free|fsck|ftp|fuser|gawk|git|gparted|grep|groupadd|groupdel|groupmod|groups|grub-mkconfig|gzip|halt|head|hg|history|host|hostname|htop|iconv|id|ifconfig|ifdown|ifup|import|install|ip|java|jobs|join|kill|killall|less|link|ln|locate|logname|logrotate|look|lpc|lpr|lprint|lprintd|lprintq|lprm|ls|lsof|lynx|make|man|mc|mdadm|mkconfig|mkdir|mke2fs|mkfifo|mkfs|mkisofs|mknod|mkswap|mmv|more|most|mount|mtools|mtr|mutt|mv|nano|nc|netstat|nice|nl|node|nohup|notify-send|npm|nslookup|op|open|parted|passwd|paste|pathchk|ping|pkill|pnpm|podman|podman-compose|popd|pr|printcap|printenv|ps|pushd|pv|quota|quotacheck|quotactl|ram|rar|rcp|reboot|remsync|rename|renice|rev|rm|rmdir|rpm|rsync|scp|screen|sdiff|sed|sendmail|seq|service|sftp|sh|shellcheck|shuf|shutdown|sleep|slocate|sort|split|ssh|stat|strace|su|sudo|sum|suspend|swapon|sync|sysctl|tac|tail|tar|tee|time|timeout|top|touch|tr|traceroute|tsort|tty|umount|uname|unexpand|uniq|units|unrar|unshar|unzip|update-grub|uptime|useradd|userdel|usermod|users|uudecode|uuencode|v|vcpkg|vdir|vi|vim|virsh|vmstat|wait|watch|wc|wget|whereis|which|who|whoami|write|xargs|xdg-open|yarn|yes|zenity|zip|zsh|zypper)(?=$|[)\s;|&])/,lookbehind:!0},keyword:{pattern:/(^|[\s;|&]|[<>]\()(?:case|do|done|elif|else|esac|fi|for|function|if|in|select|then|until|while)(?=$|[)\s;|&])/,lookbehind:!0},builtin:{pattern:/(^|[\s;|&]|[<>]\()(?:\.|:|alias|bind|break|builtin|caller|cd|command|continue|declare|echo|enable|eval|exec|exit|export|getopts|hash|help|let|local|logout|mapfile|printf|pwd|read|readarray|readonly|return|set|shift|shopt|source|test|times|trap|type|typeset|ulimit|umask|unalias|unset)(?=$|[)\s;|&])/,lookbehind:!0,alias:"class-name"},boolean:{pattern:/(^|[\s;|&]|[<>]\()(?:false|true)(?=$|[)\s;|&])/,lookbehind:!0},"file-descriptor":{pattern:/\B&\d\b/,alias:"important"},operator:{pattern:/\d?<>|>\||\+=|=[=~]?|!=?|<<[<-]?|[&\d]?>>|\d[<>]&?|[<>][&=]?|&[>&]?|\|[&|]?/,inside:{"file-descriptor":{pattern:/^\d/,alias:"important"}}},punctuation:/\$?\(\(?|\)\)?|\.\.|[{}[\];\\]/,number:{pattern:/(^|\s)(?:[1-9]\d*|0)(?:[.,]\d+)?\b/,lookbehind:!0}},a.inside=e.languages.bash;for(var s=["comment","function-name","for-or-select","assign-left","parameter","string","environment","function","keyword","builtin","boolean","file-descriptor","operator","punctuation","number"],o=n.variable[1].inside,i=0;i<s.length;i++)o[s[i]]=e.languages.bash[s[i]];e.languages.sh=e.languages.bash,e.languages.shell=e.languages.bash}(Prism);

Prism.languages.sql={comment:{pattern:/(^|[^\\])(?:\/\*[\s\S]*?\*\/|(?:--|\/\/|#).*)/,lookbehind:!0},variable:[{pattern:/@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/,greedy:!0},/@[\w.$]+/],string:{pattern:/(^|[^@\\])("|')(?:\\[\s\S]|(?!\2)[^\\]|\2\2)*\2/,greedy:!0,lookbehind:!0},identifier:{pattern:/(^|[^@\\])`(?:\\[\s\S]|[^`\\]|``)*`/,greedy:!0,lookbehind:!0,inside:{punctuation:/^`|`$/}},function:/\b(?:AVG|COUNT|FIRST|FORMAT|LAST|LCASE|LEN|MAX|MID|MIN|MOD|NOW|ROUND|SUM|UCASE)(?=\s*\()/i,keyword:/\b(?:ACTION|ADD|AFTER|ALGORITHM|ALL|ALTER|ANALYZE|ANY|APPLY|AS|ASC|AUTHORIZATION|AUTO_INCREMENT|BACKUP|BDB|BEGIN|BERKELEYDB|BIGINT|BINARY|BIT|BLOB|BOOL|BOOLEAN|BREAK|BROWSE|BTREE|BULK|BY|CALL|CASCADED?|CASE|CHAIN|CHAR(?:ACTER|SET)?|CHECK(?:POINT)?|CLOSE|CLUSTERED|COALESCE|COLLATE|COLUMNS?|COMMENT|COMMIT(?:TED)?|COMPUTE|CONNECT|CONSISTENT|CONSTRAINT|CONTAINS(?:TABLE)?|CONTINUE|CONVERT|CREATE|CROSS|CURRENT(?:_DATE|_TIME|_TIMESTAMP|_USER)?|CURSOR|CYCLE|DATA(?:BASES?)?|DATE(?:TIME)?|DAY|DBCC|DEALLOCATE|DEC|DECIMAL|DECLARE|DEFAULT|DEFINER|DELAYED|DELETE|DELIMITERS?|DENY|DESC|DESCRIBE|DETERMINISTIC|DISABLE|DISCARD|DISK|DISTINCT|DISTINCTROW|DISTRIBUTED|DO|DOUBLE|DROP|DUMMY|DUMP(?:FILE)?|DUPLICATE|ELSE(?:IF)?|ENABLE|ENCLOSED|END|ENGINE|ENUM|ERRLVL|ERRORS|ESCAPED?|EXCEPT|EXEC(?:UTE)?|EXISTS|EXIT|EXPLAIN|EXTENDED|FETCH|FIELDS|FILE|FILLFACTOR|FIRST|FIXED|FLOAT|FOLLOWING|FOR(?: EACH ROW)?|FORCE|FOREIGN|FREETEXT(?:TABLE)?|FROM|FULL|FUNCTION|GEOMETRY(?:COLLECTION)?|GLOBAL|GOTO|GRANT|GROUP|HANDLER|HASH|HAVING|HOLDLOCK|HOUR|IDENTITY(?:COL|_INSERT)?|IF|IGNORE|IMPORT|INDEX|INFILE|INNER|INNODB|INOUT|INSERT|INT|INTEGER|INTERSECT|INTERVAL|INTO|INVOKER|ISOLATION|ITERATE|JOIN|KEYS?|KILL|LANGUAGE|LAST|LEAVE|LEFT|LEVEL|LIMIT|LINENO|LINES|LINESTRING|LOAD|LOCAL|LOCK|LONG(?:BLOB|TEXT)|LOOP|MATCH(?:ED)?|MEDIUM(?:BLOB|INT|TEXT)|MERGE|MIDDLEINT|MINUTE|MODE|MODIFIES|MODIFY|MONTH|MULTI(?:LINESTRING|POINT|POLYGON)|NATIONAL|NATURAL|NCHAR|NEXT|NO|NONCLUSTERED|NULLIF|NUMERIC|OFF?|OFFSETS?|ON|OPEN(?:DATASOURCE|QUERY|ROWSET)?|OPTIMIZE|OPTION(?:ALLY)?|ORDER|OUT(?:ER|FILE)?|OVER|PARTIAL|PARTITION|PERCENT|PIVOT|PLAN|POINT|POLYGON|PRECEDING|PRECISION|PREPARE|PREV|PRIMARY|PRINT|PRIVILEGES|PROC(?:EDURE)?|PUBLIC|PURGE|QUICK|RAISERROR|READS?|REAL|RECONFIGURE|REFERENCES|RELEASE|RENAME|REPEAT(?:ABLE)?|REPLACE|REPLICATION|REQUIRE|RESIGNAL|RESTORE|RESTRICT|RETURN(?:ING|S)?|REVOKE|RIGHT|ROLLBACK|ROUTINE|ROW(?:COUNT|GUIDCOL|S)?|RTREE|RULE|SAVE(?:POINT)?|SCHEMA|SECOND|SELECT|SERIAL(?:IZABLE)?|SESSION(?:_USER)?|SET(?:USER)?|SHARE|SHOW|SHUTDOWN|SIMPLE|SMALLINT|SNAPSHOT|SOME|SONAME|SQL|START(?:ING)?|STATISTICS|STATUS|STRIPED|SYSTEM_USER|TABLES?|TABLESPACE|TEMP(?:ORARY|TABLE)?|TERMINATED|TEXT(?:SIZE)?|THEN|TIME(?:STAMP)?|TINY(?:BLOB|INT|TEXT)|TOP?|TRAN(?:SACTIONS?)?|TRIGGER|TRUNCATE|TSEQUAL|TYPES?|UNBOUNDED|UNCOMMITTED|UNDEFINED|UNION|UNIQUE|UNLOCK|UNPIVOT|UNSIGNED|UPDATE(?:TEXT)?|USAGE|USE|USER|USING|VALUES?|VAR(?:BINARY|CHAR|CHARACTER|YING)|VIEW|WAITFOR|WARNINGS|WHEN|WHERE|WHILE|WITH(?: ROLLUP|IN)?|WORK|WRITE(?:TEXT)?|YEAR)\b/i,boolean:/\b(?:FALSE|NULL|TRUE)\b/i,number:/\b0x[\da-f]+\b|\b\d+(?:\.\d*)?|\B\.\d+\b/i,operator:/[-+*\/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?|\b(?:AND|BETWEEN|DIV|ILIKE|IN|IS|LIKE|NOT|OR|REGEXP|RLIKE|SOUNDS LIKE|XOR)\b/i,punctuation:/[;[\]()`,.]/};

!function(e){var n=/[*&][^\s[\]{},]+/,r=/!(?:<[\w\-%#;/?:@&=+$,.!~*'()[\]]+>|(?:[a-zA-Z\d-]*!)?[\w\-%#;/?:@&=+$.~*'()]+)?/,t="(?:"+r.source+"(?:[ \t]+"+n.source+")?|"+n.source+"(?:[ \t]+"+r.source+")?)",a="(?:[^\\s\\x00-\\x08\\x0e-\\x1f!\"#%&'*,\\-:>?@[\\]`{|}\\x7f-\\x84\\x86-\\x9f\\ud800-\\udfff\\ufffe\\uffff]|[?:-]<PLAIN>)(?:[ \t]*(?:(?![#:])<PLAIN>|:<PLAIN>))*".replace(/<PLAIN>/g,(function(){return"[^\\s\\x00-\\x08\\x0e-\\x1f,[\\]{}\\x7f-\\x84\\x86-\\x9f\\ud800-\\udfff\\ufffe\\uffff]"})),d="\"(?:[^\"\\\\\r\n]|\\\\.)*\"|'(?:[^'\\\\\r\n]|\\\\.)*'";function o(e,n){n=(n||"").replace(/m/g,"")+"m";var r="([:\\-,[{]\\s*(?:\\s<<prop>>[ \t]+)?)(?:<<value>>)(?=[ \t]*(?:$|,|\\]|\\}|(?:[\r\n]\\s*)?#))".replace(/<<prop>>/g,(function(){return t})).replace(/<<value>>/g,(function(){return e}));return RegExp(r,n)}e.languages.yaml={scalar:{pattern:RegExp("([\\-:]\\s*(?:\\s<<prop>>[ \t]+)?[|>])[ \t]*(?:((?:\r?\n|\r)[ \t]+)\\S[^\r\n]*(?:\\2[^\r\n]+)*)".replace(/<<prop>>/g,(function(){return t}))),lookbehind:!0,alias:"string"},comment:/#.*/,key:{pattern:RegExp("((?:^|[:\\-,[{\r\n?])[ \t]*(?:<<prop>>[ \t]+)?)<<key>>(?=\\s*:\\s)".replace(/<<prop>>/g,(function(){return t})).replace(/<<key>>/g,(function(){return"(?:"+a+"|"+d+")"}))),lookbehind:!0,greedy:!0,alias:"atrule"},directive:{pattern:/(^[ \t]*)%.+/m,lookbehind:!0,alias:"important"},datetime:{pattern:o("\\d{4}-\\d\\d?-\\d\\d?(?:[tT]|[ \t]+)\\d\\d?:\\d{2}:\\d{2}(?:\\.\\d*)?(?:[ \t]*(?:Z|[-+]\\d\\d?(?::\\d{2})?))?|\\d{4}-\\d{2}-\\d{2}|\\d\\d?:\\d{2}(?::\\d{2}(?:\\.\\d*)?)?"),lookbehind:!0,alias:"number"},boolean:{pattern:o("false|true","i"),lookbehind:!0,alias:"important"},null:{pattern:o("null|~","i"),lookbehind:!0,alias:"important"},string:{pattern:o(d),lookbehind:!0,greedy:!0},number:{pattern:o("[+-]?(?:0x[\\da-f]+|0o[0-7]+|(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?|\\.inf|\\.nan)","i"),lookbehind:!0},tag:r,important:n,punctuation:/---|[:[\]{}\-,|>?]|\.\.\./},e.languages.yml=e.languages.yaml}(Prism);

!function(n){function e(n){return n=n.replace(/<inner>/g,(function(){return"(?:\\\\.|[^\\\\\n\r]|(?:\n|\r\n?)(?![\r\n]))"})),RegExp("((?:^|[^\\\\])(?:\\\\{2})*)(?:"+n+")")}var t="(?:\\\\.|``(?:[^`\r\n]|`(?!`))+``|`[^`\r\n]+`|[^\\\\|\r\n`])+",a="\\|?__(?:\\|__)+\\|?(?:(?:\n|\r\n?)|(?![^]))".replace(/__/g,(function(){return t})),i="\\|?[ \t]*:?-{3,}:?[ \t]*(?:\\|[ \t]*:?-{3,}:?[ \t]*)+\\|?(?:\n|\r\n?)";n.languages.markdown=n.languages.extend("markup",{}),n.languages.insertBefore("markdown","prolog",{"front-matter-block":{pattern:/(^(?:\s*[\r\n])?)---(?!.)[\s\S]*?[\r\n]---(?!.)/,lookbehind:!0,greedy:!0,inside:{punctuation:/^---|---$/,"front-matter":{pattern:/\S+(?:\s+\S+)*/,alias:["yaml","language-yaml"],inside:n.languages.yaml}}},blockquote:{pattern:/^>(?:[\t ]*>)*/m,alias:"punctuation"},table:{pattern:RegExp("^"+a+i+"(?:"+a+")*","m"),inside:{"table-data-rows":{pattern:RegExp("^("+a+i+")(?:"+a+")*$"),lookbehind:!0,inside:{"table-data":{pattern:RegExp(t),inside:n.languages.markdown},punctuation:/\|/}},"table-line":{pattern:RegExp("^("+a+")"+i+"$"),lookbehind:!0,inside:{punctuation:/\||:?-{3,}:?/}},"table-header-row":{pattern:RegExp("^"+a+"$"),inside:{"table-header":{pattern:RegExp(t),alias:"important",inside:n.languages.markdown},punctuation:/\|/}}}},code:[{pattern:/((?:^|\n)[ \t]*\n|(?:^|\r\n?)[ \t]*\r\n?)(?: {4}|\t).+(?:(?:\n|\r\n?)(?: {4}|\t).+)*/,lookbehind:!0,alias:"keyword"},{pattern:/^```[\s\S]*?^```$/m,greedy:!0,inside:{"code-block":{pattern:/^(```.*(?:\n|\r\n?))[\s\S]+?(?=(?:\n|\r\n?)^```$)/m,lookbehind:!0},"code-language":{pattern:/^(```).+/,lookbehind:!0},punctuation:/```/}}],title:[{pattern:/\S.*(?:\n|\r\n?)(?:==+|--+)(?=[ \t]*$)/m,alias:"important",inside:{punctuation:/==+$|--+$/}},{pattern:/(^\s*)#.+/m,lookbehind:!0,alias:"important",inside:{punctuation:/^#+|#+$/}}],hr:{pattern:/(^\s*)([*-])(?:[\t ]*\2){2,}(?=\s*$)/m,lookbehind:!0,alias:"punctuation"},list:{pattern:/(^\s*)(?:[*+-]|\d+\.)(?=[\t ].)/m,lookbehind:!0,alias:"punctuation"},"url-reference":{pattern:/!?\[[^\]]+\]:[\t ]+(?:\S+|<(?:\\.|[^>\\])+>)(?:[\t ]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?/,inside:{variable:{pattern:/^(!?\[)[^\]]+/,lookbehind:!0},string:/(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\))$/,punctuation:/^[\[\]!:]|[<>]/},alias:"url"},bold:{pattern:e("\\b__(?:(?!_)<inner>|_(?:(?!_)<inner>)+_)+__\\b|\\*\\*(?:(?!\\*)<inner>|\\*(?:(?!\\*)<inner>)+\\*)+\\*\\*"),lookbehind:!0,greedy:!0,inside:{content:{pattern:/(^..)[\s\S]+(?=..$)/,lookbehind:!0,inside:{}},punctuation:/\*\*|__/}},italic:{pattern:e("\\b_(?:(?!_)<inner>|__(?:(?!_)<inner>)+__)+_\\b|\\*(?:(?!\\*)<inner>|\\*\\*(?:(?!\\*)<inner>)+\\*\\*)+\\*"),lookbehind:!0,greedy:!0,inside:{content:{pattern:/(^.)[\s\S]+(?=.$)/,lookbehind:!0,inside:{}},punctuation:/[*_]/}},strike:{pattern:e("(~~?)(?:(?!~)<inner>)+\\2"),lookbehind:!0,greedy:!0,inside:{content:{pattern:/(^~~?)[\s\S]+(?=\1$)/,lookbehind:!0,inside:{}},punctuation:/~~?/}},"code-snippet":{pattern:/(^|[^\\`])(?:``[^`\r\n]+(?:`[^`\r\n]+)*``(?!`)|`[^`\r\n]+`(?!`))/,lookbehind:!0,greedy:!0,alias:["code","keyword"]},url:{pattern:e('!?\\[(?:(?!\\])<inner>)+\\](?:\\([^\\s)]+(?:[\t ]+"(?:\\\\.|[^"\\\\])*")?\\)|[ \t]?\\[(?:(?!\\])<inner>)+\\])'),lookbehind:!0,greedy:!0,inside:{operator:/^!/,content:{pattern:/(^\[)[^\]]+(?=\])/,lookbehind:!0,inside:{}},variable:{pattern:/(^\][ \t]?\[)[^\]]+(?=\]$)/,lookbehind:!0},url:{pattern:/(^\]\()[^\s)]+/,lookbehind:!0},string:{pattern:/(^[ \t]+)"(?:\\.|[^"\\])*"(?=\)$)/,lookbehind:!0}}}}),["url","bold","italic","strike"].forEach((function(e){["url","bold","italic","strike","code-snippet"].forEach((function(t){e!==t&&(n.languages.markdown[e].inside.content.inside[t]=n.languages.markdown[t])}))})),n.hooks.add("after-tokenize",(function(n){"markdown"!==n.language&&"md"!==n.language||function n(e){if(e&&"string"!=typeof e)for(var t=0,a=e.length;t<a;t++){var i=e[t];if("code"===i.type){var r=i.content[1],o=i.content[3];if(r&&o&&"code-language"===r.type&&"code-block"===o.type&&"string"==typeof r.content){var l=r.content.replace(/\b#/g,"sharp").replace(/\b\+\+/g,"pp"),s="language-"+(l=(/[a-z][\w-]*/i.exec(l)||[""])[0].toLowerCase());o.alias?"string"==typeof o.alias?o.alias=[o.alias,s]:o.alias.push(s):o.alias=[s]}}else n(i.content)}}(n.tokens)})),n.hooks.add("wrap",(function(e){if("code-block"===e.type){for(var t="",a=0,i=e.classes.length;a<i;a++){var s=e.classes[a],d=/language-(.+)/.exec(s);if(d){t=d[1];break}}var p=n.languages[t];if(p)e.content=n.highlight(e.content.replace(r,"").replace(/&(\w{1,8}|#x?[\da-f]{1,8});/gi,(function(n,e){var t;return"#"===(e=e.toLowerCase())[0]?(t="x"===e[1]?parseInt(e.slice(2),16):Number(e.slice(1)),l(t)):o[e]||n})),p,t);else if(t&&"none"!==t&&n.plugins.autoloader){var u="md-"+(new Date).valueOf()+"-"+Math.floor(1e16*Math.random());e.attributes.id=u,n.plugins.autoloader.loadLanguages(t,(function(){var e=document.getElementById(u);e&&(e.innerHTML=n.highlight(e.textContent,n.languages[t],t))}))}}}));var r=RegExp(n.languages.markup.tag.pattern.source,"gi"),o={amp:"&",lt:"<",gt:">",quot:'"'},l=String.fromCodePoint||String.fromCharCode;n.languages.md=n.languages.markdown}(Prism);

/* ===== 50-icons.js ===== */
/** IconSearchOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconSearchOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M11.748 6.7028C11.748 3.90104 9.47653 1.62976 6.6748 1.62956C3.87291 1.62956 1.60156 3.90091 1.60156 6.7028C1.60176 9.50453 3.87304 11.776 6.6748 11.776C9.47641 11.7759 11.7479 9.50441 11.748 6.7028ZM13.0479 6.7028C13.0477 10.2224 10.1944 13.0757 6.6748 13.0759C3.15507 13.0759 0.300977 10.2225 0.300781 6.7028C0.300781 3.18294 3.15494 0.328781 6.6748 0.328781C10.1945 0.328977 13.0479 3.18307 13.0479 6.7028Z", fill: "currentColor" }),
  h("path", { d: "M15.6991 14.7513L14.7792 15.6712L11.3974 12.2894L12.3173 11.3694L15.6991 14.7513Z", fill: "currentColor" }))

/** IconSearchWarningOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconSearchWarningOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M15.683 14.7514L14.763 15.6713L11.3812 12.2895L12.3011 11.3695L15.683 14.7514Z", fill: "currentColor" }),
  h("path", { d: "M9.26526 12.5172C8.46932 12.8746 7.58782 13.0757 6.65881 13.0758C5.72972 13.0758 4.84747 12.8756 4.05139 12.5181L4.70471 11.3853C5.30616 11.6366 5.96625 11.776 6.65881 11.776C7.3511 11.7759 8.01067 11.6365 8.61194 11.3853L9.26526 12.5172ZM1.62854 7.3531C1.80466 8.72851 2.53029 9.93116 3.57971 10.734L2.92542 11.8668C1.49134 10.8285 0.505229 9.20914 0.317017 7.3531H1.62854ZM12.9987 7.3531C12.8104 9.20937 11.8245 10.8285 10.3903 11.8668L9.73694 10.734C10.7865 9.93115 11.5129 8.72861 11.6891 7.3531H12.9987ZM10.3903 1.53767C11.8246 2.57611 12.8104 4.1959 12.9987 6.05232H11.6891C11.5129 4.6766 10.7869 3.47321 9.73694 2.67049L10.3903 1.53767ZM3.57971 2.67049C2.52998 3.4732 1.8047 4.67669 1.62854 6.05232H0.317017C0.505244 4.19613 1.49119 2.57614 2.92542 1.53767L3.57971 2.67049ZM6.65881 0.32869C7.58761 0.328776 8.46946 0.528969 9.26526 0.886307L8.61096 2.0201C8.00995 1.7692 7.35073 1.62955 6.65881 1.62947C5.96675 1.62947 5.30679 1.76821 4.70569 2.01912L4.05139 0.886307C4.84743 0.528886 5.72979 0.32869 6.65881 0.32869Z", fill: "currentColor" }))

/** IconBrowseOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconBrowseOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M11.2426 4.80473V6.10551H4.75819V4.80473H11.2426Z", fill: "currentColor" }),
  h("path", { d: "M9.40858 7.84478V9.14557H4.75819V7.84478H9.40858Z", fill: "currentColor" }),
  h("path", { d: "M9.23438 0.546389C10.1941 0.546389 10.9683 0.544914 11.5859 0.611819C12.2161 0.680096 12.7634 0.825745 13.2393 1.17139C13.5172 1.3733 13.7619 1.61812 13.9639 1.896C14.3096 2.37183 14.4551 2.91922 14.5234 3.54932C14.5903 4.16686 14.5889 4.94133 14.5889 5.90088V10.0981C14.5889 11.0576 14.5903 11.8321 14.5234 12.4497C14.4552 13.0798 14.3094 13.6272 13.9639 14.103C13.7619 14.381 13.5172 14.6257 13.2393 14.8276C12.7633 15.1734 12.2163 15.3189 11.5859 15.3872C10.9683 15.4541 10.1942 15.4536 9.23438 15.4536H6.76563C5.80591 15.4536 5.03168 15.4541 4.41407 15.3872C3.78385 15.3189 3.23665 15.1734 2.76074 14.8276C2.48291 14.6257 2.23802 14.3809 2.03614 14.103C1.69066 13.6272 1.54483 13.0798 1.47657 12.4497C1.40973 11.8321 1.41114 11.0576 1.41114 10.0981V5.90088C1.41113 4.94132 1.40966 4.16686 1.47657 3.54932C1.54488 2.91921 1.69042 2.37184 2.03614 1.896C2.2381 1.61807 2.4828 1.37333 2.76074 1.17139C3.23665 0.825682 3.78386 0.680109 4.41407 0.611819C5.03168 0.544905 5.80591 0.546389 6.76563 0.546389H9.23438ZM6.76563 1.896C5.77586 1.896 5.0876 1.89738 4.55957 1.95459C4.0443 2.01043 3.76214 2.11349 3.55469 2.26416C3.39135 2.38284 3.24761 2.52662 3.12891 2.68994C2.97821 2.89736 2.8752 3.17967 2.81934 3.69483C2.76214 4.22279 2.76075 4.91131 2.76074 5.90088V10.0981C2.76074 11.0876 2.76221 11.7762 2.81934 12.3042C2.87516 12.8194 2.97829 13.1026 3.12891 13.3101C3.24754 13.4733 3.39147 13.6172 3.55469 13.7358C3.76213 13.8865 4.04438 13.9896 4.55957 14.0454C5.0876 14.1026 5.77586 14.103 6.76563 14.103H9.23438C10.2242 14.103 10.9124 14.1026 11.4404 14.0454C11.9556 13.9896 12.2379 13.8865 12.4453 13.7358C12.6086 13.6172 12.7525 13.4733 12.8711 13.3101C13.0217 13.1026 13.1248 12.8195 13.1807 12.3042C13.2378 11.7762 13.2393 11.0876 13.2393 10.0981V5.90088C13.2393 4.91131 13.2379 4.22279 13.1807 3.69483C13.1248 3.17969 13.0218 2.89736 12.8711 2.68994C12.7524 2.52667 12.6086 2.38281 12.4453 2.26416C12.2379 2.11355 11.9556 2.01041 11.4404 1.95459C10.9124 1.8974 10.2241 1.896 9.23438 1.896H6.76563Z", fill: "currentColor" }))

/** IconBrowseWarningOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconBrowseWarningOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M1.3252 3.75391C1.3252 1.99831 2.74831 0.575195 4.50391 0.575195V1.9248C3.4939 1.9248 2.6748 2.7439 2.6748 3.75391V4.58789H1.3252V3.75391Z", fill: "currentColor" }),
  h("path", { d: "M1.3252 12.2461C1.3252 14.0017 2.74831 15.4248 4.50391 15.4248V14.0752C3.4939 14.0752 2.6748 13.2561 2.6748 12.2461V11.4121H1.3252V12.2461Z", fill: "currentColor" }),
  h("path", { d: "M14.6748 3.75391C14.6748 1.99831 13.2517 0.575195 11.4961 0.575195V1.9248C12.5061 1.9248 13.3252 2.7439 13.3252 3.75391V4.58789H14.6748V3.75391Z", fill: "currentColor" }),
  h("path", { d: "M14.6748 12.2461C14.6748 14.0017 13.2517 15.4248 11.4961 15.4248V14.0752C12.5061 14.0752 13.3252 13.2561 13.3252 12.2461V11.4121H14.6748V12.2461Z", fill: "currentColor" }),
  h("path", { d: "M9.78125 0.575195V1.9248H6.21875V0.575195H9.78125Z", fill: "currentColor" }),
  h("path", { d: "M9.78125 14.0752V15.4248H6.21875V14.0752H9.78125Z", fill: "currentColor" }),
  h("path", { d: "M13.3252 6.45602H14.6748V9.4111H13.3252V6.45602Z", fill: "currentColor" }),
  h("path", { d: "M1.3252 6.45602H2.6748L2.6748 9.4111H1.3252L1.3252 6.45602Z", fill: "currentColor" }),
  h("path", { d: "M11.2421 5.05475V6.35553H4.75769V5.05475H11.2421Z", fill: "currentColor" }),
  h("path", { d: "M9.40808 8.09479V9.39557H4.75769V8.09479H9.40808Z", fill: "currentColor" }))

/** IconThinkOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconThinkOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M8.00192 6.64454C8.75026 6.64454 9.35732 7.25169 9.35739 8.00001C9.35739 8.74838 8.7503 9.35548 8.00192 9.35548C7.25367 9.35533 6.64743 8.74829 6.64743 8.00001C6.6475 7.25178 7.25371 6.64468 8.00192 6.64454Z", fill: "currentColor" }),
  h("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M9.97165 1.29981C11.5853 0.718916 13.271 0.642197 14.3144 1.68555C15.3577 2.72902 15.2811 4.41466 14.7002 6.02833C14.4707 6.66561 14.1504 7.32937 13.75 8.00001C14.1504 8.67062 14.4707 9.33444 14.7002 9.97169C15.2811 11.5854 15.3578 13.271 14.3144 14.3145C13.271 15.3579 11.5854 15.2811 9.97165 14.7002C9.3344 14.4708 8.67059 14.1505 7.99997 13.75C7.32933 14.1505 6.66558 14.4708 6.02829 14.7002C4.41461 15.2811 2.72899 15.3578 1.68552 14.3145C0.642155 13.271 0.71887 11.5854 1.29977 9.97169C1.52915 9.33454 1.84865 8.67049 2.24899 8.00001C1.84866 7.32953 1.52915 6.66544 1.29977 6.02833C0.718852 4.41459 0.64207 2.729 1.68552 1.68555C2.72897 0.642112 4.41456 0.718887 6.02829 1.29981C6.66541 1.52918 7.32949 1.8487 7.99997 2.24903C8.67045 1.84869 9.33451 1.52919 9.97165 1.29981ZM12.9404 9.2129C12.4391 9.893 11.8616 10.5681 11.2148 11.2149C10.568 11.8616 9.89296 12.4391 9.21286 12.9404C9.62532 13.1579 10.0271 13.338 10.4121 13.4766C11.9146 14.0174 12.9172 13.8738 13.3955 13.3955C13.8737 12.9173 14.0174 11.9146 13.4765 10.4121C13.3379 10.0271 13.1578 9.62535 12.9404 9.2129ZM3.05856 9.2129C2.84121 9.62523 2.66197 10.0272 2.52341 10.4121C1.98252 11.9146 2.12627 12.9172 2.60446 13.3955C3.08278 13.8737 4.08544 14.0174 5.58786 13.4766C5.97264 13.338 6.37389 13.1577 6.7861 12.9404C6.10624 12.4393 5.43168 11.8614 4.78513 11.2149C4.13823 10.5679 3.55992 9.89313 3.05856 9.2129ZM7.99899 3.792C7.23179 4.31419 6.45306 4.95512 5.70407 5.70411C4.95509 6.45309 4.31415 7.23184 3.79196 7.99903C4.3143 8.76666 4.95471 9.54653 5.70407 10.2959C6.45309 11.0449 7.23271 11.6848 7.99997 12.207C8.76725 11.6848 9.54683 11.0449 10.2959 10.2959C11.0449 9.54686 11.6848 8.76729 12.207 8.00001C11.6848 7.23275 11.0449 6.45312 10.2959 5.70411C9.5465 4.95475 8.76662 4.31434 7.99899 3.792ZM5.58786 2.52344C4.08533 1.98255 3.08272 2.12625 2.60446 2.6045C2.12621 3.08275 1.98252 4.08536 2.52341 5.5879C2.66189 5.97253 2.8414 6.37409 3.05856 6.78614C3.55983 6.10611 4.1384 5.43189 4.78513 4.78516C5.43186 4.13843 6.10606 3.55987 6.7861 3.0586C6.37405 2.84144 5.97249 2.66192 5.58786 2.52344ZM13.3955 2.6045C12.9172 2.12631 11.9146 1.98257 10.4121 2.52344C10.0272 2.66201 9.62519 2.84125 9.21286 3.0586C9.8931 3.55996 10.5679 4.13827 11.2148 4.78516C11.8614 5.43172 12.4392 6.10627 12.9404 6.78614C13.1577 6.37393 13.338 5.97267 13.4765 5.5879C14.0174 4.08549 13.8736 3.08281 13.3955 2.6045Z", fill: "currentColor" }))

/** IconChevronDownOutline14：路径来自 DeepSeek 官方 chat-demo */
const IconChevronDownOutline14 = () => h('svg', { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z", fill: "currentColor" }))

/** IconChevronRightOutline14：路径来自 DeepSeek 官方 chat-demo */
const IconChevronRightOutline14 = () => h('svg', { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M5.5 2.15137L5.92383 2.57617L8.65137 5.30273C8.90706 5.55843 9.13382 5.78438 9.29785 5.98828C9.46883 6.20088 9.61756 6.44405 9.66602 6.75C9.69222 6.91565 9.69222 7.08435 9.66602 7.25C9.61756 7.55595 9.46883 7.79912 9.29785 8.01172C9.13382 8.21561 8.90706 8.44157 8.65137 8.69727L5.92383 11.4238L5.5 11.8486L4.65137 11L5.07617 10.5762L7.80273 7.84863C8.07732 7.57405 8.24849 7.40124 8.3623 7.25977C8.46904 7.12709 8.47813 7.07728 8.48047 7.0625C8.48703 7.02105 8.48703 6.97895 8.48047 6.9375C8.47813 6.92272 8.46904 6.87291 8.3623 6.74023C8.24848 6.59876 8.07732 6.42595 7.80273 6.15137L5.07617 3.42383L4.65137 3L5.5 2.15137Z", fill: "currentColor" }))

/** IconCheckedOutline14：路径来自 DeepSeek 官方 chat-demo */
const IconCheckedOutline14 = () => h('svg', { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M11.5625 4.59024L7.61328 9.07755C7.35056 9.37601 7.11248 9.64852 6.89355 9.84708C6.66495 10.0544 6.38421 10.251 6.01367 10.3168C5.81982 10.3512 5.62109 10.3533 5.42676 10.3217C5.05512 10.2612 4.77168 10.0678 4.54004 9.86368C4.31828 9.66831 4.07654 9.3995 3.80957 9.10489L2.44434 7.59903L3.55566 6.59122L4.9209 8.09805C5.21158 8.41883 5.3878 8.6123 5.53125 8.73868C5.60924 8.80738 5.65156 8.83232 5.66797 8.84024C5.6955 8.84468 5.72351 8.84507 5.75098 8.84024C5.72559 8.8449 5.75466 8.85461 5.88574 8.73575C6.02735 8.60732 6.20128 8.41128 6.4873 8.08633L10.4375 3.60001L11.5625 4.59024Z", fill: "currentColor" }))

/** IconCloseFill14：路径来自 DeepSeek 官方 chat-demo */
const IconCloseFill14 = () => h('svg', { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M10.6074 4.40278L8.00975 6.99973L10.6074 9.59739L9.59736 10.6074L6.9997 8.00978L4.40274 10.6074L3.3927 9.59739L5.98966 6.99973L3.3927 4.40278L4.40274 3.39273L6.9997 5.98969L9.59736 3.39273L10.6074 4.40278Z", fill: "currentColor" }))

/** IconCloseOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconCloseOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M14.1168 13.197L13.197 14.1167L1.8833 2.80303L2.80309 1.88324L14.1168 13.197Z", fill: "currentColor" }),
  h("path", { d: "M13.197 1.88326L14.1168 2.80305L2.80309 14.1168L1.8833 13.197L13.197 1.88326Z", fill: "currentColor" }))

/** IconLinkOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconLinkOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M2.09971 8.32562L4.06152 6.36381L5.05174 7.35403L3.08994 9.31584C2.09734 10.3084 2.09734 11.9182 3.08994 12.9108C4.08256 13.903 5.69167 13.9026 6.68416 12.9101L8.64597 10.9483L9.6362 11.9385L7.67439 13.9003C6.13517 15.4395 3.63976 15.4393 2.1004 13.9003C0.561069 12.361 0.560378 9.86495 2.09971 8.32562Z", fill: "currentColor" }),
  h("path", { d: "M8.32557 2.09968L6.36376 4.06149L7.35399 5.05171L9.3158 3.08991C10.3084 2.09731 11.9181 2.09731 12.9107 3.08991C13.903 4.08253 13.9025 5.69164 12.91 6.68413L10.9482 8.64594L11.9384 9.63616L13.9003 7.67436C15.4395 6.13514 15.4393 3.63973 13.9003 2.10037C12.3609 0.561038 9.86491 0.560347 8.32557 2.09968Z", fill: "currentColor" }),
  h("path", { d: "M10.7302 6.25978L6.25969 10.7303L5.26947 9.74007L9.73998 5.26955L10.7302 6.25978Z", fill: "currentColor" }))

/** IconRightUpOutline14：路径来自 DeepSeek 官方 chat-demo */
const IconRightUpOutline14 = () => h('svg', { width: 8, height: 14, viewBox: "0 0 8 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M6.54199 8.62824C6.54199 8.44193 6.54146 8.28829 6.53906 8.15851L1.11719 13.5814L0.728516 13.1927L0.339844 12.803L5.76172 7.38019C5.63201 7.3778 5.47812 7.37824 5.29199 7.37824H1.43555V6.27863H5.29199C5.65471 6.27863 5.97167 6.27814 6.22852 6.30597C6.49541 6.33493 6.76232 6.3998 7.00293 6.57452C7.13452 6.67013 7.25108 6.78571 7.34668 6.9173C7.52157 7.15808 7.5863 7.4256 7.61523 7.69269C7.64305 7.94948 7.64258 8.26562 7.64258 8.62824V12.4857H6.54199V8.62824Z", fill: "currentColor" }))

/** IconCopyOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconCopyOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M6.14929 4.02032C7.11197 4.02032 7.87983 4.02016 8.49597 4.07598C9.12128 4.13269 9.65792 4.25188 10.1415 4.53106C10.7202 4.8653 11.2008 5.3459 11.535 5.92462C11.8142 6.40818 11.9334 6.94481 11.9901 7.57012C12.0459 8.18625 12.0458 8.95419 12.0458 9.9168C12.0458 10.8795 12.0459 11.6473 11.9901 12.2635C11.9334 12.8888 11.8142 13.4254 11.535 13.909C11.2008 14.4877 10.7202 14.9683 10.1415 15.3025C9.65792 15.5817 9.12128 15.7009 8.49597 15.7576C7.87984 15.8134 7.11196 15.8133 6.14929 15.8133C5.18667 15.8133 4.41874 15.8134 3.80261 15.7576C3.1773 15.7009 2.64067 15.5817 2.1571 15.3025C1.5784 14.9683 1.09778 14.4877 0.76355 13.909C0.484366 13.4254 0.365184 12.8888 0.308472 12.2635C0.252649 11.6473 0.252808 10.8795 0.252808 9.9168C0.252808 8.95418 0.252664 8.18625 0.308472 7.57012C0.365184 6.94481 0.484366 6.40818 0.76355 5.92462C1.09777 5.34589 1.57839 4.86529 2.1571 4.53106C2.64067 4.25188 3.1773 4.13269 3.80261 4.07598C4.41874 4.02017 5.18666 4.02032 6.14929 4.02032ZM6.14929 5.37774C5.16181 5.37774 4.46634 5.37761 3.92566 5.42657C3.39434 5.47472 3.07859 5.56574 2.83582 5.70587C2.4632 5.92106 2.15354 6.2307 1.93835 6.60333C1.79823 6.8461 1.70721 7.16185 1.65906 7.69317C1.6101 8.23385 1.61023 8.92933 1.61023 9.9168C1.61023 10.9043 1.61009 11.5998 1.65906 12.1404C1.70721 12.6717 1.79823 12.9875 1.93835 13.2303C2.15356 13.6029 2.46321 13.9126 2.83582 14.1277C3.07859 14.2679 3.39434 14.3589 3.92566 14.407C4.46634 14.456 5.16182 14.4559 6.14929 14.4559C7.13682 14.4559 7.83224 14.456 8.37292 14.407C8.90425 14.3589 9.21999 14.2679 9.46277 14.1277C9.83535 13.9126 10.145 13.6029 10.3602 13.2303C10.5004 12.9875 10.5914 12.6717 10.6395 12.1404C10.6885 11.5998 10.6884 10.9043 10.6884 9.9168C10.6884 8.92934 10.6885 8.23384 10.6395 7.69317C10.5914 7.16185 10.5004 6.8461 10.3602 6.60333C10.1451 6.23071 9.83536 5.92107 9.46277 5.70587C9.21999 5.56574 8.90424 5.47472 8.37292 5.42657C7.83224 5.3776 7.13682 5.37774 6.14929 5.37774ZM9.80164 0.367975C10.7638 0.367975 11.5314 0.36788 12.1473 0.423639C12.7726 0.480307 13.3093 0.598759 13.7928 0.877741C14.3717 1.21192 14.8521 1.69355 15.1864 2.27227C15.4655 2.75574 15.5857 3.29164 15.6425 3.9168C15.6983 4.53301 15.6971 5.3016 15.6971 6.26446V7.82989C15.6971 8.29264 15.6989 8.58993 15.6649 8.84844C15.4668 10.3525 14.401 11.5738 12.9833 11.9988V10.5467C13.6973 10.1903 14.2105 9.49662 14.3192 8.67169C14.3387 8.52347 14.3407 8.3358 14.3407 7.82989V6.26446C14.3407 5.27706 14.3398 4.58149 14.2909 4.04083C14.2428 3.50968 14.1526 3.19372 14.0126 2.95098C13.7974 2.57849 13.4876 2.26869 13.1151 2.05352C12.8724 1.91347 12.5564 1.82237 12.0253 1.77423C11.4847 1.72528 10.7888 1.7254 9.80164 1.7254H7.71472C6.7562 1.72558 5.92665 2.27697 5.52332 3.07891H4.07019C4.54221 1.51132 5.9932 0.368186 7.71472 0.367975H9.80164Z", fill: "currentColor" }))

/** IconCheckOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconCheckOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M15.0498 3.92579L8.49512 12.3818C8.25774 12.6881 8.04517 12.9645 7.84668 13.1689C7.63957 13.3823 7.38732 13.5841 7.04492 13.6719C6.86373 13.7183 6.6757 13.7346 6.48926 13.7197C6.13666 13.6915 5.8528 13.5355 5.6123 13.3604C5.38201 13.1926 5.12573 12.9567 4.83984 12.6953L1.03125 9.21289L1.96875 8.1875L5.77734 11.6699C6.08684 11.9529 6.27773 12.1249 6.43066 12.2363C6.50183 12.2882 6.54699 12.3135 6.57324 12.3252C6.58525 12.3305 6.59269 12.3322 6.5957 12.333C6.59802 12.3336 6.59961 12.334 6.59961 12.334C6.63317 12.3367 6.66758 12.3335 6.7002 12.3252C6.7002 12.3252 6.70211 12.3251 6.7041 12.3242C6.70698 12.3229 6.71348 12.319 6.72461 12.3115C6.74849 12.2956 6.78843 12.2642 6.84961 12.2012C6.98138 12.0654 7.13957 11.8628 7.39648 11.5313L13.9502 3.07422L15.0498 3.92579Z", fill: "currentColor" }))

/** IconSendOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconSendOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M8.3125 0.980206C8.66767 1.05312 8.97902 1.2042 9.2627 1.43235C9.48724 1.613 9.73029 1.85795 9.97949 2.10716L14.707 6.8347L13.293 8.24876L9 3.95579V15.0417H7V3.95579L2.70703 8.24876L1.29297 6.8347L6.02051 2.10716C6.26971 1.85795 6.51277 1.613 6.7373 1.43235C6.97662 1.23988 7.28445 1.04404 7.6875 0.980206C7.8973 0.947029 8.1031 0.955183 8.3125 0.980206Z", fill: "currentColor" }))

/** IconStopFill16：路径来自 DeepSeek 官方 chat-demo */
const IconStopFill16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M2 4.88C2 3.68009 2 3.08013 2.30557 2.65954C2.40426 2.52371 2.52371 2.40426 2.65954 2.30557C3.08013 2 3.68009 2 4.88 2H11.12C12.3199 2 12.9199 2 13.3405 2.30557C13.4763 2.40426 13.5957 2.52371 13.6944 2.65954C14 3.08013 14 3.68009 14 4.88V11.12C14 12.3199 14 12.9199 13.6944 13.3405C13.5957 13.4763 13.4763 13.5957 13.3405 13.6944C12.9199 14 12.3199 14 11.12 14H4.88C3.68009 14 3.08013 14 2.65954 13.6944C2.52371 13.5957 2.40426 13.4763 2.30557 13.3405C2 12.9199 2 12.3199 2 11.12V4.88Z", fill: "currentColor" }))

/** IconRefreshOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconRefreshOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M7.92136 0.349152C10.3744 0.349234 12.5564 1.5052 13.9557 3.29894L15.1281 2.12759C15.3303 1.92546 15.6767 2.06943 15.6767 2.35538V5.53923C15.6766 5.71626 15.5329 5.85976 15.3559 5.86002H12.171C11.8854 5.8597 11.7426 5.51465 11.9443 5.31249L12.9641 4.29056C11.8237 2.74305 9.98908 1.74106 7.92136 1.74097C4.46436 1.74097 1.66233 4.543 1.66233 8C1.66233 11.457 4.46436 14.259 7.92136 14.259C11.3782 14.2589 14.1804 11.4569 14.1804 8H15.5722C15.5722 12.2251 12.1465 15.6507 7.92136 15.6508C3.69614 15.6508 0.270508 12.2252 0.270508 8C0.270508 3.77478 3.69614 0.349152 7.92136 0.349152Z", fill: "currentColor" }))

/** IconEditOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconEditOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M9.94076 1.34942C10.7047 0.90231 11.6503 0.902415 12.4143 1.34942C12.7061 1.52015 12.9688 1.79118 13.3104 2.13284C13.6521 2.47448 13.9231 2.73721 14.0939 3.02894C14.5408 3.79294 14.5409 4.73856 14.0939 5.50251C13.9231 5.79415 13.652 6.05704 13.3104 6.39861L6.65932 13.0497C6.28068 13.4284 6.00695 13.7108 5.66543 13.9097C5.32391 14.1085 4.94315 14.2074 4.42705 14.3498L3.24394 14.6761C2.77527 14.8054 2.34538 14.9262 2.00131 14.9684C1.65196 15.0112 1.17964 15.0013 0.810764 14.6325C0.441921 14.2637 0.432107 13.7913 0.47486 13.442C0.517035 13.0979 0.6379 12.668 0.767181 12.1993L1.09352 11.0162C1.23588 10.5001 1.33481 10.1193 1.5336 9.77784C1.7325 9.43632 2.0149 9.1626 2.39355 8.78395L9.04466 2.13284C9.38625 1.79126 9.64911 1.52016 9.94076 1.34942ZM15.5427 14.8398H7.55223L8.96707 13.425H15.5427V14.8398ZM3.39382 9.78422C2.965 10.213 2.84244 10.3436 2.75709 10.49C2.67183 10.6366 2.61862 10.8079 2.45733 11.3925L2.13099 12.5756C2.00183 13.0439 1.92194 13.3419 1.88863 13.5536C2.10041 13.5204 2.39872 13.4416 2.86764 13.3123L4.05075 12.9859C4.63544 12.8246 4.80669 12.7715 4.95323 12.6862C5.09968 12.6008 5.23022 12.4783 5.65905 12.0494L10.721 6.98644L8.45577 4.72121L3.39382 9.78422ZM11.7 2.57079C11.3774 2.38198 10.9777 2.38198 10.6551 2.57079C10.5602 2.62647 10.4487 2.72931 10.0449 3.13311L9.45604 3.72094L11.7213 5.98617L12.3102 5.39833C12.7139 4.99457 12.8168 4.88307 12.8725 4.78818C13.0613 4.46561 13.0612 4.06585 12.8725 3.74326C12.8169 3.64827 12.7146 3.53752 12.3102 3.13311C11.9057 2.72863 11.795 2.6264 11.7 2.57079Z", fill: "currentColor" }))

/** IconEllipsisOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconEllipsisOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M4.55146 8.00001C4.55146 8.63513 4.03659 9.15001 3.40146 9.15001C2.76634 9.15001 2.25146 8.63513 2.25146 8.00001C2.25146 7.36488 2.76634 6.85001 3.40146 6.85001C4.03659 6.85001 4.55146 7.36488 4.55146 8.00001Z", fill: "currentColor" }),
  h("path", { d: "M9.1476 8.00001C9.1476 8.63513 8.63273 9.15001 7.9976 9.15001C7.36248 9.15001 6.8476 8.63513 6.8476 8.00001C6.8476 7.36488 7.36248 6.85001 7.9976 6.85001C8.63273 6.85001 9.1476 7.36488 9.1476 8.00001Z", fill: "currentColor" }),
  h("path", { d: "M13.7486 8.00001C13.7486 8.63513 13.2338 9.15001 12.5986 9.15001C11.9635 9.15001 11.4486 8.63513 11.4486 8.00001C11.4486 7.36488 11.9635 6.85001 12.5986 6.85001C13.2338 6.85001 13.7486 7.36488 13.7486 8.00001Z", fill: "currentColor" }))

/** IconTrashOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconTrashOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M14.4782 4.84067L14.2138 10.1152C14.1102 12.1872 14.067 13.0115 13.3866 13.9607C13.1044 14.3546 12.7498 14.6912 12.3424 14.9535C11.8239 15.2872 11.2415 15.4316 10.5585 15.4998C9.88727 15.5668 9.04946 15.5656 7.99998 15.5656C6.95051 15.5656 6.1127 15.5668 5.44142 15.4998C4.75851 15.4316 4.17602 15.2872 3.65753 14.9535C3.25012 14.6912 2.89559 14.3546 2.61332 13.9607C1.93296 13.0115 1.88979 12.1872 1.78619 10.1152L1.52179 4.84067L2.89006 4.77277L3.15343 10.0463C3.26221 12.2218 3.32452 12.6015 3.72646 13.1624C3.90825 13.4161 4.13686 13.6334 4.39927 13.8023C4.66204 13.9714 5.00263 14.0792 5.57825 14.1367C6.16562 14.1953 6.92298 14.1963 7.99998 14.1963C9.07699 14.1963 9.83434 14.1953 10.4217 14.1367C10.9973 14.0792 11.3379 13.9714 11.6007 13.8023C11.8631 13.6334 12.0917 13.4161 12.2735 13.1624C12.6755 12.6015 12.7378 12.2218 12.8465 10.0463L13.1099 4.77277L14.4782 4.84067ZM5.43011 6.22849H6.7994V11.3909H5.43011V6.22849ZM9.20056 6.22849H10.5699V11.3909H9.20056V6.22849ZM8.53597 0.434431C9.17976 0.434431 9.6522 0.426926 10.0966 0.571258C10.2357 0.616451 10.3717 0.672554 10.502 0.738948C10.9182 0.951107 11.2464 1.29099 11.7015 1.74612L12.4978 2.54136H15.3742V3.91169H0.625732V2.54136H3.50218L4.29845 1.74612C4.75358 1.29099 5.08174 0.951107 5.49801 0.738948C5.62831 0.672554 5.76425 0.616451 5.90334 0.571258C6.34776 0.426926 6.82021 0.434431 7.46399 0.434431H8.53597ZM7.46399 1.80476C6.73208 1.80476 6.51641 1.81187 6.32617 1.87369C6.25545 1.89667 6.18668 1.92533 6.12041 1.95907C5.96398 2.03878 5.82348 2.16253 5.44142 2.54136H10.5585C10.1765 2.16253 10.036 2.03878 9.87955 1.95907C9.81329 1.92533 9.74452 1.89667 9.6738 1.87369C9.48356 1.81187 9.26789 1.80476 8.53597 1.80476H7.46399Z", fill: "currentColor" }))

/** IconMicOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconMicOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "-1.4937 -0.4304 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M13.1392 8.4347A6.8543 6.8543 0 0 1 0.0021 8.4347L1.3765 8.1186A5.4476 5.4476 0 0 0 11.7648 8.1186ZM10.243 6.9412C10.243 8.9694 8.5987 10.6137 6.5705 10.6137C4.5422 10.6137 2.8979 8.9694 2.8979 6.9412L2.8979 3.6725C2.8979 1.6443 4.5422 0 6.5705 0C8.5987 0 10.243 1.6443 10.243 3.6725ZM8.8364 3.6726C8.8364 2.4211 7.8219 1.4066 6.5705 1.4066C5.319 1.4066 4.3045 2.4211 4.3045 3.6726L4.3045 6.9411C4.3045 8.1925 5.319 9.207 6.5705 9.207C7.8219 9.207 8.8364 8.1925 8.8364 6.9411ZM5.8675 12.7393H7.2741V15.6391H5.8675Z", fill: "currentColor" }))

/** IconMicFill16：路径来自 DeepSeek 官方 chat-demo */
const IconMicFill16 = () => h('svg', { width: 16, height: 16, viewBox: "-1.9761 -1.2725 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M12.0479 7.71973L11.8184 8.33496C10.4226 10.4226 9.05179 11.9398 6.68066 12.1787V13.4551H5.36816V12.1787C2.99681 11.9399 1.00863 10.4227 0.229492 8.33496L0 7.71973L1.23047 7.26074L1.45996 7.87598C2.11043 9.61879 3.8931 10.9004 6.02441 10.9004C8.15571 10.9003 9.93844 9.6188 10.5889 7.87598L10.8184 7.26074L12.0479 7.71973Z", fill: "currentColor" }),
  h("path", { d: "M6.02441 0C7.88594 0.000147526 9.39453 1.50953 9.39453 3.37109V6.3584C9.39453 8.21996 7.88594 9.72934 6.02441 9.72949C4.16276 9.72949 2.65332 8.22005 2.65332 6.3584V3.37109C2.65332 1.50944 4.16276 0 6.02441 0Z", fill: "currentColor" }))

/** IconPaperclipOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconPaperclipOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M5.5498 9.75V5H6.9502V9.75C6.9502 10.3299 7.4201 10.7998 8 10.7998C8.5799 10.7998 9.0498 10.3299 9.0498 9.75V4.5C9.0498 2.9536 7.7964 1.7002 6.25 1.7002C4.7036 1.7002 3.4502 2.9536 3.4502 4.5V9.75C3.4502 12.2629 5.4871 14.2998 8 14.2998C10.5129 14.2998 12.5498 12.2629 12.5498 9.75V4H13.9502V9.75C13.9502 13.0361 11.2861 15.7002 8 15.7002C4.71391 15.7002 2.0498 13.0361 2.0498 9.75V4.5C2.04981 2.1804 3.9304 0.299806 6.25 0.299805C8.5696 0.299805 10.4502 2.1804 10.4502 4.5V9.75C10.4502 11.1031 9.3531 12.2002 8 12.2002C6.6469 12.2002 5.5498 11.1031 5.5498 9.75Z", fill: "currentColor" }))

/** IconNewChatOutline20：路径来自 DeepSeek 官方 chat-demo */
const IconNewChatOutline20 = () => h('svg', { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M9.99994 1.22943C5.15598 1.22943 1.22937 5.15604 1.22937 10C1.22937 11.3437 1.5319 12.6189 2.07359 13.7592L2.40673 14.4596L3.8065 13.7942L3.4743 13.0939L3.31625 12.7371C2.97051 11.8938 2.77962 10.97 2.77962 10C2.77962 6.01243 6.01237 2.77968 9.99994 2.77968C13.9875 2.77968 17.2203 6.01243 17.2203 10C17.2203 13.9876 13.9875 17.2203 9.99994 17.2203C9.18334 17.2203 8.5858 17.1622 8.05597 17.0159C7.53397 16.8717 7.03885 16.6305 6.44609 16.2171C5.57744 15.6112 4.33224 15.3975 3.30584 16.0458L3.28975 16.0562L3.27366 16.0676L2.59034 16.5484L3.10425 18.0825L4.14438 17.35C4.51831 17.1207 5.07296 17.1507 5.55834 17.4891C6.26058 17.9789 6.91499 18.3092 7.64333 18.5103C8.3639 18.7093 9.11779 18.7706 9.99994 18.7706C14.8439 18.7706 18.7705 14.844 18.7705 10C18.7705 5.15604 14.8439 1.22943 9.99994 1.22943ZM9.21913 6.36949V9.22487H6.36943V10.7751H9.21913V13.6305H10.7694V10.7751H13.6304V9.22487H10.7694V6.36949H9.21913Z", fill: "currentColor" }))

/** IconSettingsOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconSettingsOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M14.0861 5.51366C13.8717 5.0575 13.588 4.58542 13.2889 4.18108C13.208 4.07172 13.1596 4.04373 13.0243 4.03054C12.4277 3.97255 11.8245 4.05527 11.2269 3.9972C10.7224 3.94816 10.3133 3.71661 10.0115 3.30919C9.66986 2.84777 9.43973 2.31343 9.09824 1.85234C9.01771 1.74365 8.96805 1.71589 8.83354 1.70282C8.29432 1.65044 7.70402 1.65061 7.16656 1.70282C7.03205 1.71589 6.98239 1.74365 6.90186 1.85234C6.56067 2.31303 6.33025 2.84774 5.98855 3.30919C5.68681 3.71661 5.27774 3.94816 4.77317 3.9972C4.17564 4.05527 3.57239 3.97255 2.97585 4.03054C2.84046 4.04373 2.79208 4.07172 2.71115 4.18108C2.41212 4.58542 2.12835 5.0575 1.91403 5.51366C1.85299 5.64359 1.85286 5.7018 1.91403 5.8319C2.14865 6.33077 2.49748 6.76892 2.73237 7.26854C2.9594 7.7515 2.96041 8.24717 2.73338 8.73044C2.49837 9.23061 2.14891 9.66837 1.91403 10.1681C1.85291 10.2982 1.85299 10.3564 1.91403 10.4863C2.12856 10.9429 2.41185 11.4142 2.71115 11.8189C2.79208 11.9283 2.84046 11.9563 2.97585 11.9694C3.57239 12.0274 4.17564 11.9447 4.77317 12.0028C5.27774 12.0518 5.68681 12.2834 5.98855 12.6908C6.33024 13.1522 6.56037 13.6866 6.90186 14.1476C6.98239 14.2563 7.03205 14.2841 7.16656 14.2972C7.70402 14.3494 8.29432 14.3495 8.83354 14.2972C8.96805 14.2841 9.01771 14.2563 9.09824 14.1476C9.43944 13.687 9.66985 13.1522 10.0115 12.6908C10.3133 12.2834 10.7224 12.0518 11.2269 12.0028C11.8244 11.9447 12.4271 12.0275 13.0243 11.9694C13.1596 11.9563 13.208 11.9283 13.2889 11.8189C13.5891 11.4131 13.872 10.942 14.0861 10.4863C14.1471 10.3564 14.1472 10.2982 14.0861 10.1681C13.8513 9.66861 13.5017 9.23061 13.2667 8.73044C13.0397 8.24717 13.0407 7.7515 13.2677 7.26854C13.5026 6.7689 13.8513 6.33106 14.0861 5.8319C14.1472 5.7018 14.1471 5.64359 14.0861 5.51366ZM15.3035 6.40373C15.0685 6.90359 14.7188 7.34119 14.4841 7.84037C14.4231 7.97025 14.423 8.02855 14.4841 8.15861C14.7189 8.65833 15.0685 9.09611 15.3035 9.59626C15.5308 10.0801 15.5308 10.5744 15.3035 11.0582C15.052 11.5933 14.7225 12.1426 14.37 12.6191C14.0685 13.0265 13.6581 13.259 13.1536 13.3081C12.5566 13.366 11.9541 13.2835 11.3573 13.3414C11.2228 13.3545 11.1731 13.3823 11.0926 13.491C10.7511 13.9521 10.521 14.4864 10.1793 14.9478C9.87828 15.3542 9.46719 15.5869 8.96387 15.6358C8.34008 15.6964 7.66194 15.6966 7.03623 15.6358C6.53291 15.5869 6.12182 15.3542 5.82084 14.9478C5.47911 14.4863 5.24878 13.9517 4.90753 13.491C4.82701 13.3823 4.77734 13.3545 4.64284 13.3414C4.04647 13.2835 3.44373 13.366 2.84653 13.3081C2.34201 13.259 1.93164 13.0265 1.63013 12.6191C1.27867 12.144 0.948453 11.5941 0.696621 11.0582C0.469315 10.5744 0.469279 10.0801 0.696621 9.59626C0.931628 9.09613 1.2813 8.65807 1.51597 8.15861C1.57708 8.02855 1.57702 7.97025 1.51597 7.84037C1.28117 7.34095 0.931635 6.9036 0.696621 6.40373C0.469213 5.91992 0.469367 5.42562 0.696621 4.94183C0.948441 4.40587 1.27868 3.85598 1.63013 3.38092C1.93164 2.97349 2.34201 2.74095 2.84653 2.6919C3.44353 2.63397 4.04599 2.71649 4.64284 2.65856C4.77734 2.64549 4.82701 2.61774 4.90753 2.50904C5.24905 2.04792 5.47913 1.51362 5.82084 1.05219C6.12182 0.645806 6.53291 0.413119 7.03623 0.364178C7.66002 0.303556 8.33816 0.303369 8.96387 0.364178C9.46719 0.413119 9.87828 0.645806 10.1793 1.05219C10.521 1.51365 10.7513 2.04828 11.0926 2.50904C11.1731 2.61774 11.2228 2.64549 11.3573 2.65856C11.9541 2.71649 12.5566 2.63397 13.1536 2.6919C13.6581 2.74095 14.0685 2.97349 14.37 3.38092C14.7214 3.85598 15.0517 4.40587 15.3035 4.94183C15.5307 5.42562 15.5309 5.91992 15.3035 6.40373Z", fill: "currentColor" }),
  h("path", { d: "M9.13764 7.99999C9.13764 7.3715 8.62855 6.8624 8.00005 6.8624C7.37155 6.8624 6.86246 7.3715 6.86246 7.99999C6.86246 8.62849 7.37155 9.13759 8.00005 9.13759C8.62855 9.13759 9.13764 8.62849 9.13764 7.99999ZM10.4834 7.99999C10.4834 9.37126 9.37132 10.4833 8.00005 10.4833C6.62878 10.4833 5.51674 9.37126 5.51674 7.99999C5.51674 6.62873 6.62878 5.51669 8.00005 5.51669C9.37132 5.51669 10.4834 6.62873 10.4834 7.99999Z", fill: "currentColor" }))

/** IconPlayMediaOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconPlayMediaOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M9.31006 14.8936C9.30005 14.9767 9.26249 15.2257 9.03858 15.4171C8.95084 15.492 8.84784 15.5468 8.73682 15.5782C8.45324 15.6584 8.22543 15.5514 8.15088 15.5137C8.07158 15.4737 7.98931 15.4174 7.95068 15.3917L3.15479 12.1944H2.86572C2.50642 12.1944 2.18033 12.195 1.91358 12.1661C1.63391 12.1357 1.33732 12.0666 1.0669 11.8702C0.922729 11.7654 0.795709 11.6383 0.690919 11.4942C0.494309 11.2236 0.424376 10.9264 0.394044 10.6466C0.365138 10.3798 0.365724 10.0538 0.365724 9.69441V6.29206C0.365723 5.933 0.365196 5.60754 0.394044 5.34089C0.42437 5.06099 0.494281 4.76388 0.690919 4.49323C0.795763 4.34895 0.922602 4.22209 1.0669 4.11726C1.33741 3.92073 1.6338 3.85073 1.91358 3.82038C2.18033 3.79148 2.50642 3.79206 2.86572 3.79206H3.71826L7.91065 0.647532C7.95088 0.617359 8.03247 0.555178 8.11084 0.509836C8.18041 0.469607 8.41182 0.341459 8.71045 0.41511C8.79681 0.436447 8.87927 0.471498 8.95361 0.519602L9.0249 0.57136L9.10498 0.647532C9.27169 0.829111 9.30067 1.03833 9.30908 1.10847C9.31986 1.19842 9.31885 1.30131 9.31885 1.35163V14.6593C9.31885 14.7057 9.32069 14.8054 9.31006 14.8936ZM1.76611 9.69441C1.76611 10.0846 1.76686 10.3213 1.78565 10.4952C1.79436 10.5757 1.805 10.6216 1.81299 10.6466C1.81667 10.658 1.81947 10.6644 1.8208 10.6671C1.8219 10.6693 1.82275 10.671 1.82275 10.671C1.84121 10.6964 1.86377 10.7189 1.88916 10.7374C1.88916 10.7374 1.8908 10.7382 1.89307 10.7393C1.89569 10.7406 1.90216 10.7435 1.91358 10.7471C1.93852 10.7551 1.98446 10.7658 2.06494 10.7745C2.23879 10.7933 2.47538 10.795 2.86572 10.795H3.57959L7.91943 13.6876V2.3907L4.18408 5.19245H2.86572C2.47542 5.19245 2.23878 5.19317 2.06494 5.21198C1.98446 5.2207 1.93852 5.23134 1.91358 5.23933C1.90209 5.24302 1.8957 5.24584 1.89307 5.24714C1.89068 5.24833 1.88916 5.25007 1.88916 5.25007C1.86389 5.26851 1.84114 5.29117 1.82275 5.31648L1.8208 5.31941C1.8195 5.32203 1.81666 5.3285 1.81299 5.33991C1.805 5.36486 1.79436 5.4108 1.78565 5.49128C1.76682 5.66512 1.76611 5.90173 1.76611 6.29206V9.69441Z", fill: "currentColor" }),
  h("path", { d: "M11.2036 4.90008C12.9119 6.60839 12.9118 9.37826 11.2036 11.0866L10.2133 10.0964C11.3748 8.93476 11.3749 7.05189 10.2133 5.89032L11.2036 4.90008Z", fill: "currentColor" }),
  h("path", { d: "M13.4306 2.67302C16.3689 5.61129 16.3688 10.3753 13.4306 13.3136L12.4404 12.3234C14.8319 9.93183 14.8319 6.0548 12.4404 3.66326L13.4306 2.67302Z", fill: "currentColor" }))

/** IconWarningOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconWarningOutline16 = () => h('svg', { width: 14, height: 14, viewBox: "0 0 14 14", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M6.30017 3.32843H7.69983V7.79657H6.30017V3.32843Z", fill: "currentColor" }),
  h("path", { d: "M6.30017 9.01935H7.69983V10.6711H6.30017V9.01935Z", fill: "currentColor" }),
  h("path", { d: "M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z", fill: "currentColor" }),
  h("rect", { width: 14, height: 14, fill: "currentColor" }))

/**
 * IconArrowLeftOutline16：返回箭头。
 *
 * 官方 chat-demo 是独立 App，没有「返回宿主面板」这个场景，所以图标集里没有返回箭头。
 * 这里另画一个，但严格沿用官方行内图标的规格：填充路径（官方图标零 stroke）、
 * 笔触 1.4（对齐 PanelLeft/Settings 一类的线框粗细）、16×16 视框、左右各留约 1.9 的安全边距。
 *
 * 画法要点：头部是一条闭合 chevron 多边形，尖端在外/内两条边的斜接交点处——
 * 若拆成多段子路径分别填充，各段绕向不一致会让 nonzero 填充互相挖空，尖端出现缺口。
 *
 * 生成脚本见 .tmp/gen-arrow4.mjs。
 */
const IconArrowLeftOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M3.4 7.3L14.2 7.3L14.2 8.7L3.4 8.7ZM8.4 3.29L3.87 8L8.4 12.71L7.4 13.69L1.93 8L7.4 2.31Z", fill: "currentColor" }))

/** IconMenuOutline20：路径来自 DeepSeek 官方 chat-demo（移动端顶栏的菜单按钮） */
const IconMenuOutline20 = () => h('svg', { width: 20, height: 20, viewBox: "0 0 20 20", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M17.2027 4.90034V6.43655H2.79724V4.90034H17.2027Z", fill: "currentColor" }),
  h("path", { d: "M10.9603 13.0634V14.5996H2.79724V13.0634H10.9603Z", fill: "currentColor" }))

/** IconPanelLeftOutline16：路径来自 DeepSeek 官方 chat-demo */
const IconPanelLeftOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z", fill: "currentColor" }))

/**
 * IconUserOutline16：设置里的「账号管理」分区图标。
 *
 * 官方设置弹窗有这枚图标，但 chat-demo 的图标集里没有导出，
 * 这里按官方行内图标规格自绘：填充路径、笔触约 1.4、16×16 视框、四周约 1.6 安全边距。
 */
const IconUserOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M8 1.4a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm0 1.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Z", fill: "currentColor" }),
  h("path", { d: "M8 9.1c-2.1 0-3.9.5-5.1 1.4-.6.5-1 1.1-1 1.9 0 1 .8 1.8 1.8 1.8h8.6c1 0 1.8-.8 1.8-1.8 0-.8-.4-1.4-1-1.9-1.2-.9-3-1.4-5.1-1.4Zm0 1.4c1.7 0 3.1.4 3.9 1 .3.2.4.4.4.6 0 .2-.2.4-.4.4H4.1c-.2 0-.4-.2-.4-.4 0-.2.1-.4.4-.6.8-.6 2.2-1 3.9-1Z", fill: "currentColor" }))

/** IconDataOutline16：设置里的「数据管理」分区图标 */
const IconDataOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { fillRule: "evenodd", clipRule: "evenodd", d: "M8 1.4c-3.2 0-5.8 1-5.8 2.4v8.4c0 1.4 2.6 2.4 5.8 2.4s5.8-1 5.8-2.4V3.8c0-1.4-2.6-2.4-5.8-2.4Zm4.4 3.2c-.5.5-2.1 1-4.4 1s-3.9-.5-4.4-1c-.2-.2-.3-.3-.3-.4 0-.1.1-.3.3-.4.5-.5 2.1-1 4.4-1s3.9.5 4.4 1c.2.1.3.3.3.4 0 .1-.1.2-.3.4ZM3.6 6.4c1.1.5 2.6.8 4.4.8s3.3-.3 4.4-.8v2.2c-.5.5-2.1 1-4.4 1s-3.9-.5-4.4-1V6.4Zm0 3.8c1.1.5 2.6.8 4.4.8s3.3-.3 4.4-.8v2.2c-.5.5-2.1 1-4.4 1s-3.9-.5-4.4-1v-2.2Z", fill: "currentColor" }))

/**
 * IconMultiSelectOutline16：分组标题行的「多选」入口。
 *
 * 路径直接取自官方渲染（hover 后用真实 MouseEvent 触发并抓 svg path），
 * 形状是「两条横线 + 两个圆环」，即官方的 list 选择样式。
 * 注意不能靠肉眼估——第一版按「三条线 + 圆点」自绘，与官方完全不同。
 */
const IconMultiSelectOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M14.2004 9.73944V11.0402H7.40356V9.73944H14.2004Z", fill: "currentColor" }),
  h("path", { d: "M14.2004 2.15491V3.45569H7.40356V2.15491H14.2004Z", fill: "currentColor" }),
  h("path", { d: "M4.31055 10.3903C4.31055 9.61068 3.71825 8.9692 2.95898 8.89221L2.80566 8.8844C1.9742 8.8844 1.2998 9.5588 1.2998 10.3903L1.30762 10.5436C1.37947 11.2522 1.94276 11.8153 2.65137 11.8873L2.80566 11.8951C3.58507 11.895 4.22575 11.3027 4.30273 10.5436L4.31055 10.3903ZM5.61035 10.3903C5.61016 11.9394 4.35481 13.1947 2.80566 13.1949C1.25635 13.1949 0.000196493 11.9395 0 10.3903C0 8.84083 1.25623 7.58459 2.80566 7.58459C4.35493 7.58479 5.61035 8.84095 5.61035 10.3903Z", fill: "currentColor" }),
  h("path", { d: "M4.31091 2.80566C4.31091 2.02619 3.7185 1.38466 2.95935 1.30762L2.80603 1.2998C1.97463 1.2998 1.30017 1.97426 1.30017 2.80566L1.30798 2.95898C1.37989 3.66756 1.94316 4.23082 2.65173 4.30273L2.80603 4.31055C3.58529 4.3103 4.22608 3.71798 4.3031 2.95898L4.31091 2.80566ZM5.61072 2.80566C5.61046 4.35465 4.35502 5.61009 2.80603 5.61035C1.25682 5.61035 0.000624607 4.35481 0.000366211 2.80566C0.000366211 1.25629 1.25666 0 2.80603 0C4.35518 0.000258397 5.61072 1.25645 5.61072 2.80566Z", fill: "currentColor" }))

/**
 * IconShareOutline16：会话菜单与消息操作行的「分享」。
 * 路径与官方消息操作栏的第 6 枚图标一致（斜向箭头 + 弧尾）。
 */
const IconShareOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M7.95889 1.52285C7.95888 0.826234 8.76055 0.467983 9.27669 0.875208L9.37524 0.967191L15.1317 7.18358C15.5582 7.64419 15.5582 8.35614 15.1317 8.81676L9.37524 15.0331C8.87034 15.578 7.95888 15.2205 7.95889 14.4775V10.8207C7.10614 10.8432 6.31361 10.9316 5.45468 11.2515C4.39484 11.6463 3.18248 12.413 1.64676 13.9425C1.4533 14.135 1.18329 14.1696 0.969086 14.0908C0.74748 14.0091 0.547307 13.7879 0.54859 13.4844L0.55516 13.1315C0.618924 11.3494 1.11153 9.29838 2.27656 7.63787C3.45289 5.96147 5.29554 4.71635 7.95889 4.54797V1.52285ZM9.20911 5.13366C9.20899 5.50567 8.9031 5.77687 8.56523 5.77755C5.99383 5.78282 4.33736 6.8762 3.29964 8.35496C2.54519 9.43014 2.10739 10.7283 1.9152 11.9939C3.04749 11.0323 4.0569 10.4385 5.01917 10.0801C6.29638 9.60449 7.4406 9.56343 8.56429 9.56295C8.9178 9.5628 9.20894 9.84909 9.20911 10.2068L9.20817 13.3737L14.1837 8.00017L9.20817 2.62571L9.20911 5.13366Z", fill: "currentColor" }))

/**
 * IconPinOutline16：多选操作条里的「置顶」。
 * 官方截图里是一枚斜置图钉轮廓；自绘对齐官方行内图标规格：
 * 填充路径、16×16 视框、约 1.4 线宽观感。
 */
const IconPinOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M9.6 1.1a1.6 1.6 0 0 1 2.3 0l3 3a1.6 1.6 0 0 1 0 2.3l-2.1 2.1a.9.9 0 0 1-.64.27h-1.9L7.6 11.5v2.6a.75.75 0 0 1-1.28.53L4 12.3l-2.77 2.03a.5.5 0 0 1-.63-.7L3.4 11 1.07 8.68A.75.75 0 0 1 1.6 7.4h2.6l2.73-2.66V2.84c0-.24.1-.47.27-.64L9.6 1.1Zm1.24 1.06-2.14 2.14a.9.9 0 0 0-.26.64v1.9c0 .24-.1.47-.27.64L5.1 9.55a.75.75 0 0 1-.52.21H3.16l7.4 7.4v-1.42a.75.75 0 0 1 .21-.52l2.07-2.07a.9.9 0 0 0 .27-.64v-1.9c0-.24.1-.47.27-.64l2.14-2.14-3.06-3.06a.1.1 0 0 0-.32 0Z", fill: "currentColor" }))

/*
 * 消息末尾操作行新增的两枚图标（喜欢 / 不喜欢）。
 *
 * 其余四枚（复制 / 重新生成 / 朗读）复用文件上方已有的 IconCopyOutline16、
 * IconRefreshOutline16、IconPlayMediaOutline16，它们的路径本来就是官方原版。
 * 16×16 视框、单色填充，d 属性抄自官方消息操作栏，不要手写近似图标替换。
 */
const IconLikeOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M8.27868 0.811572C8.81991 0.142194 9.79022 0.0421835 10.4538 0.557601L10.5823 0.669306L10.6066 0.693544L10.6097 0.695652L10.6392 0.725159C11.355 1.44679 11.6337 2.49468 11.3716 3.47669L11.3706 3.48091L11.3611 3.51674L11.3601 3.51885L10.889 5.22604C10.8796 5.25997 10.8707 5.29157 10.8627 5.32088C10.8934 5.32095 10.927 5.32194 10.9628 5.32194H11.9007C12.4264 5.32194 12.7831 5.319 13.0651 5.36725C14.8182 5.66719 15.9851 7.34568 15.6565 9.09357C15.6036 9.37487 15.477 9.7092 15.294 10.2022L14.3371 12.7798C14.1402 13.3104 13.9774 13.7518 13.8102 14.1024C13.6376 14.4645 13.4386 14.7793 13.1442 15.0424C12.9712 15.197 12.7802 15.3303 12.5751 15.4386C12.226 15.6231 11.8608 15.7 11.4612 15.7358C11.0743 15.7705 10.6035 15.7695 10.0375 15.7695H4.87377C4.08053 15.7695 3.42928 15.7702 2.90734 15.7137C2.37212 15.6557 1.88991 15.5311 1.46676 15.2237C1.22415 15.0474 1.01078 14.8339 0.834466 14.5914C0.527021 14.1682 0.401373 13.686 0.343384 13.1508C0.286822 12.6287 0.287531 11.9769 0.287531 11.1833V9.51405C0.287531 8.84778 0.281347 8.36714 0.399237 7.9565C0.671152 7.00935 1.41115 6.26832 2.35829 5.99638C2.76894 5.87849 3.24958 5.88573 3.91585 5.88573C4.11983 5.88573 4.14548 5.88319 4.16244 5.88046C4.23532 5.86863 4.30409 5.83663 4.35845 5.78667C4.3711 5.77504 4.38761 5.75604 4.51442 5.59488L8.25655 0.838972L8.2576 0.837918L8.27868 0.811572ZM1.69122 11.1833C1.69122 12.0082 1.69217 12.5711 1.73865 13.0001C1.78371 13.4157 1.86473 13.6221 1.96943 13.7662C2.0592 13.8898 2.16733 13.9989 2.29085 14.0887C2.43501 14.1934 2.64216 14.2744 3.05803 14.3195C3.45897 14.3629 3.97637 14.3656 4.7157 14.3659C4.30801 13.8053 4.06453 13.1171 4.06444 12.371V8.59406H5.46813V12.371C5.46838 13.4733 6.36166 14.3669 7.46407 14.3669H10.0375C10.6286 14.3669 11.0269 14.3663 11.3369 14.3385C11.6339 14.3118 11.7956 14.2638 11.9196 14.1983C12.0241 14.1431 12.1213 14.0747 12.2094 13.996C12.314 13.9025 12.4151 13.7678 12.5435 13.4986C12.6774 13.2176 12.8162 12.845 13.0219 12.2909L13.9788 9.71322C14.1848 9.15816 14.2531 8.96731 14.2781 8.83433C14.4618 7.85692 13.8093 6.91895 12.8291 6.75092C12.6957 6.7281 12.4928 6.72458 11.9007 6.72458H10.9628C10.7737 6.72458 10.5693 6.72657 10.4 6.70666C10.2211 6.68562 9.96702 6.63024 9.74771 6.43161C9.64454 6.33811 9.55957 6.2261 9.4969 6.10177C9.3639 5.83784 9.37799 5.57899 9.40521 5.40097C9.431 5.23261 9.48672 5.03616 9.53694 4.85404L10.008 3.14579L10.0175 3.11102C10.1488 2.61338 10.0078 2.08338 9.64654 1.71681L9.6086 1.67887L9.55064 1.64304C9.48795 1.62043 9.41425 1.63814 9.36938 1.69362L9.35779 1.70627L9.35884 1.70732L5.61672 6.46217C5.51822 6.58735 5.42237 6.7133 5.30689 6.81942C5.05075 7.05471 4.73126 7.20939 4.38796 7.26519C4.23315 7.29032 4.07513 7.28837 3.91585 7.28837C3.15356 7.28837 2.91916 7.2957 2.7461 7.34528C2.26364 7.48379 1.88564 7.86081 1.74708 8.34325C1.69738 8.51636 1.69122 8.7511 1.69122 9.51405V11.1833Z", fill: "currentColor" }))

const IconDislikeOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M7.72451 15.1086C7.18929 15.7705 6.22975 15.8694 5.57357 15.3597L5.44643 15.2492L5.42247 15.2253L5.41934 15.2232L5.39016 15.194C4.68239 14.4804 4.40679 13.4441 4.66589 12.473L4.66693 12.4689L4.67631 12.4334L4.67735 12.4314L5.14318 10.7431C5.15243 10.7096 5.1613 10.6783 5.16923 10.6493C5.13878 10.6493 5.10558 10.6483 5.07023 10.6483H4.14274C3.62288 10.6483 3.27015 10.6512 2.9912 10.6035C1.25757 10.3069 0.103662 8.64702 0.42863 6.91854C0.480965 6.64037 0.606164 6.30975 0.787119 5.82223L1.73336 3.27321C1.92812 2.74852 2.08912 2.31209 2.25442 1.96535C2.42515 1.60724 2.62191 1.29594 2.91304 1.03578C3.08408 0.882951 3.273 0.751121 3.47579 0.643944C3.82102 0.461504 4.18214 0.38551 4.57731 0.350066C4.95993 0.315784 5.42553 0.316718 5.98521 0.316718H11.0916C11.876 0.316718 12.52 0.31607 13.0362 0.37195C13.5655 0.429293 14.0423 0.552534 14.4608 0.856536C14.7007 1.03085 14.9117 1.24193 15.086 1.48181C15.3901 1.90027 15.5143 2.37709 15.5717 2.90638C15.6276 3.42269 15.6269 4.06721 15.6269 4.85202V6.50274C15.6269 7.1616 15.633 7.6369 15.5164 8.04299C15.2475 8.97962 14.5158 9.71242 13.5791 9.98133C13.173 10.0979 12.6977 10.0908 12.0389 10.0908C11.8372 10.0908 11.8118 10.0933 11.795 10.096C11.723 10.1077 11.6549 10.1393 11.6012 10.1887C11.5887 10.2002 11.5724 10.219 11.447 10.3784L7.74639 15.0815L7.74535 15.0825L7.72451 15.1086ZM14.2388 4.85202C14.2388 4.03628 14.2379 3.47965 14.1919 3.05541C14.1473 2.64443 14.0672 2.4403 13.9637 2.29779C13.8749 2.17562 13.768 2.06769 13.6458 1.9789C13.5033 1.87532 13.2984 1.79523 12.8872 1.75067C12.4907 1.70773 11.979 1.70511 11.2479 1.70482C11.6511 2.25917 11.8918 2.93968 11.8919 3.67755V7.41251H10.5038V3.67755C10.5036 2.58745 9.62023 1.70378 8.53007 1.70378H5.98521C5.40065 1.70378 5.00679 1.70442 4.70028 1.73192C4.40651 1.7583 4.24662 1.80571 4.12399 1.87052C4.02069 1.92511 3.92452 1.99276 3.8374 2.07061C3.73401 2.16306 3.634 2.2962 3.50705 2.56249C3.37462 2.84027 3.23734 3.20873 3.03393 3.75675L2.08768 6.30578C1.88395 6.85467 1.81646 7.0434 1.79172 7.1749C1.61005 8.14146 2.25533 9.06902 3.22464 9.23517C3.35654 9.25774 3.55717 9.26123 4.14274 9.26123H5.07023C5.25717 9.26123 5.4593 9.25926 5.62672 9.27894C5.80364 9.29975 6.05492 9.35452 6.27179 9.55094C6.37381 9.6434 6.45784 9.75417 6.51982 9.87712C6.65133 10.1381 6.6374 10.3941 6.61048 10.5701C6.58498 10.7366 6.52988 10.9309 6.48022 11.111L6.01439 12.8003L6.00501 12.8347C5.87513 13.3268 6.01464 13.8509 6.37184 14.2134L6.40935 14.2509L6.46667 14.2863C6.52866 14.3087 6.60155 14.2912 6.64591 14.2363L6.65738 14.2238L6.65633 14.2228L10.3569 9.52072C10.4543 9.39693 10.5491 9.27238 10.6633 9.16744C10.9166 8.93476 11.2325 8.7818 11.572 8.72662C11.7251 8.70177 11.8814 8.70369 12.0389 8.70369C12.7927 8.70369 13.0245 8.69645 13.1956 8.64742C13.6727 8.51045 14.0465 8.13761 14.1836 7.66053C14.2327 7.48935 14.2388 7.25721 14.2388 6.50274V4.85202Z", fill: "currentColor" }))

/** IconDocOutline16：设置里的「服务协议」分区图标 */
const IconDocOutline16 = () => h('svg', { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg" },
  h("path", { d: "M4.2 1.4h4.5l3.9 3.9v9.3H4.2V1.4Zm1.4 1.4v10.4h5.6V5.9H8.1V2.8H5.6Zm3.9.5v1.2h1.2l-1.2-1.2Z", fill: "currentColor" }),
  h("path", { d: "M5.9 7.6h4.2v1.3H5.9zM5.9 10h4.2v1.3H5.9z", fill: "currentColor" }))

/**
 * IconWhaleFill：DeepSeek 官方鲸鱼标记。
 *
 * 几何与 viewBox 取自宿主 primitives 包导出的 FISH_LOGO_PATH / FISH_LOGO_VIEWBOX
 * （viewBox 0 0 23.16 17.04），与官方 FishLogo 组件渲染方式一致：
 * 宽度由调用方给，高度按 viewBox 比例算，颜色走 currentColor。
 *
 * 这是品牌资源，不要改写路径——品牌行与会话区空态共用它，改动会同时影响两处。
 */
const IconWhaleFill = ({ size = 24, className }) => h('svg', {
  width: size,
  height: (size * 17.04) / 23.16,
  className,
  viewBox: '0 0 23.16 17.04',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
  'aria-hidden': true,
},
  h('path', { d: 'M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z', fill: 'currentColor' }))

/* ===== 60-sider.js ===== */
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

/* ===== 65-reply-area.js ===== */
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

/* ===== 70-messages.js ===== */
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

/* ===== 75-speech.js ===== */
/** 语音：录音转 WAV 交给 ASR，朗读用 TTS 返回的音频播放 */

let player = null
/** 朗读排队中的停止标志：置位后下一段不再请求 */
let stopped = false

/** 停止当前朗读并释放音频元素；同时让排队中的下一段放弃 */
function stopReadAloud() {
  stopped = true
  if (player === null) return
  player.pause()
  player.src = ''
  player = null
}

/**
 * 朗读一段文本。ASR/TTS 都走 Host 代理，音频以 blob 形式返回后直接播放。
 *
 * TTS 单次上限 10000 个计费字符（汉字算 2），超了服务端直接 400。
 * 长回答按段落切成若干段连续播放，任一段失败就整体停止并抛出。
 *
 * @returns 播放结束或被停止时 resolve
 */
async function speak(text) {
  stopReadAloud()
  stopped = false
  const chunks = splitForSpeech(text)
  for (const chunk of chunks) {
    // 用户中途点了停止：后面几段不再请求
    if (stopped) return
    await speakChunk(chunk)
  }
}

/** 单段上限留出余量：按「汉字 2 字符」估算，取 9000 计费字符 */
const SPEECH_BUDGET = 9000

/** 按段落切分，单段超预算时再按句子切，保证每段都在 TTS 限制内 */
function splitForSpeech(text) {
  const cost = (value) => Array.from(value).reduce((sum, char) => sum + (/[\u4e00-\u9fff]/.test(char) ? 2 : 1), 0)
  if (cost(text) <= SPEECH_BUDGET) return [text]

  const chunks = []
  let current = ''
  const push = () => {
    if (current.trim() !== '') chunks.push(current)
    current = ''
  }
  for (const paragraph of text.split(/\n{2,}/)) {
    if (cost(current) + cost(paragraph) <= SPEECH_BUDGET) {
      current += (current === '' ? '' : '\n\n') + paragraph
      continue
    }
    push()
    if (cost(paragraph) <= SPEECH_BUDGET) {
      current = paragraph
      continue
    }
    // 单段就超预算：按句号切
    for (const sentence of paragraph.split(/(?<=[。！？!?.])\s*/)) {
      if (cost(current) + cost(sentence) > SPEECH_BUDGET) push()
      current += sentence
    }
  }
  push()
  return chunks
}

/** 播放一段：请求 TTS 并等音频放完 */
async function speakChunk(text) {
  const blob = await synthesize(text)
  if (stopped) return
  const url = URL.createObjectURL(blob)
  const audio = new Audio(url)
  player = audio
  try {
    await audio.play()
    await new Promise((resolve, reject) => {
      audio.addEventListener('ended', resolve, { once: true })
      audio.addEventListener('error', () => reject(new Error('音频播放失败')), { once: true })
      audio.addEventListener('pause', resolve, { once: true })
    })
  } finally {
    if (player === audio) player = null
    URL.revokeObjectURL(url)
  }
}

/** ASR 单次上限 120 秒，留 2 秒余量给上传与解码 */
const RECORDING_LIMIT_MS = 118_000

/** 人声频段：按对数分布到各柱，与官方 chat-demo 一致 */
const SPECTRUM_LOW = 100
const SPECTRUM_HIGH = 4000
/** dB 映射区间：低于底噪不起跳，避免环境噪声让柱子常亮 */
const SPECTRUM_DB_FLOOR = -80
const SPECTRUM_DB_CEIL = -25
/** 人声高频能量自然衰减，按倍频程补偿，避免右侧常年贴底 */
const SPECTRUM_TILT_PER_OCTAVE = 4

/**
 * 录音中的实时频谱：从左到右低频到高频。
 * 每帧直接改 transform，不触发 React 渲染。
 */
function Spectrum({ getAnalyser }) {
  const rootRef = useRef(null)
  const [count, setCount] = useState(0)

  // 按容器宽度决定柱数：2px 柱 + 3px 间距
  useEffect(() => {
    const root = rootRef.current
    if (root === null) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const fit = Math.floor((entry.contentRect.width + 3) / (2 + 3))
      setCount(Math.max(0, Math.min(60, fit)))
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (root === null || count < 1) return undefined
    const bars = Array.from(root.children)
    const levels = new Float32Array(count)
    const targets = new Float32Array(count)
    const tilts = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      tilts[index] = SPECTRUM_TILT_PER_OCTAVE * Math.log2(SPECTRUM_HIGH / SPECTRUM_LOW) * (index / count)
    }
    let data = new Float32Array(0)
    let ranges = []
    let rangeKey = ''
    let frame = 0

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const analyser = getAnalyser()
      if (analyser !== null && analyser !== undefined) {
        if (data.length !== analyser.frequencyBinCount) data = new Float32Array(analyser.frequencyBinCount)
        const key = `${analyser.context.sampleRate}:${analyser.fftSize}`
        const binWidth = analyser.context.sampleRate / analyser.fftSize
        if (key !== rangeKey) {
          rangeKey = key
          ranges = countRanges(count, binWidth, data.length)
        }
        analyser.getFloatFrequencyData(data)
      }
      for (let index = 0; index < count; index += 1) {
        let target = 0
        if (analyser !== null && analyser !== undefined && ranges.length === count) {
          const { from, to, center } = ranges[index]
          let peak = -Infinity
          if (to - from <= 1) {
            const base = Math.min(data.length - 2, Math.floor(center))
            const weight = center - base
            peak = data[base] * (1 - weight) + data[base + 1] * weight
          } else {
            for (let bin = from; bin < to; bin += 1) peak = Math.max(peak, data[bin])
          }
          const db = peak + tilts[index]
          target = Math.min(1, Math.max(0, (db - SPECTRUM_DB_FLOOR) / (SPECTRUM_DB_CEIL - SPECTRUM_DB_FLOOR)))
        }
        targets[index] = target
      }
      for (let index = 0; index < count; index += 1) {
        // 与相邻频段加权平均，填平谐波之间的空隙
        const prev = targets[Math.max(0, index - 1)]
        const next = targets[Math.min(count - 1, index + 1)]
        const target = (prev + targets[index] * 2 + next) / 4
        // 起几乎即时、落稍缓：不闪烁也不拖尾
        levels[index] += (target - levels[index]) * (target > levels[index] ? 0.8 : 0.35)
        const height = 5 + 31 * levels[index]
        bars[index].style.transform = `scaleY(${height / 5})`
      }
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [count, getAnalyser])

  return h('div', { ref: rootRef, className: 'dsa-spectrum', 'aria-hidden': true },
    Array.from({ length: count }, (_, index) => h('span', { key: index, className: 'dsa-spectrum-bar' })),
  )
}

/** 把频段按对数切成 n 段，返回每段的 bin 区间与中心位置 */
function countRanges(n, binWidth, binCount) {
  const ranges = []
  const ratio = SPECTRUM_HIGH / SPECTRUM_LOW
  for (let index = 0; index < n; index += 1) {
    const low = SPECTRUM_LOW * ratio ** (index / n)
    const high = SPECTRUM_LOW * ratio ** ((index + 1) / n)
    const from = Math.min(binCount - 1, Math.floor(low / binWidth))
    const to = Math.min(binCount, Math.max(from + 1, Math.ceil(high / binWidth)))
    ranges.push({ from, to, center: Math.sqrt(low * high) / binWidth })
  }
  return ranges
}

/**
 * 把底层异常翻成一句用户能照做的提示。
 * 录音链路的失败点很多（没有设备、权限被拒、被其他程序占用、编码器不可用），
 * 原始 DOMException 的 message 对普通用户没有意义。
 */
function describeRecordingError(error) {
  const name = error?.name ?? ''
  if (name === 'NotAllowedError') return '需要麦克风权限：请在系统或浏览器设置里允许本应用使用麦克风'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '没有找到可用的麦克风设备'
  if (name === 'NotReadableError' || name === 'TrackStartError') return '麦克风被其他程序占用，请关闭占用它的应用后重试'
  if (name === 'SecurityError') return '当前页面不允许使用麦克风（安全策略限制）'
  if (name === 'AbortError') return '录音被中断'
  const message = error?.message ?? String(error)
  return message === '' ? '录音失败' : message
}

/** 该环境到底缺什么：先判断再动手，失败时能直接说清楚 */
function recordingSupport() {
  if (typeof navigator === 'undefined' || navigator.mediaDevices === undefined) {
    return '当前环境没有 mediaDevices（需要安全上下文或桌面端）'
  }
  if (typeof navigator.mediaDevices.getUserMedia !== 'function') return '当前环境不支持 getUserMedia'
  if (typeof window.MediaRecorder !== 'function') return '当前环境不支持 MediaRecorder，无法录音'
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  if (typeof AudioContextClass !== 'function') return '当前环境不支持 Web Audio'
  return null
}

/**
 * 录音器：用 MediaRecorder 采集，结束后解成 16 位单声道 WAV。
 * ASR 只接受 16 位 PCM WAV 与 Ogg Opus，浏览器录出来通常是 webm/opus，
 * 所以在本地解码后重采样成 WAV，避免服务端直接拒绝。
 *
 * ASR 单次上限 120 秒、8 MiB，因此录到上限会自动停止并回调 onLimit。
 */
class Recorder {
  #stream = null
  #recorder = null
  #chunks = []
  #analyser = null
  #audioContext = null
  #limitTimer = null
  #deviceLabel = ''

  /** 请求麦克风并开始录音；到 120 秒自动停止并触发 onLimit */
  async start({ onLimit, deviceId } = {}) {
    const missing = recordingSupport()
    if (missing !== null) throw new Error(missing)

    // 优先用用户选定的设备；没选就用系统默认。
    // 系统默认可能是一个虚拟声卡（例如 Steam Streaming Speakers），
    // 那种设备会「成功」返回一条静音轨道，录出来什么都没有，所以下面还要做静音检测。
    const constraints = {
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        ...(deviceId === undefined || deviceId === '' ? {} : { deviceId: { exact: deviceId } }),
      },
    }
    try {
      this.#stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      throw new Error(describeRecordingError(error))
    }

    this.#deviceLabel = this.#stream.getAudioTracks()[0]?.label ?? ''
    this.#chunks = []
    try {
      this.#recorder = new MediaRecorder(this.#stream)
    } catch (error) {
      this.#release()
      throw new Error(`无法创建录音器：${describeRecordingError(error)}`)
    }
    this.#recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) this.#chunks.push(event.data)
    })
    this.#recorder.start()

    // 频谱只是装饰：AudioContext 建不起来时不该让录音整体失败
    try {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
      this.#audioContext = new AudioContextClass()
      const source = this.#audioContext.createMediaStreamSource(this.#stream)
      this.#analyser = this.#audioContext.createAnalyser()
      this.#analyser.fftSize = 64
      source.connect(this.#analyser)
    } catch {
      this.#analyser = null
    }

    if (typeof onLimit === 'function') {
      this.#limitTimer = setTimeout(() => {
        this.#limitTimer = null
        onLimit()
      }, RECORDING_LIMIT_MS)
    }
    return this
  }

  /**
   * 把 [100, 4000] Hz 的人声频段按对数切成 count 段，返回每段的 bin 区间。
   * 低频段窄于一个 bin 时用中心位置插值，否则相邻几根柱子会完全同步。
   */
  ranges(count) {
    if (this.#analyser === null) return []
    const binWidth = this.#analyser.context.sampleRate / this.#analyser.fftSize
    const binCount = this.#analyser.frequencyBinCount
    const ratio = SPECTRUM_HIGH / SPECTRUM_LOW
    const ranges = []
    for (let index = 0; index < count; index += 1) {
      const low = SPECTRUM_LOW * ratio ** (index / count)
      const high = SPECTRUM_LOW * ratio ** ((index + 1) / count)
      const from = Math.min(binCount - 1, Math.floor(low / binWidth))
      const to = Math.min(binCount, Math.max(from + 1, Math.ceil(high / binWidth)))
      ranges.push({ from, to, center: Math.sqrt(low * high) / binWidth })
    }
    return ranges
  }

  /** 频谱分析节点；没有就返回 null，界面退化成静态 */
  analyser() {
    return this.#analyser
  }

  /** 停止并返回 WAV blob */
  async stop() {
    const recorder = this.#recorder
    if (recorder === null) return null
    const stopped = new Promise((resolve) => {
      recorder.addEventListener('stop', resolve, { once: true })
    })
    recorder.stop()
    await stopped
    const type = recorder.mimeType || 'audio/webm'
    const blob = new Blob(this.#chunks, { type })
    const deviceLabel = this.#deviceLabel
    this.#release()
    if (blob.size === 0) throw new Error('没有录到声音，请检查麦克风后重试')
    let wav
    try {
      wav = await toWav(blob)
    } catch (error) {
      // 解码失败最常见的原因是编码不被支持（例如容器里没有 opus 解码器）
      throw new Error(`录音格式无法处理（${type}）：${describeRecordingError(error)}`)
    }
    // 全静音说明音频这条路是通的但没采到声音，几乎都是设备选错了
    // （系统默认可能是虚拟声卡，比如 Steam Streaming Speakers）。
    if (await isSilentWav(wav)) {
      throw new Error(
        `录到的是一条静音轨道（设备：${deviceLabel || '默认设备'}）。` +
          '请在设置里换一个麦克风，或检查系统默认录音设备。',
      )
    }
    return wav
  }

  /** 取消录音，不产出任何数据 */
  cancel() {
    try {
      this.#recorder?.stop()
    } catch {
      // 已经停止时忽略
    }
    this.#release()
  }

  #release() {
    if (this.#limitTimer !== null) {
      clearTimeout(this.#limitTimer)
      this.#limitTimer = null
    }
    this.#stream?.getTracks().forEach((track) => track.stop())
    this.#stream = null
    this.#recorder = null
    this.#analyser = null
    this.#audioContext?.close().catch(() => {})
    this.#audioContext = null
  }
}

/**
 * 异步判定 WAV 是否全静音。
 * 阈值取 0.004（约 -48 dBFS）：正常说话远高于它，而虚拟声卡的静音是精确的 0。
 */
async function isSilentWav(wavBlob) {
  try {
    const buffer = await wavBlob.arrayBuffer()
    const view = new DataView(buffer)
    if (buffer.byteLength <= 44) return true
    // 找 data 段起点：标准 44 字节头之后即采样数据
    let peak = 0
    for (let offset = 44; offset + 1 < buffer.byteLength; offset += 2) {
      const sample = Math.abs(view.getInt16(offset, true))
      if (sample > peak) {
        peak = sample
        if (peak > SILENCE_THRESHOLD) return false
      }
    }
    return peak <= SILENCE_THRESHOLD
  } catch {
    return false
  }
}

/** 约 -48 dBFS */
const SILENCE_THRESHOLD = 12

/** 解码任意浏览器可解的音频，重采样为 16 kHz 16 位单声道 WAV */
async function toWav(blob) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
  if (typeof AudioContextClass !== 'function') {
    throw new Error('当前环境不支持 Web Audio，无法处理录音')
  }
  const context = new AudioContextClass()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    // 用 OfflineAudioContext 做重采样：它按规范做带限插值，
    // 比手写的线性插值更不容易在降采样时产生混叠，也更贴近官方插件的做法。
    const frames = Math.max(1, Math.floor(decoded.duration * 16000))
    const OfflineClass = window.OfflineAudioContext ?? window.webkitOfflineAudioContext
    if (typeof OfflineClass !== 'function') {
      // 极老环境退回本地插值
      return encodeWav(downmix(decoded), decoded.sampleRate)
    }
    const offline = new OfflineClass(1, frames, 16000)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const rendered = await offline.startRendering()
    return encodeWav(rendered.getChannelData(0), 16000)
  } finally {
    context.close().catch(() => {})
  }
}

/** 多声道合并成单声道 */
function downmix(buffer) {
  const channels = buffer.numberOfChannels
  if (channels === 1) return buffer.getChannelData(0)
  const length = buffer.length
  const output = new Float32Array(length)
  for (let channel = 0; channel < channels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) output[index] += data[index] / channels
  }
  return output
}

/** 写一个 44 字节头的 WAV；ASR 支持 8000/16000/22050/24000/32000/44100/48000 */
function encodeWav(samples, sourceRate) {
  const targetRate = pickRate(sourceRate)
  const resampled = targetRate === sourceRate ? samples : resample(samples, sourceRate, targetRate)
  const bytes = new ArrayBuffer(44 + resampled.length * 2)
  const view = new DataView(bytes)
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index))
  }
  writeText(0, 'RIFF')
  view.setUint32(4, 36 + resampled.length * 2, true)
  writeText(8, 'WAVE')
  writeText(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, targetRate, true)
  view.setUint32(28, targetRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeText(36, 'data')
  view.setUint32(40, resampled.length * 2, true)
  let offset = 44
  for (const sample of resampled) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return new Blob([bytes], { type: 'audio/wav' })
}

const SUPPORTED_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 8000]

/** 选一个受支持的采样率：取不超过源采样率的最近一档 */
const pickRate = (rate) => SUPPORTED_RATES.find((candidate) => candidate <= rate) ?? 16000

/** 线性插值重采样，语音识别够用 */
function resample(samples, from, to) {
  const ratio = from / to
  const length = Math.floor(samples.length / ratio)
  const output = new Float32Array(length)
  for (let index = 0; index < length; index += 1) {
    const position = index * ratio
    const left = Math.floor(position)
    const right = Math.min(samples.length - 1, left + 1)
    const weight = position - left
    output[index] = samples[left] * (1 - weight) + samples[right] * weight
  }
  return output
}

/** 麦克风不可用时的统一提示 */
const micUnavailable = () => {
  throw new Error('浏览器没有麦克风权限，或当前环境不支持录音')
}

/* ===== 80-composer.js ===== */
/** 输入框：自增高文本域、深度思考 / 智能搜索开关、附件、录音、发送与停止 */
function Composer({ session, onOpenSettings }) {
  useLocaleRevision()
  const streaming = useStore(active, (state) => state.streaming)
  const prefs = useStore(settings, (state) => state)
  const [text, setText] = useState('')
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(0)
  const [recording, setRecording] = useState(null)
  const [transcribing, setTranscribing] = useState(false)
  const [level, setLevel] = useState(0)
  const textareaRef = useRef(null)
  const mirrorRef = useRef(null)
  const fileRef = useRef(null)
  const recorderRef = useRef(null)
  const levelTimer = useRef(null)

  const home = session.messages.length === 0
  const canSend = (text.trim() !== '' || files.length > 0) && !streaming && uploading === 0

  // 自增高：镜像元素决定高度，文本域跟随
  useEffect(() => {
    const mirror = mirrorRef.current
    const textarea = textareaRef.current
    if (mirror === null || textarea === null) return
    textarea.style.height = `${mirror.scrollHeight}px`
  }, [text])

  useEffect(
    () => () => {
      if (levelTimer.current !== null) clearInterval(levelTimer.current)
      recorderRef.current?.cancel()
      stopReadAloud()
    },
    [],
  )

  const submit = async () => {
    if (!canSend) return
    const content = text.trim()
    setText('')
    const ready = files
    setFiles([])
    await sendMessage(session, content, ready)
  }

  const onKeyDown = (event) => {
    // 与官方一致：Enter 发送，Shift+Enter 换行；输入法组合中不拦
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  const pickFiles = async (event) => {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    await uploadFiles(picked)
  }

  const uploadFiles = async (picked) => {
    if (picked.length === 0) return
    setUploading((count) => count + picked.length)
    for (const file of picked) {
      const placeholderId = newId()
      const image = isImageFile(file)
      // 预览地址只留在内存里，不进会话文件
      if (image) rememberPreview(placeholderId, URL.createObjectURL(file))
      const placeholder = {
        id: placeholderId,
        serverId: null,
        name: file.name,
        size: file.size,
        isImage: image,
        mimeType: file.type,
        busy: true,
      }
      setFiles((list) => [...list, placeholder])
      try {
        const uploaded = await attachFile(file)
        // 服务端返回的附件 id 与占位 id 不同，把预览一并转过去
        rememberPreview(uploaded.id, previewOf(placeholderId))
        setFiles((list) => list.map((item) => (item.id === placeholderId ? uploaded : item)))
      } catch (error) {
        showToast(`${file.name}: ${error.message}`)
        setFiles((list) => list.filter((item) => item.id !== placeholderId))
      } finally {
        setUploading((count) => Math.max(0, count - 1))
      }
    }
  }

  const removeFile = (id) => {
    setFiles((list) => list.filter((item) => item.id !== id))
  }

  /** 结束录音并转写；按钮与到时自动收尾共用这一条路径 */
  const finishRecording = async () => {
    const recorder = recorderRef.current
    if (recorder === null) return
    recorderRef.current = null
    if (levelTimer.current !== null) {
      clearInterval(levelTimer.current)
      levelTimer.current = null
    }
    setRecording(null)
    setLevel(0)
    setTranscribing(true)
    try {
      const wav = await recorder.stop()
      if (wav !== null) {
        const text = await transcribe(wav)
        if (text.trim() !== '') setText((current) => (current === '' ? text : `${current} ${text}`))
      }
    } catch (error) {
      showToast(error.message)
    } finally {
      setTranscribing(false)
      textareaRef.current?.focus()
    }
  }

  const toggleRecording = async () => {
    if (recording !== null) {
      await finishRecording()
      return
    }
    try {
      const recorder = await new Recorder().start({
        // 用户可能在设置里指定了真实麦克风，避免录到系统默认的虚拟声卡
        deviceId: readPreferredMic(),
        // 到 ASR 的 120 秒上限时自动收尾并转写，而不是让请求注定被拒
        onLimit: () => {
          showToast(T('recordingLimit'))
          void finishRecording()
        },
      })
      recorderRef.current = recorder
      setRecording({ startedAt: Date.now() })
      levelTimer.current = setInterval(() => setLevel(recorder.level()), 100)
    } catch (error) {
      showToast(error?.name === 'NotAllowedError' ? '需要麦克风权限才能语音输入' : error.message)
    }
  }

  const onDrop = async (event) => {
    event.preventDefault()
    const dropped = Array.from(event.dataTransfer?.files ?? [])
    await uploadFiles(dropped)
  }

  return h('div', { className: 'dsa-composer-wrap', 'data-home': home ? 'true' : 'false' },
    h('div', { className: 'dsa-composer-inner' },
    h('div', {
      className: 'dsa-composer',
      'data-home': home ? 'true' : 'false',
      onClick: (event) => {
        if (event.target === event.currentTarget) textareaRef.current?.focus()
      },
      onDragOver: (event) => event.preventDefault(),
      onDrop,
    },
      files.length > 0 &&
        h('div', { className: 'dsa-attachments' },
          files.map((file) => {
            const url = previewOf(file.id)
            return h('div', { key: file.id, className: 'dsa-attachment', title: file.name },
              file.isImage && url !== undefined
                ? h('img', { src: url, alt: file.name })
                : h('div', { className: 'dsa-attachment-name' }, file.name),
              file.busy === true && h('div', { className: 'dsa-attachment-busy' }),
              h('button', {
                type: 'button',
                className: 'dsa-attachment-remove',
                'aria-label': T('close'),
                onClick: (event) => {
                  event.stopPropagation()
                  removeFile(file.id)
                },
              }, h(IconCloseFill14)),
            )
          }),
        ),

      h('div', { className: 'dsa-textarea-wrap' },
        recording !== null
          ? h(React.Fragment, null,
              h(Spectrum, { getAnalyser: () => recorderRef.current?.analyser() ?? null }),
              h('span', { className: 'dsa-recording-tip' }, T('recording')),
            )
          : null,
        h('textarea', {
          ref: textareaRef,
          className: 'dsa-textarea',
          style: recording !== null ? { visibility: 'hidden' } : undefined,
          value: text,
          placeholder: T('placeholder'),
          rows: 1,
          onChange: (event) => setText(event.target.value),
          onKeyDown,
          onPaste: async (event) => {
            const pasted = Array.from(event.clipboardData?.files ?? [])
            if (pasted.length > 0) await uploadFiles(pasted)
          },
        }),
        h('textarea', {
          ref: mirrorRef,
          className: 'dsa-textarea-mirror',
          value: text === '' ? T('placeholder') : text,
          readOnly: true,
          tabIndex: -1,
          rows: 1,
        }),
      ),

      h('div', { className: 'dsa-function-row' },
        h('div', { className: 'dsa-toggles' },
          h('button', {
            type: 'button',
            className: 'dsa-toggle',
            'data-selected': prefs.thinking ? 'true' : 'false',
            'aria-pressed': prefs.thinking ? 'true' : 'false',
            onClick: () => settings.set((state) => ({ ...state, thinking: !state.thinking })),
            title: T('thinking'),
          }, h(IconThinkOutline16), T('thinking')),
          h('button', {
            type: 'button',
            className: 'dsa-toggle',
            'data-selected': prefs.search ? 'true' : 'false',
            'aria-pressed': prefs.search ? 'true' : 'false',
            onClick: () => settings.set((state) => ({ ...state, search: !state.search })),
            title: T('search'),
          }, h(IconSearchOutline16), T('search')),
        ),

        h('div', { className: 'dsa-composer-right' },
          h('input', {
            ref: fileRef,
            type: 'file',
            multiple: true,
            style: { display: 'none' },
            onChange: pickFiles,
          }),
          h('button', {
            type: 'button',
            className: 'dsa-icon-button',
            title: T('attach'),
            'aria-label': T('attach'),
            onClick: () => fileRef.current?.click(),
          }, h(IconPaperclipOutline16)),
          h('button', {
            type: 'button',
            className: recording !== null ? 'dsa-mic-active' : 'dsa-icon-button',
            title: T('voiceInput'),
            'aria-label': T('voiceInput'),
            'aria-pressed': recording !== null ? 'true' : 'false',
            disabled: transcribing || streaming,
            onClick: toggleRecording,
          },
            transcribing
              ? h('span', { className: 'dsa-transcribing' })
              : recording !== null
                ? h(React.Fragment, null,
                    h('span', { className: 'dsa-mic-halo' }),
                    h('span', { className: 'dsa-mic-core' }),
                    h('span', { className: 'dsa-mic-glyph' }, h(IconMicFill16)),
                  )
                : h(IconMicOutline16),
          ),
          h('button', {
            type: 'button',
            className: 'dsa-send',
            'data-mode': streaming ? 'stop' : 'send',
            disabled: !streaming && !canSend,
            title: streaming ? T('stop') : T('send'),
            'aria-label': streaming ? T('stop') : T('send'),
            onClick: () => {
              if (streaming) stopStreaming()
              else void submit()
            },
          }, streaming ? h(IconStopFill16) : h(IconSendOutline16)),
        ),
      ),
    ),
    h('div', { className: 'dsa-caveat' }, T('welcomeTip')),
    ),
  )
}

/* ===== 85-settings.js ===== */
/**
 * 设置弹窗：对齐官方网页端的「系统设置」——左侧分区导航，右侧内容。
 *
 * 分区划分按官方：通用设置 / 账号管理 / 数据管理 / 服务协议。
 * 本插件没有账号与协议体系，对应分区放真实可做的事：
 *   通用设置 = 模型来源 + 搜索渠道 + 麦克风
 *   账号管理 = DeepSeek 凭据（对应官方「账号」）
 *   数据管理 = 会话存储位置与清空
 *   服务协议 = 说明这份实现的边界
 */
function SettingsDialog({ onClose }) {
  useLocaleRevision()
  const [tab, setTab] = useState('general')
  const info = useStore(credential, (state) => state)
  const ref = useRef(null)

  useOutsideClick(ref, true, onClose)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs = [
    { id: 'general', label: T('settingsGeneral'), icon: IconSettingsOutline16 },
    { id: 'account', label: T('settingsAccount'), icon: IconUserOutline16 },
    { id: 'data', label: T('settingsData'), icon: IconDataOutline16 },
    { id: 'about', label: T('settingsAbout'), icon: IconDocOutline16 },
  ]

  return h('div', {
    className: 'dsa-overlay',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) onClose()
    },
  },
    h('section', {
      ref,
      className: 'dsa-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': T('settings'),
    },
      h('header', { className: 'dsa-dialog-header' },
        h('h2', { className: 'dsa-dialog-title' }, T('settings')),
        h('button', { type: 'button', className: 'dsa-icon-button', onClick: onClose, 'aria-label': T('close') },
          h(IconCloseOutline16),
        ),
      ),
      h('div', { className: 'dsa-dialog-layout' },
        h('nav', { className: 'dsa-dialog-nav' },
          tabs.map((item) =>
            h('button', {
              key: item.id,
              type: 'button',
              className: 'dsa-dialog-nav-item',
              'data-active': tab === item.id ? 'true' : 'false',
              onClick: () => setTab(item.id),
            },
              h('span', { className: 'dsa-dialog-nav-icon' }, h(item.icon)),
              item.label,
            ),
          ),
        ),
        h('div', { className: 'dsa-dialog-body' },
          tab === 'general' && h(GeneralSection, { poolHint: null }),
          tab === 'account' && h(AccountSection, { info }),
          tab === 'data' && h(DataSection),
          tab === 'about' && h(AboutSection),
        ),
      ),
    ),
  )
}

/** 通用设置：模型来源、模型池选择、搜索渠道、麦克风 */
function GeneralSection() {
  useLocaleRevision()
  const source = useStore(settings, (state) => state.source)
  const poolProvider = useStore(settings, (state) => state.poolProvider)
  const poolModel = useStore(settings, (state) => state.poolModel)
  const [pool, setPool] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(() => readPreferredMic())

  // 拉一次模型池清单：provider 与各自模型由 Host 现查，缓存到本次弹窗
  useEffect(() => {
    let cancelled = false
    readPoolProviders()
      .then((value) => {
        if (!cancelled) setPool(value)
      })
      .catch(() => {
        if (!cancelled) setPool({ available: false, providers: [], search: { configured: false, proxy: false } })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 列出录音设备。label 只有在已授权后才有值，所以先请求一次权限再枚举，
  // 否则用户看到的全是空名字，没法判断该选哪个。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        await navigator.mediaDevices?.getUserMedia({ audio: true })
      } catch {
        // 被拒绝也继续，至少能列出 deviceId
      }
      try {
        const list = (await navigator.mediaDevices?.enumerateDevices?.()) ?? []
        if (cancelled) return
        setDevices(list.filter((item) => item.kind === 'audioinput'))
      } catch {
        if (!cancelled) setDevices([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return h(React.Fragment, null,
    h('div', { className: 'dsa-field' },
      h('label', { className: 'dsa-field-label', htmlFor: 'dsa-source' }, T('modelSource')),
      h('select', {
        id: 'dsa-source',
        className: 'dsa-input',
        value: source,
        onChange: (event) => {
          const next = event.target.value
          settings.set((state) => ({ ...state, source: next }))
          // 首次切到模型池时自动挑一个可用的 provider/模型，避免空选择
          if (next === 'pool' && poolProvider === '' && pool !== null) {
            const first = pool.providers.find((p) => p.models.length > 0)
            if (first !== undefined) {
              settings.set((state) => ({
                ...state,
                poolProvider: first.id,
                poolModel: first.models[0].id,
              }))
            }
          }
        },
      },
        h('option', { value: 'direct' }, T('sourceDirect')),
        h('option', { value: 'pool', disabled: pool !== null && !pool.available }, T('sourcePool')),
      ),
      h('div', { className: 'dsa-hint' },
        source === 'pool' ? T('sourcePoolHint') : T('sourceDirectHint')),
    ),

    // 模型池模式下才出现的 provider / 模型选择
    source === 'pool' &&
      h('div', { className: 'dsa-field' },
        h('label', { className: 'dsa-field-label', htmlFor: 'dsa-pool-provider' }, T('poolProvider')),
        pool === null
          ? h('div', { className: 'dsa-hint' }, '…')
          : h('select', {
              id: 'dsa-pool-provider',
              className: 'dsa-input',
              value: poolProvider,
              onChange: (event) => {
                const id = event.target.value
                const entry = pool.providers.find((p) => p.id === id)
                settings.set((state) => ({
                  ...state,
                  poolProvider: id,
                  poolModel: entry?.models[0]?.id ?? '',
                }))
              },
            },
              pool.providers.filter((p) => p.models.length > 0).map((p) =>
                h('option', { key: p.id, value: p.id }, `${p.name}（${p.models.length}）`),
              ),
            ),
        h('label', { className: 'dsa-field-label', htmlFor: 'dsa-pool-model' }, T('poolModel')),
        pool === null
          ? h('div', { className: 'dsa-hint' }, '…')
          : h('select', {
              id: 'dsa-pool-model',
              className: 'dsa-input',
              value: poolModel,
              onChange: (event) => {
                const id = event.target.value
                settings.set((state) => ({ ...state, poolModel: id }))
              },
            },
              (pool.providers.find((p) => p.id === poolProvider)?.models ?? []).map((m) =>
                h('option', { key: m.id, value: m.id }, m.name ?? m.id),
              ),
            ),
      ),

    // 搜索渠道：模型池模式的联网搜索由它提供
    h(SearchSection),

    // 麦克风选择：系统默认可能是虚拟声卡，录出来全静音，必须能手动换
    h('div', { className: 'dsa-field' },
      h('label', { className: 'dsa-field-label', htmlFor: 'dsa-mic' }, T('microphone')),
      h('select', {
        id: 'dsa-mic',
        className: 'dsa-input',
        value: deviceId,
        onChange: (event) => {
          setDeviceId(event.target.value)
          writePreferredMic(event.target.value)
        },
      },
        h('option', { value: '' }, T('microphoneDefault')),
        devices.map((device, index) =>
          h('option', { key: device.deviceId || index, value: device.deviceId },
            device.label || `${T('microphoneDevice')} ${index + 1}`,
          ),
        ),
      ),
      h('div', { className: 'dsa-hint' }, T('microphoneHint')),
    ),
  )
}

/**
 * 搜索渠道：三选一 + 代理地址。
 *
 * 三个渠道的差别对用户是实质性的（要不要额外 Key、要不要代理），
 * 所以每一项都带状态标记，选之前就能看出哪个能用。
 */
function SearchSection() {
  useLocaleRevision()
  const [state, setState] = useState(null)
  const [proxyDraft, setProxyDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    readSearchSettings()
      .then((value) => {
        if (cancelled) return
        setState(value)
        setProxyDraft(value.proxy ?? '')
      })
      .catch(() => {
        if (!cancelled) setState({ provider: 'deepseek', proxy: '', providers: [], proxyConfigured: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = async (patch) => {
    setBusy(true)
    try {
      await saveSearchSettings(patch)
      const next = await readSearchSettings()
      setState(next)
      setProxyDraft(next.proxy ?? '')
    } catch (error) {
      showToast(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return h('div', { className: 'dsa-field' }, h('div', { className: 'dsa-hint' }, '…'))

  const active = state.providers.find((item) => item.id === state.provider)

  return h('div', { className: 'dsa-field' },
    h('label', { className: 'dsa-field-label', htmlFor: 'dsa-search-channel' }, T('searchChannel')),
    h('select', {
      id: 'dsa-search-channel',
      className: 'dsa-input',
      value: state.provider,
      disabled: busy,
      onChange: (event) => void persist({ provider: event.target.value }),
    },
      state.providers.map((item) =>
        h('option', { key: item.id, value: item.id },
          `${item.label} · ${item.configured ? T('searchKeyReady') : T('searchKeyMissing')}`,
        ),
      ),
    ),
    h('div', { className: 'dsa-hint' }, T('searchChannelHint')),

    // 代理只对需要的渠道显示，避免给不需要的渠道制造「必须填」的错觉
    active?.needsProxy === true &&
      h('div', { className: 'dsa-field' },
        h('label', { className: 'dsa-field-label', htmlFor: 'dsa-search-proxy' }, T('searchProxy')),
        h('input', {
          id: 'dsa-search-proxy',
          className: 'dsa-input',
          type: 'text',
          placeholder: T('searchProxyPlaceholder'),
          value: proxyDraft,
          disabled: busy,
          onChange: (event) => setProxyDraft(event.target.value),
          onBlur: () => {
            if (proxyDraft.trim() !== (state.proxy ?? '')) void persist({ proxy: proxyDraft.trim() })
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          },
        }),
        h('div', { className: 'dsa-hint' }, T('searchProxyHint')),
      ),

    active?.configured === false &&
      h('div', { className: 'dsa-status', 'data-tone': 'error' }, T('poolNoSearchKey')),
  )
}

/** 账号管理：DeepSeek 凭据 */
function AccountSection({ info }) {
  useLocaleRevision()
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const activeLabel =
    info.active === 'plugin-key'
      ? T('credentialActivePlugin')
      : info.active === 'account'
        ? T('credentialActiveAccount')
        : info.active === 'env-key'
          ? T('credentialActiveEnv')
          : T('credentialMissing')

  const save = async () => {
    // 空输入不保存：「保存」按钮不该删除已有 Key，那是「清除」的职责。
    // 早先这里直接把空串传给 Host，等于 unset——用户点一下保存就把 Key 清掉了。
    const next = draft.trim()
    if (next === '') {
      setStatus({ tone: 'error', message: T('apiKeyEmpty') })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const info2 = await saveCredential(next)
      credential.set(info2)
      setDraft('')
      setStatus({ tone: 'ok', message: T('save2') })
    } catch (error) {
      // 保存失败时把 Host 侧的真实状态一并取出，用户看到的就是原因而不是「失败」
      let detail = ''
      try {
        const info3 = await diagnoseHost()
        if (!info3.credentialsService) detail = ' · Host 没有凭据服务'
      } catch {
        detail = ' · 连不上 Host'
      }
      setStatus({ tone: 'error', message: `${error.message}${detail}` })
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const result = await verifyCredential(draft.trim() || undefined)
      if (result.ok) {
        setStatus({
          tone: 'ok',
          message: `${T('verified')}${result.models.length > 0 ? ` · ${result.models.map((item) => item.id).join(', ')}` : ''}`,
        })
      }
    } catch (error) {
      setStatus({ tone: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  return h(React.Fragment, null,
    h('div', { className: 'dsa-field' },
      h('div', { className: 'dsa-status', 'data-tone': info.active === null ? 'error' : 'ok' }, activeLabel),
    ),
    h('div', { className: 'dsa-field' },
      h('label', { className: 'dsa-field-label', htmlFor: 'dsa-api-key' }, T('apiKey')),
      h('input', {
        id: 'dsa-api-key',
        className: 'dsa-input',
        type: 'password',
        autoComplete: 'off',
        placeholder: info.pluginKey.masked ?? T('apiKeyPlaceholder'),
        value: draft,
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') void save()
        },
      }),
      h('div', { className: 'dsa-hint' }, T('apiKeyHint')),
    ),
    status !== null &&
      h('div', { className: 'dsa-field' },
        h('div', { className: 'dsa-status', 'data-tone': status.tone }, status.message),
      ),
    h('div', { className: 'dsa-dialog-actions' },
      h('button', {
        type: 'button',
        className: 'dsa-button',
        'data-variant': 'primary',
        disabled: busy,
        onClick: save,
      }, busy ? '…' : T('save2')),
      h('button', {
        type: 'button',
        className: 'dsa-button',
        disabled: busy,
        onClick: verify,
      }, busy ? T('verifying') : T('verify')),
      h('span', { style: { flex: 1 } }),
      h('button', {
        type: 'button',
        className: 'dsa-button',
        disabled: busy || !info.pluginKey.configured,
        onClick: async () => {
          setBusy(true)
          try {
            const next = await saveCredential('')
            credential.set(next)
            setStatus({ tone: 'ok', message: T('clear') })
          } catch (error) {
            setStatus({ tone: 'error', message: error.message })
          } finally {
            setBusy(false)
          }
        },
      }, T('clear')),
    ),
  )
}

/** 数据管理：会话存放位置与清空入口 */
function DataSection() {
  useLocaleRevision()
  const items = useStore(sessions, (state) => state.items)
  const [busy, setBusy] = useState(false)

  return h(React.Fragment, null,
    h('div', { className: 'dsa-row' },
      h('div', { className: 'dsa-row-main' },
        h('div', { className: 'dsa-row-title' }, T('dataSessions')),
        h('div', { className: 'dsa-row-desc' }, T('dataSessionsDesc')),
      ),
      h('div', { className: 'dsa-row-value' }, String(items.length)),
    ),
    h('div', { className: 'dsa-row' },
      h('div', { className: 'dsa-row-main' },
        h('div', { className: 'dsa-row-title' }, T('dataClearAll')),
        h('div', { className: 'dsa-row-desc' }, T('dataClearAllDesc')),
      ),
      h('button', {
        type: 'button',
        className: 'dsa-button',
        'data-variant': 'danger',
        disabled: busy || items.length === 0,
        onClick: async () => {
          const ok = await openConfirm({
            title: T('dataClearConfirm'),
            body: T('deleteIrreversible'),
            confirmLabel: T('dataClearAllAction'),
            danger: true,
          })
          if (!ok) return
          setBusy(true)
          try {
            for (const item of items) await removeSession(item.id)
            createSession()
          } catch (error) {
            showToast(error.message)
          } finally {
            setBusy(false)
          }
        },
      }, busy ? '…' : T('dataClearAllAction')),
    ),
  )
}

/** 服务协议：说明这份实现与官方的关系，避免误解 */
function AboutSection() {
  useLocaleRevision()
  return h('div', { className: 'dsa-about' },
    h('p', null, T('aboutBody1')),
    h('p', null, T('aboutBody2')),
  )
}

/** 顶部提示条 */
function Toast() {
  const state = useStore(toast, (value) => value)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (state.message === null) return undefined
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(timer)
  }, [state.seq, state.message])

  if (!visible || state.message === null) return null
  return h('div', { className: 'dsa-toast', role: 'status' }, state.message)
}

/* ===== 90-panel.js ===== */
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

/* ===== 92-scroll-nav.js ===== */
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

/* ===== 95-apply.js ===== */
/** 插件入口：注册侧栏图标、中央面板、样式与语言 */
function apply(ctx) {
  // 语言跟随宿主：LocaleSnapshot 的字段是 active（不是 id），拿不到时退回浏览器语言
  const syncLocale = () => {
    let id = ''
    try {
      const snapshot = ctx.locale.getLocale()
      id = snapshot?.active ?? ''
    } catch {
      id = ''
    }
    if (id === '') id = navigator.language || 'zh'
    setLocale(id)
  }
  syncLocale()
  ctx.effect(() => ctx.on('locale/change', syncLocale), 'deepseek-chat: locale')

  // 面板样式：挂一份 <style>，卸载时移除
  ctx.effect(() => {
    const style = document.createElement('style')
    // dsh-dsc 构建时替换成真实包名，见 scripts/build-client.mjs
    style.setAttribute('data-plugin', 'dsh-dsc')
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'deepseek-chat: styles')

  // 中央面板：key 与侧栏图标 id 一致，侧栏点它时中央就渲染这个组件。
  // layout 由闭包传入：面板里的「返回对话」需要它切换中央面板。
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: 'deepseek-chat' }, (props) =>
      h(DeepSeekPanel, { ...props, layout: ctx.layout }),
    ),
  )

  // 侧栏图标
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: 'deepseek-chat',
        order: 8,
        label: () => T('panelLabel'),
      },
      DeepSeekIcon,
    ),
  )
}

/**
 * 侧栏图标：DeepSeek 官方鲸鱼。
 *
 * 路径取宿主 primitives 包导出的 `FISH_LOGO_PATH`（3448 字符），
 * viewBox 为 `0 0 23.16 17.04`。**不要自己画，也不要改这条路径**——
 * 它是官方绘制结果，改动即失真。提取方式见 `.tmp/extract-fishlogo.mjs`。
 *
 * 渲染照抄宿主 `FishLogo`：宽度由调用方给，高度按 viewBox 比例算，
 * 颜色走 `currentColor`。区别是这里要把整只鲸鱼装进 size×size 的方形槽位，
 * 而鲸鱼本身是 23.16:17.04 的横条，所以算完高度后垂直居中。
 */
const WHALE_PATH =
  'M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z'

const WHALE_VIEWBOX = { w: 23.16, h: 17.04 }

function DeepSeekIcon({ size }) {
  const edge = typeof size === 'number' ? size : 20
  // 宽度铺满槽位，高度按 viewBox 比例得出，再垂直居中
  const scale = edge / WHALE_VIEWBOX.w
  const height = WHALE_VIEWBOX.h * scale
  return h('svg', {
    width: edge,
    height: edge,
    viewBox: `0 0 ${edge} ${edge}`,
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  },
    h('g', { transform: `translate(0 ${(edge - height) / 2}) scale(${scale})` },
      h('path', { d: WHALE_PATH, fill: 'currentColor' }),
    ),
  )
}

/* ===== lib/app.css（构建时内联） ===== */
const STYLES = `/* ============================================================
   DeepSeek App 面板样式
   设计令牌沿用 DeepSeek 官方 chat-demo 的 --dsw-* 变量：宿主的
   theme 插件已经注入了一整套同名变量（含 body[data-ds-dark-theme]），
   所以这里只补它没有的几个 --ds-* 值，其余直接引用，暗色自动跟随。
   ============================================================ */

.dsa-root {
  --dsa-control-xl: 44px;
  --dsa-control-l: 40px;
  --dsa-control-m: 36px;
  --dsa-font-size-m: 14px;
  /* 字号/行高阶梯取自官方运行时 --ds-font-size-* / --ds-line-height-*。
     官方不是简单的 1.5 倍行高：正文 16/28、小字 14/25、13/23、12/21，
     行高比偏大（中文排版需要），照抄比按比例算更准。 */
  --dsa-font-l: 16px;
  --dsa-line-l: 28px;
  --dsa-font-m: 14px;
  --dsa-line-m: 25px;
  --dsa-font-sp: 13px;
  --dsa-line-sp: 23px;
  --dsa-font-s: 12px;
  --dsa-line-s: 21px;
  --dsa-font-xs: 10px;
  --dsa-line-xs: 18px;
  --dsa-ease: cubic-bezier(0.4, 0, 0.2, 1);
  --dsa-duration: 0.2s;
  /*
   * 代码块两层底色，取自官方暗色实测：
   * 外层 #1b1b1c（比页面底 #151517 略亮）、banner #2c2c2e（与侧栏 hover 同色阶）。
   * 官方不用边框分隔，靠这两层底色差表达结构；加边框反而显脏。
   */
  --dsa-code-block-bg: var(--dsw-alias-markdown-code-block, #1b1b1c);
  --dsa-code-banner-bg: var(--dsw-alias-markdown-code-block-banner, #2c2c2e);
  /* 搜索条目卡片与来源胶囊里的站点图标底色，官方实测 #353638（与侧栏 active 同色阶） */
  --dsa-site-icon-bg: #353638;
  /* 等宽字体栈取自官方 --ds-font-family-code（运行时实测值）。
     比原先多几档 Ubuntu Mono / Cousine / Roboto Mono，Windows 上 Cascadia Mono 命中率更高。 */
  --dsa-font-code: Menlo, Monaco, Consolas, 'Cascadia Mono', 'Ubuntu Mono', 'DejaVu Sans Mono',
    'Liberation Mono', 'JetBrains Mono', 'Fira Code', Cousine, 'Roboto Mono', 'Courier New', Courier,
    sans-serif, system-ui;
  --dsa-list-max: 840px;
  --dsa-list-padding: 44px;
  --dsa-scroll: rgba(0, 0, 0, 0.08);
  --dsa-scroll-hover: rgba(0, 0, 0, 0.15);
  /* 对话目录导航条的背景板：官方浅色 rgba(255,255,255,.8)、暗色 rgba(21,21,23,.6) */
  --dsa-scroll-nav-bg: rgba(255, 255, 255, 0.8);

  /* 品牌蓝：取自官方 main.css 的 --dsw-static-deepseek-500 / -450。
     不能直接用宿主的 --dsw-alias-brand-primary——它在暗色主题下被宿主改成近白色
     （实测 rgb(249,250,251)），字标与选中态会跟着变白，看不出品牌色。
     官方浅色用 500 档、暗色用 450 档（暗背景上要提亮），所以这里分两套。 */
  --dsa-brand: #3964fe;
  --dsa-brand-hover: #2f55e8;
  --dsa-brand-soft: rgba(57, 100, 254, 0.1);
  --dsa-brand-soft-strong: rgba(86, 134, 254, 0.18);

  /* 侧栏导航项的两个语义色。
     宿主只提供了 active-accent，hover 那档是空的（实测 getPropertyValue 返回空），
     直接引用会让悬停毫无反馈。这里按官方色阶补齐，浅色/暗色各一套。 */
  --dsa-nav-hover: #f1f3f5;
  --dsa-nav-active: #e4edfd;

  position: absolute;
  inset: 0;
  display: flex;
  overflow: hidden;
  box-sizing: border-box;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-family: var(--dsw-font-family, system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif);
  font-size: var(--dsa-font-size-m);
  word-break: break-word;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-variant-ligatures: no-contextual;
  -webkit-tap-highlight-color: transparent;
}

.dsa-root[data-dsa-dark='true'] {
  color-scheme: dark;
  --dsa-scroll: rgba(255, 255, 255, 0.15);
  --dsa-scroll-hover: rgba(255, 255, 255, 0.24);
  --dsa-scroll-nav-bg: rgba(21, 21, 23, 0.6);
  /* 暗色品牌蓝提亮到官方的 450 档：500 档压在 #151517 背景上偏暗，字标发灰 */
  --dsa-brand: #5686fe;
  --dsa-brand-hover: #6f98ff;
  /* 官方暗色：悬停 #2c2c2e、激活 #353638 */
  --dsa-nav-hover: #2c2c2e;
  --dsa-nav-active: #353638;
}

.dsa-root *,
.dsa-root *::before,
.dsa-root *::after {
  box-sizing: border-box;
}

/* 避开原生窗口栏。
   桌面端 Electron 用 titleBarOverlay 在 Web 层之上盖了一条高栏（本机 40px），
   宿主的 .frame 用 padding-top 给这块留白。但绝对定位的 inset:0 对齐的是祖先的
   padding box，而 padding 区属于 padding box —— 于是本面板从 .frame 最顶边起算，
   把自己的顶部内容压进窗口栏里，那一带收得到点击判定却收不到真实点击。

   条件必须和 .frame 的 padding-top 完全一致（宿主只在 Windows 那条规则里加 padding）：
   用 --dsh-frame-top-clearance 会因为它在 macOS 也有值（48px）而凭空多出留白。
   Web 端没有 data-windows-titlebar，本节整体不生效，与改动前一致。 */
[data-windows-titlebar] .dsa-root {
  top: var(--dsh-windows-titlebar-height, 0px);
}

/* 让出的那条带要涂成侧栏色。
   宿主 .frame 自己就是这么做的（背景用 --dsw-specific-sidebar-fill）：
   窗口栏带若留成根元素的 --dsw-alias-bg-base（白），会和侧栏的浅灰错开一截，
   看起来像顶部多出一条白带。

   用 box-shadow 向上投影而不是伪元素：.dsa-root 有 overflow: hidden，
   铺在它外面的伪元素会被裁掉；元素自身的投影不受自己 overflow 裁剪。 */
[data-windows-titlebar] .dsa-root {
  box-shadow: 0 calc(-1 * var(--dsh-windows-titlebar-height, 0px)) 0 0
    var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2));
}

/* 折叠条是 fixed 定位，不随 .dsa-root 的 top 下移——
   .dsa-root 靠 top: titlebar 高度避让窗口栏，折叠条必须单独让出同样的高度，
   否则三枚按钮压进窗口栏，点得到判定却收不到真实点击（与根元素当年的坑相同）。 */
[data-windows-titlebar] .dsa-collapsed-bar {
  top: calc(var(--dsh-windows-titlebar-height, 0px) + 12px);
}

.dsa-root button {
  font: inherit;
  color: inherit;
}

/* ---------------- 侧栏 ---------------- */

/* 侧栏宽度取自官方运行时令牌 --sider-width: 261px（不是我按观感估的 268px）。
   这个值在官方登录页就能读到，不用登录。
   折叠动效对齐官方实测：0.3s cubic-bezier(0.4,0,0.2,1)。
   用 margin-left 收进去而不是 max-width——max-width 动画时内部内容会先换行
   再收缩，margin 推出去是纯位移，内容不重排。 */
.dsa-sider {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 261px;
  height: 100%;
  min-height: 0;
  /* 官方内容区左右各 12px（所有子项 x12、宽 236）——早先 10px 让整列内容错位 2px */
  padding: 8px 12px 0;
  border-right: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2));
  margin-left: 0;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.dsa-sider-top {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 48px;
  margin-bottom: 10px;
  padding: 0 2px;
  flex-shrink: 0;
}

/* 品牌标记位：官方鲸鱼 Logo 与「返回对话」控件叠在同一个格子里。
   默认只露 Logo；鼠标悬停（或键盘聚焦到按钮）时 Logo 隐去、返回控件浮现。
   用 grid 单格叠放而不是 absolute：父容器高度由 Logo 自然撑开，
   切换时不会有任何跳动，也不依赖写死的像素。 */
.dsa-brand {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 50%;
}

.dsa-brand-logo {
  grid-area: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsa-brand);
  transition: opacity 0.15s var(--dsa-ease);
}

/* 悬停：Logo 让位，返回控件浮现。
   两者都叠在同一格里，光靠 opacity 不够——透明度为 0 的元素照样接收点击，
   而且 Logo 在 DOM 里排在按钮前面、层叠却可能压住它，导致「看不见却点得到」。
   所以两边同时切 pointer-events：露出谁，谁才接收鼠标。 */
.dsa-brand:hover .dsa-brand-logo,
.dsa-brand:focus-within .dsa-brand-logo {
  opacity: 0;
  pointer-events: none;
}

.dsa-brand-back {
  grid-area: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  outline: none;
  opacity: 0;
  /* 隐藏时不可点：否则未悬停时误点品牌位会直接退出面板，而用户看不到任何控件 */
  pointer-events: none;
  transition: opacity 0.15s var(--dsa-ease), background-color 0.15s var(--dsa-ease);
}

/* 悬停：Logo 让位，返回控件浮现 */
.dsa-brand:hover .dsa-brand-back,
.dsa-brand:focus-within .dsa-brand-back {
  opacity: 1;
  pointer-events: auto;
}

.dsa-brand-back:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsa-brand-back:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

/* 字标：官方是蓝色 deepseek 小写字标，字重 600、字号 19px */
.dsa-app-name {
  min-width: 0;
  overflow: hidden;
  color: var(--dsa-brand);
  font-size: 19px;
  line-height: 22px;
  font-weight: 600;
  letter-spacing: -0.2px;
  white-space: nowrap;
}

.dsa-sider-top-spacer {
  flex: 1;
}

.dsa-sider-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  outline: none;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-sider-tool:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* 新对话：规格取自官方 ._5a8ac7a——
   height 40px / border-radius 100px / padding 0 16px / 14px-500 /
   背景 --dsw-alias-button-elevated-fill / 三段式阴影。
   这是胶囊按钮，不是方角卡片；上一版误改成 12px 圆角，与官方不符。 */
/*
 * 「开启新对话」胶囊。
 *
 * margin-bottom 必须是 0：这个间距由外层 .dsa-sider-head 统一承担。
 * 早先挂在这里，导致多选态换成「选择对话」后间距跟着消失，列表整体上抬 14px——
 * 官方实测两种状态下分组标题都在 y=134、条目都在 y=156，位移恒为 0。
 */
.dsa-new-chat {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 100px;
  background: var(--dsw-alias-button-elevated-fill, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  user-select: none;
  /* 供 ::after 的快捷键做定位锚点 */
  position: relative;
  box-shadow: 0 -2px 2px rgba(72, 104, 178, 0.04), 0 2px 2px rgba(106, 111, 117, 0.09),
    0 1px 2px rgba(72, 104, 178, 0.08);
  transition: box-shadow 0.3s;
}

/*
 * 头部槽位容器：普通态装「开启新对话」，多选态装「选择对话 + 退出」。
 *
 * 这个容器必须常驻、且自己承担与列表之间的 14px 间距——
 * 间距挂在这里，就不会因为内部内容替换而消失，列表位置在两种状态下保持不动。
 */
.dsa-sider-head {
  flex-shrink: 0;
  margin-bottom: 14px;
}

/* 文字节点在子元素里，所以把字重也下放到子元素，绕开 .dsa-root button 的 font:inherit 简写
   （简写会连 font-weight 一起重置，实测按钮的 500 被压成 400）。
   文字恒居中：官方 ._5a8ac7a 是 justify-content:center，快捷键靠绝对定位不占布局。 */
.dsa-new-chat-label {
  font-weight: 500;
  white-space: nowrap;
}

/* 悬停：官方实测是「内描边提亮 + 阴影增强」，背景色不变——
   暗色内描边 rgba(255,255,255,.1) → .16，浅色是三段式阴影加深。
   早先悬停换 background，与官方的微妙反馈不符（底色跳变太抢眼）。 */
.dsa-new-chat:hover {
  box-shadow: 0 4px 4px rgba(72, 104, 178, 0.04), 0 -3px 4px rgba(72, 104, 178, 0.04),
    0 6px 6px rgba(106, 111, 117, 0.1);
}

/* 暗色：内描边 .1 → .16，外投影不变（官方实测值） */
.dsa-root[data-dsa-dark='true'] .dsa-new-chat:hover {
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.16), 0 2px 4px rgba(106, 111, 117, 0.08);
}

.dsa-new-chat:focus-visible {
  border-color: var(--dsa-brand);
}

/* 暗色下三段式阴影不可见，官方改成内描边 + 一层浅投影 */
.dsa-root[data-dsa-dark='true'] .dsa-new-chat {
  border: none;
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 2px 4px rgba(106, 111, 117, 0.08);
}

.dsa-new-chat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--dsw-alias-label-secondary);
}

/* 快捷键提示：官方用绝对定位伪元素挂在按钮右侧，默认 opacity:0，悬停整枚按钮才淡入。
   绝对定位是关键——它不参与 flex 布局，所以文字始终精确居中，不会被快捷键推偏。
   官方 ._5a8ac7a:after 取 right:11px / top:50% / translateY(-50%) / transition:opacity .3s。 */
.dsa-new-chat {
  justify-content: center;
}

.dsa-new-chat::after {
  content: attr(data-kbd);
  position: absolute;
  top: 50%;
  right: 11px;
  transform: translateY(-50%);
  color: var(--dsw-alias-label-caption);
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}

.dsa-new-chat:hover::after,
.dsa-new-chat:focus-visible::after {
  opacity: 1;
}
.dsa-session-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  /* 官方列表项占满 236px 全幅，滚动条悬浮在内容上（overlay）。
     scrollbar-gutter: stable 会预留 ~10px 让项宽缩水，与官方不符。 */
  scrollbar-width: thin;
  scrollbar-color: var(--dsa-scroll) transparent;
}

.dsa-section-title {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  /* 官方分组标题行：padding 2px 10px、12px/18px、字重 500、行总高 22px；
     文字左缘与列表项文字（padding-left 10px）对齐 */
  padding: 2px 10px;
  font-size: 12px;
  line-height: 18px;
  font-weight: 500;
  color: var(--dsw-alias-label-tertiary);
  background: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2));
  user-select: none;
}

/* 多选入口：常驻显示（用户要求），与官方「悬停才出现」不同但更易发现 */
/*
 * 分组标题右侧的多选入口。
 *
 * 官方实测：只有「置顶」分组标题带这枚按钮（x=226、12×12、opacity:1 常驻），
 * 普通分组标题没有。它不隐藏、不淡入——上屏就能看见。
 *
 * 我上一轮反向改过两次：先做成每个分组都挂（视觉噪音大），
 * 再改成悬停才显示（把常驻需求理解错了）。两处都不对，现按官方为准：
 * 只挂在置顶组 + 常驻。
 */
.dsa-section-multi {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  transition: color var(--dsa-duration) var(--dsa-ease);
}

/* 图标本体 12px，但热区靠 padding 撑到可点尺寸——12px 的纯图标太小，手指点不准 */
.dsa-section-multi::before {
  content: '';
  position: absolute;
  inset: -6px;
}

.dsa-section-multi:hover {
  color: var(--dsw-alias-label-primary);
}

.dsa-section-multi:hover {
  background: var(--dsa-nav-hover);
  color: var(--dsw-alias-label-primary);
}

/* ---------------- 多选模式 ----------------
   官方交互：分组标题悬停出「多选」入口 → 整列变成圆圈选择，
   头部「选择对话 / 已选择 N 个对话」+ 关闭，底部「置顶 | 删除」操作条。 */

/*
 * 多选态头部：官方实测 ._3c15409 —— 236×40、padding-left 10px、
 * justify-content: space-between；标题 16px/500 在 x=22（= 12 容器 + 10 内距）；
 * 关闭按钮 28×28 正圆、实心底色 rgb(44,44,46)（不是描边幽灵按钮），位置 x=220。
 *
 * 它占用的是「开启新对话」那个槽位（y=70 / 高 40），不是另起一行——
 * 所以列表起点不会因为这个头部而变化。
 */
.dsa-select-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 100%;
  height: 40px;
  padding: 0 0 0 10px;
}

.dsa-select-title {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 关闭按钮：官方是实心胶囊底，悬停不变描边 */
.dsa-select-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsa-nav-active);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color var(--dsa-duration) var(--dsa-ease),
    color var(--dsa-duration) var(--dsa-ease);
}

.dsa-select-close:hover {
  background: var(--dsa-nav-hover);
  color: var(--dsw-alias-label-primary);
}

/* 选择圈：未选是灰描边圆，选中是品牌蓝实心 + 白勾 */
/*
 * 多选态的单行。
 *
 * 官方实测（a._546d736）：行内 padding 仍是 9px 6px 9px 10px，
 * 勾选圈占 x=22 / 20×20 正圆，文字从普通态的 x=22 移到 x=52 ——
 * 即「文字在原地右平移 30px = 勾选圈 20 + 间距 10」，不是整体挪位。
 * 勾选圈参与了行内 flex 流，所以文字自然被推到后面；不需要额外 transform。
 */
/*
 * 多选态的单行：文字「滑」到 x=52，不是瞬移。
 *
 * 官方实测（rAF 逐帧）：进入多选态后文字 relX 走
 *   10 → 18 → 23 → 27 → 31 → 33 → 35 → 37 → 38 → 39 → 40
 * 约 12 帧（≈200ms）缓出，是**布局过渡**而不是 transform 位移：
 * 勾选圈插入 flex 流后占掉 30px，文字被挤过去，浏览器对这条自动位置变化
 * 套用了 transition，于是看着像平滑滑动。
 *
 * 我方原来的问题：圆圈是条件渲染（挂载瞬间才出现）+ 文字没声明 transition，
 * 于是表现为「切换」而不是「切入」。
 *
 * 做法对齐官方：
 *   - 圆圈始终在场，宽度/外边距从 0 展开（可过渡）
 *   - 文字与行本身声明 transition，让 flex 自动让位也走动画
 */
/*
 * 行本身。
 *
 * 这里**不能**用 overflow: hidden：行内「更多」按钮的下拉菜单是 position:absolute
 * 子元素、会向下超出 40px 行高，hidden 会把它整块裁掉（看不见菜单）。
 * 早先为配合勾选圈的负 margin 加过 hidden，正是它挡住了菜单。
 *
 * 收起的勾选圈改用「自身不可见 + 不参与命中」处理，不再依赖父级裁剪：
 * 负 margin 只是把它拉到行左边的空白区，视觉上并不可见（opacity:0，
 * 且行的 padding-left 区本就是空白带，圈在那里的 20px 落在面板内边距里，
 * 不会溢出到面板外）。
 */
.dsa-session-item {
  position: relative;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  height: 40px;
  padding: 9px 6px 9px 10px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}


.dsa-session-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 18px;
  /* 让 flex 让位产生的位移也走过渡——这是「切入」而非「切换」的关键 */
  transition: margin 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/*
 * 勾选圈。默认宽度 0（不占位、不可见），进入多选态时展开到 20×20。
 *
 * 为什么不是条件渲染：条件渲染是「挂载瞬间出现」，无法过渡，
 * 文字会被突然挤开——官方是平滑滑过去。这里让圆圈一直在场，
 * 用 width / margin-right / opacity 三个可过渡属性控制展开。
 * overflow:hidden 保证 0 宽时圆圈本身不被画出边界。
 */
/*
 * 勾选圈与文字的位移过渡。
 *
 * 试过但失败的方案（记下来免得再走一遍）：
 *   1) 圈的 width 0→20 配 gap 0→10 过渡 → 不产生中间帧。
 *      React 在同一批次里同时改这两个值，浏览器把它们当成一个新的稳定态
 *      一次性布局，rAF 实测第 2 帧就从 12 直接跳到 40，看着仍是「切换」。
 *   2) 圈用 transform 平移 → 能补间，但圈自身会跟着挪位，视觉上圈从左边飞进来。
 *
 * 可用方案：圈**始终 20px 占位**，用 margin-left 在 -30px ↔ 0 之间过渡。
 *   收起态 margin-left:-30px → 圈被拉出左边，净占位 = -30+20+10 = 0，文字回到原位
 *   展开态 margin-left:0     → 净占位 = 0+20+10 = 30，文字被推右 30px
 * margin 是布局属性且能可靠补间，两个方向都平滑。
 */
.dsa-select-circle {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  margin-right: 10px;
  margin-left: -30px;
  border: 1.5px solid var(--dsw-alias-border-l3);
  border-radius: 50%;
  opacity: 0;
  transition: margin-left 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.15s var(--dsa-ease),
    background-color 0.15s var(--dsa-ease),
    border-color 0.15s var(--dsa-ease);
}

/* 多选态：圈滑入占位，文字被推右 30px */
.dsa-session-item[data-selecting='true'] .dsa-select-circle {
  margin-left: 0;
  opacity: 1;
}

/* 选中态：品牌色实心 + 白色对勾（官方 ds-checkbox--s 的选中态） */
.dsa-session-item[data-checked='true'] .dsa-select-circle {
  border-color: var(--dsa-brand);
  background: var(--dsa-brand);
}

.dsa-session-item[data-checked='true'] .dsa-select-circle::after {
  content: '';
  width: 5px;
  height: 9px;
  margin-top: -2px;
  border: solid #fff;
  border-width: 0 1.8px 1.8px 0;
  transform: rotate(45deg);
}

.dsa-session-item[data-checked='true'] .dsa-select-circle {
  border-color: var(--dsa-brand);
  background: var(--dsa-brand);
}

.dsa-session-item[data-checked='true'] .dsa-select-circle::after {
  content: '';
  width: 9px;
  height: 5px;
  margin-top: -2px;
  border-left: 1.8px solid #fff;
  border-bottom: 1.8px solid #fff;
  transform: rotate(-45deg);
}

/* 底部操作条：置顶 | 删除 左右分布，官方布局 */
/*
 * 多选态底部操作条。
 * 官方实测 ._35dde8c：236x62、flex 两等分（各 118 宽），
 * 每枚内部 display:flex + gap:8px + 图标与文字，无背景、无边框、无分隔线；
 * 文字 14px、颜色 rgb(129,133,140)（label-tertiary），悬停才转 primary。
 */
.dsa-select-actions {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  height: 62px;
  /* 子按钮用 color: inherit（.dsa-root button 的简写），这里给出基准色 */
  color: var(--dsw-alias-label-tertiary);
}

.dsa-select-action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  padding: 0;
  border: none;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 14px;
  cursor: pointer;
  transition: color var(--dsa-duration) var(--dsa-ease);
}

.dsa-select-action:hover:not(:disabled) {
  color: var(--dsw-alias-label-primary);
}

.dsa-select-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dsa-select-action[data-danger='true']:hover:not(:disabled) {
  color: var(--dsw-alias-state-error-primary);
}

.dsa-select-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dsa-select-divider {
  flex-shrink: 0;
  width: 1px;
  height: 20px;
  background: var(--dsw-alias-border-l2);
}

/* ---------------- 应用内确认弹窗 ----------------
   对齐官方确认卡（用户截图）：居中小卡、无 header 分隔、
   标题 + 说明正文 + 右下角「取消 / 确认」，确认键按危险与否换色。 */

.dsa-confirm {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  padding: 22px 24px 18px;
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1));
  box-shadow: 0 0 1px rgba(0, 0, 0, 0.2), 0 12px 32px rgba(0, 0, 0, 0.2);
  animation: dsa-confirm-in 0.16s var(--dsa-ease);
}

@keyframes dsa-confirm-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}

.dsa-confirm-title {
  margin: 0;
  font-size: 15px;
  line-height: 24px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}

.dsa-confirm-body {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 21px;
  color: var(--dsw-alias-label-secondary);
}

.dsa-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

.dsa-confirm-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  padding: 0 18px;
  border-radius: 10px;
  border: none;
  background: var(--dsa-nav-hover, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
}

.dsa-confirm-button:hover {
  filter: brightness(1.12);
}

.dsa-confirm-button:focus-visible {
  box-shadow: 0 0 0 2px var(--dsa-brand);
}

.dsa-confirm-button[data-variant='primary'] {
  background: var(--dsa-brand);
  color: #fff;
}

.dsa-confirm-button[data-variant='danger'] {
  background: var(--dsw-alias-state-error-primary, #f25a5a);
  color: #fff;
}

/* 会话项规格取自官方 ._546d736：
   height 40px / border-radius 12px / padding 9px 6px 9px 10px / 14px-22px。
   早先按观感写成 38px + 10px 圆角，比官方紧一档，行距也偏挤。 */

.dsa-session-item:hover {
  background: var(--dsa-nav-hover);
}

/* 激活态：官方用 --dsw-specific-sidebar-nav-item-active-accent，
   浅色是淡蓝 #e4edfd、暗色是中性 #353638。
   早先退回 --dsw-alias-bg-layer-1，浅色下是纯白，跟侧栏底色 #f9fafb 几乎没差别，
   选中项等于没有高亮。 */
.dsa-session-item[data-active='true'] {
  background: var(--dsa-nav-active);
}

.dsa-session-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  line-height: 18px;
}

/*
 * 会话行的「更多」按钮。
 *
 * 可见性三态（官方实测）：
 *   普通行        按钮宽 0、完全收起（不是半透明，是真不占位）
 *   当前选中行    opacity:1、28×28，常显
 *   悬停任意行    opacity:1 浮现
 * 所以「选中态常显」不是可选润色——否则当前会话想改名/置顶还得先悬停。
 * 官方按钮 28×28、全圆角；悬停时是深灰圆形底 + 三点图标（截图 3）。
 */
.dsa-session-more {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-left: 4px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s var(--dsa-ease), background-color 0.15s var(--dsa-ease);
}

/* 选中行常显 */
.dsa-session-item[data-active='true'] .dsa-session-more,
.dsa-session-item:hover .dsa-session-more,
.dsa-session-more:focus-visible,
.dsa-session-more[aria-expanded='true'] {
  opacity: 1;
  pointer-events: auto;
}

.dsa-session-more:hover,
.dsa-session-more[aria-expanded='true'] {
  background: var(--dsa-nav-hover);
  color: var(--dsw-alias-label-primary);
}

/* 会话行下拉菜单：官方是浮在行右侧的深色圆角卡（截图 2），
   五项：重命名 / 置顶（取消置顶）/ 分享 / 多选 / 删除，删除红色。 */
/*
 * 行下拉菜单（由 portal 渲染到 body，fixed 定位）。
 *
 * 为什么必须 fixed + portal：侧栏列表 .dsa-session-list 是 overflow-y:auto
 * 的滚动容器，行内 absolute 菜单会被裁剪——实测最后一行打开时菜单越出列表底边
 * 74px，下面几项完全看不见。fixed 脱离裁剪链路后任何行都能完整显示。
 * 坐标由触发按钮的 getBoundingClientRect 算出（top = 按钮底边、right = 视口右边距）。
 */
.dsa-row-menu {
  position: fixed;
  z-index: 60;
  min-width: 148px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2, #2c2c2e);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
  animation: dsa-menu-in 0.14s var(--dsa-ease);
}

@keyframes dsa-menu-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}

.dsa-row-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.dsa-row-menu-item:hover {
  background: var(--dsa-nav-hover);
}

.dsa-row-menu-item[data-danger='true'] {
  color: var(--dsw-alias-state-error-primary);
}

.dsa-row-menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: inherit;
}

/* 会话行需要 position: relative 才能让菜单相对它定位 */

.dsa-session-action {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.dsa-session-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dsa-rename-input {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--dsa-brand);
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  outline: none;
}

/*
 * 侧栏底部：一个整体账号控件。
 *
 * 官方实测 ._2afd28d：236x44、radius 12px、padding 6px 2px 6px 6px、无上边框，
 * 左头像 32x32 正圆（x=18）、中名称（x=58）、右三点图标 16x16（x=222 靠右）。
 * 官方这里没有分隔线，容器高度也是 44 而不是 56——早先的 border-top + 56px 都不对。
 */
.dsa-sider-footer {
  position: relative;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 6px 0;
}

.dsa-account {
  display: flex;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  height: 44px;
  padding: 6px 2px 6px 6px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  text-align: left;
  cursor: pointer;
  outline: none;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-account:hover {
  background: var(--dsa-nav-hover);
}

.dsa-account-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--dsa-nav-active);
  color: var(--dsa-brand);
  overflow: hidden;
}

.dsa-account-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  font-weight: 400;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dsa-account-caret {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--dsw-alias-label-tertiary);
}





.dsa-sider-empty {
  padding: 24px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  text-align: center;
}

/* ---------------- 主区 ---------------- */

.dsa-main {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

/* 顶部工具条：对齐官方收起态的浮动胶囊（边栏 / 搜索 / 新对话）。
   展开态不渲染它；收起态随 .dsa-collapsed-bar 一起出现在主区左上。 */
.dsa-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.12));
  border-radius: 100px;
  background: var(--dsa-nav-active, #353638);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
}

.dsa-toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  outline: none;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-toolbar-button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsa-toolbar-button:focus-visible {
  box-shadow: 0 0 0 2px var(--dsa-brand);
}

/* 折叠态左上角整条：对齐官方 .ca6d4be1——fixed top 12 left 16，
   鲸鱼（27×24）+ 16px 间距 + 工具条胶囊（114×40）。
   入场与侧栏滑出同步：0.3s 同曲线淡入下移，避免「侧栏滑走了、
   折叠条凭空蹦出来」的两段感。 */
.dsa-collapsed-bar {
  position: fixed;
  top: 12px;
  left: 16px;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 16px;
  animation: dsa-bar-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes dsa-bar-in {
  from {
    opacity: 0;
    transform: translateY(-6px);
  }
}

/* 折叠态的鲸鱼位：官方收起态这里是纯 Logo，本插件把「回宿主主对话」的
   退出控件叠在同一格里——悬停（或键盘聚焦）时 Logo 隐去、返回箭头浮现。
   机制与侧栏品牌行的 .dsa-brand 完全一致：grid 单格叠放，切换零跳动；
   两侧同时切 pointer-events，避免「看不见却点得到」。 */
.dsa-collapsed-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
}

.dsa-collapsed-mark .dsa-brand-logo {
  grid-area: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsa-brand);
  transition: opacity 0.15s var(--dsa-ease);
}

.dsa-collapsed-mark:hover .dsa-brand-logo,
.dsa-collapsed-mark:focus-within .dsa-brand-logo {
  opacity: 0;
  pointer-events: none;
}

.dsa-collapsed-mark .dsa-brand-back {
  grid-area: 1 / 1;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s var(--dsa-ease), background-color 0.15s var(--dsa-ease);
}

.dsa-collapsed-mark:hover .dsa-brand-back,
.dsa-collapsed-mark:focus-within .dsa-brand-back {
  opacity: 1;
  pointer-events: auto;
}

/* 折叠条的格子是 34px，品牌行的默认 30px 按钮在这里偏小，撑满格子 */
.dsa-collapsed-mark .dsa-brand-back {
  width: 34px;
  height: 34px;
}

.dsa-header-spacer {
  flex: 1;
}

.dsa-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  outline: none;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-icon-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dsa-icon-button:focus-visible {
  box-shadow: 0 0 0 2px var(--dsw-alias-button-primary-fill);
}

.dsa-icon-button:disabled {
  color: var(--dsw-alias-label-caption);
  cursor: not-allowed;
}

.dsa-content {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

/* ---------------- 对话目录导航条（官方 scroll-nav） ---------------- */

/*
 * 官方规格（main.css ._189b4a0 等，暗色实测）：
 * 容器 34×300 固定右侧、垂直居中；背景板 34×(100%-8px) 圆角 16、blur(5px)；
 * 每轮一行 30px，右侧对齐；短线 8×2 圆角 4，当前轮次 scale(1.5) 变品牌蓝；
 * 悬停时面板展开到 240px 宽、显示提问全文（默认 opacity:0 不占视觉）。
 * 窄于 768px 隐藏。
 */
.dsa-scroll-nav {
  position: fixed;
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
  z-index: 5;
  display: flex;
  align-items: center;
  width: 34px;
  height: 300px;
  border-radius: 8px;
  user-select: none;
  transition: all 0.2s;
}
@media not all and (min-width: 768px) {
  .dsa-scroll-nav {
    display: none;
  }
}

/* 背景板：比容器矮 8px 并在垂直向居中，作为展开面板的底 */
.dsa-scroll-nav-bg {
  position: absolute;
  top: 50%;
  right: 0;
  transform: translateY(-50%);
  z-index: -1;
  width: 34px;
  height: calc(100% - 8px);
  max-height: calc(100% - 8px);
  border-radius: 16px;
  background-color: var(--dsa-scroll-nav-bg);
  backdrop-filter: blur(5px);
}

/*
 * 面板：官方宽度恒为 240（._490b7a1），收起态只是「背景透明 + 文字 opacity:0」，
 * 不做宽度动画——宽度恒定则右边出的短线在开合过程中纹丝不动，
 * 若用 width 过渡，item 宽度会跟着变，观感上是整条在抖。
 */
.dsa-scroll-nav-panel {
  position: absolute;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 240px;
  max-height: 100%;
  overflow: hidden;
  border: 1px solid transparent;
  border-radius: 16px;
  /* 官方 --scroll-nav-page-padding: 15px 0 15px 24px，内距在容器不在每一项 */
  padding: 15px 0 15px 24px;
  box-sizing: border-box;
  pointer-events: none;
  transition: background 0.2s, box-shadow 0.2s, border-color 0.2s;
}
.dsa-scroll-nav[data-open='true'] .dsa-scroll-nav-panel {
  pointer-events: auto;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-shadow-lv3);
  border-color: var(--dsw-alias-border-inverted);
}

/*
 * 展开面板上下 32px 的渐隐遮罩（官方 ._4ce999d:before/:after）：
 * 轮次超出面板高度时，上下边缘的条目淡出而不是硬切，暗示还有内容。
 * 只在展开态出现——收起态面板只有一条短线，加遮罩会把它抹掉。
 */
.dsa-scroll-nav[data-open='true'] .dsa-scroll-nav-panel::before,
.dsa-scroll-nav[data-open='true'] .dsa-scroll-nav-panel::after {
  content: '';
  position: absolute;
  left: 0;
  z-index: 2;
  width: 100%;
  height: 32px;
  pointer-events: none;
  background: linear-gradient(180deg, var(--dsw-alias-bg-layer-1) 20.19%, transparent 100%);
}
.dsa-scroll-nav[data-open='true'] .dsa-scroll-nav-panel::before {
  top: 0;
}
.dsa-scroll-nav[data-open='true'] .dsa-scroll-nav-panel::after {
  bottom: 0;
  transform: rotate(180deg);
}
/* 内容没超出时两片遮罩都收掉，否则顶部第一条会被压暗 */
.dsa-scroll-nav[data-scrollable='false'] .dsa-scroll-nav-panel::before,
.dsa-scroll-nav[data-scrollable='false'] .dsa-scroll-nav-panel::after,
.dsa-scroll-nav[data-at-top='true'] .dsa-scroll-nav-panel::before,
.dsa-scroll-nav[data-at-bottom='true'] .dsa-scroll-nav-panel::after {
  opacity: 0;
}

/* 内层列表：轮次多时自己滚，最大高度由外框的 max-height 约束 */
.dsa-scroll-nav-list {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  /* 官方同样隐藏原生滚动条，靠外层容器裁切 */
  scrollbar-width: none;
}
.dsa-scroll-nav-list::-webkit-scrollbar {
  display: none;
}

/* 每轮一行：固定 30px，短线始终靠右，文字从右侧溢出裁切 */
.dsa-scroll-nav-item {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  width: calc(100% - 6px);
  height: 30px;
  margin-right: 8px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.dsa-scroll-nav-item:hover {
  color: var(--dsw-alias-label-primary);
}

/* 提问摘要：默认透明（只留短线），展开后显示 */
.dsa-scroll-nav-text {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 0.1s, color 0.2s;
}
.dsa-scroll-nav[data-open='true'] .dsa-scroll-nav-text {
  opacity: 1;
}
.dsa-scroll-nav-item:hover .dsa-scroll-nav-text {
  color: var(--dsw-alias-label-primary);
}

/* 短线容器：16×20，负责把 8×2 的短线居中 */
.dsa-scroll-nav-mark {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 20px;
}

.dsa-scroll-nav-dash {
  width: 8px;
  height: 2px;
  flex-shrink: 0;
  border-radius: 4px;
  background-color: var(--dsw-alias-border-l4);
  transition: background-color 0.2s, transform 0.2s;
}
.dsa-scroll-nav-item:hover .dsa-scroll-nav-dash {
  background-color: var(--dsw-alias-label-primary);
}

/* 当前轮次：品牌蓝 + 加粗 + 短线放大 1.5 倍（官方 ._19d617c）。
   用 --dsa-brand 而不是 --dsw-alias-brand-text：宿主在暗色主题下把后者改成近白色
   rgb(249,250,251)，当前轮次会和普通轮次一个颜色，看不出「现在在哪」。 */
.dsa-scroll-nav-item[data-active='true'] .dsa-scroll-nav-text {
  color: var(--dsa-brand);
  font-weight: 500;
}
.dsa-scroll-nav-item[data-active='true'] .dsa-scroll-nav-dash {
  background-color: var(--dsa-brand);
  transform: scale(1.5);
}

/* ---------------- 消息列表 ---------------- */

/* 对话区与来源面板的横向容器：占满头部与输入区之间的空间 */
.dsa-body {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.dsa-scroll {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  /* 官方消息区不显示原生滚动条，改用自绘的对话目录导航条（见 .dsa-scroll-nav）。
     隐藏原生条而不是 scrollbar-gutter：后者会占宽，让 752 的消息列缩水。 */
  scrollbar-width: none;
  scrollbar-color: transparent transparent;

  padding-bottom: 8px;
}
.dsa-scroll::-webkit-scrollbar {
  display: none;
}

/* 空会话：欢迎语 + composer 作为一组垂直居中（官方实测 composer 跟着问候语走，
   底距视口 347px，不吸底）。整块用 margin auto 居中时，
   composer 会被 flex 挤压，所以宽度必须给它撑住。 */
.dsa-scroll-empty {
  justify-content: center;
}

.dsa-column {
  width: calc(var(--dsa-list-max) - 2 * var(--dsa-list-padding));
  /* 与 .dsa-composer 的 max-width 用同一套减去量，收窄时两者位移才严格相等 */
  max-width: calc(100% - 16px - 24px);
  margin: 0 auto;
  /* 顶部让开浮动工具条（约 50px），否则第一条消息会被它压住 */
  padding-top: 52px;
  padding-bottom: 8px;
}

.dsa-welcome {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.dsa-welcome-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  max-width: var(--dsa-list-max);
  margin: auto;
  /* 左右内距与 .dsa-column 的容器标尺一致（--dsa-list-padding），
     空态与消息态 composer 宽度才能相同。 */
  padding: 0 var(--dsa-list-padding);
  flex-shrink: 0;
}

/* 空态里嵌进欢迎区的 composer：
   宽度与消息列同轴（官方实测 composer 比正文宽 24px），居中，跟在问候语下方。
   官方组中心在视口约 42% 处，flex 居中的中心是 50%——差值不大，
   不再做偏移，避免负 margin 与问候语重叠（实测 -8vh 会盖住标题）。 */
.dsa-welcome-composer {
  display: flex;
  justify-content: center;
  width: 100%;
}

.dsa-greeting {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 21px;
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
  text-align: center;
  color: var(--dsw-alias-label-primary);
}

/* 空态标题左端的品牌标记：与侧栏品牌行同一个官方鲸鱼，只换尺寸 */
.dsa-greeting-mark {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--dsa-brand);
}

.dsa-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
}

/* ---------------- 消息 ---------------- */

.dsa-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding-bottom: 16px;
}

.dsa-user[data-first='true'] {
  padding-top: 34px;
}

.dsa-user-bubble {
  max-width: calc(100% - 88px);
  padding: 10px 16px;
  border-radius: 22px;
  font-size: 16px;
  line-height: 24px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-specific-bubble, var(--dsw-alias-bg-layer-2));
  white-space: pre-wrap;
  word-break: break-word;
}

/*
 * 用户消息的编辑态。
 *
 * 早先直接复用 .dsa-textarea-mirror 再靠内联样式硬改可见性——
 * 那个类的本职是「隐藏的测高镜像」（visibility:hidden + 静态定位），
 * 拿来当输入框会渲染成没有定位的静态块，样式全歪、也拿不到 .dsa-composer 的盒子外观。
 * 这里给它自己的类，复用 composer 的视觉变量但布局独立。
 */
.dsa-user-editor {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  width: 100%;
}

.dsa-user-editor-box {
  /* 覆盖 .dsa-composer 的居中与固定宽度：编辑框跟随用户气泡那一侧铺满 */
  width: 100%;
  max-width: 100%;
  margin: 0;
  overflow: visible;
}

.dsa-user-editor-input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  min-height: 60px;
  max-height: 202px;
  margin: 0;
  padding: 12px 16px;
  border: none;
  border-radius: 24px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 16px;
  line-height: 24px;
  resize: none;
  outline: none;
  caret-color: var(--dsa-brand);
}

.dsa-user-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.dsa-user-files {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 10px;
  max-width: 100%;
  margin-bottom: 8px;
}

.dsa-assistant {
  position: relative;
  padding-bottom: 6px;
}

/* 用户消息的操作栏：默认几乎透明（保留占位，避免悬停时布局跳动）。
   用 opacity 而不是 display:none，是为了让高度始终占住，悬停时不推挤上下文。 */
.dsa-user-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  margin-top: 6px;
  opacity: 0.001;
  transition: opacity var(--dsa-duration) var(--dsa-ease);
}

.dsa-user:hover .dsa-user-actions,
.dsa-user-actions:focus-within {
  opacity: 1;
}

/*
 * 操作栏常显：官方 ._965abe9 / ._54866f7 都是 opacity:1，没有悬停显隐逻辑。
 * 早先做成悬停淡入是错的——回答读完后想复制还得先悬停，白多一步。
 * 只在流式生成中隐藏（由组件按 busy 判断，不靠 CSS）。
 */
.dsa-assistant-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-top: 12px;
  padding-bottom: 10px;
}

/*
 * 操作按钮行：官方 ._965abe9 是 flex + gap 10px，按钮 28×28 圆形胶囊。
 * 官方外层 ._0a3d93b 还有 left:-6px，把行左移半个按钮宽度，
 * 让首枚图标的视觉左沿与正文对齐——图标本身带内边距，不左移会显得缩进。
 */
.dsa-action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  position: relative;
  left: -6px;
}

/* 版本切换器：「‹ 2/3 ›」。数字用等宽字体，切换时不会因字宽变化而抖动。 */
.dsa-version-switcher {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 26px;
  padding: 0 2px;
  border-radius: 6px;
  color: var(--dsw-alias-label-tertiary);
}

.dsa-version-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-version-arrow:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dsa-version-arrow:disabled {
  opacity: 0.35;
  cursor: default;
}

.dsa-version-label {
  min-width: 30px;
  font-family: var(--dsa-font-code);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

/* 操作按钮：官方 ds-button--iconLabel 28px 圆形热区、16px 图标、#adb2b8 */
.dsa-action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 13px;
  cursor: pointer;
  /* 官方 .db183363 用 label-tertiary，悬停只换底色不提亮图标 */
  transition: background-color var(--dsa-duration) var(--dsa-ease),
    color var(--dsa-duration) var(--dsa-ease);
}

.dsa-action-button:hover {
  background: var(--dsa-nav-hover);
}

/* 已生效的态度 / 朗读状态：图标转为品牌色，与未选中的中性灰区分 */
.dsa-action-button[data-active='true'] {
  color: var(--dsa-brand);
}

/*
 * 「N 个网页」来源胶囊，对齐官方 .f93f59e4：
 * fit-content + margin-top 16px + padding 4px 10px 4px 4px + 圆角 100px。
 * 只换背景色（官方 transition:background-color .3s），不做位移。
 */
.dsa-sources-pill {
  display: flex;
  align-items: center;
  width: fit-content;
  box-sizing: border-box;
  margin-top: 16px;
  padding: 4px 10px 4px 4px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 100px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  user-select: none;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-sources-pill:hover {
  background: var(--dsa-nav-hover);
}

/* 4 枚站点图标叠放：后一枚压前一枚 4px，圆形裁剪 */
.dsa-sources-logos {
  display: flex;
  margin-left: 6px;
}

/*
 * 单枚站点图标。img 铺满、cover 裁切；底下的首字母兜底在 img 之上不可见，
 * 一旦 img 加载失败被移除，首字母就露出来——不需要额外的 onError 状态位。
 */
.dsa-sources-logo {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-left: -4px;
  border-radius: 50%;
  background: var(--dsw-alias-bg-layer-2, var(--dsa-nav-active));
  /* 用底色描边做出相邻图标之间的分隔，官方也是这个做法 */
  box-shadow: 0 0 0 1px var(--dsw-alias-bg-base);
  overflow: hidden;
}

.dsa-sources-logo img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dsa-sources-fallback {
  position: absolute;
  color: var(--dsw-alias-label-secondary);
  font-size: 9px;
  font-weight: 500;
  line-height: 1;
  text-transform: uppercase;
}

.dsa-sources-logo:first-child {
  margin-left: 0;
}

.dsa-sources-count {
  margin-left: 6px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 400;
  line-height: 24px;
}

.dsa-action-button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.dsa-waiting {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
}

.dsa-waiting-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dsw-alias-label-dimmed, var(--dsw-alias-label-tertiary));
  animation: dsa-fading 0.9s linear infinite;
}

.dsa-waiting-dot:nth-child(2) {
  animation-delay: 0.1s;
}

.dsa-waiting-dot:nth-child(3) {
  animation-delay: 0.2s;
}

@keyframes dsa-fading {
  0%,
  100% {
    opacity: 0.3;
  }
  33%,
  66% {
    opacity: 1;
  }
}

.dsa-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-state-error-primary);
}

.dsa-error > span {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

/* ---------------- 思考与工具时间线 ---------------- */

.dsa-reply-area {
  margin-bottom: 10px;
}

.dsa-area-title {
  display: flex;
  align-items: center;
  height: 34px;
  margin-bottom: 2px;
  /* 官方思考折叠头是正文色（实测 rgb(249,250,250)），不是灰色 */
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  user-select: none;
  transition: color 0.2s;
}

.dsa-area-title:hover {
  color: var(--dsw-alias-label-primary);
}

.dsa-area-icon {
  display: flex;
  margin-right: 6px;
  color: var(--dsa-brand);
}

.dsa-area-icon[data-stopped='true'] {
  color: var(--dsw-alias-label-tertiary);
}

.dsa-area-text {
  margin-right: 6px;
  font-size: 16px;
  line-height: 28px;
}

.dsa-shimmer {
  color: transparent;
  background: linear-gradient(
      90deg,
      var(--dsw-alias-label-secondary) 0%,
      var(--dsw-alias-label-secondary) 40%,
      var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary)) 50%,
      var(--dsw-alias-label-secondary) 60%,
      var(--dsw-alias-label-secondary) 100%
    )
    0 0 / 300% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  animation: dsa-shimmer 2s ease-out infinite;
}

@keyframes dsa-shimmer {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: 0 0;
  }
}

.dsa-step-content {
  position: relative;
  padding: 5px 0 5px 22px;
}

.dsa-step-content::after,
.dsa-step-row[data-line='true']::after {
  content: '';
  position: absolute;
  left: 7.5px;
  top: 31px;
  width: 1px;
  height: calc(100% - 24px);
  background: var(--dsw-alias-label-dimmed, var(--dsw-alias-border-l2));
}

.dsa-step-content[data-last='true'] {
  padding-bottom: 0;
}

.dsa-step-content[data-last='true']::after {
  height: calc(100% - 32px);
}

.dsa-step-dot {
  position: absolute;
  top: 9px;
  left: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.dsa-step-dot-inner {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dsa-brand);
  animation: dsa-pulse 1.5s linear infinite;
}

.dsa-step-dot-inner[data-inactive='true'] {
  animation: none;
  background: var(--dsw-alias-label-tertiary);
}

@keyframes dsa-pulse {
  0% {
    transform: scale(1);
    animation-timing-function: ease-out;
  }
  40% {
    transform: scale(1.3);
    animation-timing-function: linear;
  }
  60% {
    transform: scale(1.3);
    animation-timing-function: ease-out;
  }
  100% {
    transform: scale(1);
  }
}

.dsa-step-row {
  position: relative;
  display: flex;
  align-items: center;
  max-width: 100%;
  height: 34px;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  line-height: 24px;
}

.dsa-step-row[data-clickable='true'] {
  width: fit-content;
  cursor: pointer;
}

.dsa-step-row[data-clickable='true']::before,
.dsa-step-row[data-active='true']::before {
  content: '';
  position: absolute;
  z-index: -1;
  left: -10px;
  width: calc(100% + 20px);
  height: calc(100% - 6px);
  border-radius: 100px;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s;
}

.dsa-step-row[data-clickable='true']::before {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsa-step-row[data-clickable='true']:hover::before {
  opacity: 1;
}

.dsa-step-row[data-active='true']::before {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-alias-interactive-bg-hover));
  opacity: 1;
}

.dsa-row-icon {
  display: flex;
  flex-shrink: 0;
  margin-right: 6px;
  padding: 1px;
}

.dsa-row-icon svg {
  width: 14px;
  height: 14px;
}

.dsa-step-row .dsa-row-svg svg {
  width: 16px;
  height: 16px;
}

.dsa-step-intro,
.dsa-step-summary {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.dsa-step-query {
  margin-left: 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  animation: dsa-fade-in 0.3s ease-in;
}

@keyframes dsa-fade-in {
  from {
    opacity: 0;
  }
}

.dsa-site-thumbs {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.dsa-site-thumb {
  width: 16px;
  height: 16px;
  margin-left: -4px;
  border-radius: 50%;
  border: 1px solid var(--dsw-alias-bg-base);
  background: var(--dsw-alias-bg-layer-2);
  object-fit: contain;
}

.dsa-site-thumb:first-child {
  margin-left: 0;
}

.dsa-tool-row {
  position: relative;
  display: flex;
  max-width: 100%;
  padding: 5px 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  line-height: 24px;
}

.dsa-tool-icon {
  margin-top: 4px;
}

.dsa-tool-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  row-gap: 6px;
  width: calc(100% - 30px);
  overflow: hidden;
}

.dsa-tool-intro {
  display: inline-block;
  margin-right: 6px;
  font-variant-numeric: tabular-nums;
}

.dsa-page {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin-right: 6px;
  white-space: nowrap;
}

.dsa-page-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 20px;
  text-decoration: underline dotted var(--dsw-alias-label-caption, var(--dsw-alias-border-l3));
  text-underline-offset: 4px;
  color: var(--dsw-alias-label-secondary);
}

a.dsa-page-text:hover {
  color: var(--dsw-alias-label-primary);
  text-decoration-color: var(--dsw-alias-label-tertiary);
}

.dsa-page[data-failed='true'] .dsa-page-text {
  cursor: not-allowed;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
}

.dsa-page-icon {
  position: relative;
  bottom: 1px;
  display: flex;
}

.dsa-chip {
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  min-width: 0;
  max-width: 540px;
  height: 20px;
  margin-right: 4px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-markdown-tag, var(--dsw-alias-bg-layer-2));
}

.dsa-chip[data-failed='true'] {
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
}

.dsa-chip-icon {
  display: flex;
  margin-right: 2px;
}

.dsa-chip-icon svg {
  width: 12px;
  height: 12px;
}

.dsa-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------------- 来源面板 ---------------- */

/*
 * 会话顶部标题行（有消息时才有）。
 *
 * 官方实测（视口 1603）：容器高 60px、左内距 18px、
 * 标题块 padding 8px 12px / 14px 500 / 圆角 22px，
 * 右侧分享按钮 34×34 全圆角靠右（x=1164）。
 * 它和消息列同在 .dsa-main-column，右栏打开时一起被挤压。
 */
.dsa-session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  box-sizing: border-box;
  height: 60px;
  padding: 0 18px;
}

.dsa-session-header-title {
  min-width: 0;
  overflow: hidden;
  padding: 8px 12px;
  border-radius: 22px;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dsa-session-header-share {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color var(--dsa-duration) var(--dsa-ease),
    color var(--dsa-duration) var(--dsa-ease);
}

.dsa-session-header-share:hover {
  background: var(--dsa-nav-hover);
  color: var(--dsw-alias-label-primary);
}

/*
 * 消息栏：竖向容纳「可滚动的消息区 + 吸底输入栏」。
 *
 * 这一层是右栏挤压能成立的前提：composer 与 .dsa-scroll 都在它里面，
 * 右栏一占宽度，整条竖栏变窄，居中的 composer 与消息列同步左移。
 * 早先把 composer 直接挂在 .dsa-body 下（与 .dsa-scroll 平级且不包一层），
 * 面板挤压时 composer 不动、消息列变窄，两者轴线错开。
 */
.dsa-main-column {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/*
 * 来源面板：右侧第三栏，参与 flex 挤压（不是浮层）。
 *
 * 官方实测（视口 1603，面板关闭 → 打开）：
 *   可用区宽 1254 → 864（少 390，正好是面板宽）
 *   消息列 x 556 → 361、输入栏 x 545 → 350，均左移 195 = 390/2
 * 即三栏布局：右栏推走会话栏右边缘，居中内容随之位移。
 */
.dsa-source-panel {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  width: 390px;
  max-width: 45%;
  min-height: 0;
  border-left: 1px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
}

.dsa-source-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 60px;
  padding: 0 14px 0 20px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
}

.dsa-source-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
}

.dsa-source-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
  scrollbar-color: var(--dsa-scroll) transparent;
}

.dsa-source-item {
  display: block;
  margin-bottom: 6px;
  padding: 12px;
  border-radius: 12px;
  color: inherit;
  text-decoration: none;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-source-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

/*
 * 搜索条目卡片，规格取自官方 .search-view-card（暗色实测）：
 *   卡片 padding 12px / radius 12px
 *   meta 行 13px/20px、gap 6px、padding-top 2px、字重 400（我原先写成 500）
 *   站点图标 18×18、圆形（50%，我原先 4px 圆角）、底色 #353638
 *   分隔竖线 1×12、rgba(255,255,255,.16)
 *   标题 14px/500/22px、最多 2 行
 *   摘要 13px/400/20px、label-tertiary、最多 2 行
 */
.dsa-source-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 2px;
  font-size: 13px;
  line-height: 20px;
  font-weight: 400;
}

.dsa-source-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  /* 官方站点图标是正圆，不是圆角方块 */
  border-radius: 50%;
  background: var(--dsa-site-icon-bg);
  object-fit: cover;
  overflow: hidden;
}

.dsa-source-site {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-tertiary);
}

.dsa-source-divider {
  width: 1px;
  height: 12px;
  margin: 0 3px;
  background: var(--dsw-alias-border-l3);
}

.dsa-source-date {
  flex-shrink: 0;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}

.dsa-source-index {
  flex-shrink: 0;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--dsw-alias-markdown-tag, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.dsa-source-headline {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.dsa-source-snippet {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

/* ---------------- 输入区 ---------------- */

/* 输入区与消息列共轴：官方（对话页实测）composer 与消息正文共用同一个 840px 内容区，
   composer 盒比正文宽 24px（两侧各 12px）。
   所以宽度上限用 776px（752 + 2*12），与正文同轴心——
   早先独立设 660px 并单独居中，和消息列错开，观感是「输入框比消息窄一截还偏了」。 */
.dsa-composer-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 100%;
  /* 左右不再留内距：留了会让 composer 的可用宽度比 .dsa-column 少 32px，
     右栏挤压时两者收缩节奏不同，位移差 2px（实测 -187 vs -185）。
     composer 自身宽度已经用 calc 控制，这里加内距纯属叠加。 */
  padding: 0;
  background: var(--dsw-alias-bg-base);
}

/* 空态里嵌在欢迎区的这份：不吸底（在滚动流里跟着居中块走）、无背景分层 */
.dsa-scroll-empty .dsa-composer-wrap {
  background: transparent;
}

.dsa-composer-inner {
  /* 不再额外收窄：宽度由 .dsa-composer 自己的 calc 决定，
     这里再减 64px 会让空态与消息态宽度不同，也会破坏挤压时的位移一致性 */
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
}

.dsa-composer {
  display: flex;
  flex-direction: column;
  /*
   * 宽度锚定与 .dsa-column 同一套容器标尺（--dsa-list-max / --dsa-list-padding），
   * 只多出两侧各 12px：官方 composer 776、消息列 752，两者同轴心（实测）。
   *
   * 为什么不用 max-width:776 各管各的：右栏挤压时容器变窄，
   * 两个「各自居中 + 各自上限」的盒子收窄节奏不同，
   * 实测位移差了 2px（输入栏 -187、消息列 -185），轴线就错开了。
   * 用同一个 calc 表达式，两者减掉的宽度永远相同。
   *
   * margin auto 不能省：父级是 align-items:center 的 flex 列，
   * 但 composer 宽度可能触到 max-width，必须显式居中才不会贴左。
   */
  width: calc(var(--dsa-list-max) - 2 * var(--dsa-list-padding) + 24px);
  max-width: calc(100% - 16px);
  margin-left: auto;
  margin-right: auto;
  border-radius: 24px;
  border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, var(--dsw-alias-border-l2));
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-layer-1));
  overflow: hidden;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.02), 0 2px 4px rgba(0, 0, 0, 0.04);
  cursor: text;
}

.dsa-composer[data-home='true'] {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02), 0 2px 2px rgba(72, 104, 178, 0.01),
    0 30px 60px rgba(72, 104, 178, 0.03);
}

.dsa-root[data-dsa-dark='true'] .dsa-composer[data-home='true'] {
  box-shadow: none;
}

.dsa-attachments {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 12px 12px 0;
  overflow-x: auto;
  cursor: default;
}

.dsa-attachment {
  position: relative;
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  overflow: hidden;
  background: var(--dsw-alias-bg-skeleton, var(--dsw-alias-bg-layer-2));
}

.dsa-attachment img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dsa-attachment-name {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 4px;
  font-size: 11px;
  line-height: 14px;
  text-align: center;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  overflow-wrap: anywhere;
}

.dsa-attachment-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: var(--dsw-alias-label-primary-inverted, #fff);
  background: var(--dsw-alias-button-contrast-fill, rgba(0, 0, 0, 0.5));
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--dsa-duration) var(--dsa-ease);
}

.dsa-attachment:hover .dsa-attachment-remove {
  opacity: 1;
}

.dsa-attachment-busy {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
}

.dsa-attachment-busy::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 16px;
  height: 16px;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  animation: dsa-spin 0.8s linear infinite;
}

@keyframes dsa-spin {
  to {
    transform: rotate(360deg);
  }
}

.dsa-textarea-wrap {
  position: relative;
  width: 100%;
}

.dsa-textarea,
.dsa-textarea-mirror {
  display: block;
  width: 100%;
  min-height: 60px;
  margin: 0;
  padding: 12px 12px 0 16px;
  border: none;
  font: inherit;
  font-size: 16px;
  line-height: 24px;
  word-break: break-word;
  white-space: pre-wrap;
  overflow: auto;
}

.dsa-textarea {
  position: absolute;
  height: 100%;
  resize: none;
  outline: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  caret-color: var(--dsa-brand);
}

.dsa-textarea::placeholder {
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  user-select: none;
}

.dsa-textarea-mirror {
  visibility: hidden;
  pointer-events: none;
  max-height: 336px;
}

.dsa-function-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  padding: 10px 12px;
}

.dsa-toggles {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dsa-toggle {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 34px;
  padding: 0 12px;
  border-radius: 18px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  /* 官方开关文字 13px/500、行高 24px（实测 ds-toggle-button），图标 14px */
  line-height: 24px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s, border-color 0.2s;
}

.dsa-toggle:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

/* 选中态：官方用 ghost-active 系列——
   背景 --dsw-alias-button-ghost-active-fill (#283142)、
   边框 --dsw-alias-button-ghost-active-border (#4868b2)、
   文字 --dsw-alias-brand-text (#679efe)。
   早先自造 rgba 蓝，与官方的两档深浅对不上。 */
.dsa-toggle[data-selected='true'] {
  background: var(--dsw-alias-button-ghost-active-fill, var(--dsa-brand-soft));
  color: var(--dsw-alias-brand-text, var(--dsa-brand));
  border-color: var(--dsw-alias-button-ghost-active-border, var(--dsa-brand));
}

.dsa-toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dsa-composer-right {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

/* 录音中的按钮：外圈光晕呼吸、内圈实心、图标转白（对齐官方 VoiceButton） */
.dsa-mic-active {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  outline: none;
}

.dsa-mic-halo {
  position: absolute;
  inset: 4px;
  border-radius: 50%;
  background: var(--dsa-brand);
  opacity: 0.2;
  animation: dsa-halo-enter 0.15s ease-out both, dsa-halo-breath 1.8s ease-in-out 0.15s infinite;
}

.dsa-mic-core {
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--dsa-brand);
  opacity: 0.75;
  animation: dsa-core-enter 0.2s ease-out 0.14s both;
}

.dsa-mic-glyph {
  position: relative;
  display: flex;
  color: #fff;
  animation: dsa-fade-in 0.1s ease-out 0.26s both;
}

@keyframes dsa-halo-enter {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 0.2; }
}

@keyframes dsa-halo-breath {
  0%, 100% { scale: 1; }
  50% { scale: 1.1; }
}

@keyframes dsa-core-enter {
  from { transform: scale(0.6); opacity: 0; }
  to { transform: scale(1); opacity: 0.75; }
}

@keyframes dsa-fade-in {
  from { opacity: 0; }
}

/* 转写中转圈 */
.dsa-transcribing {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--dsw-alias-border-l2);
  border-top-color: var(--dsw-alias-label-tertiary);
  animation: dsa-spin 0.8s linear infinite;
}
.dsa-send {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  margin-left: 6px;
  padding: 0;
  border: none;
  border-radius: 50%;
  /* 官方发送钮（ds-button--primary）背景是品牌蓝 #5686fe，白图标。
     宿主的 --dsw-alias-button-primary-fill 在暗色下是 #f9fafb（近白）——
     白按钮压在深灰输入区里直接消失，必须钉成品牌蓝。 */
  background: var(--dsa-brand);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s ease;
}

.dsa-send:hover:not(:disabled) {
  background: var(--dsa-brand-hover);
}

/* 官方禁用态是同色蓝 + opacity 0.4（实测 ds-button--primary），
   不是换灰色——换灰会让「可发送时变蓝、禁用时变灰」出现色相跳变。 */
.dsa-send:disabled {
  background: var(--dsa-brand);
  opacity: 0.4;
  cursor: not-allowed;
}

.dsa-send[data-mode='stop'] {
  background: var(--dsw-alias-button-contrast-fill, var(--dsw-alias-label-secondary));
}

.dsa-caveat {
  width: 100%;
  padding: 6px 0;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
  color: var(--dsw-alias-label-tertiary);
  user-select: none;
}

/* 官方空态没有免责声明（有消息后它才贴在 composer 下方）。
   data-home 由 Composer 在空会话时标在 wrap 上。 */
.dsa-composer-wrap[data-home='true'] .dsa-caveat {
  display: none;
}

/* 录音频谱：覆盖输入框正文区，纵向居中，与官方 chat-demo 一致 */
.dsa-spectrum {
  position: absolute;
  top: 50%;
  translate: 0 -50%;
  left: 16px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 36px;
  opacity: 0.85;
  pointer-events: none;
}

.dsa-spectrum-bar {
  flex-shrink: 0;
  width: 2px;
  height: 5px;
  border-radius: 1px;
  background: var(--dsw-alias-button-info-hover, var(--dsw-alias-brand-primary));
  transform-origin: center;
  will-change: transform;
}

.dsa-recording-tip {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  text-align: center;
  pointer-events: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  white-space: nowrap;
}

/* ---------------- 设置弹窗 ---------------- */

.dsa-overlay {
  position: absolute;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  /* 官方遮罩用 --dsw-alias-bg-mask-1：浅色 rgba(0,0,0,.24)、暗色 rgba(0,0,0,.5)。
     早先写死 0.4，浅色下偏黑、暗色下偏淡，两头都不对。 */
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4));
}

.dsa-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 880px;
  height: min(640px, 100%);
  /* 官方弹窗圆角 --dsl-modal-content-border-radius: 24px */
  border-radius: 24px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  box-shadow: var(--dsw-shadow-lv3, 0 0 1px rgba(0, 0, 0, 0.2), 0 12px 32px rgba(0, 0, 0, 0.16));
  overflow: hidden;
}

.dsa-dialog-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 56px;
  padding: 0 12px 0 24px;
}

.dsa-dialog-title {
  flex: 1;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

/* 官方设置是左右分栏：左列分区导航（约 200px），右列内容，中间一条分隔线 */
.dsa-dialog-layout {
  display: flex;
  flex: 1;
  min-height: 0;
}

.dsa-dialog-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  width: 200px;
  padding: 0 12px 20px;
  overflow-y: auto;
}

.dsa-dialog-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  outline: none;
}

.dsa-dialog-nav-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsa-dialog-nav-item[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.dsa-dialog-nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
}

.dsa-dialog-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 4px 24px 24px;
  overflow-y: auto;
}

/* 设置里的横向条目：左标题右控件，对齐官方的「键 - 值」行 */
.dsa-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dsa-row-main {
  flex: 1;
  min-width: 0;
}

.dsa-row-title {
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}

.dsa-row-desc {
  margin-top: 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.dsa-row-value {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--dsw-alias-label-secondary);
}

.dsa-about p {
  margin: 0 0 14px;
  font-size: 14px;
  line-height: 24px;
  color: var(--dsw-alias-label-secondary);
}

.dsa-field {
  margin-bottom: 20px;
}

.dsa-field:last-child {
  margin-bottom: 0;
}

.dsa-field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.dsa-input {
  display: block;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: 10px;
  background: var(--dsw-specific-input-major, var(--dsw-alias-bg-base));
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  outline: none;
}

.dsa-input:focus {
  border-color: var(--dsa-brand);
}

.dsa-hint {
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* 提示后紧跟下一个字段时要有间隔。
   字段本身只有 margin-bottom，前一个字段的提示会把后面的标签顶到零间距
   （实测「搜索代理」标签与上一行提示间距 0，两行字贴在一起）。 */
.dsa-hint + .dsa-field,
.dsa-hint + .dsa-field-label {
  margin-top: 16px;
}

.dsa-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-skeleton));
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

.dsa-status[data-tone='ok'] {
  color: var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary));
}

.dsa-status[data-tone='error'] {
  color: var(--dsw-alias-state-error-primary);
}

.dsa-dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 18px;
}

.dsa-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  padding: 0 16px;
  border-radius: 100px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.dsa-button:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

/*
 * 主按钮。颜色不能取 --dsw-alias-button-primary-fill：宿主在暗色主题下把它
 * 改成近白色 rgb(249,250,251)，而这里文字是白的——按钮会变成一块纯白、
 * 文字完全看不见（截图中「保存」就是这个症状）。
 * 品牌蓝 --dsa-brand 是插件自己钉住的（暗色是提亮过的 450 档），填色安全。
 */
.dsa-button[data-variant='primary'] {
  border-color: transparent;
  background: var(--dsa-brand);
  color: #fff;
}

.dsa-button[data-variant='primary']:hover:not(:disabled) {
  background: var(--dsa-brand-hover);
}

/* 危险操作：删除类按钮用红色描边，与官方「删除所有对话」一致 */
.dsa-button[data-variant='danger'] {
  border-color: var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}

.dsa-button[data-variant='danger']:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);
}

.dsa-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ---------------- 搜索对话 ---------------- */

.dsa-search-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: min(520px, 100%);
  /* 与设置弹窗同一档：官方 --dsl-modal-content-border-radius: 24px */
  border-radius: 24px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  box-shadow: var(--dsw-shadow-lv3, 0 0 1px rgba(0, 0, 0, 0.2), 0 12px 32px rgba(0, 0, 0, 0.16));
  overflow: hidden;
}

.dsa-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  height: 56px;
  padding: 0 18px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}

.dsa-search-field-icon {
  display: flex;
  flex-shrink: 0;
  color: var(--dsw-alias-label-tertiary);
}

.dsa-search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: none;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 15px;
  outline: none;
}

.dsa-search-results {
  flex: 1;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
}

.dsa-search-result {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.dsa-search-result:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsa-search-result-title {
  display: block;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* ---------------- 底部用户菜单 ---------------- */

.dsa-user-menu {
  position: absolute;
  left: 4px;
  bottom: calc(100% + 6px);
  z-index: 30;
  min-width: 180px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.dsa-user-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 38px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.dsa-user-menu-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsa-user-menu-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--dsw-alias-label-secondary);
}



/* ---------------- 提示 ---------------- */

.dsa-toast {
  position: absolute;
  left: 50%;
  bottom: 96px;
  z-index: 950;
  max-width: min(560px, calc(100% - 48px));
  padding: 10px 16px;
  /* 官方 --dsl-toast-border-radius: 12px */
  border-radius: 12px;
  background: var(--dsw-alias-toast-bg, var(--dsw-alias-label-primary));
  color: var(--dsw-alias-label-primary-foreground, #fff);
  font-size: 13px;
  line-height: 20px;
  transform: translateX(-50%);
  animation: dsa-toast-in 0.18s var(--dsa-ease);
}

@keyframes dsa-toast-in {
  from {
    opacity: 0;
    transform: translate(-50%, 6px);
  }
}

/* ---------------- Markdown ---------------- */

.ds-md {
  font-size: 16px;
  line-height: 28px;
  color: var(--dsw-alias-label-primary);
  overflow-wrap: anywhere;
}

.ds-md > :first-child {
  margin-top: 0;
}

.ds-md > :last-child {
  margin-bottom: 0;
}

.ds-md-p {
  margin: 0 0 12px;
}

.ds-md-h1,
.ds-md-h2,
.ds-md-h3,
.ds-md-h4,
.ds-md-h5,
.ds-md-h6 {
  margin: 20px 0 10px;
  font-weight: 700;
  line-height: 1.4;
}

.ds-md-h1 {
  font-size: 24px;
}

.ds-md-h2 {
  font-size: 22px;
}

.ds-md-h3 {
  font-size: 20px;
}

.ds-md-h4 {
  font-size: 17px;
  font-weight: 600;
}

.ds-md-h5,
.ds-md-h6 {
  font-size: 16px;
  font-weight: 600;
}

.ds-md-ul,
.ds-md-ol {
  margin: 0 0 12px;
  padding-left: 26px;
}

.ds-md-ul {
  list-style: disc;
}

.ds-md-ol {
  list-style: decimal;
}

.ds-md-li {
  margin: 4px 0;
}

.ds-md-li > .ds-md-ul,
.ds-md-li > .ds-md-ol {
  margin: 4px 0 0;
}

.ds-md-quote {
  margin: 0 0 12px;
  padding: 2px 0 2px 14px;
  border-left: 3px solid var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-secondary);
}

.ds-md-hr {
  height: 1px;
  margin: 20px 0;
  border: none;
  background: var(--dsw-alias-border-l2);
}

.ds-md-link {
  color: var(--dsa-brand);
  text-decoration: none;
  text-underline-offset: 3px;
}

.ds-md-link:hover {
  text-decoration: underline;
}

.ds-md-image {
  max-width: 100%;
  border-radius: 10px;
}

.ds-md-code {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--dsw-alias-markdown-inline-code, var(--dsw-alias-bg-layer-2));
  font-family: var(--dsa-font-code);
  font-size: 0.875em;
}

/*
 * 代码块，规格取自官方 .md-code-block（暗色实测）：
 *   外层 radius 12px、背景 #1b1b1c、margin 16px 0 11px、无边框
 *   banner 高 40px、背景 #2c2c2e、上方 12px 圆角、无分隔线、内距 6px
 *   pre padding 16px
 * 我原先加了 1px 边框、banner 只有 30px 且有 border-bottom、按钮 24px/6px 圆角，
 * 三处都不对：官方是无边框 + 明显的深浅两层底色对比。
 */
.ds-md-code-block {
  position: relative;
  margin: 16px 0 11px;
  border-radius: 12px;
  background: var(--dsa-code-block-bg);
  overflow: hidden;
}

/*
 * 代码块标题栏：左侧语言名，右侧「复制 / 下载」。
 * 没有语言名时也保留这条 bar，否则按钮无处安放。
 * 官方 .md-code-block-banner 是 flex + space-between + align-items:center、padding 6px。
 */
.ds-md-code-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-sizing: border-box;
  height: 40px;
  padding: 6px;
  border-radius: 12px 12px 0 0;
  background: var(--dsa-code-banner-bg);
}

/* 官方语言名 12px、label-primary、等宽字体 */
.ds-md-code-lang {
  min-width: 0;
  padding-left: 6px;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsa-font-code);
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.ds-md-code-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* 官方按钮：高 28px、padding 0 10px、gap 3px、13px、全圆角（capsule） */
.ds-md-code-copy {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex-shrink: 0;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 4096px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  /* 不能用 font: inherit——简写会把 font-size 一起重置成继承值，
     后面的 13px 被它覆盖（实测仍显示 16px）。逐项写。 */
  font-family: inherit;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--dsa-duration) var(--dsa-ease),
    color var(--dsa-duration) var(--dsa-ease);
}

.ds-md-code-copy svg {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

/*
 * 文字在子元素里，字号必须下放到这一层。
 * 按钮自身的 font-size 管不到 span——span 会从按钮继承，但消息层级的
 * 字号规则（.ds-md 的 16px）会先胜出，实测按钮仍显示 16px。
 */
.ds-md-code-copy-label {
  font-size: 13px;
  line-height: 1;
}

.ds-md-code-copy:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

.ds-md-code-copy[data-copied] {
  color: var(--dsw-alias-brand-text);
}

/*
 * 代码块语法高亮配色。
 *
 * 取值全部来自官方 chat.deepseek.com 的 .md-code-block（暗色实测，逐 token 采样）：
 *   punctuation  rgb(227,234,242)  property rgb(108,184,230)
 *   operator     rgb(233,174,126)  string   rgb(145,208,118)
 *   boolean      rgb(230,211,122)
 * 官方 token 类名与 Prism 完全一致，所以这组规则能原样套用。
 *
 * 官方只对上面五类有独立配色，其余（keyword / number / comment 等）沿用正文前景色，
 * 这里保持同样克制：不自行扩展配色，避免五颜六色偏离官方观感。
 */
.ds-md-code-block .token.punctuation {
  color: rgb(227, 234, 242);
}

.ds-md-code-block .token.property {
  color: rgb(108, 184, 230);
}

.ds-md-code-block .token.operator {
  color: rgb(233, 174, 126);
}

.ds-md-code-block .token.string {
  color: rgb(145, 208, 118);
}

.ds-md-code-block .token.boolean {
  color: rgb(230, 211, 122);
}

/* 注释压暗一档，否则与正文同亮会抢读（官方未单独配色，这里取 label-tertiary） */
.ds-md-code-block .token.comment {
  color: var(--dsw-alias-label-tertiary);
  font-style: normal;
}

.ds-md-code-copy:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}

.ds-md-code-block pre {
  margin: 0;
  /* 官方 pre 内距 16px（实测），比原先的 12px 更舒展 */
  padding: 16px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.ds-md-code-block code {
  font-family: var(--dsa-font-code);
  font-size: 13px;
  line-height: 22px;
  white-space: pre;
}

/* 引用预览卡：悬停角标 300ms 后出现，替代「点开侧栏才能看来源」。
   用 fixed 定位是因为消息区是滚动容器，absolute 会被 overflow 裁掉。 */
.dsa-citation-card {
  position: fixed;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 24px));
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 20px;
}

.dsa-citation-card-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.dsa-citation-card-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  border-radius: 50%;
  background: var(--dsa-brand);
  /* 底色是品牌蓝，文字必须显式取白：--dsw-alias-label-primary-inverted 的语义是
     「配浅色底的深色字」，深色主题下它是深灰，压在蓝底上对比度不够。 */
  color: #fff;
  font-size: 11px;
  line-height: 18px;
}

.dsa-citation-card-meta {
  min-width: 0;
  flex: 1;
}

.dsa-citation-card-title {
  display: -webkit-box;
  overflow: hidden;
  font-weight: 500;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.dsa-citation-card-host {
  margin-top: 2px;
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dsa-citation-card-snippet {
  display: -webkit-box;
  overflow: hidden;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.dsa-citation-card-open {
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-brand-text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background-color var(--dsa-duration) var(--dsa-ease);
}

.dsa-citation-card-open:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.ds-md-table-wrap {
  margin: 0 0 12px;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: thin;
}

.ds-md-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 15px;
  line-height: 25px;
}

.ds-md-table th,
.ds-md-table td {
  padding: 8px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  text-align: left;
}

.ds-md-table th {
  font-weight: 500;
  background: var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-skeleton));
}

/* 引用角标 */
.ds-md-citation {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  margin: 0 2px;
  padding: 0 4px;
  border: none;
  border-radius: 5px;
  background: var(--dsw-alias-markdown-citation, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 17px;
  font-weight: 500;
  vertical-align: 1px;
  cursor: pointer;
}

.ds-md-citation:hover {
  background: var(--dsw-alias-interactive-bg-hover-accent, var(--dsw-alias-border-l2));
  color: var(--dsw-alias-label-primary);
}

.ds-md-loading::after {
  content: '';
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--dsa-brand);
  animation: dsa-caret 1s steps(2) infinite;
}

@keyframes dsa-caret {
  50% {
    opacity: 0;
  }
}

/* 思考区的 Markdown 用更小的字号与更淡的颜色 */
.dsa-step-content .ds-md {
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-secondary);
}

.dsa-step-content .ds-md-code-block code {
  font-size: 12px;
  line-height: 20px;
}

/* ---------------- 桌面端折叠态（对齐官方「收起边栏」） ----------------
   折叠后侧栏滑出（margin-left 动画，见 .dsa-sider 的过渡声明）；
   主区左上由 .dsa-collapsed-bar 提供入口。展开态主区没有任何常驻工具条。 */

.dsa-root[data-dsa-collapsed='true'] .dsa-sider {
  margin-left: -261px;
  opacity: 0;
  pointer-events: none;
  /* 位移结束后再隐藏，避免半程时内容露在折叠条下面 */
  visibility: hidden;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), visibility 0s 0.3s;
}

/* 折叠态没有侧栏，内容列用整幅宽度重新居中（官方折叠后正文居中于剩余空间）。
   不改 padding-top：折叠条是 fixed 定位不占布局，52px 在两个态下都够用——
   折叠瞬间改 padding 会让居中的 composer 纵向瞬跳（实测 +32px 下移），
   官方交互只有左平移。max-width 的变化由下方 transition 平滑。 */
.dsa-root[data-dsa-collapsed='true'] .dsa-column,
.dsa-root[data-dsa-collapsed='true'] .dsa-welcome-inner {
  max-width: 840px;
}

/* 内容列宽度跟随侧栏折叠平滑过渡（与 .dsa-sider 的 margin 同曲线同时长），
   让居中重算连续进行，不再有竖直方向的瞬跳。 */
.dsa-column,
.dsa-welcome-inner {
  transition: max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ---------------- 移动端（< 768px，与官方断点一致） ----------------
   窄屏不再隐藏侧栏，而是把它变成抽屉：顶栏菜单按钮打开，
   点遮罩或选中会话后关闭。直接 display:none 会让手机上没有切换会话的入口。 */

.dsa-root[data-dsa-mobile='true'] .dsa-sider {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 800;
  width: 300px;
  max-width: calc(100vw - 48px);
  border-right: 1px solid var(--dsw-alias-border-l1);
  box-shadow: 0 0 24px rgba(0, 0, 0, 0.16);
  /* 收起时移出屏幕并隐藏，避免抽屉边缘露在左侧 */
  transform: translateX(-100%);
  visibility: hidden;
  transition: transform 0.22s var(--dsa-ease), visibility 0.22s var(--dsa-ease);
}

.dsa-root[data-dsa-mobile='true'][data-dsa-drawer='true'] .dsa-sider {
  transform: translateX(0);
  visibility: visible;
}

.dsa-drawer-mask {
  position: absolute;
  inset: 0;
  z-index: 799;
  /* 与设置弹窗同一个遮罩令牌，避免两处深浅不一 */
  background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.4));
  animation: dsa-mask-in 0.22s var(--dsa-ease);
}

@keyframes dsa-mask-in {
  from {
    opacity: 0;
  }
}

/* 抽屉内的会话列表要能自己滚，否则会话多了会顶出屏幕 */
.dsa-root[data-dsa-mobile='true'] .dsa-session-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* 移动端工具条：贴左并缩小留白，避免在小屏上占掉太多首屏 */
.dsa-root[data-dsa-mobile='true'] .dsa-toolbar {
  top: 8px;
  left: 10px;
  gap: 0;
  padding: 3px;
}

.dsa-root[data-dsa-mobile='true'] .dsa-toolbar-button {
  width: 34px;
  height: 34px;
}

.dsa-root[data-dsa-mobile='true'] .dsa-icon-button {
  width: 38px;
  height: 38px;
}

/* 移动端设置弹窗：官方在小屏上是整屏铺开，左右分栏改为上下 */
.dsa-root[data-dsa-mobile='true'] .dsa-dialog {
  max-width: 100%;
  height: 100%;
  border-radius: 0;
}

.dsa-root[data-dsa-mobile='true'] .dsa-dialog-layout {
  flex-direction: column;
}

.dsa-root[data-dsa-mobile='true'] .dsa-dialog-nav {
  flex-direction: row;
  gap: 4px;
  width: 100%;
  padding: 0 12px 8px;
  /* 四个分区平分宽度而不是横向滚动：
     滚动条在触屏上几乎看不见，超出的那个「服务协议」看起来就是被裁掉了。 */
  overflow: visible;
}

.dsa-root[data-dsa-mobile='true'] .dsa-dialog-nav-item {
  flex: 1 1 0;
  width: auto;
  min-width: 0;
  gap: 6px;
  padding: 0 6px;
  font-size: 13px;
  white-space: nowrap;
}

/* 窄屏下图标让位给文字：四个分区平分后每格只剩百来像素，图标会把字挤掉 */
.dsa-root[data-dsa-mobile='true'] .dsa-dialog-nav-icon {
  display: none;
}

.dsa-root[data-dsa-mobile='true'] .dsa-dialog-body {
  padding: 8px 16px 24px;
}

/* 移动端留白收紧，正文可读宽度优先 */
.dsa-root[data-dsa-mobile='true'] {
  --dsa-list-padding: 16px;
  --dsa-list-max: 100%;
}

.dsa-root[data-dsa-mobile='true'] .dsa-greeting {
  gap: 8px;
  font-size: 20px;
  line-height: 28px;
}

.dsa-root[data-dsa-mobile='true'] .dsa-greeting-mark svg {
  width: 26px;
  height: auto;
}

/* 触摸设备上悬停不可用：消息操作栏常显，否则手机上永远点不到复制/朗读 */
@media (hover: none) {
  .dsa-assistant-actions {
    opacity: 1;
  }

  .dsa-user-actions {
    opacity: 1;
  }

  .dsa-session-action {
    width: auto;
    opacity: 1;
  }
}

/* 移动端输入区：工具行放不下时换行，而不是让按钮互相压住。
   390px 宽下两个开关各约 102px，加上右侧三个图标必然超出，
   不换行会出现「智能搜索」压在麦克风上的重叠（实测重叠 68px）。 */
.dsa-root[data-dsa-mobile='true'] .dsa-function-row {
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
}

.dsa-root[data-dsa-mobile='true'] .dsa-toggles {
  flex: 1 1 100%;
  min-width: 0;
  gap: 8px;
}

.dsa-root[data-dsa-mobile='true'] .dsa-toggle {
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}

/* 开关文字在窄屏可能被截断，允许省略号而不是撑破 */
.dsa-root[data-dsa-mobile='true'] .dsa-toggle span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dsa-root[data-dsa-mobile='true'] .dsa-composer-right {
  margin-left: auto;
}

/* 移动端输入框：字号不小于 16px，否则 iOS 聚焦时会自动放大页面 */
.dsa-root[data-dsa-mobile='true'] .dsa-textarea,
.dsa-root[data-dsa-mobile='true'] .dsa-textarea-mirror {
  font-size: 16px;
}

/* 移动端输入框：外层 .dsa-composer-wrap 已经有 16px 左右留白，
   这里不要再加 margin，否则左右会叠成 56/40 的不对称。 */
.dsa-root[data-dsa-mobile='true'] .dsa-composer {
  margin: 0 0 8px;
}

/* 移动端正文：左右留白收紧但对称，避免角标贴边把句号挤到下一行 */
.dsa-root[data-dsa-mobile='true'] .dsa-column {
  padding-left: 16px;
  padding-right: 16px;
}

/* 移动端版本切换器：箭头与数字间距收紧，别占掉半行 */
.dsa-root[data-dsa-mobile='true'] .dsa-version-switcher {
  gap: 0;
}

.dsa-root[data-dsa-mobile='true'] .dsa-version-arrow {
  width: 20px;
}

/* 窄屏：宿主右栏或窗口过窄时压缩 */

@media (max-width: 860px) {
  .dsa-root {
    --dsa-list-padding: 28px;
  }

  .dsa-sider {
    width: 220px;
  }
}

@media (max-width: 720px) {
  .dsa-root {
    --dsa-list-padding: 20px;
  }

  .dsa-sider {
    width: 200px;
  }
}

/* 640px 以下不再隐藏侧栏——移动端靠抽屉提供入口（见上方 data-dsa-mobile 规则） */
@media (max-width: 640px) {
  .dsa-root {
    --dsa-list-padding: 16px;
  }

  .dsa-greeting {
    font-size: 20px;
    line-height: 28px;
    font-weight: 500;
  }

  /* 来源面板改为整屏覆盖 */
  .dsa-source-panel {
    position: absolute;
    inset: 0;
    z-index: 20;
    width: auto;
    max-width: none;
    border-left: none;
  }
}
`

    return { inject: INJECT, apply }
  },
})
