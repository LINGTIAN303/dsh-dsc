# dsh-deepseek-chat

复刻 DeepSeek 对话界面的 DeepSeek Harness 插件：左侧栏一个鲸鱼图标入口，点开是一屏全屏对话面板——侧栏会话列表、欢迎语、消息流、底部输入框。

**当前对齐的是官网页版（chat.deepseek.com）。** 侧栏 261px、消息列 752px、输入框 776px、「开启新对话」的 `Ctrl + J` 提示、空态 composer 跟随问候语居中，全部取自网页版实测。界面本身是竖屏的对话布局，但它不是 DeepSeek App（iOS / Android）的复刻——**App 版的移植还没开始**。

<p align="center">
  <img src="icon.svg" width="96" height="96" alt="DeepSeek Chat">
</p>

## 特性

- **视觉复刻**：侧栏标尺、消息列宽、输入框圆角、代码块配色、操作栏图标位置，均按官方页面实测值对齐（不是目测）。
- **对话目录导航条**：会话右侧那列小短横，悬停展开显示每一轮提问，当前轮次亮品牌蓝，点击跳转。
- **深度思考**：折叠显示推理过程与用时。
- **智能搜索**：模型自主决定何时搜索，结果附引用角标，点开右侧来源面板。
- **阅读链接**：消息里带 URL 时自动抓取网页再作答。
- **文件输入**：拖拽、粘贴或点附件上传 PDF / Word / PowerPoint / 图片，按类型走版面解析或文本解析。
- **语音输入与朗读**：麦克风转写填入输入框；每条回答下方的朗读按钮把正文合成语音。
- **会话管理**：历史列表、分组（置顶 / 昨天 / 更早）、重命名、置顶、多选批量删除。
- **模型池支持**：可选择把请求交给 DSH 自己配置的模型，此时由插件构建工具链（`web_search` / `read_url`），模型自主决定搜索与抓页。

## 安装

### 前置

- DeepSeek Harness v0.2.2 及以上（Desktop 版）。
- Node.js `>= 22.13.0`。

### 从源码安装

```bash
git clone https://github.com/LINGTIAN303/dsh-deepseek-chat.git
cd dsh-deepseek-chat
pnpm install
```

把插件以本地链接方式注册进 Desktop profile：

```bash
cd ~/.dsh/profiles/desktop
pnpm add link:<仓库绝对路径>
```

然后重启 DSH，或从「插件」面板里重新加载。左侧栏出现鲸鱼图标即安装成功。

### 从旧版 `dsh-deepseek-app` 升级

插件随仓库改名为 `dsh-deepseek-chat`，包名、插件 id、路由前缀、数据目录都跟着变了。升级时要做两件事：

1. **替换 profile 里的注册**：把 `~/.dsh/profiles/desktop/package.json` 里的 `dsh-deepseek-app` 改成 `dsh-deepseek-chat`（或重新执行上面的 `pnpm add link:...`）。
2. **数据会自动迁移**：首次加载时插件会把 `~/.dsh/plugins/dsh-deepseek-app/` 下的 `sessions.json` 与 `settings.json` 复制到新目录。**旧目录保留不删**，方便回滚；确认无误后可手动删除。

迁移是幂等的：新目录已有同名文件时不会覆盖（以新数据为准）。

### 构建

客户端产物 `lib/client.js` 在仓库里已提交（DSH 的客户端模块加载器只接受自包含文件，必须预先构建）。改动 `src/` 或 `lib/app.css` 后需要重新构建：

```bash
node scripts/build-client.mjs
node --check lib/client.js
```

改了 Host 侧（`lib/*.js`）后**必须重载插件**——Client 有热更新，Host 没有：

```
插件 → 已安装 → dsh-deepseek-chat → 停用 → 启用
```

## 配置

三项凭据按**顺序**取第一个可用的：

1. 面板「设置」里填写的 API Key（存进本机 DSH 凭据，不进浏览器）。
2. 已登录的 DeepSeek 账号。
3. 环境变量 `DEEPSEEK_API_KEY`。

浏览器只与 Host 的 `/api/deepseek-chat/*` 通信，密钥不会出现在页面代码里。设置里的「校验」用一次免费的 `GET /models` 确认 Key 有效。

### 插件配置

写在 `cordis.patch.yml` 的 `config` 下，全部可选：

```yaml
apiBaseURL: https://api.deepseek.com   # 换自建网关时改这里
defaultModel: deepseek-flash           # 默认对话模型
defaultThinking: true                  # 新会话默认开深度思考
defaultSearch: true                    # 新会话默认开联网搜索
defaultSafetyCheck: true               # 默认开内容安全校验
searchProvider: deepseek               # 搜索渠道：deepseek / tavily / exa
tavilyApiKey: tvly-xxx                 # 不写则读环境变量 TAVILY_API_KEY
exaApiKey: exa-xxx                     # 不写则读环境变量 EXA_API_KEY
searchProxy: 127.0.0.1:7897            # 只有 Tavily 需要
```

