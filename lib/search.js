/**
 * 联网搜索：模型池模式（走 ctx.llm）下替代 DeepSeek 的服务端搜索。
 *
 * 为什么需要它：实测 DeepSeek 的 deepseek_web_search 无法通过 ctx.llm 传递——
 * 补全 JSON Schema 后不报错，但模型不会真正触发服务端搜索（tool-call 数量为 0）。
 * 所以模型池模式要自己实现「搜索 → 回填上下文」这一轮。
 *
 * 三家渠道（用户在设置里选，默认 DeepSeek 官方）：
 *   deepseek  POST /v1/tools/search，复用 DeepSeek 凭据，国内直连，固定 10 条
 *   tavily    api.tavily.com，需独立 Key，境外域名通常要走代理
 *   exa       api.exa.ai，需独立 Key，直连可达
 *
 * 网络约束（实测）：本机系统 DNS 解析不了 api.tavily.com（ENOTFOUND），
 * 必须经 HTTP 代理；api.exa.ai 与 api.deepseek.com 可直连。
 * Node 的 fetch 不读系统代理设置，所以这里手写 CONNECT 隧道 + TLS，不依赖第三方包。
 */
import http from 'node:http'
import https from 'node:https'
import tls from 'node:tls'

/** 渠道清单：id 即设置里存的值；host 用于建隧道与拼 Host 头
 *
 * needsProxy 来自实测：api.tavily.com 在本机 DNS 解析不出来（ENOTFOUND），
 * api.deepseek.com 与 api.exa.ai 均可直连。直连能通的渠道就不强行走代理，
 * 少一层失败点。
 */
export const SEARCH_PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek 官方搜索', host: 'api.deepseek.com', port: 443, path: '/v1/tools/search', needsProxy: false },
  { id: 'tavily', label: 'Tavily', host: 'api.tavily.com', port: 443, path: '/search', needsProxy: true },
  { id: 'exa', label: 'Exa', host: 'api.exa.ai', port: 443, path: '/search', needsProxy: false },
]

export const DEFAULT_SEARCH_PROVIDER = 'deepseek'

/** 按 id 取渠道定义；未知 id 回落到默认渠道 */
function providerOf(id) {
  return SEARCH_PROVIDERS.find((item) => item.id === id) ?? SEARCH_PROVIDERS[0]
}

/** 经 HTTP 代理建一条到目标的 TLS 隧道 */
function tunnel(proxy, host, port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.host,
      port: proxy.port,
      method: 'CONNECT',
      path: `${host}:${port}`,
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy()
        reject(new Error(`代理 CONNECT 失败：HTTP ${res.statusCode}`))
        return
      }
      resolve(socket)
    })
    req.on('error', reject)
    req.setTimeout(15_000, () => {
      req.destroy(new Error('代理连接超时'))
    })
    req.end()
  })
}

