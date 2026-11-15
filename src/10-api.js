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
