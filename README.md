# Paywall Buster · 多平台订阅弹窗与广告阻断器

> [!IMPORTANT]
> 本项目是 **source-available 非商业项目**，仅用于浏览器扩展开发、
> 网页前端技术和源代码阅读交流。项目不上架 Chrome Web Store，不提供
> 任何网站访问授权，也不能恢复服务端未下发的付费内容。
>
> 使用前请阅读 [DISCLAIMER.md](DISCLAIMER.md)。使用者应自行遵守当地
> 法律法规、版权规则以及目标网站的服务条款。本项目与任何媒体、付费墙
> 供应商或广告平台不存在隶属或合作关系。

许可证：[PolyForm Noncommercial License 1.0.0](LICENSE)  
第三方名称与非关联声明：[NOTICE.md](NOTICE.md)  
贡献要求：[CONTRIBUTING.md](CONTRIBUTING.md)  
安全报告：[SECURITY.md](SECURITY.md)

Chrome / Edge（Manifest V3）扩展。三件事：

1. **拆弹窗** —— 订阅墙、注册墙、cookie 之外的遮挡层、滚动锁；
2. **救正文** —— 把被 CSS 裁掉（`max-height + overflow:hidden`）、被 blur/降透明藏起来、被折叠的段落放出来；DOM 里只发了一两段时，从 JSON-LD / Fusion / `__NEXT_DATA__` 里把全文回填；
3. **清广告** —— CSS 隐藏广告位 + JS 兜底清屏 + 88 条域名级网络拦截（Google GAM / Xandr / PubMatic / Criteo / Taboola / Outbrain / 百度联盟 / 广点通 / 穿山甲 / 阿里妈妈 …）。

当前版本 **v2.0.0**：从"只认 Reuters 一家"升级成"按付费墙供应商 + 站点档案"驱动。一套 Piano / Poool / OneCount / Zephr / Conde / Sophi 规则覆盖几十家站点，站点档案只补哈希类名和特例。

---

## 0. 升级 / 安装

**从旧版升级**

1. `chrome://extensions` → Paywall Buster → 确认目录已换成 v2.0 → 点 **重新加载**
2. 回文章页按 **Cmd+Shift+R** 硬刷新（content script 必须在页面加载前注入）

> 目录里必须有 `rules/ads.json`（和 `manifest.json` 同级），否则扩展加载会报规则错误。该文件**顶层必须是裸数组**，写成 `{"rules":[...]}` 会直接加载失败。

**全新安装**

1. `chrome://extensions` → 右上角打开 **开发者模式**
2. **加载已解压的扩展程序** → 选 `paywall-buster/` 目录
3. 打开任意文章页，popup 里应看到「已处置弹窗 #N」

快捷键：`Alt+Shift+Y` 本站开关 · `Alt+Shift+R` 阅读模式（只留正文，Esc 退出）。

---

## 1. 真实站点实测（v2.0，扩展真加载，非脚本注入）

| 站点 | 结果 | 正文 | 可见段 | 可滚高度 | 广告残留 |
|---|---|---|---|---|---|
| reuters.com（China AI bubble） | ✅ | 6657 字 | 31/31 | 4829 px | 0 |
| reuters.com（Xi opens plenum） | ✅ | 4677 字 | 20/20 | 4228 px | 0 |
| telegraph.co.uk（BBC £400k） | ✅ | 5883 字（修前 670） | 37/53 | 5774 px（修前 291） | 0 |
| washingtonpost.com（Woodward） | ✅ | DOM 1651 + 回填 28803 字 | — | 20053 px | 0 |
| stratechery.com | ✅ | 1790 字 | 15/17 | 2041 px | 0 |
| thepaper.cn / 36kr.com | ✅ | 2782 / 2505 字 | 105/105 · 25/25 | 正常 | 0 |
| wired.com | ⚠️ 部分 | 4494 字 | 6/39 | 4287 px | 0 |
| bloomberg.com | ⚠️ 无法判定 | — | — | — | — |

两个 ⚠️ 的真实原因（都已定位，不是扩展 bug）：

- **wired**：Conde Nast 的 meter 由客户端按剩余配额逐段渲染，DOM 里本就只有 6 段。墙拆干净了（overlays 里只剩 4 个 fides CMP，被刻意保留），但缺的段落服务器没发。
- **bloomberg**：命中反爬验证页（`Bloomberg - Are you a robot?` + `#px-captcha`），拿不到文章 DOM。扩展在这种页面上判定 score 只有 40（低于 60 门槛）因此**什么也不做** —— 这是想要的行为，不能在验证页上乱删节点。

