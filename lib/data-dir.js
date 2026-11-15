/**
 * 插件数据目录：会话与设置都落在 `$DSH_HOME/plugins/<目录名>/` 下。
 *
 * **目录名刻意不跟包名走。** 这个插件改过两次名（`dsh-deepseek-app` →
 * `dsh-deepseek-chat` → 发布名 `dsh-dsc`），若目录跟着包名变，每次改名都要
 * 迁移一次用户数据，而数据迁移是「做错了就丢历史」的操作。现在目录名固定为
 * `dsh-deepseek-chat`，以后无论包名怎么改，用户数据都原地不动。
 *
 * 为什么单独一个模块：会话与设置各自算一遍路径时，改包名会出现
 * 「sessions 读新目录、settings 还在读旧目录」这种半迁移状态，排查极其费劲。
 * 路径只在这里定义一次。
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * 数据目录名。**不要改成包名**——见文件头说明。
 * 这是磁盘上的稳定标识，与 npm 包名解耦。
 */
export const DATA_DIR_NAME = 'dsh-deepseek-chat'

/**
 * 历史目录名，按时间倒序排列。
 * 首次加载时按顺序找第一个存在的目录搬数据，搬完就停——
 * 这样从任意旧版本升上来的用户都能找到自己的会话。
 */
const LEGACY_DIR_NAMES = ['dsh-deepseek-app']

const dshHome = () => process.env.DSH_HOME || join(homedir(), '.dsh')

/** 插件数据目录，不存在时创建 */
export function pluginDataDir() {
  const dir = join(dshHome(), 'plugins', DATA_DIR_NAME)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 数据文件名 → 绝对路径 */
export function pluginDataFile(name) {
  return join(pluginDataDir(), name)
}

/**
 * 从历史目录搬数据。幂等（新目录已有同名文件则跳过），且**不删旧目录**：
 * 迁移本身有风险，留着旧文件让用户能自己回滚。
 * 返回搬过的文件名数组，便于日志定位。
 */
export function migrateLegacyData() {
  const target = join(dshHome(), 'plugins', DATA_DIR_NAME)
  mkdirSync(target, { recursive: true })

  const moved = []
  for (const legacyName of LEGACY_DIR_NAMES) {
    const legacy = join(dshHome(), 'plugins', legacyName)
    if (!existsSync(legacy)) continue
    for (const name of ['sessions.json', 'settings.json']) {
      const from = join(legacy, name)
      const to = join(target, name)
      // 新目录已有同名文件就不覆盖：用户可能已在新版本里改过，新数据优先
      if (!existsSync(from) || existsSync(to)) continue
      cpSync(from, to)
      moved.push(name)
    }
  }
  return moved
}