搜索渠道也可以在面板「设置 → 通用设置 → 搜索渠道」里改，**界面上的选择优先**（存在 `~/.dsh/plugins/dsh-deepseek-chat/settings.json`）。

### 三家搜索渠道的差别（实测）

| 渠道 | 凭据 | 网络 | 返回 |
| --- | --- | --- | --- |
| `deepseek` | 复用 DeepSeek 凭据 | 国内直连 | 固定 10 条，带站点名与发布时间 |
| `tavily` | 独立 Key | `api.tavily.com` 本机 DNS 解析不出来，**必须走代理** | 可配条数 |
| `exa` | 独立 Key | 可直连（**经代理反而 TLS 握手被断开**） | 可配条数 |

## 会话存在哪

`~/.dsh/plugins/dsh-deepseek-chat/sessions.json`。换浏览器、清缓存都不会丢。

## 计费

除模型 Token 外，联网搜索、网页抓取、文件解析、语音识别与语音合成按 DeepSeek 官方工具价格**单独计费**。

## 开发

```
src/
  00-runtime.js      React 引用、极简 store、通用 hooks
  05-i18n.js         中英文案
  10-api.js          与 Host 的 HTTP 通信
  20-store.js        会话状态、消息构建、流式事件应用
  30-view.js         把 SSE 事件组装成渲染用的步骤数据
  40-markdown.js     Markdown 渲染 + 代码块复制/下载
  45-prism.js        构建产物：Prism 语法高亮（勿手改）
  50-icons.js        图标（构建产物，勿手改）
  60-sider.js        会话列表、分组、多选、行内菜单
  65-reply-area.js   回答区（思考折叠、搜索步骤、操作栏）
  70-messages.js     用户消息、文件卡片、来源胶囊
  75-speech.js       语音输入与朗读
  80-composer.js     底部输入框
  85-settings.js     设置弹窗
  90-panel.js        面板根组件
  92-scroll-nav.js   对话目录导航条
  95-apply.js        插件入口（注册侧栏图标与中央面板）
lib/
  index.js           Host 入口、路由注册
  client.js          构建产物：整份客户端（勿手改）
  app.css            全部样式，构建时内联进 client.js
  config.js          配置读取与默认值
  credential.js      凭据解析（插件 Key → DSH 账号 → 环境变量）
  deepseek-api.js    DeepSeek 官方 API 封装
  llm-api.js         模型池模式：把 ctx.llm 的输出转成 DeepSeek SSE 协议
  search.js          三家搜索渠道 + 网页抓取
  session-store.js   会话落盘
  settings-store.js  设置落盘
scripts/
  build-client.mjs   拼接 src/*.js + 内联 app.css → lib/client.js
  build-prism.mjs    打包 Prism 语言定义 → src/45-prism.js
  gen-icons.mjs      生成图标 → src/50-icons.js
docs/
  DETAIL.md          面向用户的简介
  details/架构/      架构与实现细节（含官方实测数据）
  index/             文档索引
  plans/             计划与完成记录
```

### 两条协议

插件有两个半侧，各自有硬约束：

**Host** 走 `ctx.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch })`，挂在 `/api/deepseek-chat/*` 下。密钥只在这里出现。

**Client** 必须是一份自包含产物——DSH 的模块加载器不接受同步 `require` 相对路径的 chunk，所以 `src/` 的分片只是为了可读，产物永远是单个文件（`window.__ModuleLoader__.load`）。

### 官方样式真值

`docs/details/架构/deepseek-chat.md` 记录了从官方 `main.css` 与真机实测得到的每一处数值（侧栏 261px、消息列 752px、输入框 776px、多选圈位移 30px……），改界面前先查那里，别凭眼估。

## 路线图

| 范围 | 状态 |
| --- | --- |
| 官网页版（chat.deepseek.com）的视觉与交互 | 已对齐 |
| 对话能力（深度思考、搜索、阅读链接、文件、语音、朗读） | 已实现 |
| 会话管理（分组、置顶、重命名、多选删除） | 已实现 |
| 模型池模式（自建工具链） | 已实现 |
| **DeepSeek App（iOS / Android）的界面移植** | **未开始** |

App 版不是把窗口缩窄就能得到。真机 App 的导航模型（底部标签栏、页面栈转场）、手势（侧滑返回、下拉刷新）、以及很多只在触屏成立的交互，都还没做。当前 `< 768px` 下的抽屉侧栏是**网页版的响应式适配**，不等于 App 版。

## 已知限制

- 只有 `deepseek-flash` 支持 DeepSeek 的服务端工具集（联网搜索、阅读链接、文件解析、ASR、TTS、内容安全），其他模型不接受这些参数。
- 语音输入与朗读依赖浏览器麦克风与音频播放权限。
- 开启内容安全校验后，服务端会在回答结束后再审核一次，末尾可能多等一会儿。
- 模型池模式下工具链由插件自己实现，DeepSeek 的服务端工具（含 `safety_check`）不参与。

## 许可

MIT
