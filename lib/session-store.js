/**
 * 会话持久化：整份会话列表落在 Host 的一个 JSON 文件里。
 * 放 Host 而不是浏览器，是为了换浏览器/清缓存也不丢历史。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

/** 单文件上限：超出就拒绝写入，避免把整个面板拖死 */
const MAX_BYTES = 32 * 1024 * 1024

export class SessionStore {
  #file
  #cache
  /** 串行化写入：并发的保存请求排队落盘，避免互相覆盖 */
  #queue = Promise.resolve()

  constructor(file) {
    this.#file = file ?? join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'plugins', 'dsh-deepseek-app', 'sessions.json')
  }

  get file() {
    return this.#file
  }

  /** 读取全部会话；文件不存在或损坏时返回空列表，不让坏文件挡住面板 */
  #read() {
    if (this.#cache !== undefined) return this.#cache
    if (!existsSync(this.#file)) {
      this.#cache = { version: 1, sessions: [] }
      return this.#cache
    }
    const text = readFileSync(this.#file, 'utf8')
    if (text.length > MAX_BYTES) {
      throw new Error(`会话文件超过 ${MAX_BYTES} 字节，请先清理 ${this.#file}`)
    }
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      this.#cache = { version: 1, sessions: [] }
      return this.#cache
    }
    this.#cache = {
      version: 1,
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
    }
    return this.#cache
  }

  list() {
    return this.#read().sessions
  }

  get(id) {
    return this.#read().sessions.find((session) => session?.id === id)
  }

  /** 写入或更新一个会话；title/updatedAt 由调用方给全 */
  async save(session) {
    if (typeof session?.id !== 'string' || session.id === '') {
      throw new Error('会话缺少 id')
    }
    this.#queue = this.#queue.then(() => {
      const data = this.#read()
      const index = data.sessions.findIndex((item) => item?.id === session.id)
      if (index >= 0) data.sessions[index] = session
      else data.sessions.unshift(session)
      this.#flush(data)
    })
    return this.#queue
  }

  async remove(id) {
    this.#queue = this.#queue.then(() => {
      const data = this.#read()
      const next = data.sessions.filter((item) => item?.id !== id)
      if (next.length === data.sessions.length) return
      data.sessions = next
      this.#flush(data)
    })
    return this.#queue
  }

  /** 先写临时文件再改名，避免写到一半断电留下半个 JSON */
  #flush(data) {
    mkdirSync(dirname(this.#file), { recursive: true })
    const text = JSON.stringify(data)
    if (text.length > MAX_BYTES) {
      throw new Error(`会话数据超过 ${MAX_BYTES} 字节，请先删除部分历史`)
    }
    const temp = `${this.#file}.tmp`
    writeFileSync(temp, text, 'utf8')
    renameSync(temp, this.#file)
  }
}