**这些墙破不了**（服务端截断，正文根本没发到浏览器）：财新 `#Main_Content_Val`（480 字 vs 页面自报 3710 字）、机器之心 pro（1841 字后接「解锁全文」）、Medium、theinformation、The Times。扩展会在页面右下角弹一条褐色提示，告诉你"正文在服务器端被截断，浏览器端补不回来"，不会假装成功。

---

## 2. 架构

```
manifest.json          MV3，两条 content_scripts + DNR 规则集
rules/ads.json         88 条 declarativeNetRequest 静态规则（87 block + 1 allow）
src/profiles.js        window.__PB_PROFILES__：17 供应商 / 27 站点 / 32 广告选择器 / 34 广告域 / 52 条多语文案
src/content.js         评分引擎：找遮挡层 → 打分 → neutralise；负责计数与广告清屏
src/repair.js          正文修复：摘 hidden/inert、清 blur/降透明、解祖先链 max-height 裁剪、JSON-LD 全文回填、硬墙提示
src/static-hide.css    CSS 先手：高置信度弹层直接 display:none，裁剪层解限，滚动解锁
src/ads.css            广告位 CSS 隐藏
src/background.js      DNR 动态规则、badge 计数、快捷键
src/popup.{html,css,js} 面板：站点开关、圈选、阅读模式、诊断
```

**两级投放**：`hide[]` 走 CSS 无条件隐藏（只放绝无可能是正文的模态/遮罩）；`selectors[]` 交给评分引擎，几何 + 文案 + 正文保护一起算。

**评分**（`analyse()`）：属性特征 +45、文案 +30、fixed/sticky +15、z-index ≥100 +15、覆盖率 ≥45% +25；反过来，含 `article` −70、含 >3 个 p 且 >1500 字 −60、点中 ARTICLE/MAIN/NAV 等语义标签 −45。**≥60 分才动手**，其余一律放过 —— 宁可漏杀不可误杀。

**正文保护是硬约束**：宽特征选择器一律带 `:not(:has(article)):not(:has(p + p))`。v2.0 开发中踩过一次：`[class*="tp-modal" i]` 把 `body.tp-modal-open` 整块隐藏，正文直接消失；`section[class*="martech-paywall" i]` 把 Telegraph 整篇正文当墙藏了（670 字 / 12 段）。两条都已加保护，回归用例 K、以及 telegraph 复测都覆盖了这个点。

---

## 3. CMP / cookie 同意层：刻意不动

Sourcepoint（`sp_message_container_*`）、OneTrust、Fides、Didomi、Cookiebot、Usercentrics 这些是**同意管理**层，不是付费墙。它们和付费墙在结构上无法区分（都是 fixed 全屏、z-index 拉满、文案里有 privacy），但清掉它们不会解锁正文，反而会因为"没同意"被站点继续挡住。

`content.js` 的 `CMP_RE` 与 `repair.js` 的 `isCMP()` 会跳过这些元素（含向上 4 层祖先检查）。wired 页上那 4 个 fides 浮层被原样保留，就是这条规则在工作。

---

## 4. 诊断

popup 里点 **诊断**，或控制台执行：

```js
__PB_DEBUG__()        // 当前页面候选元素 + 每条的分数和判定理由
__PB_REPAIR__.diag()  // 正文根、段落数、内嵌数据源、救援/解锁/回填统计
__PB_ADS__()          // 广告位命中列表
__PB_STATE__          // 计数器
```

隔离世界的变量在页面主控制台读不到；主世界能读的是 `document.documentElement.dataset.pbDbg` —— 每轮扫描的 `元素 s=分数 理由` 摘要，排查"为什么这个弹层没被杀"直接看它。

常见判定：`s=40 text="subscription"` 表示只命中文案、缺少 fixed/z-index/覆盖率证据，按规则不动手。

---

## 5. 测试状态

当前公开快照没有包含早期开发中使用的 `test/run.sh` 和 14 个
CDP 自动化用例，因此不能直接执行 README 旧版本中提到的测试命令。

下面列出的是 v2.0 开发阶段曾经使用的回归场景。贡献相关修改时，
应重新提供可运行的测试，或提交最小复现页面和验证步骤：

