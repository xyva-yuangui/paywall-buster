# Paywall Buster 支持平台与兼容范围

本文说明 Paywall Buster 实际适配的浏览器、付费墙供应商、站点档案和已知
限制。“支持”表示项目内已有对应规则或适配代码，不等于承诺任意文章都能
恢复完整正文。

## 浏览器

| 平台 | 状态 | 说明 |
|---|---|---|
| Google Chrome 桌面版 105+ | 支持 | 主要测试浏览器，Manifest V3 |
| Microsoft Edge 桌面版 105+ | 支持 | Chromium 内核，与 Chrome 使用同一扩展包 |
| Brave / Opera / Vivaldi | 可能兼容 | Chromium 内核，未纳入系统回归测试 |
| Chrome / Edge Android | 不支持 | 移动版浏览器不提供同类扩展加载能力 |
| iOS 浏览器 | 不支持 | 无法加载当前扩展包 |
| Firefox | 未适配 | Manifest 与 declarativeNetRequest 行为存在差异 |
| Safari | 未适配 | 需要单独的 Safari Web Extension 工程 |

操作系统不是扩展本身的限制。只要平台提供兼容的桌面版 Chromium 浏览器，
Windows、macOS 和 Linux 原则上都可以使用。

## 付费墙供应商

供应商规则优先于站点规则，因为同一套付费墙 SDK 常被多家媒体共用。

| 供应商 | 状态 | 主要处理方式 |
|---|---|---|
| Piano / TinyPass | 支持 | 模态框、iframe、遮罩、Piano 域名 |
| Poool | 支持 | Web Component、iframe 和自定义元素 |
| OneCount | 支持 | `oc-*` 页面结构与 OneCount 域名 |
| Conde Nast / Sophi | 支持 | 付费墙栏、订阅单元和客户端裁剪 |
| Zephr | 支持 | Zephr 弹层、iframe 与页面遮挡 |
| Pelcro | 支持 | Pelcro 根节点和模态框 |
| Leaky Paywall | 支持 | WordPress 付费墙模态框 |
| Memberful | 支持 | Memberful 遮罩层 |
| Substack | 部分支持 | 可清理前端提示；服务端未下发段落无法恢复 |
| Ghost Members | 部分支持 | 可清理订阅 CTA；服务端付费正文无法恢复 |
| Medium | 有限支持 | 仅处理发送到浏览器中的 metered 内容 |
| Arc XP + Sophi | 支持 | `PaywallWrapper`、裁剪层和内嵌数据回填 |
| Newspack | 支持 | Newspack 付费墙组件 |
| Axate | 支持 | Axate 模态框 |
| Vox Media / Concert | 支持 | Concert 付费墙组件 |
| Dow Jones | 支持 | WSJ、Barron's 常见付费墙结构 |
| Financial Times | 支持 | FT barrier 与订阅遮挡 |

## 站点档案

### 已进行真实浏览器验证

| 站点 | 结果 |
|---|---|
| Reuters | 完整正文、弹层与滚动恢复通过 |
| Telegraph | 正文裁剪恢复通过 |
| Washington Post | 可见 DOM 内容与 JSON-LD 回填通过 |
| Stratechery | 正文裁剪和继续阅读遮挡处理通过 |
| The Paper 澎湃新闻 | 正文与会员遮挡处理通过 |
| 36Kr | 正文与会员遮挡处理通过 |
| Wired | 前端遮挡可处理；缺失段落由服务端控制 |
| Bloomberg | 可能进入反爬验证页；验证页上不做修改 |

### 已提供站点档案

以下站点已有专用选择器或裁剪规则，但未包含在本次公开快照的自动化回归
结果中：

`ft.com`、`wsj.com`、`nytimes.com`、`lemonde.fr`、`economist.com`、
`theatlantic.com`、`medium.com`、`theinformation.com`、`theverge.com`、
`caixin.com`、`wallstreetcn.com`、`huxiu.com`、`tmtpost.com`、
`sspai.com`、`csdn.net`、`zhihu.com`、`jiqizhixin.com`、
`jianshu.com`、`infoq.cn`。

## 广告与追踪域名

`rules/ads.json` 包含 88 条 Manifest V3 网络规则，其中 87 条拦截、1 条
例外。覆盖范围包括：

- Google GAM / DoubleClick
- Xandr / AppNexus
- PubMatic、Criteo、Taboola、Outbrain
- 百度联盟、广点通、穿山甲、阿里妈妈
- 多家媒体自有广告和统计域名

网络规则按域名生效，可能误伤同域统计、支付或验证码脚本。项目为
`doubleclick.net/recaptcha` 保留了例外。

## 明确无法处理的场景

- 服务器只返回试读段落，完整正文从未进入浏览器。
- 必须真实登录后才由服务器返回正文。
- DataDome、PerimeterX、Cloudflare 等验证页或反爬挑战。
- 移动端浏览器和未适配的 Firefox、Safari。
- 破坏网站授权、版权、合同或服务条款的使用方式。

## 权限说明

扩展需要 `storage`、`activeTab`、`scripting`、
`declarativeNetRequest` 和 `<all_urls>`。这些权限用于本地分析页面、
保存站点开关和应用广告规则。当前实现不包含账号系统、遥测、远程代码
加载器或页面数据上传。
