/** 插件入口：注册侧栏图标、中央面板、样式与语言 */
function apply(ctx) {
  // 语言跟随宿主：LocaleSnapshot 的字段是 active（不是 id），拿不到时退回浏览器语言
  const syncLocale = () => {
    let id = ''
    try {
      const snapshot = ctx.locale.getLocale()
      id = snapshot?.active ?? ''
    } catch {
      id = ''
    }
    if (id === '') id = navigator.language || 'zh'
    setLocale(id)
  }
  syncLocale()
  ctx.effect(() => ctx.on('locale/change', syncLocale), 'deepseek-app: locale')

  // 面板样式：挂一份 <style>，卸载时移除
  ctx.effect(() => {
    const style = document.createElement('style')
    style.setAttribute('data-plugin', 'dsh-deepseek-app')
    style.textContent = STYLES
    document.head.appendChild(style)
    return () => style.remove()
  }, 'deepseek-app: styles')

  // 中央面板：key 与侧栏图标 id 一致，侧栏点它时中央就渲染这个组件。
  // layout 由闭包传入：面板里的「返回对话」需要它切换中央面板。
  ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: 'deepseek-app' }, (props) =>
      h(DeepSeekPanel, { ...props, layout: ctx.layout }),
    ),
  )

  // 侧栏图标
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: 'deepseek-app',
        order: 8,
        label: () => T('panelLabel'),
      },
      DeepSeekIcon,
    ),
  )
}

/** 侧栏图标：DeepSeek 的鲸鱼轮廓，用当前文字色绘制 */
function DeepSeekIcon({ size }) {
  const edge = typeof size === 'number' ? size : 20
  return h('svg', {
    width: edge,
    height: edge,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
  },
    h('path', {
      d: 'M4.2 13.6c0-3.6 3.1-6.5 7-6.5 2.2 0 3.6.6 4.9 1.9l1.5-1.5v3.3l-1.4.5c-.5 2.9-2.7 5-5.7 5.3-.5 1.2-1.6 1.9-3 1.9-1.7 0-3-1.2-3.3-2.8l1.5-.3c.2.9.9 1.5 1.9 1.5.9 0 1.5-.5 1.7-1.2-2.6-.3-4.6-1.5-5.1-2.1z',
      fill: 'currentColor',
    }),
  )
}
