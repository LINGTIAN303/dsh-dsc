/**
 * DeepSeek API 代理：浏览器永远拿不到密钥，请求体与响应流在这里转一手。
 * 只暴露本插件需要的路径，不做通用转发。
 */
import { resolveCredential, parseError } from './credential.js'

export { parseError }

/** Anthropic 兼容前缀：Messages 与 Files 都在它下面 */
const anthropicBase = (apiBaseURL) => new URL('/anthropic/v1', apiBaseURL)
/**
 * 独立工具接口前缀：Search / Fetch / OCR / ASR / TTS 都在 /v1/tools 下。
 * 结尾必须带斜杠：new URL('tts', '.../v1/tools') 会把 tools 当文件名替换掉，
 * 拼出 /v1/tts 这种不存在的路径（服务端 404）。
 */
const toolsBase = (apiBaseURL) => new URL('/v1/tools/', apiBaseURL)
/** 上传文件并引用时必带；纯文本对话不带 */
const FILES_BETA = 'files-api-2025-04-14'
/** 官方单个附件上限 100 MiB；multipart 包体略有膨胀，留 1 MiB 余量 */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const UPLOAD_OVERHEAD = 1024 * 1024

const json = (status, value) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

/**
 * 把上游的非 2xx 转成前端可展示的错误。
 * 带上 HTTP 状态与错误码：真实对接时「400」和「401」的处置完全不同，
 * 只给一句 message 会让人无从下手。
 */
const upstreamFailure = async (response) => {
  const text = await response.text().catch(() => '')
  let code = ''
  try {
    const body = JSON.parse(text)
    code = body?.error?.code ?? body?.error?.type ?? ''
  } catch {
    // 非 JSON 错误体
  }
  const detail = parseError(text) || `HTTP ${response.status}`
  const suffix = code && !detail.includes(code) ? `（${code}）` : ''
  return json(response.status, { error: { message: `${detail}${suffix}`, status: response.status } })
}

/**
 * 统一的上游调用。credential 缺省时现取，避免每次请求都读一遍凭据。
 * @param ctx Cordis 上下文
 * @param apiBaseURL 配置里的基础地址
 * @param path 拼在 base 后的路径
 * @param init 额外的 fetch 选项（headers 由这里合并）
 */
async function callUpstream(ctx, apiBaseURL, url, init) {
  const credential = await resolveCredential(ctx, apiBaseURL)
  if (credential === undefined) {
    return { error: json(401, { error: { message: '还没有可用的 DeepSeek 凭据，请在面板设置里填写 API Key', code: 'NO_CREDENTIAL' } }) }
  }
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(credential.headers)) headers.set(name, value)
  const response = await fetch(url, { ...init, headers })
  return { response, credential }
}

/** 校验 Key：GET /models，不产生费用 */
export async function handleVerify(ctx, apiBaseURL, body) {
  const apiKey = typeof body?.apiKey === 'string' && body.apiKey !== '' ? body.apiKey : undefined
  const headers = new Headers()
  if (apiKey === undefined) {
    const credential = await resolveCredential(ctx, apiBaseURL)
    if (credential === undefined) return json(401, { error: { message: '还没有可用的 DeepSeek 凭据' } })
    for (const [name, value] of Object.entries(credential.headers)) headers.set(name, value)
  } else {
    headers.set('x-api-key', apiKey)
  }
  const response = await fetch(new URL('/models', apiBaseURL), { headers, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) return upstreamFailure(response)
  const payload = await response.json().catch(() => ({}))
  const models = Array.isArray(payload?.data)
    ? payload.data.map((item) => ({ id: String(item?.id ?? ''), name: String(item?.name ?? item?.id ?? '') })).filter((item) => item.id)
    : []
  return json(200, { ok: true, models })
}

/**
 * 对话：转发 Messages 请求并原样回传 SSE。
 * 客户端只负责展示内容块，并在此后的请求里把它们原样回传（见官方协议说明）。
 */
export async function handleMessages(ctx, apiBaseURL, request) {
  const body = await request.text()
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    return json(400, { error: { message: '请求体不是合法 JSON' } })
  }
  const hasFile = Array.isArray(parsed?.messages)
    && parsed.messages.some((message) => Array.isArray(message?.content)
      && message.content.some((block) => block?.type === 'image' || block?.type === 'document'))
  const result = await callUpstream(ctx, apiBaseURL, new URL('messages', anthropicBase(apiBaseURL)), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...(hasFile ? { 'anthropic-beta': FILES_BETA } : {}),
    },
    body: JSON.stringify({ ...parsed, stream: true }),
    signal: request.signal,
  })
  if (result.error) return result.error
  if (!result.response.ok) return upstreamFailure(result.response)
  return new Response(result.response.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-credential-kind': result.credential.kind,
    },
  })
}

