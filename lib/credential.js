/**
 * 凭据解析：插件自有 Key 优先，其次 DSH 已登录的 DeepSeek 账号，最后环境变量。
 * 只在 Host 内存里流转，绝不下发到浏览器。
 */

/**
 * 插件自有的 API Key 引用名。
 * 与 DSH 模型路由用的 DEEPSEEK_API_KEY 分开，避免互相串改。
 */
const PLUGIN_KEY_REF = 'DEEPSEEK_APP_API_KEY'

/** 账号令牌只发往允许的目的地，由账号服务自己判定 */
const ACCOUNT_TOKEN_HEADER = 'x-dsh-auth-token'

/** 凭据服务是可选依赖：profile 里没有它时按未配置处理，而不是让插件起不来 */
const credentialsOf = (ctx) => ctx.get?.('credentials')

/**
 * 依次尝试三种凭据来源，返回第一个可用的凭据。
 * @param ctx Cordis 上下文，用于取 credentials / deepseekAccount
 * @param apiBaseURL 本次请求的目的地，账号服务据此判断是否允许下发令牌
 */
export async function resolveCredential(ctx, apiBaseURL) {
  // 1. 插件自有 Key
  const credentials = credentialsOf(ctx)
  if (credentials !== undefined) {
    const info = await credentials.describe(PLUGIN_KEY_REF)
    if (info.configured) {
      const resolved = await credentials.resolve(PLUGIN_KEY_REF)
      if (resolved?.value) {
        return { kind: 'plugin-key', headers: { 'x-api-key': resolved.value } }
      }
    }
  }

  // 2. DSH 已登录的 DeepSeek 账号令牌
  const token = await ctx.get?.('deepseekAccount')?.resolveToken(apiBaseURL)
  if (token) {
    return { kind: 'account', headers: { [ACCOUNT_TOKEN_HEADER]: token } }
  }

  // 3. 环境里的 DEEPSEEK_API_KEY
  const envValue = process.env.DEEPSEEK_API_KEY
  if (envValue) {
    return { kind: 'env-key', headers: { 'x-api-key': envValue } }
  }

  return undefined
}

/**
 * 凭据面板需要的只读状态：说明当前生效的是哪一种来源，不返回任何密钥。
 * @returns active 为 null 表示三种来源都没有配置。
 */
export async function describeCredential(ctx, apiBaseURL) {
  const credentials = credentialsOf(ctx)
  const info = credentials === undefined ? undefined : await credentials.describe(PLUGIN_KEY_REF)
  const accountToken = await ctx.get?.('deepseekAccount')?.resolveToken(apiBaseURL)
  const envKey = process.env.DEEPSEEK_API_KEY
  const active = info?.configured ? 'plugin-key' : accountToken ? 'account' : envKey ? 'env-key' : null
  return {
    active,
    pluginKey: {
      configured: Boolean(info?.configured),
      writable: info?.writable ?? false,
      masked: info?.masked ?? null,
    },
    account: { signedIn: Boolean(accountToken) },
    env: { configured: Boolean(envKey) },
  }
}

/** 写入插件自有 Key；空串等价于清除，清除后自动回落到账号或环境 */
export async function savePluginKey(ctx, value) {
  const credentials = credentialsOf(ctx)
  if (credentials === undefined) {
    // 这个错误要能让用户看懂该怎么办，而不是只说「失败了」
    throw new Error(
      '当前 profile 没有可用的凭据服务（ctx.credentials），API Key 无法保存。请确认 dsh-base 里的 credentials 行处于启用状态。',
    )
  }
  if (!value) {
    await credentials.unset(PLUGIN_KEY_REF)
    return
  }
  await credentials.set(PLUGIN_KEY_REF, value)
}

/** 把 API 的错误体还原成一句可展示的话 */
export function parseError(text) {
  if (!text) return ''
  try {
    const body = JSON.parse(text)
    if (typeof body?.error?.message === 'string') return body.error.message
    if (typeof body?.message === 'string') return body.message
  } catch {
    // 非 JSON 直接展示原文
  }
  return text.slice(0, 500)
}
