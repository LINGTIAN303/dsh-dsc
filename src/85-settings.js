/**
 * 设置弹窗：对齐官方网页端的「系统设置」——左侧分区导航，右侧内容。
 *
 * 分区划分按官方：通用设置 / 账号管理 / 数据管理 / 服务协议。
 * 本插件没有账号与协议体系，对应分区放真实可做的事：
 *   通用设置 = 模型来源 + 搜索渠道 + 麦克风
 *   账号管理 = DeepSeek 凭据（对应官方「账号」）
 *   数据管理 = 会话存储位置与清空
 *   服务协议 = 说明这份实现的边界
 */
function SettingsDialog({ onClose }) {
  useLocaleRevision()
  const [tab, setTab] = useState('general')
  const info = useStore(credential, (state) => state)
  const ref = useRef(null)

  useOutsideClick(ref, true, onClose)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const tabs = [
    { id: 'general', label: T('settingsGeneral'), icon: IconSettingsOutline16 },
    { id: 'account', label: T('settingsAccount'), icon: IconUserOutline16 },
    { id: 'data', label: T('settingsData'), icon: IconDataOutline16 },
    { id: 'about', label: T('settingsAbout'), icon: IconDocOutline16 },
  ]

  return h('div', {
    className: 'dsa-overlay',
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) onClose()
    },
  },
    h('section', {
      ref,
      className: 'dsa-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': T('settings'),
    },
      h('header', { className: 'dsa-dialog-header' },
        h('h2', { className: 'dsa-dialog-title' }, T('settings')),
        h('button', { type: 'button', className: 'dsa-icon-button', onClick: onClose, 'aria-label': T('close') },
          h(IconCloseOutline16),
        ),
      ),
      h('div', { className: 'dsa-dialog-layout' },
        h('nav', { className: 'dsa-dialog-nav' },
          tabs.map((item) =>
            h('button', {
              key: item.id,
              type: 'button',
              className: 'dsa-dialog-nav-item',
              'data-active': tab === item.id ? 'true' : 'false',
              onClick: () => setTab(item.id),
            },
              h('span', { className: 'dsa-dialog-nav-icon' }, h(item.icon)),
              item.label,
            ),
          ),
        ),
        h('div', { className: 'dsa-dialog-body' },
          tab === 'general' && h(GeneralSection, { poolHint: null }),
          tab === 'account' && h(AccountSection, { info }),
          tab === 'data' && h(DataSection),
          tab === 'about' && h(AboutSection),
        ),
      ),
    ),
  )
}

