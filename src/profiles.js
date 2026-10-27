// SPDX-FileCopyrightText: 2026 Paywall Buster contributors
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

/* Paywall Buster — 平台档案（profiles）
 * 设计原则：
 *   1) 供应商（vendor）优先于站点：Piano / Poool / OneCount 这类付费墙 SDK 的 DOM 特征**跨站一致**，
 *      一条 vendor 规则能覆盖几十个媒体站；站点表只用于补哈希类名与特例。
 *   2) 分两级投放：
 *      - hide[]      → 写进 static-hide.css 的同名表，由 CSS 无条件 display:none（只放「绝不可能是正文」的模态/遮罩类名）
 *      - selectors[] → 交给 content.js 的评分引擎（几何 + 文案 + 正文保护），可放较宽的特征
 *   3) 正文保护永远优先：任何命中 article / [itemprop=articleBody] / 多段落的容器一律进评分保护。
 */
(function () {
  'use strict';
  if (window.__PB_PROFILES__) { return; }

  /* ---------------- 供应商档案 ---------------- */
  var vendors = {
    piano: {
      name: 'Piano / TinyPass',
      probe: /(piano\.io|tinypass\.com|ppr\.piano\.io)/i,
      hide: ['#tp-modal', '.tp-modal', '.tp-backdrop', '.tp-container', '.tp-container-inner', '.tp-iframe',
             '[class*="tp-modal"]', '[class*="tp-backdrop"]', 'iframe[src*="tinypass.com"]',
             'iframe[src^="https://piano."]', '[id^="piano-offer"]', '[class*="piano-offer"]', '[id^="offer_"]'],
      selectors: ['[id^="piano"]', '[class*="piano"]', '[data-piano]', '.tp-container-inner', '[id^="offer_"]'],
      block: ['piano.io', 'tinypass.com']
    },
    poool: {
      name: 'Poool',
      probe: /(poool\.(fr|io)|poool-widget)/i,
      hide: ['poool-widget', 'poool-modal', '#poool-widget', '[class*="poool-modal"]', 'iframe[src*="poool"]'],
      selectors: ['[class*="poool"]', '[id*="poool"]'],
      block: ['poool.fr', 'poool.io']
    },
    onecount: {
      name: 'OneCount',
      probe: /(onecount\.(net|com)|oc_paywall)/i,
      hide: ['#oc_paywall', '.oc-paywall', '[class*="oc-paywall"]', '[id^="oc-modal"]'],
      selectors: ['[id^="oc-"]', '[class*="onecount"]', '[class*="oc-wall"]'],
      block: ['onecount.net']
    },
    'conde-nast': {
      name: 'Conde Nast / Sophi',
      probe: /(conde\.digital|sophi\.io|cdn\.condenast\.com)/i,
      hide: ['[class*="PaywallBarWrapper"]', '[class*="PaywallInlineBarrierWrapper"]',
             '[class*="consumer-marketing-unit--paywall"]', '[class*="paywall-bar"]'],
      selectors: ['[class*="PaywallBar"]', '[class*="PaywallInlineBarrier"]', '[class*="consumer-marketing-unit" i]'],
      block: []
    },
    zephr: {
      name: 'Zephr',
      probe: /(zephr\.com|zephr\.me)/i,
      hide: ['[class*="zephr-modal"]', '[id^="zephr"]', 'iframe[src*="zephr"]',
             '.zephr-paywall', '.zephr-overlay', '.zephr-paywall-container', '[class^="zephr-paywall"]',
             '.tm-zephr-footer-fallback'],
      selectors: ['[class*="zephr"]', '.zephr-paywall', '.zephr-overlay', '.tm-zephr-footer-fallback'],
      block: ['zephr.com']
    },
    pelcro: {
      name: 'Pelcro',
      probe: /pelcro\.com/i,
      hide: ['#pelcro-root', '[class*="pelcro-modal"]'],
      selectors: ['[class*="pelcro"]'],
      block: ['pelcro.com']
    },
    'leaky-paywall': {
      name: 'Leaky Paywall (WordPress)',
      probe: /leaky-?paywall/i,
      hide: ['.leaky-paywall-modal', '[class*="leaky-paywall-modal"]', '#leaky_paywall_modal'],
      selectors: ['[class*="leaky-paywall"]', '[id^="leaky_paywall"]'],
      block: []
    },
    memberful: {
      name: 'Memberful',
      probe: /memberful\.com/i,
      hide: ['[class*="memberful-overlay"]'],
      selectors: ['[class*="memberful"]'],
      block: []
    },
    substack: {
      name: 'Substack',
      probe: /(substackcdn|substack\.com)/i,
      hide: ['.subscription-watermark', '.paywall-cta', '.paywall-modal'],
      selectors: ['.paywall', '[class*="paywall"]', '[class*="subscription-watermark"]', '[data-testid="paywall"]'],
      block: [],
      note: 'Substack 的付费段落是服务端不下发，只能解锁可见部分与订阅浮层'
    },
    ghost: {
      name: 'Ghost (members)',
      probe: /(ghost\.org|ghost-)/i,
      hide: ['.gh-post-upgrade-cta', '.gh-subscribe', '[class*="gh-post-upgrade"]'],
      selectors: ['[class*="gh-post-upgrade"]', '[class*="gh-subscribe"]', '.members-cta'],
      block: [],
      note: 'Ghost 付费内容同样服务端不下发，只能清理 CTA 与解锁布局'
    },
    medium: {
      name: 'Medium',
      probe: /(medium\.com|cdn-client\.medium\.com)/i,
      hide: ['[class*="MeteredContent"]', '[data-testid="paywall"]'],
      selectors: ['[class*="meteredContent"]', '[class*="MeteredContent"]', '[data-testid="paywall"]'],
      block: []
    },
    arcxp: {
      name: 'Arc XP + Sophi',
      probe: /(arcpublishing\.com|paywall\.sophi\.io|Fusion\.)/i,
      hide: [],
      selectors: ['[data-paywall-state]', '[class*="PaywallWrapper"]', '[class*="restricted"]', '[class*="paywall-modal"]'],
      block: [],
      note: '正文常在 DOM 内被 max-height 裁掉，靠 repair.js 祖先链解锁；Sophi 决策接口见 background 动态规则'
    },
    newspack: {
      name: 'Newspack (WordPress)',
      probe: /newspack/i,
      hide: ['[class*="newspack-paywall-modal"]'],
      selectors: ['[class*="newspack"]', '[class*="np-access"]'],
      block: []
    },
    axate: {
      name: 'Axate',
      probe: /axate\.(com|io)/i,
      hide: ['[class*="axate-modal"]'],
      selectors: ['[class*="axate"]'],
      block: []
    },
    'vox-concert': {
      name: 'Vox Media / Concert',
      probe: /(concert\.io|voxmedia)/i,
      hide: [],
      selectors: ['[class*="Concert"]', '[data-testid*="paywall"]', '[class*="c-paywall"]'],
      block: []
    },
    'dow-jones': {
      name: 'Dow Jones (WSJ / Barron\'s)',
      probe: /(dowjones\.io|wsj\.net|barrons)/i,
      hide: [],
      selectors: ['[class*="snippet-promotion"]', '[class*="wsj-paywall"]', '[class*="paywall"]', '[data-testid*="paywall"]'],
      block: []
    },
    ft: {
      name: 'Financial Times',
      probe: /ft\.com/i,
      hide: [],
      selectors: ['[class*="barrier"]', '[data-trackable*="barrier"]', '.o-barrier'],
      block: []
    }
  };

  /* ---------------- 站点档案 ---------------- */
  /* selectors: 交给评分引擎；hide: 进 CSS 无条件隐藏；clip: 额外裁切层选择器 */
  var sites = {
    'reuters.com': {
      selectors: ['[data-testid*="subscription" i]', '[data-testid*="offer" i]',
                  '[class*="Subscription" i]', '[class*="subscription" i]', '[id*="subscription" i]',
                  '[class*="OfferModule" i]', '[class*="RegWall" i]', '[class*="modal-module__underlay" i]'],
      clip: ['[class*="regular-article-layout-module__restricted"]', '[class*="paywall"]']
    },
    'ft.com': { selectors: ['[class*="barrier" i]', '[data-trackable*="barrier" i]'], clip: [] },
    'wsj.com': { selectors: ['[class*="paywall" i]', '[class*="snippet-promotion" i]'], clip: [] },
    'nytimes.com': { selectors: ['[data-testid*="modal" i]', '[class*="GateWrapper" i]', '[id*="gate" i]', '[class*="gateway-container" i]', '[id^="softwall" i]', '[class*="softwall" i]'], clip: [] },
    'washingtonpost.com': { selectors: ['[id^="softwall" i]', '[class*="softwall" i]', '[data-qa*="wall" i]', '[class*="teaser-content" i]'], clip: ['[class*="teaser-content" i]'], hardWall: false },
    'telegraph.co.uk': { selectors: ['[class*="martech-paywall" i]', '[class*="martech-regwall" i]', 'section[class*="paywall" i]', '[class*="regwall" i]'], clip: ['[class*="martech-paywall" i]'] },
    'lemonde.fr': { selectors: ['[class*="lmd-paywall" i]', '[class*="lmd-wall" i]', '[class*="paywall" i]'], clip: [] },
    'stratechery.com': { selectors: ['[class*="continue-reading" i]', '[class*="paywall" i]'], clip: ['.is-style-continue-reading', '.has-continue-reading', 'div.entry-content'] },
    'economist.com': { selectors: ['[class*="paywall" i]', '[class*="SubscriptionBarrier" i]'], clip: [] },
    'bloomberg.com': { selectors: ['[class*="paywall" i]', '[class*="Barrier"]', '#slidingBanner', '[class*="sheetWrapper" i]'], clip: [] },
    'theatlantic.com': { selectors: ['[class*="paywall" i]', '[class*="Paywall"]', '[data-testid*="paywall" i]', '[class*="teaser-content" i]'], clip: ['[class*="teaser-content" i]'] },
    'wired.com': { selectors: ['[class*="paywall" i]', '[data-testid*="paywall" i]', '[class*="ConsumerMarketingUnit" i]'], clip: [] },
    'medium.com': { selectors: ['[class*="MeteredContent"]', '[data-testid="paywall"]'], clip: [] },
    'theinformation.com': { selectors: ['[class*="paywall" i]', '[class*="Paywall"]'], clip: [] },
    'theverge.com': { selectors: ['[class*="Concert"]', '[data-testid*="paywall" i]', '[class*="pmc-privacy-banner" i]', 'aside[class*="duet--navigation" i]'], clip: [] },
    /* 中文平台：特征多为「会员/试读/登录后阅读」文案 + 遮罩，靠评分引擎而非死记类名 */
    'caixin.com': {
      selectors: ['[class*="subscribe" i]', '[class*="vip" i]', '[class*="member" i]', '[class*="pay" i]', '[id*="paywall" i]',
                  '.pc-pay-layer', '#chargeWallContent', '#chargeWall', '.chargeInner', '[class*="cost-uibtn" i]', '[class*="subRightContent" i]', '[class*="loginContent" i]'],
      hardWall: true,
      clip: ['[class*="article-content"]', '[class*="content"]'],
      textExtra: true
    },
    'wallstreetcn.com': { selectors: ['[class*="member" i]', '[class*="vip" i]', '[class*="paywall" i]', '[class*="subscribe" i]'], clip: [] },
    '36kr.com': { selectors: ['[class*="paywall" i]', '[class*="member" i]', '[class*="subscribe" i]'], clip: [] },
    'huxiu.com': { selectors: ['[class*="member" i]', '[class*="vip" i]', '[class*="pay" i]'], clip: [] },
    'tmtpost.com': { selectors: ['[class*="member" i]', '[class*="pay" i]'], clip: [] },
    'sspai.com': { selectors: ['[class*="member" i]', '[class*="pay" i]', '[class*="subscribe" i]', '[class*="fixed-series" i]', 'article.paid-article [class*="overlay" i]'], clip: [] },
    'csdn.net': { selectors: ['[class*="vip-mask" i]', '[class*="readmore" i]', '[class*="article-show-more" i]', '[class*="passport" i]', '.passport-login-tip-container', '[class*="passport-login" i]'], clip: [] },
    'zhihu.com': { selectors: ['[class*="PayWall" i]', '[class*="PaidContent" i]', '[class*="Modal" i]', '.Modal-wrapper', '[class*="signFlow" i]'], clip: [] },
    'jiqizhixin.com': { selectors: ['#reference-detail-content', '[class*="reference-detail" i]', '[class*="member-layout" i]', '[class*="btn__no-user" i]'], clip: ['#reference-detail-content', '[class*="reference-detail__content" i]'], hardWall: true },
    'jianshu.com': { selectors: ['[class*="pay" i]', '[class*="modal" i]'], clip: [] },
    'infoq.cn': { selectors: ['[class*="paywall" i]', '[class*="member" i]'], clip: [] },
    'thepaper.cn': { selectors: ['[class*="pay" i]', '[class*="member" i]'], clip: [] }
  };

  /* ---------------- 广告选择器（与 content.js 的 AD_SEL 合并） ---------------- */
  var adSelectors = [
    /* 中文广告联盟 */
    '[id^="cpro"]', '[class^="cpro"]', '.ec_ad', '.ec-ad', '[class*="baidu-ad" i]',
    '[class*="gdt-ad" i]', '[id*="gdt" i]', '[class*="pangle" i]', '[class*="bytedance-ad" i]',
    '[class*="tanx" i]', '[id^="tanx"]', '[class*="alimama" i]', '[class*="union-ad" i]',
    '[class*="ad-slot" i]', '[class*="adwrap" i]', '[class*="ad-wrap" i]', '[class*="advert" i]',
    '[class*="gg-" i]', '[id^="gg_"]', '[class*="sina-ad" i]', '[class*="ad_" i]',
    /* 通用 */
    '[id^="sinaadToolkitBox"]', '[class*="sinaads" i]', '[class*="banner-left-info" i]', '[class*="kr-shadow-wrapper-card" i]',
    'ins.adsbygoogle', '[data-ad-client]', '[data-ad-slot]', '[aria-label="advertisement" i]',
    'iframe[src*="/ad/"]', 'iframe[src*="adserver"]', 'iframe[src*="adserv"]'
  ];

  /* 广告域名（iframe/script 兜底用，与 content.js 的 AD_HOST_RE 合并） */
  var adHosts = [
    'doubleclick\\.net', 'googlesyndication\\.com', 'googleadservices\\.com', 'adsafeprotected\\.com',
    'amazon-adsystem\\.com', 'adnxs\\.com', 'criteo\\.(com|net)', 'taboola\\.com', 'outbrain\\.com',
    'dianomi\\.com', 'moatads\\.com', 'pubmatic\\.com', 'rubiconproject\\.com', 'openx\\.net',
    'media\\.net', '3lift\\.com', 'adform\\.net', 'yieldmo\\.com', 'smartadserver\\.com',
    'pos\\.baidu\\.com', 'cpro\\.baidu\\.com', 'tanx\\.com', 'alimama\\.com', 'gdt\\.qq\\.com',
    'pangolin-sdk-toutiao\\.com', 'ad\\.sina\\.com\\.cn', 'union\\.liebao\\.cn',
    'adx\\.36kr\\.com', 'ad-sdk\\.huxiu\\.com', 'pinggai[0-9]\\.caixin\\.com',
    'cpro\\.baidustatic\\.com', 'static\\.mediav\\.com', 'yt-adp\\.ws\\.126\\.net',
    'wwads\\.cn'
  ];

  /* ---------------- 多语言付费墙文案（与 content.js 的 TEXT_RE 合并） ---------------- */
  var text = [
    /* 中文 */
    '开通会员', '会员专享', '付费内容', '试读', '剩余\\s*\\d+\\s*字', '解锁全文', '查看全文', '阅读全文',
    '继续阅读', '登录后阅读', '登录即可', '订阅后', '立即订阅', '尊享', '购买后阅读', '免费注册', '升级会员',
    '本文为付费', '限时免费', '开通VIP', 'VIP专享', '会员文章', '付费专栏',
    '会员专属内容', '解锁全文，继续了解', '本篇试读', '试读来自', '登录.{0,4}(查看|阅读|继续|复制)',
    /* 日 / 韩 / 欧洲 */
    '購読', '会員限定', '有料記事', '구독', '유료', 'suscr[ií]bete', 'abonnez[- ]vous', 'abonnieren',
    'abbonati', 'assine', 'пОДПИС', 'premium article', 'for subscribers only',
    'create your free account', 'log in to continue', 'already a subscriber', 'unlock (this|the) article',
    'member[ -]only', 'start your (free )?trial', 'to continue reading',
    'just\s*\$', '\$\s?\d+(\.\d+)?\s*(/|per)\s*(week|month|year)', 'for \$\d+', 'subscriber-exclusive'
  ];

  window.__PB_PROFILES__ = {
    version: '2.0.0',
    vendors: vendors,
    sites: sites,
    adSelectors: adSelectors,
    adHosts: adHosts,
    text: text
  };
})();
