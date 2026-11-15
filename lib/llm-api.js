/**
 * 模型池模式：把 ctx.llm 的 StreamChunk 流转换成 Anthropic Messages 的 SSE 格式。
 *
 * 为什么要转换：浏览器那侧（src/10-api.js、src/20-store.js）解析的是 Anthropic 的
 * 事件协议（message_start / content_block_delta / message_delta…），
 * 直连模式是纯透传，所以只要这里产出同样格式，客户端一行都不用改。
 *
 * 两套事件的对应关系（实测得出）：
 *   StreamChunk                          Anthropic SSE
 *   block-start {blockType:'text'}    →  content_block_start {content_block:{type:'text'}}
 *   block-start {blockType:'reasoning'}→  content_block_start {content_block:{type:'thinking'}}
 *   text-delta                        →  content_block_delta {delta:{type:'text_delta'}}
 *   reasoning-delta                   →  content_block_delta {delta:{type:'thinking_delta'}}
 *   tool-call-delta                   →  content_block_delta {delta:{type:'input_json_delta'}}
 *   block-end                         →  content_block_stop
 *   usage                             →  message_delta {usage}
 *   finish                            →  message_delta {delta:{stop_reason}} + message_stop
 *
 * 工具循环：模型池模式下 DeepSeek 的服务端搜索不可用（实测 tool-call 恒为 0），
 * 所以搜索由 Host 自己做——先在本地搜一轮，把结果作为 system 上下文注入，
 * 再让模型基于资料回答。这样不需要完整的工具调用循环，语义也更可控。
 */
import { searchWeb, formatSearchContext, DEFAULT_SEARCH_PROVIDER } from './search.js'

/**
 * 模型池模式暴露给模型的工具定义。
 *
 * 为什么要用标准 ToolSchema：ctx.llm 的 `tools` 要求
 * `{ name, description, parameters }`，parameters 必须是合法 JSON Schema。
 * DeepSeek 直连模式那两个服务端工具没有 description/parameters，塞进来直接
 * 报 `Invalid schema`——这是两套协议的硬差异，不是参数没填对。
 *
 * 与直连模式的能力对齐：
 *   deepseek_web_search ↔ 联网搜索（这里由 Host 真正执行）
 *   deepseek_read_url   ↔ 阅读链接（同样由 Host 抓取）
 */
const TOOL_SCHEMAS = [
  {
    name: 'web_search',
    description:
      '联网搜索。当问题涉及实时信息、近期事件、你不确定的事实，或用户明确要求查资料时调用。'
      + '返回若干网页的标题、站点、摘要与 URL。一次调用可覆盖一个检索意图。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索词，用用户的语言，简洁具体' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_url',
    description: '打开一个具体网页并读取正文。适合在 web_search 之后深入某一篇资料。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要打开的网页地址（http/https）' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
]

/** 只把联网搜索开着的那个工具带上（关掉搜索时不暴露搜索能力，与 UI 开关一致） */
function toolsFor(search) {
  return search === true ? TOOL_SCHEMAS : TOOL_SCHEMAS.filter((tool) => tool.name === 'read_url')
}

/**
 * 执行一个模型发起的工具调用。
 *
 * 返回：
 *   text    回填给模型的工具结果正文
 *   query   搜索词（web_search）
 *   sources 结构化来源列表，用于转成客户端的 web_search_tool_result
 *   url / title / text  读页面时的元数据
 *
 * 设计取舍：工具失败不抛错，而是把错误当结果回填。
 * 抛错会中断整轮对话，而模型拿到错误信息后通常能自己改口或换个词再试。
 */
async function runTool({ call, config, search, searchKey, resolveDeepSeekKey, signal }) {
  let args = {}
  try {
    args = call.args.trim() === '' ? {} : JSON.parse(call.args)
  } catch {
    args = {}
  }

  if (call.name === 'web_search') {
    const query = typeof args.query === 'string' ? args.query.trim() : ''
    if (query === '') {
      return { text: '没有提供检索词。', query: '' }
    }
    if (search !== true) {
      return { text: '联网搜索当前是关闭状态，无法检索。', query }
    }
    const channel = config.searchProvider ?? DEFAULT_SEARCH_PROVIDER
    try {
      const apiKey = searchKey === null ? await resolveDeepSeekKey() : searchKey
      const results = await searchWeb({
        provider: channel,
        apiKey,
        proxy: parseProxyLoose(config.searchProxy),
        query,
        maxResults: 5,
        signal,
      })
      return {
        text: formatSearchContext(query, results),
        query,
        // 结构化来源：字段名对齐客户端 web_search_result 的期望
        sources: results.map((item) => ({
          title: item.title ?? '',
          url: item.url ?? '',
          snippet: item.snippet ?? '',
          publishedAt: item.publishedAt ?? null,
        })),
      }
    } catch (error) {
      return {
        text: `搜索失败：${String(error?.message ?? error)}`,
        query,
        sources: [],
      }
    }
  }

  if (call.name === 'read_url') {
    const url = typeof args.url === 'string' ? args.url.trim() : ''
    if (url === '') return { text: '没有提供网址。', url: '' }
    try {
      const text = await readPage(url, signal)
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text)?.[1]?.trim() ?? url
      return { text: `URL: ${url}\n\n${text}`, url, title, pageText: text }
    } catch (error) {
      return { text: `打开失败：${String(error?.message ?? error)}`, url, title: url }
    }
  }

  return { text: `未知工具：${call.name}`, query: '' }
}