/** 通用设置：模型来源、模型池选择、搜索渠道、麦克风 */
function GeneralSection() {
  useLocaleRevision()
  const source = useStore(settings, (state) => state.source)
  const poolProvider = useStore(settings, (state) => state.poolProvider)
  const poolModel = useStore(settings, (state) => state.poolModel)
  const [pool, setPool] = useState(null)
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState(() => readPreferredMic())

  // 拉一次模型池清单：provider 与各自模型由 Host 现查，缓存到本次弹窗
  useEffect(() => {
    let cancelled = false
    readPoolProviders()
      .then((value) => {
        if (!cancelled) setPool(value)
      })
      .catch(() => {
        if (!cancelled) setPool({ available: false, providers: [], search: { configured: false, proxy: false } })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 列出录音设备。label 只有在已授权后才有值，所以先请求一次权限再枚举，
  // 否则用户看到的全是空名字，没法判断该选哪个。
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        await navigator.mediaDevices?.getUserMedia({ audio: true })
      } catch {
        // 被拒绝也继续，至少能列出 deviceId
      }
      try {
        const list = (await navigator.mediaDevices?.enumerateDevices?.()) ?? []
        if (cancelled) return
        setDevices(list.filter((item) => item.kind === 'audioinput'))
      } catch {
        if (!cancelled) setDevices([])
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return h(React.Fragment, null,
    h('div', { className: 'dsa-field' },
      h('label', { className: 'dsa-field-label', htmlFor: 'dsa-source' }, T('modelSource')),
      h('select', {
        id: 'dsa-source',
        className: 'dsa-input',
        value: source,
        onChange: (event) => {
          const next = event.target.value
          settings.set((state) => ({ ...state, source: next }))
          // 首次切到模型池时自动挑一个可用的 provider/模型，避免空选择
          if (next === 'pool' && poolProvider === '' && pool !== null) {
            const first = pool.providers.find((p) => p.models.length > 0)
            if (first !== undefined) {
              settings.set((state) => ({
                ...state,
                poolProvider: first.id,
                poolModel: first.models[0].id,
              }))
            }
          }
        },
      },
        h('option', { value: 'direct' }, T('sourceDirect')),
        h('option', { value: 'pool', disabled: pool !== null && !pool.available }, T('sourcePool')),
      ),
      h('div', { className: 'dsa-hint' },
        source === 'pool' ? T('sourcePoolHint') : T('sourceDirectHint')),
    ),

    // 模型池模式下才出现的 provider / 模型选择
    source === 'pool' &&
      h('div', { className: 'dsa-field' },
        h('label', { className: 'dsa-field-label', htmlFor: 'dsa-pool-provider' }, T('poolProvider')),
        pool === null
          ? h('div', { className: 'dsa-hint' }, '…')
          : h('select', {
              id: 'dsa-pool-provider',
              className: 'dsa-input',
              value: poolProvider,
              onChange: (event) => {
                const id = event.target.value
                const entry = pool.providers.find((p) => p.id === id)
                settings.set((state) => ({
                  ...state,
                  poolProvider: id,
                  poolModel: entry?.models[0]?.id ?? '',
                }))
              },
            },
              pool.providers.filter((p) => p.models.length > 0).map((p) =>
                h('option', { key: p.id, value: p.id }, `${p.name}（${p.models.length}）`),
              ),
            ),
        h('label', { className: 'dsa-field-label', htmlFor: 'dsa-pool-model' }, T('poolModel')),
        pool === null
          ? h('div', { className: 'dsa-hint' }, '…')
          : h('select', {
              id: 'dsa-pool-model',
              className: 'dsa-input',
              value: poolModel,
              onChange: (event) => {
                const id = event.target.value
                settings.set((state) => ({ ...state, poolModel: id }))
              },
            },
              (pool.providers.find((p) => p.id === poolProvider)?.models ?? []).map((m) =>
                h('option', { key: m.id, value: m.id }, m.name ?? m.id),
              ),
            ),
      ),

    // 搜索渠道：模型池模式的联网搜索由它提供
    h(SearchSection),

    // 麦克风选择：系统默认可能是虚拟声卡，录出来全静音，必须能手动换
    h('div', { className: 'dsa-field' },
      h('label', { className: 'dsa-field-label', htmlFor: 'dsa-mic' }, T('microphone')),
      h('select', {
        id: 'dsa-mic',
        className: 'dsa-input',
        value: deviceId,
        onChange: (event) => {
          setDeviceId(event.target.value)
          writePreferredMic(event.target.value)
        },
      },
        h('option', { value: '' }, T('microphoneDefault')),
        devices.map((device, index) =>
          h('option', { key: device.deviceId || index, value: device.deviceId },
            device.label || `${T('microphoneDevice')} ${index + 1}`,
          ),
        ),
      ),
      h('div', { className: 'dsa-hint' }, T('microphoneHint')),
    ),
  )
}

/**
 * 搜索渠道：三选一 + 代理地址。
 *
 * 三个渠道的差别对用户是实质性的（要不要额外 Key、要不要代理），
 * 所以每一项都带状态标记，选之前就能看出哪个能用。
 */
function SearchSection() {
  useLocaleRevision()
  const [state, setState] = useState(null)
  const [proxyDraft, setProxyDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    readSearchSettings()
      .then((value) => {
        if (cancelled) return
        setState(value)
        setProxyDraft(value.proxy ?? '')
      })
      .catch(() => {
        if (!cancelled) setState({ provider: 'deepseek', proxy: '', providers: [], proxyConfigured: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const persist = async (patch) => {
    setBusy(true)
    try {
      await saveSearchSettings(patch)
      const next = await readSearchSettings()
      setState(next)
      setProxyDraft(next.proxy ?? '')
    } catch (error) {
      showToast(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (state === null) return h('div', { className: 'dsa-field' }, h('div', { className: 'dsa-hint' }, '…'))

  const active = state.providers.find((item) => item.id === state.provider)

  return h('div', { className: 'dsa-field' },
    h('label', { className: 'dsa-field-label', htmlFor: 'dsa-search-channel' }, T('searchChannel')),
    h('select', {
      id: 'dsa-search-channel',
      className: 'dsa-input',
      value: state.provider,
      disabled: busy,
      onChange: (event) => void persist({ provider: event.target.value }),
    },
      state.providers.map((item) =>
        h('option', { key: item.id, value: item.id },
          `${item.label} · ${item.configured ? T('searchKeyReady') : T('searchKeyMissing')}`,
        ),
      ),
    ),
    h('div', { className: 'dsa-hint' }, T('searchChannelHint')),

    // 代理只对需要的渠道显示，避免给不需要的渠道制造「必须填」的错觉
    active?.needsProxy === true &&
      h('div', { className: 'dsa-field' },
        h('label', { className: 'dsa-field-label', htmlFor: 'dsa-search-proxy' }, T('searchProxy')),
        h('input', {
          id: 'dsa-search-proxy',
          className: 'dsa-input',
          type: 'text',
          placeholder: T('searchProxyPlaceholder'),
          value: proxyDraft,
          disabled: busy,
          onChange: (event) => setProxyDraft(event.target.value),
          onBlur: () => {
            if (proxyDraft.trim() !== (state.proxy ?? '')) void persist({ proxy: proxyDraft.trim() })
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
          },
        }),
        h('div', { className: 'dsa-hint' }, T('searchProxyHint')),
      ),

    active?.configured === false &&
      h('div', { className: 'dsa-status', 'data-tone': 'error' }, T('poolNoSearchKey')),
  )
}

/** 账号管理：DeepSeek 凭据 */
function AccountSection({ info }) {
  useLocaleRevision()
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const activeLabel =
    info.active === 'plugin-key'
      ? T('credentialActivePlugin')
      : info.active === 'account'
        ? T('credentialActiveAccount')
        : info.active === 'env-key'
          ? T('credentialActiveEnv')
          : T('credentialMissing')

  const save = async () => {
    // 空输入不保存：「保存」按钮不该删除已有 Key，那是「清除」的职责。
    // 早先这里直接把空串传给 Host，等于 unset——用户点一下保存就把 Key 清掉了。
    const next = draft.trim()
    if (next === '') {
      setStatus({ tone: 'error', message: T('apiKeyEmpty') })
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const info2 = await saveCredential(next)
      credential.set(info2)
      setDraft('')
      setStatus({ tone: 'ok', message: T('save2') })
    } catch (error) {
      // 保存失败时把 Host 侧的真实状态一并取出，用户看到的就是原因而不是「失败」
      let detail = ''
      try {
        const info3 = await diagnoseHost()
        if (!info3.credentialsService) detail = ' · Host 没有凭据服务'
      } catch {
        detail = ' · 连不上 Host'
      }
      setStatus({ tone: 'error', message: `${error.message}${detail}` })
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const result = await verifyCredential(draft.trim() || undefined)
      if (result.ok) {
        setStatus({
          tone: 'ok',
          message: `${T('verified')}${result.models.length > 0 ? ` · ${result.models.map((item) => item.id).join(', ')}` : ''}`,
        })
      }
    } catch (error) {
      setStatus({ tone: 'error', message: error.message })
    } finally {
      setBusy(false)
    }
  }

  return h(React.Fragment, null,
    h('div', { className: 'dsa-field' },
      h('div', { className: 'dsa-status', 'data-tone': info.active === null ? 'error' : 'ok' }, activeLabel),
    ),
    h('div', { className: 'dsa-field' },
      h('label', { className: 'dsa-field-label', htmlFor: 'dsa-api-key' }, T('apiKey')),
      h('input', {
        id: 'dsa-api-key',
        className: 'dsa-input',
        type: 'password',
        autoComplete: 'off',
        placeholder: info.pluginKey.masked ?? T('apiKeyPlaceholder'),
        value: draft,
        onChange: (event) => setDraft(event.target.value),
        onKeyDown: (event) => {
          if (event.key === 'Enter') void save()
        },
      }),
      h('div', { className: 'dsa-hint' }, T('apiKeyHint')),
    ),
    status !== null &&
      h('div', { className: 'dsa-field' },
        h('div', { className: 'dsa-status', 'data-tone': status.tone }, status.message),
      ),
    h('div', { className: 'dsa-dialog-actions' },
      h('button', {
        type: 'button',
        className: 'dsa-button',
        'data-variant': 'primary',
        disabled: busy,
        onClick: save,
      }, busy ? '…' : T('save2')),
      h('button', {
        type: 'button',
        className: 'dsa-button',
        disabled: busy,
        onClick: verify,
      }, busy ? T('verifying') : T('verify')),
      h('span', { style: { flex: 1 } }),
      h('button', {
        type: 'button',
        className: 'dsa-button',
        disabled: busy || !info.pluginKey.configured,
        onClick: async () => {
          setBusy(true)
          try {
            const next = await saveCredential('')
            credential.set(next)
            setStatus({ tone: 'ok', message: T('clear') })
          } catch (error) {
            setStatus({ tone: 'error', message: error.message })
          } finally {
            setBusy(false)
          }
        },
      }, T('clear')),
    ),
  )
}

/** 数据管理：会话存放位置与清空入口 */
function DataSection() {
  useLocaleRevision()
  const items = useStore(sessions, (state) => state.items)
  const [busy, setBusy] = useState(false)

  return h(React.Fragment, null,
    h('div', { className: 'dsa-row' },
      h('div', { className: 'dsa-row-main' },
        h('div', { className: 'dsa-row-title' }, T('dataSessions')),
        h('div', { className: 'dsa-row-desc' }, T('dataSessionsDesc')),
      ),
      h('div', { className: 'dsa-row-value' }, String(items.length)),
    ),
    h('div', { className: 'dsa-row' },
      h('div', { className: 'dsa-row-main' },
        h('div', { className: 'dsa-row-title' }, T('dataClearAll')),
        h('div', { className: 'dsa-row-desc' }, T('dataClearAllDesc')),
      ),
      h('button', {
        type: 'button',
        className: 'dsa-button',
        'data-variant': 'danger',
        disabled: busy || items.length === 0,
        onClick: async () => {
          const ok = await openConfirm({
            title: T('dataClearConfirm'),
            body: T('deleteIrreversible'),
            confirmLabel: T('dataClearAllAction'),
            danger: true,
          })
          if (!ok) return
          setBusy(true)
          try {
            for (const item of items) await removeSession(item.id)
            createSession()
          } catch (error) {
            showToast(error.message)
          } finally {
            setBusy(false)
          }
        },
      }, busy ? '…' : T('dataClearAllAction')),
    ),
  )
}

/** 服务协议：说明这份实现与官方的关系，避免误解 */
function AboutSection() {
  useLocaleRevision()
  return h('div', { className: 'dsa-about' },
    h('p', null, T('aboutBody1')),
    h('p', null, T('aboutBody2')),
  )
}

/** 顶部提示条 */
function Toast() {
  const state = useStore(toast, (value) => value)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (state.message === null) return undefined
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(timer)
  }, [state.seq, state.message])

  if (!visible || state.message === null) return null
  return h('div', { className: 'dsa-toast', role: 'status' }, state.message)
}