/**
 * 上传附件：转发 multipart 到 Messages Files API。
 * purpose 必须排在 file 之前，这里由调用方在 FormData 里保证顺序。
 */
export async function handleUpload(ctx, apiBaseURL, request) {
  // 官方上限 100 MiB；Host 的精确路由是缓冲型，超大体积会在读入内存后才失败，
  // 所以先按 Content-Length 拦一道，给用户一句能看懂的话。
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + UPLOAD_OVERHEAD) {
    return json(413, {
      error: { message: `文件过大：单个附件不能超过 ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB` },
    })
  }
  const form = await request.formData()
  const result = await callUpstream(ctx, apiBaseURL, new URL('files', anthropicBase(apiBaseURL)), {
    method: 'POST',
    headers: { 'anthropic-beta': FILES_BETA },
    body: form,
    signal: request.signal,
  })
  if (result.error) return result.error
  if (!result.response.ok) return upstreamFailure(result.response)
  return new Response(result.response.body, {
    status: result.response.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** 删除附件，释放服务端配额 */
export async function handleDeleteFile(ctx, apiBaseURL, fileId, request) {
  const result = await callUpstream(ctx, apiBaseURL, new URL(`files/${encodeURIComponent(fileId)}`, anthropicBase(apiBaseURL)), {
    method: 'DELETE',
    headers: { 'anthropic-beta': FILES_BETA },
    signal: request.signal,
  })
  if (result.error) return result.error
  return new Response(null, { status: result.response.ok ? 204 : result.response.status })
}

/** 朗读：TTS 整段合成，返回音频二进制 */
export async function handleTts(ctx, apiBaseURL, request) {
  const body = await request.json().catch(() => undefined)
  if (body === undefined || typeof body?.text !== 'string' || body.text.trim() === '') {
    return json(400, { error: { message: '没有可朗读的文本' } })
  }
  const result = await callUpstream(ctx, apiBaseURL, new URL('tts', toolsBase(apiBaseURL)), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: body.text,
      voice_id: body.voiceId ?? 'stella',
      format: body.format ?? 'wav',
      filter_markdown: body.filterMarkdown ?? true,
    }),
    signal: request.signal,
  })
  if (result.error) return result.error
  if (!result.response.ok) return upstreamFailure(result.response)
  return new Response(result.response.body, {
    status: 200,
    headers: {
      'content-type': result.response.headers.get('content-type') ?? 'audio/wav',
      'cache-control': 'no-store',
    },
  })
}

/** 语音输入：ASR 转写，接收浏览器录音的 WAV/Opus */
export async function handleAsr(ctx, apiBaseURL, request) {
  const incoming = await request.formData()
  const file = incoming.get('file')
  if (!(file instanceof Blob)) {
    return json(400, { error: { message: '缺少录音文件' } })
  }
  const form = new FormData()
  form.append('file', file, incoming.get('filename')?.toString() || 'speech.wav')
  const result = await callUpstream(ctx, apiBaseURL, new URL('asr', toolsBase(apiBaseURL)), {
    method: 'POST',
    body: form,
    signal: request.signal,
  })
  if (result.error) return result.error
  if (!result.response.ok) return upstreamFailure(result.response)
  return new Response(result.response.body, {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