/**
 * 抓取网页正文并压成纯文本。
 *
 * 只做最基本的两步：去掉 script/style/注释等标签块，再把剩余标签剥成文本。
 * 不做正文抽取（Readability 那类）——成本高且容易把结构化内容切碎，
 * 而模型对「带少量导航噪声的全文」的容忍度比想象中高。
 */
async function readPage(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; DSH-DeepSeek-Chat/1.0)' },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const type = response.headers.get('content-type') ?? ''
  if (!/text\/|json|xml/i.test(type)) throw new Error(`不支持的内容类型：${type}`)
  const html = await response.text()
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  // 截断：整页塞进去会吃光上下文，取前 6000 字符通常已覆盖要点
  return text.length > 6000 ? `${text.slice(0, 6000)}…（已截断）` : text
}

/** SSE 帧编码 */
const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`

/** 把 finish 的 reason 映射成 Anthropic 的 stop_reason */
function mapStopReason(reason) {
  switch (reason?.kind) {
    case 'stop':
      return 'end_turn'
    case 'tool-calls':
      return 'tool_use'
    case 'max-tokens':
      return 'max_tokens'
    case 'aborted':
      return 'stop_sequence'
    case 'error':
      /*
       * 不能用 end_turn：客户端会把「正常结束」当作回答完整，
       * 而这里其实是失败的（例如服务商内容审核拒答）。
       * stop_sequence 表示「非正常中断」，界面不会当成完整答案。
       */
      return 'stop_sequence'
    default:
      return 'end_turn'
  }
}

/**
 * 把一条 Anthropic 风格的 assistant 消息内容转成 ctx.llm 要的 RequestMessage。
 * 只取 text 与 thinking（历史思考不回传，与直连模式一致）。
 */
function toRequestContent(blocks) {
  const out = []
  for (const block of blocks ?? []) {
    if (block?.type === 'text' && typeof block.text === 'string' && block.text !== '') {
      out.push({ type: 'text', text: block.text })
    } else if (block?.type === 'image' && block.source !== undefined) {
      // 图片块原样带过去，由适配器决定是否支持
      out.push(block)
    }
  }
  return out.length > 0 ? out : [{ type: 'text', text: '' }]
}

/**
 * 把 Anthropic 风格的 messages 转成 GenerateOptions.messages。
 * system 单独抽出来（GenerateOptions 有独立字段）。
 *
 * assistant 消息必须带 `source`：适配器会读 `source.replayState`
 * 判断能否复用上一轮的原生响应。缺 `source` 就是 undefined 解引用，
 * 实测报 `Cannot read properties of undefined (reading 'replayState')`——
 * 只要对话里存在历史轮次就会触发（单轮首问不会，所以很容易漏掉）。
 */
function toGenerateMessages(messages, route) {
  const out = []
  for (const message of messages ?? []) {
    if (message?.role === 'system') continue
    const content = Array.isArray(message?.content)
      ? toRequestContent(message.content)
      : [{ type: 'text', text: String(message?.content ?? '') }]
    if (message?.role === 'assistant') {
      out.push({
        role: 'assistant',
        source: { kind: 'model', provider: route?.provider, model: route?.model },
        content,
      })
    } else {
      out.push({ role: 'user', content })
    }
  }
  return out
}

/**
 * 处理一次模型池请求，返回 SSE 响应。
 *
 * @param deps.llm          ctx.llm
 * @param deps.request      原始 Request（读 body）
 * @param deps.config       插件配置（含 searchProvider / 各渠道 Key / searchProxy）
 * @param deps.provider     目标 provider id
 * @param deps.model        目标模型 id
 * @param deps.search       本次是否启用搜索
 * @param deps.searchKey    当前渠道的 Key；DeepSeek 渠道传 null 表示用 DeepSeek 凭据
 * @param deps.resolveDeepSeekKey 取 DeepSeek 凭据的回调（DeepSeek 渠道专用）
 */
export async function handlePoolMessages({ llm, request, config, provider, model, search, searchKey, resolveDeepSeekKey }) {
  const raw = await request.text()
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return jsonResponse(400, { error: { message: '请求体不是合法 JSON' } })
  }

  const messages = toGenerateMessages(body?.messages, { provider, model })
  let system = typeof body?.system === 'string' ? body.system : ''

  /*
   * 工具链模式（默认）：把 web_search / read_url 作为 tools 交给模型，
   * 由模型自己决定搜不搜、搜什么、搜几次。
   *
   * 旧行为（toolLoop:false）保留一个开关：Host 先无条件搜一轮再把结果注入 system。
   * 保留它是因为有些池内模型对 function calling 支持很差（有的会把工具当文本复述），
   * 那种情况下前置检索反而更可靠。
   */
  const useToolLoop = body?.toolLoop !== false

  let searchNote = ''
  if (!useToolLoop) {
    // 旧路径：先搜再答。失败不阻断对话，把原因写进上下文让模型自己说明。
    const question = lastUserText(messages)
    if (search === true && question !== '') {
      const channel = config.searchProvider ?? DEFAULT_SEARCH_PROVIDER
      try {
        const apiKey = searchKey === null ? await resolveDeepSeekKey() : searchKey
        const results = await searchWeb({
          provider: channel,
          apiKey,
          proxy: parseProxyLoose(config.searchProxy),
          query: question,
          maxResults: 5,
          signal: request.signal,
        })
        system = `${system}\n\n${formatSearchContext(question, results)}`.trim()
      } catch (error) {
        searchNote = String(error?.message ?? error)
        system = `${system}\n\n<web_search_error>\n搜索失败：${searchNote}\n请告知用户这次没有获取到实时信息。\n</web_search_error>`.trim()
      }
    }
  }

  const options = {
    provider,
    model,
    messages,
    maxTokens: typeof body?.max_tokens === 'number' ? body.max_tokens : 4096,
    signal: request.signal,
  }
  if (system !== '') options.system = system
  /*
   * 深度思考开关 → reasoningEffort。
   *
   * 注意 'high' 不是所有适配器都认：认不出的会忽略或报错，具体由适配器决定。
   * 关闭时**不传**，让适配器用它自己的默认值——而不是传一个 'none'，
   * 因为各家表示「不思考」的取值不统一。
   */
  if (body?.thinking?.type === 'enabled') options.reasoningEffort = 'high'
  if (useToolLoop) options.tools = toolsFor(search)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => controller.enqueue(encoder.encode(frame(event, data)))
      /*
       * index 必须跨轮累积：客户端按 content_block 的 index 组装消息，
       * 每一轮工具调用都从头编号会让第二轮的 block 覆盖第一轮（实测会丢正文）。
       */
      let index = -1
      let openIndex = -1
      let finished = false

      try {
        send('message_start', {
          type: 'message_start',
          message: { id: `msg_pool_${Date.now()}`, type: 'message', role: 'assistant', content: [], model },
        })

        /*
         * 工具循环。
         *
         * 每一轮：
         *   1. 调 llm.stream(options)
         *   2. 把 text / reasoning / tool-call 都转成 Anthropic SSE 发出去
         *   3. 若这一轮以 tool-calls 结束，执行对应工具，把 assistant 的 tool-call
         *      与 tool 的结果回填进 messages，再跑下一轮
         *
         * 上限 MAX_TOOL_ROUNDS：防止模型无限自我唤起（实测某些模型会反复搜同一个词）。
         * 到达上限就停止循环，让已经流出的内容作为最终答案。
         */
        const MAX_TOOL_ROUNDS = 4
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const calls = []
          let roundStop = 'stop'
          /*
           * 本轮是否已经把某个 tool-call 开成客户端可渲染的块。
           *
           * 池模式的工具调用要走「客户端认得」的形态：直连模式下 DeepSeek 发的是
           * server_tool_use + web_search_tool_result（input 是完整对象、并非流式分片），
           * 客户端的推理段按这个形状渲染「搜索到 N 个网页」那一行。
           * 所以这里不能在 block-start 就发 tool_use（那时还不知道参数），
           * 要等参数收齐、工具执行完，再一次性补发两个块。
           */
          let toolBlockIndex = -1

          for await (const chunk of llm.stream(options)) {
            switch (chunk.type) {
              case 'block-start': {
                /*
                 * 不能沿用 chunk.index：适配器每轮都从 0 开始编号，
                 * 工具循环的第二轮会把 index 重置成 0，客户端按 index 组装时
                 * 新块会覆盖第一轮的正文（实测最终只剩最后一轮内容）。
                 * 这里一律用自己跨轮累积的计数器。
                 */
                index += 1
                openIndex = index
                const isThinking = chunk.blockType === 'reasoning'
                const isToolCall = chunk.blockType === 'tool-call'
                if (isToolCall) {
                  // 工具块延后到执行完再发，这里只记位置，不占用 index
                  toolBlockIndex = openIndex
                  index -= 1
                  break
                }
                send('content_block_start', {
                  type: 'content_block_start',
                  index: openIndex,
                  content_block: isThinking
                    ? { type: 'thinking', thinking: '' }
                    : { type: 'text', text: '' },
                })
                break
              }
              case 'text-delta':
                send('content_block_delta', {
                  type: 'content_block_delta',
                  index: openIndex,
                  delta: { type: 'text_delta', text: chunk.text ?? '' },
                })
                break
              /*
               * reasoning-delta 必须转发成 thinking_delta。
               *
               * 这段在处理工具链改造时被误删过：block-start 仍然开了 thinking 块，
               * 但没有一个 thinking_delta 跟上，结果是「推理段有壳没肉」——
               * 客户端拿到一个空的 thinking 块，界面上推理段整段消失。
               * 排查特征：SSE 里有 content_block_start{type:'thinking'}，
               * 但全文搜不到 thinking_delta。
               */
              case 'reasoning-delta':
                send('content_block_delta', {
                  type: 'content_block_delta',
                  index: openIndex,
                  delta: { type: 'thinking_delta', thinking: chunk.text ?? '' },
                })
                break
              /*
               * tool-call-delta 只累积参数，不流式下发。
               *
               * 客户端渲染推理段的工具调用用的是 server_tool_use 块，
               * 它的 input 必须是**完整对象**（直连模式下 DeepSeek 也是一次性给的）。
               * 所以这里攒着，等参数收齐、工具执行完，连同结果一起补发。
               */
              case 'tool-call-delta': {
                let call = calls.find((item) => item.id === chunk.id)
                if (call === undefined) {
                  call = { id: chunk.id, name: chunk.name ?? '', args: '' }
                  calls.push(call)
                }
                if (chunk.name !== undefined && call.name === '') call.name = chunk.name
                call.args += chunk.argumentsDelta ?? ''
                break
              }
              case 'block-end':
                send('content_block_stop', { type: 'content_block_stop', index: openIndex })
                break
              case 'usage':
                send('message_delta', {
                  type: 'message_delta',
                  delta: { stop_reason: null },
                  usage: {
                    input_tokens: chunk.usage?.inputTokens ?? 0,
                    output_tokens: chunk.usage?.outputTokens ?? 0,
                  },
                })
                break
              case 'finish': {
                finished = true
                const kind = chunk.reason?.kind ?? 'stop'
                roundStop = kind
                if (kind === 'error') {
                  /*
                   * 错误也走正常事件流，客户端会展示 message.error。
                   * 文案过一层 explainFailure：上游常回一整串 JSON，
                   * 直接抛给用户既长又难懂（实测内容审核那条有 160+ 字符）。
                   */
                  send('error', {
                    type: 'error',
                    error: {
                      type: chunk.reason.failure?.code ?? 'api_error',
                      message: explainFailure(chunk.reason.failure),
                    },
                  })
                }
                // 中间轮（还要继续跑工具）不能提前把 stop_reason 定死，
                // 否则客户端会认为回答已结束、把后续内容丢掉
                const willContinue = kind === 'tool-calls' && calls.length > 0
                if (!willContinue) {
                  send('message_delta', {
                    type: 'message_delta',
                    delta: { stop_reason: mapStopReason(chunk.reason) },
                    usage: { output_tokens: 0 },
                  })
                }
                break
              }
              default:
                break
            }
          }

          // 这一轮没有工具调用 → 结束
          if (roundStop !== 'tool-calls' || calls.length === 0) break

          /*
           * 执行工具并把结果回填。
           *
           * 回填形态遵循 ctx.llm 的 RequestMessage：
           *   assistant 的 content 里带 tool-call 块
           *   user/tool 消息带 toolCallId 与结果文本
           * 工具失败也要回填（isError 语义），否则模型会一直重试同一个失败调用。
           */
          const results = []
          for (const call of calls) {
            const outcome = await runTool({
              call,
              config,
              search,
              searchKey,
              resolveDeepSeekKey,
              signal: request.signal,
            })
            results.push({ ...outcome, call })
          }

          /*
           * 把工具调用与结果补发成客户端能渲染的形态。
           *
           * 客户端推理段认的是直连模式那两个块：
           *   server_tool_use { input:{ action:'search', queries:[...] }, kind, name }
           *   web_search_tool_result { tool_use_id, content:[{ type:'web_search_result', … }] }
           * 于是渲染成「搜索到 N 个网页」那一行 + 站点图标。
           *
           * 池模式的工具本来叫 web_search / read_url，参数也是 {query} / {url}，
           * 这里做一层形状翻译：把 query 包成 queries 数组、把搜索结果包成
           * web_search_result 条目，字段名沿用直连协议（title / url / snippet / page_age）。
           * 不翻译的话客户端认不出，推理段里就只剩一段普通文字——
           * 也就是「搜索段看不见」那个症状。
           */
          for (const item of results) {
            const call = item.call
            const isSearch = call.name === 'web_search'
            const action = isSearch ? 'search' : 'open_page'
            const input = isSearch
              ? { action, queries: [item.query ?? ''] }
              : { action, url: item.url ?? '' }

            index += 1
            send('content_block_start', {
              type: 'content_block_start',
              index,
              content_block: {
                type: 'server_tool_use',
                id: call.id,
                name: isSearch ? 'deepseek_web_search' : 'deepseek_read_url',
                input,
                caller: { type: 'direct' },
                kind: 'deep_search',
              },
            })
            send('content_block_stop', { type: 'content_block_stop', index })

            // 结果块：搜索给 web_search_tool_result，读页面给 web_fetch_tool_result
            index += 1
            const resultBlock = isSearch
              ? {
                  type: 'web_search_tool_result',
                  tool_use_id: call.id,
                  content: (item.sources ?? []).map((source) => ({
                    type: 'web_search_result',
                    title: source.title ?? '',
                    url: source.url ?? '',
                    snippet: source.snippet ?? '',
                    page_age: source.publishedAt ?? null,
                  })),
                }
              : {
                  type: 'web_fetch_tool_result',
                  tool_use_id: call.id,
                  content: {
                    type: 'web_fetch_result',
                    url: item.url ?? '',
                    content: { title: item.title ?? '', text: (item.text ?? '').slice(0, 2000) },
                  },
                }
            send('content_block_start', {
              type: 'content_block_start',
              index,
              content_block: resultBlock,
            })
            send('content_block_stop', { type: 'content_block_stop', index })
          }

          /*
           * 回填工具调用与结果。
           *
           * 必须补齐 MessageBase 的契约字段，否则适配器会在内部抛
           * `Cannot read properties of undefined (reading 'replayState')`——
           * 它读的是 assistant 消息的 `source.replayState`，而 `source` 一旦缺失
           * 就是 undefined 解引用。规则：
           *   assistant → source: { kind:'model', provider, model }（ModelMessageSource）
           *   tool      → source: { kind:'tool', callId }（ToolMessageSource）
           * 两条都要带 id，适配器用它做消息身份（去重 / replay 归属）。
           */
          const assistantTurn = {
            role: 'assistant',
            id: `msg_tool_${Date.now()}_${round}`,
            source: { kind: 'model', provider, model },
            content: calls.map((call) => ({
              type: 'tool-call',
              id: call.id,
              name: call.name,
              arguments: call.args === '' ? '{}' : call.args,
            })),
          }
          const toolTurns = results.map((item, i) => ({
            role: 'tool',
            id: `msg_toolres_${Date.now()}_${round}_${i}`,
            source: { kind: 'tool', callId: item.call.id },
            toolCallId: item.call.id,
            content: [{ type: 'text', text: item.text }],
          }))
          options.messages = [...options.messages, assistantTurn, ...toolTurns]
          // 已经有过工具调用，后续轮次不再重放工具声明（否则部分适配器会重复询问）
          options.toolHistory = { tools: options.tools ?? [], updates: [] }
        }

        if (!finished) {
          send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 0 } })
        }
        send('message_stop', { type: 'message_stop' })
        controller.close()
      } catch (error) {
        // 流已经建立，只能用 error 事件告知；客户端会把它显示成失败
        try {
          send('error', {
            type: 'error',
            error: { type: 'api_error', message: String(error?.message ?? error) },
          })
          send('message_stop', { type: 'message_stop' })
        } catch {
          // 控制器可能已关闭
        }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      'x-credential-kind': 'pool',
      ...(searchNote === '' ? {} : { 'x-search-error': encodeURIComponent(searchNote.slice(0, 200)) }),
    },
  })
}

/**
 * 把适配器给的原始错误整理成用户看得懂的一句话。
 *
 * 为什么需要：ctx.llm 的 failure.message 常常是一整串上游 JSON，例如
 * `400: {"message":"Inappropriate input/output rejected for security reasons",…}`
 * 原样显示既长又难懂。这里按已知特征分类，认不出来的就截断原文——不猜原因。
 */
function explainFailure(failure) {
  const raw = String(failure?.message ?? '')
  const code = String(failure?.code ?? '')
  if (/inappropriate|security reasons|content[_ ]?policy|sensitive/i.test(raw)) {
    return '这次请求被服务商的内容安全策略拦下了。换个问法，或换一个模型再试。'
  }
  if (/rate.?limit|too many requests/i.test(raw) || code === 'RATE_LIMIT') {
    return '请求太频繁，被服务商限流了。稍等一会儿再试。'
  }
  if (/context (length|window)|too long|maximum.*token/i.test(raw)) {
    return '对话太长了，超出模型上下文。可以新建一个会话继续。'
  }
  if (/401|403|unauthorized|invalid.*key|api key/i.test(raw)) {
    return '模型凭据无效或没有权限。去设置里检查这个 provider 的 API Key。'
  }
  const brief = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw
  return brief === '' ? '模型调用失败' : brief
}

/** 取最后一条用户消息的纯文本，用作搜索词 */
function lastUserText(messages) {  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role !== 'user') continue
    const text = (message.content ?? [])
      .filter((block) => block?.type === 'text')
      .map((block) => block.text)
      .join(' ')
      .trim()
    if (text !== '') return text.slice(0, 400)
  }
  return ''
}

/** 宽松解析代理串；与 search.js 的 parseProxy 一致，这里内联避免循环依赖顾虑 */
function parseProxyLoose(value) {  if (typeof value !== 'string' || value.trim() === '') return undefined
  const text = value.trim().replace(/^https?:\/\//i, '')
  const [host, portText] = text.split(':')
  const port = Number(portText)
  if (!host || !Number.isInteger(port) || port <= 0) return undefined
  return { host, port }
}

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
