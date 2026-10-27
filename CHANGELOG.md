# Changelog

## v2.0.0 - 2026-10-27

### Added

- 新增付费墙供应商与站点档案两级匹配。
- 新增 Piano、Poool、OneCount、Zephr、Conde Nast、Sophi、Pelcro、
  Memberful、Substack、Ghost、Medium、Arc XP、Newspack、Axate、
  Vox/Concert、Dow Jones 和 Financial Times 规则。
- 新增 27 个站点档案，覆盖国际新闻、订阅媒体和中文内容平台。
- 新增 JSON-LD、Fusion 和 `__NEXT_DATA__` 正文回填。
- 新增服务端截断提示，避免把不可恢复内容误报为成功。
- 新增 88 条 Manifest V3 网络广告规则。
- 新增中英文订阅墙、会员墙和登录墙文案匹配。

### Improved

- 改进祖先链 `max-height + overflow:hidden` 裁剪修复。
- 改进背景遮罩、滚动锁、模糊和降透明状态恢复。
- 保留 Sourcepoint、OneTrust、Fides、Didomi、Cookiebot 等 CMP 同意层。
- 增加正文保护，降低宽泛选择器误删文章内容的风险。

### Documentation

- README 增加通俗功能介绍、平台支持表、适用场景和完整安装说明。
- 新增 `PLATFORMS.md`，列出浏览器、供应商、站点和已知限制。
- 新增 PolyForm Noncommercial License 1.0.0、免责声明、贡献和安全政策。
- 明确项目为 source-available 非商业学习项目，不发布到浏览器扩展商店。

### Known Limitations

- 服务器端未下发的正文无法恢复。
- 登录态正文、验证码页面和反爬挑战不处理。
- Firefox、Safari 和移动端浏览器未适配。
