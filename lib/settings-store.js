/**
 * 非敏感运行设置的持久化：搜索渠道与代理地址。
 *
 * 为什么不放凭据服务：凭据服务是给密钥用的，渠道选择和代理地址不是密钥，
 * 放进去会让「凭据」这个概念失焦，也不便于用户在文件里排查。
 * 密钥仍然只走凭据服务（见 credential.js），这里不碰任何密钥。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** 允许写入的字段；其余一律忽略，避免前端塞进任意键污染配置 */
const ALLOWED = new Set(['searchProvider', 'searchProxy'])

export class SettingsStore {
  #file
  #cache

  constructor(file) {
    this.#file = file ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'dsh-deepseek-app', 'settings.json')
  }

  get file() {
    return this.#file
  }

  /** 读全部覆盖值；文件缺失或损坏时返回空对象，不让坏文件挡住面板 */
  read() {
    if (this.#cache !== undefined) return this.#cache
    if (!existsSync(this.#file)) {
      this.#cache = {}
      return this.#cache
    }
    try {
      const parsed = JSON.parse(readFileSync(this.#file, 'utf8'))
      this.#cache = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      this.#cache = {}
    }
    return this.#cache
  }

  /**
   * 合并写入。空串表示清除该项（回到插件配置的默认值）。
   * @returns 写入后的完整设置
   */
  write(patch) {
    const next = { ...this.read() }
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!ALLOWED.has(key)) continue
      if (typeof value !== 'string' || value.trim() === '') delete next[key]
      else next[key] = value.trim()
    }
    mkdirSync(dirname(this.#file), { recursive: true })
    const temp = `${this.#file}.tmp`
    writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8')
    renameSync(temp, this.#file)
    this.#cache = next
    return next
  }
}

/**
 * 把用户覆盖值叠到插件配置上。
 * 覆盖值优先——用户在界面里改的东西必须立即生效，否则「设置」就是假的。
 */
export function overlaySettings(resolved, overrides) {
  const provider = overrides.searchProvider ?? resolved.searchProvider
  const proxy = overrides.searchProxy ?? resolved.searchProxy
  return { ...resolved, searchProvider: provider, searchProxy: proxy }
}
