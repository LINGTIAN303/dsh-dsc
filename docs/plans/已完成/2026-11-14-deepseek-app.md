---
status: 已完成
---

# DeepSeek App 面板

## 目标

复刻 DeepSeek App 的对话体验作为 DSH 插件：左侧栏一个入口，点开后是一个全屏的竖屏 App 界面（不是横版网页布局），视觉与交互对齐官方 App。能力覆盖文章《DeepSeek 发布全家桶应用 API》列出的全部项。

## 实际执行的对齐基准

**落地时以官网页版 chat.deepseek.com 为准，不是 App。** 所有可测量的数值（侧栏 261px、消息列 752px、输入框 776px、`Ctrl + J` 提示、空态 composer 底距 347px）都取自网页版 DOM 与其 `main.css`；App 只有 iOS / Android 两端，本机无法做像素级实测。

因此本文"已完成"指的是：**对话能力全覆盖 + 网页版视觉与交互对齐**。App 版（导航模型、页面栈转场、触屏手势）的移植**未开始**，不能按本文状态认为 App 已复刻。

## 依据

- 公众号原文：[DeepSeek 发布全家桶应用 API](https://mp.weixin.qq.com/s?__biz=Mzk0OTYwNzc3NQ%3D%3D&mid=2247485910&idx=1&sn=529f50ba3b37e39319dad1faf7a122cf)
- 官方协议文档：[构建 Chatbot](https://api-docs.deepseek.com/zh-cn/guides/build_a_chatbot.md)、[联网工具](https://api-docs.deepseek.com/zh-cn/guides/web_tools.md)、[文件解析](https://api-docs.deepseek.com/zh-cn/guides/document_parsing.md)、[内容安全](https://api-docs.deepseek.com/zh-cn/guides/safety.md)、[语音合成](https://api-docs.deepseek.com/zh-cn/guides/tts.md)、[语音识别](https://api-docs.deepseek.com/zh-cn/guides/asr.md)
- 视觉与交互参照：官方开源 [chat-demo](https://github.com/deepseek-ai/chat-demo)（`src/app/theme.css` 的设计令牌、`ReplyArea` 的思考时间线、`SourceCard` 的来源卡片）

## 实测确认的前提

- 当前安装的 DSH 全量搜索 `deepseek_web_search`、`deepseek_read_url`、`safety_check`：**0 处命中**，说明这套服务端工具没有接入，插件有实际价值。
- DeepSeek API 对 `http://127.0.0.1:59491` 返回了正确的 CORS 预检响应（`access-control-allow-origin` 回显）。即便 CORS 可用，仍然走 Host 代理，目的是让密钥不进浏览器。
- 宿主 `LocaleSnapshot` 的当前语言字段是 `active` 而非 `id`；写错会静默退回英文。
- 暗色模式的宿主标记是 `body[data-ds-dark-theme]`。
- 插件走 `ctx.connection.fetch.register` 注册精确路由，自动获得 Host/Origin 校验与浏览器认证；未认证请求返回 401（已实测）。
- 平台共享模块表只提供 `react`、`react-dom`、`@deepseek-ai/cordis`、`zod` 等，**没有** `marked`、`katex`、`mermaid`，因此 Markdown 需要自带渲染器。
- 本地目录式安装的 bundle 从包自身目录解析模块，`@deepseek-ai/schemastery` 在那里不可达；Host 侧因此不声明 `Config`，改在 `apply` 里做默认值补齐。

## 交付

包在 `E:\dsh-deepseek-app`，已通过 `plugin_manager install_bundle` 装入 `desktop` profile，`application: applied`，无警告。

## 验收

| 项 | 方式 | 结果 |
| --- | --- | --- |
| 侧栏入口与中央面板注册 | `cordis_inspect_query` `Slots.listSubTree` | 两处均 `active: true` |
| 真实桌面窗口渲染 | 桌面截图 | 侧栏出现「DeepSeek」，点开后界面完整 |
| 界面语言 | 本地验证宿主 | 中文（跟随宿主 locale） |
| 空态、消息流、输入区布局 | 本地验证宿主 | 无溢出、输入区不被遮挡 |
| 思考时间线 / 搜索行 / 引用角标 | 注入假 SSE 流 | 全部渲染正确 |
| Markdown（标题/列表/引用/表格/代码块） | 注入假 SSE 流 | 全部渲染正确 |
| 暗色主题 | 切换 `body[data-ds-dark-theme]` | 令牌全部跟随，无残留亮色 |
| 来源面板 | 点引用角标 / 来源按钮 | 390px 侧栏，与对话区并排 |
| 设置弹窗 | 点侧栏「设置」 | password 输入、来源提示、按钮状态正确 |
| 窄屏 | 502px 视口 | 侧栏隐藏、输入区占满、无横向溢出 |
| 三种凭据优先级 | 单元测试 | 插件 Key → 账号令牌 → 环境变量，依次生效 |
| 会话存储 CRUD | 单元测试 | 新增/更新不重复/删除/落盘/坏文件降级 |
| 请求体组装 | 单元测试 | 文件块顺序、思考不回传、read_link 签名、拒答跳过、关搜索仍留 read_url |

## 优化轮（同日）

第一版交付后做了一轮缺陷修复与性能优化，全部有复现依据：

| 问题 | 影响 | 处理 |
| --- | --- | --- |
| 服务端会话标题被丢弃 | 标题永远停在本地截取的第一句 | `message_delta.delta.title` 回写会话并同步列表 |
| 附件 `previewUrl` 写入会话 JSON | 刷新后图片破图，blob URL 永不回收 | 预览存内存 Map，落盘时剥离字段 |
| 流式中途切换会话 | 收尾写错会话，旧回复永久停在 `pending` | 改成基于会话快照 `latest`，只有仍在该会话时才回写界面 |
| 切换会话不停朗读 | 在别的对话里继续念上一段 | 消息组件卸载时停止朗读 |
| 删除会话无确认 | 误删不可恢复 | 删除前确认 |
| 每个 SSE 事件重渲染全部历史消息 | 长会话流式卡顿 | 消息组件 `memo` + 只给最后一条传 `streaming` |
| TTS 超 10000 字符被拒 | 长回答朗读直接失败 | 按段落/句子切分，逐段播放 |
| ASR 超 120 秒被拒 | 长录音注定失败 | 录到 118 秒自动收尾转写 |
| 无效的 `@container` 查询 | 永远不会命中的死代码 | 删除 |

回归验证：服务端标题三处一致、会话文件不含 `previewUrl`、中途切换后旧会话回复状态为 `done` 且正文完整、40 个流式增量在 102 ms 内处理完、控制台无运行时报错。

## 真实 API 验证（凭据就位后）

用真实 `DEEPSEEK_APP_API_KEY` 直接驱动 Host 侧的路由处理器，跑通了全链路。这一轮抓到一个**只在真实调用下才会暴露的严重 bug**：

| 问题 | 证据 | 处理 |
| --- | --- | --- |
| **TTS / ASR 一直 404** | `new URL('tts', '.../v1/tools')` 会把末段 `tools` 当文件名替换，实际打到 `/v1/tts`；而直连 `/v1/tools/tts` 是 200 | `toolsBase` 结尾补斜杠，改为 `/v1/tools/` |
| 上游错误信息不可定位 | 缺 `anthropic-beta` 时只回一句 message | 错误里带上 HTTP 状态与错误码 |
| 超大附件无友好提示 | 100 MiB 上限、路由是缓冲型 | 按 Content-Length 前置拦截，返回 413 说明上限 |

验证结论（真实返回，非构造）：

- 深度搜索：一轮产生 9 个 `deep_search` 调用、18 条结果、3 段思考；插件把它们正确合并成 1 行搜索 + 1 行浏览 + 3 段思考，折叠标题「已思考（用时 N 秒）」。
- 阅读链接：`read_link` 调用带 1 个非空 `signature`，插件原样回传的假设成立。
- 文件输入：上传拿到 `file-api-…`，引用后正确回答文档里的数字；`hasFile` 自动补 `anthropic-beta` 生效。
- 内容安全：`safety_check: high` 下正常问题正常结束。
- 只声明 `read_url` 不开搜索：确实不触发搜索调用。
- **TTS → ASR 闭环**：合成「上海今天天气晴朗，气温二十五度。」的音频再转写，得到「上海今天天气晴朗，气温25°。」。
- 无凭据：`bootstrap` 的 `active` 为 `null`，界面明确提示填写，不是静默失败。
- 真实数据渲染回归：14 个原始内容块渲染为 2 个步骤行、3 段思考、4 个引用角标，与官方 App 观感一致。

## 真机反馈轮（录音 + 退出入口）

用户反馈两件事：录音「有反应但录不进去」、面板没有退出入口。

**录音根因不是格式，是设备选错。** 逐层排除：

1. 格式转换链路实测正常：合成 webm（11.8 KB）→ 解码 0.72s/48kHz → 重采样 11520 帧/16k → WAV 22.9 KB，峰值 0.313，文件头 RIFF/WAVE/fmt/data、PCM=1、单声道、16kHz、16 位全部合法。
2. 直接 `getUserMedia` 能成功，但拿到的设备是 `Internal AUX Jack (Steam Streaming Speakers)`。
3. 对比测量给出决定性证据：

| 设备 | 峰值 | 判定 |
| --- | --- | --- |
| Steam 虚拟声卡 | 0 | 静音 |
| Realtek 真实麦克风 | 0.9222 | 有声 |
| 系统默认 | 0 | 静音 |

系统默认录音设备指向了虚拟声卡，所以全程无异常、只是采到精确的 0。

处理：

- 录音结束后做静音检测（阈值约 -48 dBFS），命中就明确提示设备名并指向设置。
- 设置里新增「麦克风」下拉，列出所有录音设备，记住选择（只存 deviceId）。
- 每次录音失败都按 `NotAllowedError` / `NotFoundError` / `NotReadableError` 等给出可照做的提示。
- 重采样改用官方插件同款的 `OfflineAudioContext`，避免手写插值在降采样时混叠。

**退出入口**：标题栏左侧加「返回对话」按钮，调 `ctx.layout.selectPanel('conversation')`——这是切换中央面板的唯一入口。同时离开面板时停止朗读。

验证：设备列表正确列出 8 项；静音检测对精确静音判 true，对极低底噪与正常说话判 false（不误杀）；返回按钮与设置按钮都在标题栏；无运行时报错。

## 样式优化轮

对着官方 chat-demo 的源码逐个对齐：

| 项 | 之前 | 现在 |
| --- | --- | --- |
| 录音频谱 | 24 根柱子、高度按时钟正弦随机跳，与声音无关 | 移植官方算法：人声频段 100–4000 Hz 按对数分到 60 根柱、dB 映射高度、按倍频程补偿高频衰减、起快落慢；每帧直接改 `transform` 不触发 React 渲染 |
| 录音按钮 | 图标变蓝 | 外圈光晕呼吸 + 内圈实心 + 图标转白，与官方 VoiceButton 一致 |
| 思考/搜索开关选中态 | 用了宿主的 `button-ghost-active-fill`（中性灰），显示成深灰底 | 改用官方语义：浅色下品牌浅蓝底，暗色下深蓝底 + 浅蓝字 |
| 图标按钮 | 32px、hover 只换色 | 34px 圆形、hover 背景、focus 描边、禁用态降级，与官方 IconButton 一致 |
| 发送按钮禁用态 | 半透明蓝 | 中性底 + 灰字 |
| 滚动贴底 | 按「内容块数量」触发，块数不变但高度变化时停在中途 | 改用 `ResizeObserver` 跟随内容高度 |
| 输入区 | 工具栏 padding 偏大，整框 124px | 收紧到 118px |

关键判断：宿主的 `--dsw-alias-button-ghost-active-fill` 是**中性灰**（`neutral-bluish-100`），而官方 App 的选中态是**品牌浅蓝**（`blue-50`）。同名令牌语义不同，照抄会得到灰底——所以这里按官方调色板取值，而不是套宿主令牌。

另外新增「返回对话」入口（标题栏左侧，调 `ctx.layout.selectPanel('conversation')`）与「麦克风」选择。

## 未验证

- 浏览器里真实点击上传大文件（>100 MiB）的拦截提示。
- 真实录音（麦克风）的 ASR 链路：只用 TTS 生成的音频验证到接口层，浏览器录音的 WAV 重采样未在真机走过。
- 桌面端窗口仍被其他程序遮挡且会抢占前台焦点，因此像素级复核在本地验证宿主里用同一份产物完成。

## 下一步

1. 在插件里点「设置」填入 DeepSeek API Key，点「校验」确认可用。
2. 发一条会触发搜索的消息，确认思考折叠、搜索卡片、引用角标与来源面板。
3. 上传一个 PDF，确认文档解析问答；点「朗读」确认 TTS；点麦克风录一句确认 ASR。
