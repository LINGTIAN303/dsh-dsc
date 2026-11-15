/**
 * Host 半侧：注册 HTTP 路由（走 ctx.connection 的精确 Fetch 路由，自带认证与 Host/Origin 校验），
 * 把 DeepSeek API 代理给浏览器面板。密钥始终留在 Host。
 */
import { resolveConfig, searchKeyOf } from './config.js'
import { describeCredential, resolveCredential, savePluginKey } from './credential.js'
import {
  handleAsr,
  handleDeleteFile,
  handleMessages,
  handleTts,
  handleUpload,
  handleVerify,
} from './deepseek-api.js'
import { SessionStore } from './session-store.js'
import { SettingsStore, overlaySettings } from './settings-store.js'
import { migrateLegacyData } from './data-dir.js'
import { SEARCH_PROVIDERS, DEFAULT_SEARCH_PROVIDER } from './search.js'
import { handlePoolMessages } from './llm-api.js'

export const name = 'deepseek-chat'

/** 所有路由都在这条前缀下；路径段必须满足 [A-Za-z0-9_$.-]+ */
const PREFIX = '/api/deepseek-chat'

/**
 * 宿主注入的 llm 服务引用。
 * 模块级而不是闭包：apply 里两个 ctx.inject 各自独立触发，
 * 路由回调需要读到 connection 注入时 llm 是否已就绪。
 */
let llmHost

