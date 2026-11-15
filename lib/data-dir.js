/**
 * 插件数据目录：会话与设置都落在 `$DSH_HOME/plugins/<包名>/` 下。
 *
 * 为什么单独一个模块：会话与设置各自算一遍路径时，改包名会出现
 * 「sessions 读新目录、settings 还在读旧目录」这种半迁移状态，
 * 排查起来极其费劲。路径只在这里定义一次。
 *
 * 迁移背景：插件原名 `dsh-deepseek-app`，随仓库改名为 `dsh-deepseek-chat`。
 * 目录名跟着包名走，老用户的历史会话在旧目录里——必须搬过来，
 * 否则表现就是「升级后所有会话凭空消失」。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/** 当前包名，与 package.json 的 name 保持一致 */
export const PACKAGE_NAME = 'dsh-deepseek-chat'

/** 改名前用的包名；只用于迁移，不要在新逻辑里引用 */
const LEGACY_PACKAGE_NAME = 'dsh-deepseek-app'

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')

/** 插件数据目录，不存在时创建 */
export function pluginDataDir() {
  const dir = join(dshHome(), 'plugins', PACKAGE_NAME)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 数据文件名 → 绝对路径 */
export function pluginDataFile(name) {
  return join(pluginDataDir(), name)
}

/**
 * 从旧包名目录搬数据。幂等（已迁移则直接返回），且**不删旧目录**：
 * 迁移本身有风险，留着旧文件让用户能自己回滚。
 * 返回搬过的文件名数组，便于日志定位。
 */
export function migrateLegacyData() {
  const legacy = join(dshHome(), 'plugins', LEGACY_PACKAGE_NAME)
  if (!existsSync(legacy)) return []

  const target = join(dshHome(), 'plugins', PACKAGE_NAME)
  mkdirSync(target, { recursive: true })

  const moved = []
  for (const name of ['sessions.json', 'settings.json']) {
    const from = join(legacy, name)
    const to = join(target, name)
    // 新目录已有同名文件就不覆盖：用户可能已经在新版本里改过，新数据优先
    if (!existsSync(from) || existsSync(to)) continue
    cpSync(from, to)
    moved.push(name)
  }
  return moved
}