/** 解析 searchProxy 配置，支持 http://host:port 与 host:port 两种写法 */
export function parseProxy(value) {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const text = value.trim().replace(/^https?:\/\//i, '')
  const [host, portText] = text.split(':')
  const port = Number(portText)
  if (!host || !Number.isInteger(port) || port <= 0) return undefined
  return { host, port }
}

/** 发一个 HTTPS POST；有代理时走隧道，否则直连 */
async function postJson(target, proxy, headers, body) {
  const payload = JSON.stringify(body)
  const commonHeaders = {
    host: target.host,
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  }

  // 直连分支：不需要隧道，交给 https 自己解析域名
  if (proxy === undefined) {
    return new Promise((resolve, reject) => {
      const req = https.request(
        { host: target.host, port: target.port, path: target.path, method: 'POST', headers: commonHeaders, timeout: 30_000 },
        (res) => {
          let data = ''
          res.on('data', (chunk) => {
            data += chunk
          })
          res.on('end', () => resolve({ status: res.statusCode ?? 0, text: data }))
        },
      )
      req.on('error', reject)
      req.on('timeout', () => req.destroy(new Error('搜索请求超时')))
      req.write(payload)
      req.end()
    })
  }

  // 代理分支：先建隧道，再在隧道上做 TLS。
  //
  // 这里不能用 https.request 的 createConnection 传 secure socket——
  // 它会在已握手的 TLS 连接上再套一层，服务端直接断开
  // （实测 "Client network socket disconnected before secure TLS connection"）。
  // 正确做法是在 TLS socket 上自己写 HTTP/1.1 报文并解析响应。
  const raw = await tunnel(proxy, target.host, target.port)
  const secure = await new Promise((resolve, reject) => {
    const socket = tls.connect({ socket: raw, servername: target.host }, () => resolve(socket))
    socket.on('error', reject)
  })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      secure.destroy()
      reject(new Error('搜索请求超时'))
    }, 30_000)

    const head = [
      `POST ${target.path} HTTP/1.1`,
      `Host: ${target.host}`,
      'Content-Type: application/json',
      `Content-Length: ${Buffer.byteLength(payload)}`,
      'Accept: application/json',
      'Connection: close',
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      '',
      '',
    ].join('\r\n')

    secure.write(head + payload)

    const chunks = []
    secure.on('data', (chunk) => chunks.push(chunk))
    secure.on('end', () => {
      clearTimeout(timer)
      const raw = Buffer.concat(chunks)
      // 拆响应头与响应体
      const split = raw.indexOf('\r\n\r\n')
      if (split < 0) {
        reject(new Error('搜索响应格式异常'))
        return
      }
      const headerText = raw.subarray(0, split).toString('utf8')
      let bodyBuf = raw.subarray(split + 4)
      const status = Number(/^HTTP\/\d\.\d (\d{3})/.exec(headerText)?.[1] ?? 0)
      // chunked 传输要解块，否则 JSON.parse 会失败
      if (/transfer-encoding:\s*chunked/i.test(headerText)) bodyBuf = dechunk(bodyBuf)
      resolve({ status, text: bodyBuf.toString('utf8') })
    })
    secure.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

/** 解 HTTP/1.1 chunked 编码 */
function dechunk(buffer) {
  const out = []
  let offset = 0
  while (offset < buffer.length) {
    const lineEnd = buffer.indexOf('\r\n', offset)
    if (lineEnd < 0) break
    const size = Number.parseInt(buffer.subarray(offset, lineEnd).toString('utf8'), 16)
    if (!Number.isFinite(size) || size <= 0) break
    const start = lineEnd + 2
    out.push(buffer.subarray(start, start + size))
    offset = start + size + 2
  }
  return Buffer.concat(out)
}

/** 三家渠道的请求体差异集中在这里，其余流程共用 */
function buildRequest(id, query, maxResults) {
  const count = Math.min(10, Math.max(1, maxResults))
  if (id === 'tavily') {
    return { query, max_results: count, search_depth: 'basic', include_answer: false }
  }
  if (id === 'exa') {
    // contents.text 才拿得到正文摘要，否则只有标题与 URL
    return { query, numResults: count, contents: { text: { maxCharacters: 500 } } }
  }
  // DeepSeek 官方只认 query，实测 max_results 等字段被忽略、恒返回 10 条
  return { query }
}

/**
 * 把三家渠道的响应归一化成同一形状。
 * 字段来源：
 *   DeepSeek  title / url / summary(或 snippet) / site_name / date
 *   Tavily    title / url / content
 *   Exa       title / url / text
 */
function normalize(id, json) {
  const rows = Array.isArray(json?.results) ? json.results : []
  return rows
    .filter((item) => typeof item?.url === 'string' && item.url !== '')
    .map((item, index) => {
      const raw = item.summary ?? item.snippet ?? item.content ?? item.text ?? ''
      const body = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
      return {
        index: index + 1,
        title: typeof item.title === 'string' && item.title !== '' ? item.title : item.url,
        url: item.url,
        snippet: body.slice(0, 500),
        // 站点名与发布时间只有 DeepSeek 官方给，其余留空由前端按域名推导
        siteName: typeof item.site_name === 'string' ? item.site_name : '',
        publishedAt: typeof item.date === 'string' ? item.date : '',
        score:
          typeof item.score === 'number'
            ? item.score
            : typeof item.rerank_score === 'number'
              ? item.rerank_score
              : null,
      }
    })
}