const json = (status, value) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  // 必须在读写数据之前迁移：插件从 dsh-deepseek-app 改名而来，
  // 老用户的会话与设置还在旧目录里，不搬就等于升级后历史全丢
  const migrated = migrateLegacyData()
  if (migrated.length > 0) {
    ctx.logger?.info?.(`deepseek-chat: migrated legacy data (${migrated.join(', ')})`)
  }
  const store = new SessionStore(resolved.sessionStorePath)
  const settingsStore = new SettingsStore()

  /** 每次请求现算：用户可能在界面上改过搜索渠道或代理，必须立即生效 */
  const effectiveConfig = () => overlaySettings(resolved, settingsStore.read())

  /**
   * 取 DeepSeek 凭据里的 Key，供 DeepSeek 官方搜索使用。
   * 搜索接口走 x-api-key，账号令牌（x-dsh-auth-token）对它无效，
   * 所以这里只认插件自有 Key 与环境变量两种来源。
   */
  const resolveDeepSeekKey = async () => {
    const credential = await resolveCredential(ctx, resolved.apiBaseURL)
    if (credential === undefined) {
      throw new Error('没有可用的 DeepSeek 凭据：请在设置里填写 API Key，或改用其他搜索渠道')
    }
    const key = credential.headers['x-api-key']
    if (typeof key !== 'string' || key === '') {
      throw new Error('当前 DeepSeek 账号登录态无法用于搜索，请改用插件自有 API Key 或其他搜索渠道')
    }
    return key
  }

  // llm 是可选能力：宿主没装它就只是没有「DSH 模型池」这一种来源，
  // 直连模式不受影响。用嵌套 inject 而不是静态 inject 导出，
  // 是为了让缺 llm 时插件照常加载（静态声明缺失会让整个 apply 不执行）。
  ctx.inject(['llm'], (host) => {
    llmHost = host.llm
    ctx.effect(() => () => {
      llmHost = undefined
    }, 'deepseek-chat: llm')
  })

  ctx.inject(['connection'], (host) => {
    const register = (path, methods, fetch) =>
      host.connection.fetch.register({ path: `${PREFIX}/${path}`, methods, requestBody: 'buffered', fetch })

    /** 读 JSON 体；空体返回 undefined */
    const readJson = async (request) => {
      const text = await request.text()
      if (text.trim() === '') return undefined
      try {
        return JSON.parse(text)
      } catch {
        return undefined
      }
    }

    /** 统一把抛出的异常转成 500 + 可展示信息；请求已中止时不写响应 */
    const guard = (handler) => async (request) => {
      try {
        return await handler(request)
      } catch (error) {
        if (request.signal.aborted) return new Response(null, { status: 499 })
        return json(500, { error: { message: error instanceof Error ? error.message : String(error) } })
      }
    }

    const disposers = [
      // 面板启动时拉一次：配置、凭据状态、会话列表
      register('bootstrap', ['GET'], guard(async () => {
        const credential = await describeCredential(ctx, resolved.apiBaseURL)
        const config2 = effectiveConfig()
        return json(200, {
          config: {
            defaultModel: resolved.defaultModel,
            defaultThinking: resolved.defaultThinking,
            defaultSearch: resolved.defaultSearch,
            defaultSafetyCheck: resolved.defaultSafetyCheck,
            searchProvider: config2.searchProvider,
            searchProxy: config2.searchProxy ?? '',
          },
          credential,
          sessions: store.list().map(toSummary),
        })
      })),

      register('sessions', ['GET'], guard(async () => json(200, { sessions: store.list().map(toSummary) }))),

      register('session.read', ['POST'], guard(async (request) => {
        const body = await readJson(request)
        const session = store.get(body?.id)
        return session === undefined
          ? json(404, { error: { message: '会话不存在' } })
          : json(200, { session })
      })),

      register('session.save', ['POST'], guard(async (request) => {
        const body = await readJson(request)
        if (body?.session === undefined) return json(400, { error: { message: '缺少 session' } })
        await store.save(body.session)
        return json(200, { ok: true })
      })),

      register('session.delete', ['POST'], guard(async (request) => {
        const body = await readJson(request)
        if (typeof body?.id !== 'string') return json(400, { error: { message: '缺少 id' } })
        await store.remove(body.id)
        return json(200, { ok: true })
      })),

      // 凭据：读状态、填 Key（空值即清除）、免费校验
      register('credential', ['GET'], guard(async () => json(200, await describeCredential(ctx, resolved.apiBaseURL)))),

      register('credential.save', ['POST'], guard(async (request) => {
        const body = await readJson(request)
        if (typeof body?.apiKey !== 'string') return json(400, { error: { message: '缺少 apiKey' } })
        await savePluginKey(ctx, body.apiKey.trim())
        return json(200, await describeCredential(ctx, resolved.apiBaseURL))
      })),

      register('credential.verify', ['POST'], guard(async (request) => handleVerify(ctx, resolved.apiBaseURL, await readJson(request)))),

      // 自检：把 Host 侧真正看到的东西报出来，用于排查保存失败
      register('diagnose', ['GET'], guard(async () => json(200, {
        credentialsService: ctx.get?.('credentials') !== undefined,
        accountService: ctx.get?.('deepseekAccount') !== undefined,
        apiBaseURL: resolved.apiBaseURL,
        sessionFile: store.file,
        settingsFile: settingsStore.file,
        routesPrefix: PREFIX,
      }))),

      // DeepSeek 代理
      register('messages', ['POST'], guard((request) => handleMessages(ctx, resolved.apiBaseURL, request))),
      register('files.upload', ['POST'], guard((request) => handleUpload(ctx, resolved.apiBaseURL, request))),
      register('files.delete', ['POST'], guard(async (request) => {
        const body = await readJson(request)
        if (typeof body?.id !== 'string') return json(400, { error: { message: '缺少 id' } })
        return handleDeleteFile(ctx, resolved.apiBaseURL, body.id, request)
      })),
      register('tts', ['POST'], guard((request) => handleTts(ctx, resolved.apiBaseURL, request))),
      register('asr', ['POST'], guard((request) => handleAsr(ctx, resolved.apiBaseURL, request))),

      // 系统提示词只在 Host 侧拼，浏览器不需要也不应该拿
      register('system-prompt', ['GET'], guard(async () => json(200, { prompt: resolved.systemPrompt }))),

      // 搜索渠道设置：读当前值 + 可选渠道 + 各渠道 Key 是否已配置
      register('search.settings', ['GET'], guard(async () => {
        const config2 = effectiveConfig()
        const credential = await describeCredential(ctx, resolved.apiBaseURL)
        return json(200, {
          provider: config2.searchProvider,
          proxy: config2.searchProxy ?? '',
          providers: SEARCH_PROVIDERS.map((item) => ({
            id: item.id,
            label: item.label,
            needsProxy: item.needsProxy,
            // deepseek 渠道用 DeepSeek 凭据，有凭据就算就绪
            configured:
              item.id === 'deepseek'
                ? credential.active !== null
                : (searchKeyOf(config2, item.id) ?? '') !== '',
          })),
          proxyConfigured: typeof config2.searchProxy === 'string' && config2.searchProxy !== '',
        })
      })),

      // 写入搜索渠道设置；空串表示清除该项，回到插件配置的默认值
      register('search.save', ['POST'], guard(async (request) => {
        const body = await readJson(request)
        const written = settingsStore.write({
          searchProvider: body?.provider,
          searchProxy: body?.proxy,
        })
        return json(200, { ok: true, settings: written })
      })),

      // 模型池：列出 DSH 里可用的 provider 与模型，供设置界面选择
      register('pool.providers', ['GET'], guard(async () => {
        const llm = llmHost ?? ctx.get?.('llm')
        if (llm === undefined) {
          return json(200, { available: false, providers: [], reason: '宿主没有提供 llm 服务' })
        }
        const providers = []
        // 只列真正挂上适配器的 provider（listProviders 返回的就是这些）
        const registered = llm.listProviders?.() ?? []
        for (const entry of registered) {
          const id = entry?.id ?? entry?.provider
          if (typeof id !== 'string') continue
          let models = []
          try {
            const list = await llm.listModels?.(id)
            models = Array.isArray(list)
              ? list.map((m) => ({ id: m?.id ?? m?.model ?? String(m), name: m?.name ?? null }))
              : []
          } catch {
            // 某个 provider 取不到模型不影响其他 provider
            models = []
          }
          providers.push({ id, name: entry?.name ?? id, models })
        }
        const config2 = effectiveConfig()
        return json(200, {
          available: true,
          providers,
          // 搜索能力状态：模型池模式要靠外部搜索接口自己搜
          search: {
            provider: config2.searchProvider,
            configured:
              config2.searchProvider === 'deepseek'
                ? (await describeCredential(ctx, resolved.apiBaseURL)).active !== null
                : (searchKeyOf(config2, config2.searchProvider) ?? '') !== '',
            proxy: typeof config2.searchProxy === 'string' && config2.searchProxy !== '',
          },
        })
      })),

      // 模型池对话：把 ctx.llm 的流转换成 Anthropic SSE，客户端无需感知差异
      register('pool.messages', ['POST'], guard(async (request) => {
        const llm = llmHost ?? ctx.get?.('llm')
        if (llm === undefined) {
          return json(503, { error: { message: '宿主没有提供 llm 服务，模型池模式不可用' } })
        }
        const body = await readJson(request)
        const provider = typeof body?.provider === 'string' ? body.provider : ''
        const model = typeof body?.model === 'string' ? body.model : ''
        if (provider === '' || model === '') {
          return json(400, { error: { message: '缺少 provider 或 model' } })
        }
        // handlePoolMessages 要读原始 body，这里重新构造一个 Request 传进去
        const rebuilt = new Request(request.url, {
          method: 'POST',
          headers: request.headers,
          body: JSON.stringify(body),
          signal: request.signal,
        })
        const config2 = effectiveConfig()
        return handlePoolMessages({
          llm,
          request: rebuilt,
          config: config2,
          provider,
          model,
          search: body?.search === true,
          searchKey: searchKeyOf(config2, config2.searchProvider),
          resolveDeepSeekKey,
        })
      })),
    ]

    // 路由注册返回 disposer，交给 ctx.effect 统一回收
    ctx.effect(() => () => {
      for (const dispose of disposers) dispose()
    }, 'deepseek-chat: API routes')
  })
}

/** 列表只需要摘要，避免把整段消息搬进浏览器 */
function toSummary(session) {
  return {
    id: session.id,
    title: typeof session.title === 'string' ? session.title : '',
    createdAt: session.createdAt ?? 0,
    updatedAt: session.updatedAt ?? 0,
    // 置顶标记：客户端按它排出「置顶」分组
    pinnedAt: session.pinnedAt ?? null,
  }
}
