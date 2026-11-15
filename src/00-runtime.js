const React = require('react')
const ReactDOM = require('react-dom')
const h = React.createElement
const { memo, useCallback, useEffect, useMemo, useRef, useState } = React

/** 客户端要用的宿主服务；缺任何一个都不会激活，避免在半残环境里报错 */
const INJECT = ['slots', 'layout', 'locale', 'theme']

/** 类名拼接：只保留真值 */
const cx = (...values) => values.filter(Boolean).join(' ')

/** 稳定 id：会话与消息都不需要和宿主对齐，本地唯一即可 */
const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/**
 * 极简订阅式 store：React 18 的 useSyncExternalStore 读快照，
 * 状态不可变更新，避免外部库依赖。
 */
function createStore(initial) {
  let state = initial
  const listeners = new Set()
  return {
    get: () => state,
    set(update) {
      const next = typeof update === 'function' ? update(state) : update
      if (next === state) return
      state = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** 从 store 里选一片状态；选择函数应返回稳定引用或原始值 */
function useStore(store, select) {
  return React.useSyncExternalStore(
    store.subscribe,
    () => select(store.get()),
    () => select(store.get()),
  )
}

/** 每秒推进一次的 tick，用于思考用时与搜索词轮播 */
function useTicker(active, interval = 1000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return undefined
    const timer = setInterval(() => setTick((value) => value + 1), interval)
    return () => clearInterval(timer)
  }, [active, interval])
}

/** 点击外部关闭：锚定弹层的通用行为 */
function useOutsideClick(ref, active, onClose) {
  useEffect(() => {
    if (!active) return undefined
    const handler = (event) => {
      if (ref.current !== null && !ref.current.contains(event.target)) onClose()
    }
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [ref, active, onClose])
}

/** 记住用户选的麦克风：只存 deviceId，不涉及隐私内容 */
const MIC_STORAGE_KEY = 'dsh-deepseek-chat:mic'

function readPreferredMic() {
  try {
    return localStorage.getItem(MIC_STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function writePreferredMic(deviceId) {
  try {
    if (deviceId === '') localStorage.removeItem(MIC_STORAGE_KEY)
    else localStorage.setItem(MIC_STORAGE_KEY, deviceId)
  } catch {
    // 存储不可用时只影响下次记忆，不影响本次录音
  }
}

/**
 * 应用内确认弹窗：替代 window.confirm。
 * 原生弹窗样式与官方视觉完全脱节（系统灰窗 + 「确定/取消」按钮），
 * 官方确认弹窗是应用内浮层：深色圆角卡 + 主色/危险色按钮。
 * openConfirm({ title, body, confirmLabel, danger }) 返回 Promise<boolean>。
 */
const confirmStore = createStore({ spec: null, seq: 0 })

function openConfirm(spec) {
  return new Promise((resolve) => {
    confirmStore.set({ spec, seq: confirmStore.get().seq + 1 })
    confirmStore.__resolve = resolve
  })
}

function settleConfirm(result) {
  const state = confirmStore.get()
  if (state.spec === null) return
  confirmStore.set({ spec: null, seq: state.seq })
  confirmStore.__resolve?.(result)
}