/** 从错误响应里挖一句能看懂的话 */
function describeFailure(status, body) {
  try {
    const json = JSON.parse(body)
    const detail = json?.detail?.error ?? json?.detail ?? json?.error ?? json?.message
    if (typeof detail === 'string' && detail !== '') return `HTTP ${status}：${detail}`
    if (detail !== undefined) return `HTTP ${status}：${JSON.stringify(detail).slice(0, 200)}`
  } catch {
    // 非 JSON，下面回落到原文
  }
  return `HTTP ${status}：${String(body).slice(0, 200)}`
}

/**
 * 按渠道决定要不要走代理。
 *
 * 只有渠道自己标了 needsProxy 且用户配了代理时才走隧道；
 * 否则一律直连——直连能通的渠道强行走代理只会多一层失败点
 * （实测 api.exa.ai 经 7897 反而 TLS 握手被断开）。
 */
function proxyFor(target, proxy) {
  return target.needsProxy ? proxy : undefined
}

/**
 * 执行一次搜索。
 * @param options.provider 渠道 id：deepseek / tavily / exa
 * @param options.apiKey   该渠道的 Key；deepseek 渠道用 DeepSeek 的凭据
 * @param options.proxy    解析后的代理，或 undefined 表示直连
 * @param options.query    查询词
 * @param options.maxResults 返回条数（1–10）
 * @param options.signal   中止信号
 * @returns 归一化后的结果列表；失败时抛错，错误信息可直接展示给用户
 */
export async function searchWeb({ provider, apiKey, proxy, query, maxResults = 5, signal }) {
  const target = providerOf(provider)
  const id = target.id
  const text = String(query ?? '').trim()
  if (text === '') throw new Error('搜索词为空')

  if (typeof apiKey !== 'string' || apiKey === '') {
    const hint =
      id === 'deepseek'
        ? '没有可用的 DeepSeek 凭据：请先在设置里填写 API Key，或改用其他搜索渠道'
        : `没有 ${target.label} 的 API Key：请在设置里填写，或换用其他搜索渠道`
    throw new Error(hint)
  }

  if (signal?.aborted === true) throw new Error('已取消')

  const headers = id === 'tavily' ? { authorization: `Bearer ${apiKey}` } : { 'x-api-key': apiKey }
  const request = () => postJson(target, proxyFor(target, proxy), headers, buildRequest(id, text, maxResults))

  /**
   * 经代理的请求偶发 TLS 中断（实测报错
   * "Client network socket disconnected before secure TLS connection was established"），
   * 同一时刻重试一次通常就成功——是代理侧连接被掐，不是配置错误。
   * 只对这类瞬时网络错误重试一次；HTTP 错误码不重试，那是确定性的失败。
   */
  let response
  try {
    response = await request()
  } catch (error) {
    const transient = /socket disconnected|ECONNRESET|EPIPE|ETIMEDOUT|超时/i.test(String(error?.message ?? ''))
    if (!transient || proxyFor(target, proxy) === undefined) throw error
    if (signal?.aborted === true) throw new Error('已取消')
    response = await request()
  }
  const { status, text: body } = response

  if (status !== 200) throw new Error(`搜索失败：${describeFailure(status, body)}`)

  let json
  try {
    json = JSON.parse(body)
  } catch {
    throw new Error('搜索返回的不是 JSON')
  }

  return normalize(id, json)
}

/**
 * 把搜索结果整理成给模型看的上下文块。
 *
 * 为什么不直接把 JSON 塞进去：模型需要「这是外部资料、不是用户说的」这个边界，
 * 用固定格式的块包裹，并明确要求引用编号，便于前端把 [citation:N] 变成角标。
 */
export function formatSearchContext(query, results) {
  if (results.length === 0) {
    return `<web_search query="${query}">\n没有找到相关结果。\n</web_search>`
  }
  const lines = results.map((item) => {
    const meta = [item.siteName, item.publishedAt].filter(Boolean).join(' · ')
    return [`[${item.index}] ${item.title}`, meta === '' ? null : meta, `URL: ${item.url}`, `摘要: ${item.snippet}`]
      .filter((line) => line !== null)
      .join('\n')
  })
  return [
    `<web_search query="${query}">`,
    ...lines,
    '</web_search>',
    '以上是搜索返回的外部资料。请只依据这些内容回答，并在引用处用 [citation:编号] 标注来源。',
  ].join('\n')
}