| 用例 | 场景 |
|---|---|
| A | 有 paywall 类名的弹窗 + body 滚动锁 |
| B | 哈希类名 + 背景遮罩 + html 滚动锁 |
| C | 干净页面（不该误伤） |
| D | 仿 Reuters：哈希类名订阅墙 + 底部吸底条 |
| E | 正文包在 PaywallWrapper 里（复现「弹窗没了正文也没了」） |
| F | DOM 只有 2 段 + JSON-LD 带全文 |
| G | 正文被 blur + 折叠 + Fusion 内嵌数据 |
| H | 仿 Reuters metered 裁剪层（CSS 路径） |
| I | 裁剪层无任何关键词（repair.js 祖先链路径） |
| J | 仿 Reuters 广告位：全隐藏且不伤正文/视频 |
| K | Piano / Tinypass 供应商墙 |
| L | Poool 供应商墙（自定义元素 + iframe 浮层） |
| M | 中文会员墙（几何遮罩 + vip-mask + 档案 clip） |
| N | 服务端截断（Substack 风格，无内嵌全文，优雅降级） |

`CDP_PORT`（默认 9334）、`HTTP_PORT`（默认 8899）可用环境变量覆盖。
这些测试文件和端口工具不包含在当前仓库快照中。

---

## 6. 广告屏蔽的三层与副作用

1. **CSS**（`ads.css`）：广告位 `display:none`，从 document_start 就生效，广告不闪；
2. **JS**（`content.js` 的 `sweepAds`）：兜底 inline style 反覆盖、晚插入的广告位、按 iframe src 域名兜底无通用类名的广告壳。**只 display:none，从不 remove** —— 摘掉节点会让站点立刻重插或判定"广告被拦"；
3. **网络**（`rules/ads.json`）：88 条域名规则，实测在 bloomberg 上触发 20+ 次 `ERR_BLOCKED_BY_CLIENT`。

副作用要知道：域名级拦截是整段拦，个别站点会把统计/支付/验证码挂在广告域上。已经为 `doubleclick.net/recaptcha` 留了 allow 例外（priority 2）。如果某个站点出现"按钮点不动/登录不了"，先在 popup 里对该站关掉扩展对比一次；确认是规则误伤就把域名加进 `rules/ads.json` 的 allow 段。

---

## 7. 已知限制

- **服务端截断无解**：正文没发到浏览器，前端任何手段都补不回来（见 §1 列表）。
- **反爬验证页不处理**：DataDome / PerimeterX / Cloudflare 挑战页上不动任何节点 —— 那是验证页，不是文章页。
- **登录态墙**：要求真登录才发正文的站点（部分中文站、专业数据库）无法绕过。
- **SPA 硬跳转**：少数站点在 meter 触发后整页 reload 到受限路由，需要连按一次 Cmd+Shift+R。
- **CMP 层保留**：如果站点把"同意 cookie"当作发正文的前置条件，需要手动点一次同意。
- **DNR 规则上限**：静态规则可用配额约 330k，当前用 88 条，够用。

---

## 8. 版本历史

- **v1.0** 只杀带 paywall 类名的弹窗 —— 遇到 Reuters 的哈希类名就漏，且一刀切 `[class*="paywall"]` 把正文容器一起藏了。
- **v1.1** 加评分引擎 + repair 救援 + JSON-LD 回填；修掉"弹窗没了正文也没了"。
- **v1.2** 定位到真正的病根：正文被**祖先容器** `max-height + overflow:hidden` 裁掉（Reuters 1219px vs 实际 6946px），加祖先链解锁；可见滚动高度 752 → 4957。
- **v1.3** 广告屏蔽：CSS + JS + 66 条 DNR 规则。
- **v2.0**（当前）供应商驱动 + 27 站点档案 + 中英文案表 + CMP 保护 + 硬墙提示 + DNR 扩到 88 条并合并父域省配额；新增 4 个用例（K–N），修掉宽特征选择器误伤正文的两处。

---

## 9. 分发与许可

本项目按 **source-available** 分发，不采用 OSI 定义的开源许可证。
在 PolyForm Noncommercial License 1.0.0 下，允许非商业用途，禁止
预期的商业应用。完整条款见 [LICENSE](LICENSE)。

本仓库不用于上架浏览器扩展商店。请只从项目仓库和明确的源码发布页
获取代码，不要使用来源不明的 `.crx` 或经过二次打包的二进制文件。

许可证只规定代码的使用权限，不授予任何网站内容、账号或服务访问权，
也不能消除版权、合同、反规避或平台规则方面的风险。
