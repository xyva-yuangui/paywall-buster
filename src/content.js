// SPDX-FileCopyrightText: 2026 Paywall Buster contributors
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

/* Paywall Buster — content script
 * 目标：识别并移除订阅弹窗 / 付费墙遮罩 / 滚动锁定，恢复可读正文。
 * 策略：强特征选择器 + 几何/文案/层级评分，只处理"挡住视口"的层，正文容器永不误删。
 */
(function () {
  'use strict';
  if (window.__PAYWALL_BUSTER__) { return; }
  window.__PAYWALL_BUSTER__ = true;

  var SITE = (location.hostname || '').replace(/^www\./, '');
  var CFG = { enabled: true, siteOff: [], extra: {}, stats: {}, blockScripts: false };

  /* 平台档案（src/profiles.js 先于本文件注入同一隔离世界）。
     分层：vendor（Piano/Poool/OneCount… 付费墙 SDK，跨站一致）优先，站点表只补哈希类名与特例。 */
  var PROF = window.__PB_PROFILES__ || { vendors: {}, sites: {}, adSelectors: [], adHosts: [], text: [] };

  /* vendor 探测：document_start 时脚本可能尚未插入，因此未命中时允许每轮重扫（上限 400 个节点）。 */
  var vendorHits = [];
  function detectVendors() {
    if (vendorHits.length) { return vendorHits; }
    var probes = [];
    try {
      document.querySelectorAll('script[src], iframe[src], link[href]').forEach(function (n) {
        if (probes.length >= 400) { return; }
        var u = n.src || n.href || '';
        if (u) { probes.push(u); }
      });
    } catch (e) {}
    var blob = probes.join(' ');
    Object.keys(PROF.vendors).forEach(function (k) {
      var v = PROF.vendors[k];
      if (!v || !v.probe) { return; }
      var hit = v.probe.test(blob);
      if (!hit && k === 'piano' && (window.tpa || window.Piano)) { hit = true; }
      if (!hit && k === 'poool' && (window.poool || window.Poool)) { hit = true; }
      if (hit) { vendorHits.push(k); }
    });
    return vendorHits;
  }

  function profileSelectors() {
    var out = [];
    var site = PROF.sites[SITE];
    if (site && site.selectors) { out = out.concat(site.selectors); }
    detectVendors().forEach(function (k) {
      var v = PROF.vendors[k];
      if (v && v.selectors) { out = out.concat(v.selectors); }
    });
    return out;
  }

  function profileName() {
    var names = [];
    if (PROF.sites[SITE]) { names.push(SITE); }
    detectVendors().forEach(function (k) { names.push((PROF.vendors[k] && PROF.vendors[k].name) || k); });
    return names;
  }

  /* ---------------- 规则表 ---------------- */

  var ATTR_SEL = [
    '[data-paywall]',
    '[data-paywall-overlay]',
    '[data-paywall-modal]',
    '[data-testid*="paywall" i]',
    '[data-testid*="regwall" i]',
    '[data-testid*="subscri" i]',
    '[data-testid*="meter" i]',
    '[id*="paywall" i]',
    '[id*="pay-wall" i]',
    '[id*="regwall" i]',
    '[id*="subscriber-wall" i]',
    '[class*="paywall" i]',
    '[class*="pay-wall" i]',
    '[class*="subscriber-wall" i]',
    '[class*="subscriberwall" i]',
    '[class*="regwall" i]',
    '[class*="registration-wall" i]',
    '[class*="subscription-wall" i]',
    '[class*="content-gate" i]',
    '[class*="article-gate" i]'
  ];

  var ATTR_RE = /(paywall|pay-wall|subscriber-?wall|subscriberwall|regwall|registration-?wall|subscription-?wall|content-?gate|article-?gate|metered|piano|tinypass|onecount|poool)/i;

  var TEXT_RE_BASE = /(subscribe|subscription|subscriber|sign in to continue|log in to continue|register to (?:continue|read)|create a (?:free )?account|already a subscriber|unlimited (?:digital )?access|start (?:your )?free trial|free trial|special offer|limited[- ]time offer|best offer|cancel anytime|continue reading|to continue reading|exclusive offer|become a member|support our journalism|this (?:article|story) is (?:exclusive|for subscribers)|订阅|付费|会员|立即订阅|登录后|订阅后阅读)/i;
  /* 多语言文案（profiles.text：中文会员/试读/登录后阅读，日韩与欧洲订阅词） */
  var TEXT_RE = (function () {
    var extra = (PROF.text || []).join('|');
    if (!extra) { return TEXT_RE_BASE; }
    try { return new RegExp(TEXT_RE_BASE.source + '|' + extra, 'i'); } catch (e) { return TEXT_RE_BASE; }
  })();

  var CLOSE_RE = /(close|dismiss|no thanks|not now|maybe later|continue without|关闭|暂不|以后再说)/i;

  var DIALOG_SEL = 'dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]';

  /* 站点专属补充规则：类名被哈希、或弹窗命名太泛时兜底 */
  var SITE_RULES = {
    'reuters.com': [
      '[data-testid*="subscription" i]',
      '[data-testid*="offer" i]',
      '[class*="Subscription" i]',
      '[class*="subscription" i]',
      '[id*="subscription" i]',
      '[class*="OfferModule" i]',
      '[class*="RegWall" i]'
    ],
    'ft.com': ['[class*="barrier" i]', '[data-trackable*="barrier" i]'],
    'wsj.com': ['[class*="paywall" i]', '[class*="snippet-promotion" i]'],
    'nytimes.com': ['[data-testid*="modal" i]', '[class*="GateWrapper" i]'],
    'economist.com': ['[class*="paywall" i]', '[class*="SubscriptionBarrier" i]'],
    'bloomberg.com': ['[class*="paywall" i]', '[class*="Barrier"]']
  };

  /* 通用弹层命名特征：类名被哈希过的站点靠这几个命中 */
  var MODAL_HINT_SEL = [
    '[class*="modal" i]',
    '[id*="modal" i]',
    '[class*="overlay" i]',
    '[id*="overlay" i]',
    '[class*="backdrop" i]',
    '[class*="scrim" i]',
    '[class*="lightbox" i]',
    '[class*="popup" i]',
    '[class~="fixed"]',
    '[class~="sticky"]'
  ];

  /* CMP（同意管理平台）保护名单。
   * en 组 18 站实测：Sourcepoint / OneTrust / Fides(Didomi) / Cookiebot 的层是 fixed 全屏、
   * z-index 拉满，与付费墙在结构上无法区分；清掉它们不会解锁正文，
   * 反而可能因"未同意"拿不到内容（ft / economist / spiegel / atlantic / wired 都在用）。
   * 这些一律不动。 */
  var CMP_RE = /(sp_message_|sp-message|onetrust|optanon|fides-|fides_|didomi|qc-cmp|cookiebot|cybotcookiebot|usercentrics|truste|iubenda|osano|termly|ketch-consent|privacy-mgmt)/i;

  var ARTICLE_SEL = 'article, main, [itemprop="articleBody"], [class*="article-body" i], [class*="articleBody" i], [class*="article__body" i], [class*="story-body" i], [class*="body-content" i]';

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, LINK: 1, META: 1, NOSCRIPT: 1, TEMPLATE: 1, BR: 1, SVG: 1 };

  /* ---------------- 状态 ---------------- */

  var state = {
    removed: 0,
    log: [],
    seen: new WeakMap(), /* el -> 上次评分时间戳：未达标的元素允许 5s 后重评（弹窗渲染晚于首扫） */
    picking: false,
    readerOpen: false,
    queued: false,
    lastKillAt: 0,
    adsKilled: 0,
    adLog: [],
    lastAdAt: 0,
    profile: []
  };

  /* 调试/自动化可见的内部状态（只读用途） */
  window.__PB_STATE__ = state;
  window.__PB_CFG__ = CFG;
  window.__PB_ADS__ = function () {
    sweepAds('debug');
    return { count: state.adsKilled, log: state.adLog.slice(0, 20) };
  };

  window.__PB_DEBUG__ = function () {
    var list = [];
    try {
      gather().forEach(function (el) {
        var r = analyse(el);
        list.push({
          el: label(el),
          score: r ? r.score : null,
          why: r ? r.why.join(' ; ') : 'skipped'
        });
      });
    } catch (e) { list.push({ err: String(e) }); }
    return { total: list.length, top: list.sort(function (a, b) { return (b.score || 0) - (a.score || 0); }).slice(0, 8) };
  };

  function active() {
    if (!CFG.enabled) { return false; }
    var off = CFG.siteOff || [];
    return off.indexOf(SITE) < 0 && off.indexOf(location.hostname) < 0;
  }

  function notifyBadge() {
    try {
      chrome.runtime.sendMessage({ type: 'pb:badge', n: state.removed + state.adsKilled }, function () { void chrome.runtime.lastError; });
    } catch (e) { /* 扩展上下文失效时静默 */ }
  }

  /* ---------------- 几何与评分 ---------------- */

  function vpArea() {
    var w = window.innerWidth || document.documentElement.clientWidth || 1;
    var h = window.innerHeight || document.documentElement.clientHeight || 1;
    return Math.max(1, w * h);
  }

  function label(el) {
    var cls = (typeof el.className === 'string') ? el.className : '';
    var s = el.tagName.toLowerCase();
    if (el.id) { s += '#' + el.id; }
    var bits = cls.trim().split(/\s+/).filter(Boolean).slice(0, 3);
    if (bits.length) { s += '.' + bits.join('.'); }
    return s.slice(0, 120);
  }

  function bgAlpha(color) {
    var m = /rgba?\(([^)]+)\)/.exec(color || '');
    if (!m) { return 0; }
    var p = m[1].split(',');
    return p.length > 3 ? parseFloat(p[3]) : 1;
  }

  function analyse(el) {
    if (!el || !el.parentNode) { return null; }
    var tag = el.tagName;
    if (!tag || SKIP_TAGS[tag] || tag === 'BODY' || tag === 'HTML') { return null; }

    /* CMP 层：直接放弃，任何分数都不处置 */
    var cmpId = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '');
    if (CMP_RE.test(cmpId)) { return null; }

    var rect = el.getBoundingClientRect();
    var cover = (Math.max(0, rect.width) * Math.max(0, rect.height)) / vpArea();

    var ident = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' +
      (el.getAttribute('data-testid') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' +
      (el.getAttribute('data-paywall') || '');
    var attrHit = ATTR_RE.test(ident);

    /* 便宜的先判：既不是强特征、又只占很小面积 —— 直接跳过，不做 getComputedStyle */
    if (!attrHit && cover < 0.10) { return null; }

    var txt = (el.textContent || '').slice(0, 8000);
    if (!attrHit && txt.trim().length < 12) {
      /* 无文字也可能是一层背景遮罩：只有"固定定位 + 半透明/纯色 + 大面积"才继续 */
      var st0 = window.getComputedStyle(el);
      var p0 = st0.position;
      var isFixed = p0 === 'fixed' || p0 === 'sticky' || p0 === 'absolute';
      if (!isFixed || cover < 0.45 || bgAlpha(st0.backgroundColor) < 0.10) { return null; }
    }

    var st = window.getComputedStyle(el);
    var res = { score: 0, why: [] };

    if (attrHit) { res.score += 45; res.why.push('attr'); }
    var tm = TEXT_RE.exec(txt);
    if (tm) { res.score += 30; res.why.push('text="' + tm[0] + '"'); }

    var pos = st.position;
    if (pos === 'fixed' || pos === 'sticky') { res.score += 15; res.why.push(pos); }

    var z = parseInt(st.zIndex, 10);
    if (!isNaN(z) && z >= 100) { res.score += 15; res.why.push('z=' + z); }

    if (cover >= 0.45) { res.score += 25; res.why.push('cover=' + Math.round(cover * 100) + '%'); }
    else if (cover >= 0.12) { res.score += 10; }
    else if (cover < 0.02) { res.score -= 35; }

    /* 纯背景遮罩：无色文字、半透明、铺满 */
    if (cover >= 0.85 && bgAlpha(st.backgroundColor) > 0.15 && txt.trim().length < 60) {
      res.score += 25;
      res.why.push('backdrop');
    }

    if (CLOSE_RE.test(txt) || el.querySelector('[aria-label*="close" i], button[title*="close" i]')) {
      res.score += 5;
    }

    /* 保护：这里装着正文，不能动 */
    if (el.querySelector(ARTICLE_SEL)) { res.score -= 70; res.why.push('-contains-article'); }
    var ps = el.querySelectorAll('p');
    if (ps.length > 3) {
      var total = 0;
      for (var i = 0; i < ps.length && i < 40; i++) { total += (ps[i].textContent || '').length; }
      if (total > 1500) { res.score -= 60; res.why.push('-longtext'); }
    }
    if (tag === 'ARTICLE' || tag === 'MAIN' || tag === 'NAV' || tag === 'HEADER' || tag === 'FOOTER') { res.score -= 45; }
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SPAN' || tag === 'IMG' || tag === 'FORM') { res.score -= 30; }

    res.cover = cover;
    res.hidden = st.display === 'none' || st.visibility === 'hidden' || (rect.width <= 1 && rect.height <= 1);
    res.attrHit = attrHit;
    return res;
  }

  /* ---------------- 处置 ---------------- */

  function record(what, why) {
    state.log.unshift({ sel: what, why: why.join(' | '), at: Date.now() });
    if (state.log.length > 40) { state.log.length = 40; }
    state.removed += 1;
    state.lastKillAt = Date.now();
  }

  function neutralise(el, why) {
    try {
      if (el.getAttribute('data-pb-killed') === '1') { return; }
      var info = label(el);
      el.setAttribute('data-pb-killed', '1');
      el.setAttribute('aria-hidden', 'true');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      record(info, why);
      notifyBadge();
      /* 延迟一轮再摘除 DOM：有些站点靠 visibility 判断是否继续弹，墙必须先"死"一次 */
      setTimeout(function () {
        try { if (el.parentNode && el.getAttribute('data-pb-killed') === '1') { el.remove(); } } catch (e) {}
      }, 800);
    } catch (e) {}
  }

  /* ---------------- 滚动锁 / 伪元素遮罩 ---------------- */

  function unlockScroll() {
    var html = document.documentElement;
    var body = document.body;
    if (!body) { return; }
    var b = window.getComputedStyle(body);
    var h = window.getComputedStyle(html);
    var locked = b.overflow === 'hidden' || b.overflowY === 'hidden' || b.position === 'fixed' ||
                 h.overflow === 'hidden' || h.overflowY === 'hidden';
    if (locked || state.removed > 0) { html.classList.add('pb-unlock'); }

    /* body/::before 被当作遮罩层 */
    ['::before', '::after'].forEach(function (pe) {
      try {
        var ps = window.getComputedStyle(body, pe);
        if (!ps || ps.content === 'none' || ps.position !== 'fixed') { return; }
        if (parseFloat(ps.width) >= window.innerWidth * 0.9 && parseFloat(ps.height) >= window.innerHeight * 0.9) {
          html.classList.add('pb-kill-pseudo');
        }
      } catch (e) {}
    });

    /* 解除 inert / aria-hidden 锁 */
    try {
      document.querySelectorAll('main[inert], article[inert], body[inert]').forEach(function (n) { n.removeAttribute('inert'); });
      var m = document.querySelector('main[aria-hidden="true"], article[aria-hidden="true"]');
      if (m) { m.removeAttribute('aria-hidden'); }
    } catch (e) {}
  }

  /* ---------------- 候选收集 ---------------- */

  function tag(el) {
    if (!el || !el.tagName) { return '?'; }
    var t = el.tagName.toLowerCase();
    if (el.id) { t += '#' + el.id; }
    var cn = (typeof el.className === 'string' ? el.className : '').trim().split(/\s+/).slice(0, 2).join('.');
    if (cn) { t += '.' + cn; }
    return t.slice(0, 90);
  }

  function gather() {
    var out = [];
    var set = new Set();
    function add(el) { if (el && !set.has(el)) { set.add(el); out.push(el); } }

    var extra = (CFG.extra && CFG.extra[SITE]) || [];
    var siteRules = (SITE_RULES[SITE] || []).concat(profileSelectors());
    ATTR_SEL.concat(siteRules, extra).forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(add); } catch (e) {}
    });
    try { document.querySelectorAll(DIALOG_SEL).forEach(add); } catch (e) {}
    MODAL_HINT_SEL.forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(add); } catch (e) {}
    });

    var body = document.body;
    if (body) {
      var walk = function (el, depth) {
        if (depth > 3) { return; }
        var kids = el.children;
        for (var i = 0; i < kids.length; i++) {
          var k = kids[i];
          if (SKIP_TAGS[k.tagName]) { continue; }
          add(k);
          walk(k, depth + 1);
        }
      };
      walk(body, 0);
    }

    /* 穿透一层 open shadow root：部分站点把弹层放在 web component 里 */
    out.slice(0, 200).forEach(function (el) {
      try {
        if (el.shadowRoot) {
          Array.prototype.forEach.call(el.shadowRoot.children, add);
        }
      } catch (e) {}
    });
    return out;
  }

  function sweep(reason) {
    if (!active()) { return; }
    /* 后台标签页也照常扫描：用户 Cmd+click 开在后台、切回来才看到页面的情况很常见。
       页面隐藏时 getBoundingClientRect 全为 0，几何判定自然失败，不会误杀；
       靠类名/文案命中的弹层则会被清掉，切回来即干净。 */
    state.profile = profileName();
    var cands = gather();
    var killed = 0;
    var dbg = CFG.debug ? [] : null;
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      var seenAt = state.seen.get(el);
      /* 未达标的元素 1.5s 后允许重评：弹窗常在首扫之后才渲染出尺寸/文案，
         窗口太长（曾用 5000）会让遮罩多闪好几秒，甚至测试窗口内来不及处理。 */
      if (seenAt && (Date.now() - seenAt) < 1500) { continue; }
      var res = analyse(el);
      if (!res) { state.seen.set(el, Date.now()); continue; }
      state.seen.set(el, Date.now());
      if (dbg && dbg.length < 40) { dbg.push(tag(el) + ' s=' + res.score + ' ' + res.why); }
      if (res.score >= 60) {
        neutralise(el, res.why);
        killed += 1;
      }
    }
    if (dbg) {
      /* 隔离世界的 __PB_STATE__ 主世界读不到，把本轮评分落到 documentElement 上，
         外部（CDP / 控制台 / 用户反馈）就能看到"为什么这个弹层没被处理"。 */
      try { document.documentElement.setAttribute('data-pb-dbg', dbg.join(' | ')); } catch (e) {}
    }
    if (killed > 0 || reason === 'tick' || reason === 'init') { unlockScroll(); }
  }

  function queue(reason) {
    if (state.queued) { return; }
    state.queued = true;
    setTimeout(function () {
      state.queued = false;
      try { sweep(reason || 'mutation'); } catch (e) { console.warn('[PaywallBuster]', e); }
      try { sweepAds(reason || 'mutation'); } catch (e) { console.warn('[PaywallBuster]', e); }
    }, 120);
  }

  /* ---------------- 广告位清屏 ---------------- */

  /* 与 src/ads.css 同源。CSS 负责"先手"（document_start 就生效，广告不闪），
     JS 这里补三件 CSS 做不到的事：
       1) 计数并上报（popup 与诊断要看到底压掉几个广告位）；
       2) 兜底站点用 inline style 覆盖回来、或晚于 CSS 规则插进 DOM 的广告位；
       3) 按 iframe 的 src 域名兜底那些不使用通用类名的广告壳。
     一律只 display:none，从不 remove：广告位被摘掉后站点要么立刻重插一个，
     要么判定"广告被拦截"并弹提示；留着 DOM 反而更安静。 */
  var AD_SEL = [
    '[class*="ad-slot-module" i]',
    '[class*="ad-slot" i]',
    '[id^="google_ads_iframe_"]',
    '[id^="div-gpt-ad"]',
    '[class*="cc-ad-container" i]',
    '[class*="leaderboard-module__slot" i]',
    '[class*="leaderboard-module__desktop-sticky" i]',
    '[class*="leaderboard-module__mobile-sticky" i]',
    '[class*="advertisement" i]',
    '[class*="advert-" i]',
    '[data-ad]',
    '[data-ad-slot]',
    '[data-google-query-id]',
    '.adsbygoogle',
    'ins.adsbygoogle',
    '.dianomi_context',
    'iframe.dianomi-parent-iframe',
    '[class*="outbrain" i]',
    '[class*="taboola" i]',
    'div.cnx-ad-container',
    'div.cnx-ad-bid-slot',
    'div.cnx-ad-slot',
    'div.cnx-non-linear-ad-container',
    '[class*="refinitiv-promo-bar" i]',
    '[class*="promo-bar-module__container" i]',
    '[class*="adblock" i]',
    '[class*="anti-adblock" i]',
    '[class*="antiadblock" i]'
  ].concat(PROF.adSelectors || []);

  /* 广告 iframe 域名：跨域 iframe 内容进不去，只能认壳的 src */
  /* 广告 iframe 域名：跨域 iframe 内容进不去，只能认壳的 src（profiles.adHosts 追加中文联盟域名） */
  var AD_HOST_PARTS = [
    'doubleclick\.net',
    'googlesyndication\.com',
    'googleadservices\.com',
    'amazon-adsystem\.com',
    'adsafeprotected\.com',
    'adnxs\.com',
    'adsrvr\.org',
    'criteo\.',
    'taboola\.com',
    'outbrain\.com',
    'dianomi\.com',
    'moatads\.com',
    'pubmatic\.com',
    'rubiconproject\.com',
    'openx\.net',
    'indexww\.com',
    '3lift\.com',
    'media\.net',
    'smartadserver\.com',
    'yieldmo\.com',
    'teads\.tv',
    'sharethrough\.com',
    'gumgum\.com',
    'sovrn\.com',
    'spotxchange\.com'
  ];
  var AD_HOST_RE = new RegExp('(' + AD_HOST_PARTS.concat(PROF.adHosts || []).join('|') + ')', 'i');

  /* 正文保护：广告规则再准也要过这一关，避免重演 v1.0 把整篇文章藏掉的坑 */
  function adProtected(el) {
    if (!el || el.nodeType !== 1) { return true; }
    var tag = el.tagName;
    if (tag === 'ARTICLE' || tag === 'MAIN' || tag === 'BODY' || tag === 'HTML') { return true; }
    if (el.id === 'pb-reader' || el.id === 'pb-fulltext') { return true; }
    try { if (el.closest('#pb-reader, #pb-fulltext')) { return true; } } catch (e) {}
    /* 自己就在正文容器里而且装着长文 —— 那是正文，不是广告位 */
    try {
      if (el.closest('article, [itemprop="articleBody"], [class*="article-body" i]')) {
        var txt = (el.textContent || '').length;
        if (el.querySelectorAll('p').length >= 2 || txt > 600) { return true; }
      }
    } catch (e) {}
    /* 里面套着整篇文章的容器（Reuters 的 PaywallWrapper 就长这样） */
    if (el.querySelector('article') || el.querySelector('[itemprop="articleBody"]')) { return true; }
    if (el.querySelectorAll('p').length >= 4 && (el.textContent || '').length > 1200) { return true; }
    return false;
  }

  function neutraliseAd(el, why) {
    try {
      if (el.getAttribute('data-pb-ad') === '1') { return; }
      if (adProtected(el)) { return; }
      el.setAttribute('data-pb-ad', '1');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      state.adsKilled += 1;
      state.adLog.unshift({ sel: label(el), why: why, at: Date.now() });
      if (state.adLog.length > 40) { state.adLog.length = 40; }
      state.lastAdAt = Date.now();
    } catch (e) {}
  }

  function sweepAds(reason) {
    if (!active()) { return 0; }
    var before = state.adsKilled;
    var i;
    for (var s = 0; s < AD_SEL.length; s++) {
      var list = null;
      try { list = document.querySelectorAll(AD_SEL[s]); } catch (e) { continue; }
      for (i = 0; i < list.length && i < 120; i++) { neutraliseAd(list[i], 'ad:' + AD_SEL[s]); }
    }
    /* 广告 iframe 兜底：顺便折掉它那层 0 高度的占位壳 */
    try {
      var frames = document.querySelectorAll('iframe[src]');
      for (i = 0; i < frames.length && i < 120; i++) {
        var fr = frames[i];
        if (!AD_HOST_RE.test(fr.getAttribute('src') || '')) { continue; }
        neutraliseAd(fr, 'ad-iframe');
        var p = fr.parentElement;
        if (p && p !== document.body && p.children.length <= 3) { neutraliseAd(p, 'ad-iframe-shell'); }
      }
    } catch (e) {}
    if (state.adsKilled > before) { notifyBadge(); }
    return state.adsKilled - before;
  }

  /* ---------------- 手动圈选 ---------------- */

  function toast(msg, ms) {
    var t = document.getElementById('pb-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'pb-toast';
      t.setAttribute('style', 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:2147483647;' +
        'background:#111827;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;' +
        'padding:10px 16px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.35);max-width:80vw;pointer-events:none;');
      (document.body || document.documentElement).appendChild(t);
    }
    t.textContent = msg;
    clearTimeout(t.__timer);
    t.__timer = setTimeout(function () { try { t.remove(); } catch (e) {} }, ms || 2200);
  }

  function selectorOf(el) {
    if (el.id) { return '#' + CSS.escape(el.id); }
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 4 && node !== document.body) {
      var cls = (typeof node.className === 'string') ? node.className.trim().split(/\s+/).filter(Boolean) : [];
      var seg = node.tagName.toLowerCase();
      if (cls.length) { seg += '.' + cls.slice(0, 2).map(function (c) { return CSS.escape(c); }).join('.'); }
      parts.unshift(seg);
      var parent = node.parentElement;
      if (parent) {
        var same = Array.prototype.filter.call(parent.children, function (c) { return c.matches && c.matches(parts.join(' > ')); });
        if (same.length > 1) { seg += ':nth-of-type(' + (Array.prototype.indexOf.call(parent.children, node) + 1) + ')'; parts[0] = seg; }
      }
      node = parent;
      depth += 1;
    }
    return parts.join(' > ');
  }

  function onPick(ev) {
    if (!state.picking) { return; }
    ev.preventDefault();
    ev.stopPropagation();
    var el = ev.target;
    if (!el || el.nodeType !== 1) { return; }
    var sel = selectorOf(el);
    try {
      CFG.extra[SITE] = (CFG.extra[SITE] || []).concat([sel]);
      var payload = {};
      payload['extra'] = CFG.extra;
      chrome.storage.local.set(payload);
    } catch (e) {}
    el.style.setProperty('display', 'none', 'important');
    record(label(el), ['manual-pick']);
    notifyBadge();
    toast('已记录规则：' + sel, 3000);
  }

  /* ---------------- 阅读模式 ---------------- */

  function bestRoot() {
    var list = document.querySelectorAll('article, main, [class*="article" i], [class*="story" i], [itemprop="articleBody"]');
    var best = null, bestLen = 0;
    for (var i = 0; i < list.length && i < 40; i++) {
      var n = list[i];
      var len = (n.textContent || '').length;
      if (len > bestLen) { bestLen = len; best = n; }
    }
    if (best && bestLen > 400) { return best; }
    return document.body;
  }

  function readMode() {
    if (state.readerOpen) { closeReader(); return; }
    var root = bestRoot();
    var box = document.createElement('div');
    box.id = 'pb-reader';
    var head = document.createElement('div');
    head.setAttribute('style', 'position:sticky;top:0;display:flex;align-items:center;gap:12px;padding:14px 20px;' +
      'background:#12141a;border-bottom:1px solid #2a2e39;font:13px/1.4 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#8b93a7;');
    var title = document.createElement('div');
    title.setAttribute('style', 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e8e8ee;font-weight:600;');
    title.textContent = document.title || location.hostname;
    var btn = document.createElement('button');
    btn.textContent = '关闭 (Esc)';
    btn.setAttribute('style', 'cursor:pointer;background:#e2342c;color:#fff;border:0;border-radius:6px;padding:6px 12px;font-size:12px;');
    btn.addEventListener('click', closeReader);
    head.appendChild(title);
    head.appendChild(btn);

    var body = document.createElement('div');
    body.setAttribute('style', 'max-width:720px;margin:0 auto;padding:28px 22px 120px;' +
      'font:17px/1.85 Georgia,"Songti SC",-apple-system,sans-serif;color:#dcdfe7;');
    var nodes = root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,figcaption');
    var count = 0;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var t = (n.textContent || '').trim();
      if (n.tagName === 'P' || n.tagName === 'LI' || n.tagName === 'BLOCKQUOTE') {
        if (t.length < 2) { continue; }
      } else if (!t) { continue; }
      var c = document.createElement(n.tagName);
      c.textContent = t;
      if (/^H[1-4]$/.test(n.tagName)) {
        c.setAttribute('style', 'margin:1.6em 0 .6em;font:600 ' + (n.tagName === 'H1' ? '30px' : '22px') + '/1.35 -apple-system,"PingFang SC",sans-serif;color:#fff;');
      }
      body.appendChild(c);
      count += 1;
    }
    if (count === 0) {
      var p = document.createElement('p');
      p.textContent = '没抓到正文，试试刷新后重开阅读模式。';
      body.appendChild(p);
    }
    box.appendChild(head);
    box.appendChild(body);
    document.documentElement.appendChild(box);
    state.readerOpen = true;
    document.addEventListener('keydown', escReader, true);
  }

  function escReader(e) {
    if (e.key === 'Escape') { closeReader(); }
  }

  function closeReader() {
    var box = document.getElementById('pb-reader');
    if (box) { box.remove(); }
    state.readerOpen = false;
    document.removeEventListener('keydown', escReader, true);
  }

  /* ---------------- 消息接口 ---------------- */

  try {
    chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
      if (!msg || !msg.type) { return; }
      if (msg.type === 'pb:scan') {
        state.seen = new WeakMap();
        sweep('manual');
        sweepAds('manual');
        unlockScroll();
        try { if (window.__PB_REPAIR__) { window.__PB_REPAIR__.run(); } } catch (e) {}
        reply({ removed: state.removed, ads: state.adsKilled, log: state.log, adLog: state.adLog, active: active(), profile: state.profile });
        return true;
      }
      if (msg.type === 'pb:pick') {
        state.picking = !state.picking;
        toast(state.picking ? '圈选模式：点击要屏蔽的弹窗元素（再点一次按钮退出）' : '已退出圈选模式', 3000);
        reply({ picking: state.picking });
        return true;
      }
      if (msg.type === 'pb:diag') {
        var d = null;
        try { d = window.__PB_REPAIR__ ? window.__PB_REPAIR__.diag() : { error: 'repair.js 未加载' }; } catch (e) { d = { error: String(e) }; }
        reply({ diag: d, removed: state.removed, ads: state.adsKilled, adLog: state.adLog, log: state.log, href: location.href, profile: state.profile });
        return true;
      }
      if (msg.type === 'pb:ads') {
        sweepAds('manual');
        reply({ count: state.adsKilled, list: state.adLog.slice(0, 20) });
        return true;
      }
      if (msg.type === 'pb:read') { readMode(); reply({ reader: state.readerOpen }); }
      if (msg.type === 'pb:reset') {
        try {
          delete CFG.extra[SITE];
          var payload = {};
          payload['extra'] = CFG.extra;
          chrome.storage.local.set(payload);
        } catch (e) {}
        state.seen = new WeakMap();
        reply({ ok: true });
      }
    });
  } catch (e) {}

  /* ---------------- 启动 ---------------- */

  function boot() {
    try {
      chrome.storage.local.get(['enabled', 'siteOff', 'extra', 'blockScripts'], function (cfg) {
        if (chrome.runtime.lastError || !cfg) { return; }
        Object.keys(cfg).forEach(function (k) { if (cfg[k] !== undefined) { CFG[k] = cfg[k]; } });
        if (!active()) { return; }
        sweep('init');
        sweepAds('init');
        startObservers();
      });
    } catch (e) {
      startObservers();
    }
  }

  var observersOn = false;
  function startObservers() {
    if (observersOn) { return; }
    observersOn = true;

    try {
      var mo = new MutationObserver(function () { queue('mutation'); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}

    /* 快速期：前 10 秒 600ms 一次，覆盖"进页即弹 / 等两秒才弹" */
    var fastUntil = Date.now() + 10000;
    setInterval(function () {
      if (document.hidden || !active()) { return; }
      sweep('tick');
      sweepAds('tick');
    }, 1200);
    setInterval(function () {
      if (document.hidden || !active() || Date.now() > fastUntil) { return; }
      sweep('tick');
    }, 600);

    var scrollLock = false;
    window.addEventListener('scroll', function () {
      if (scrollLock) { return; }
      scrollLock = true;
      setTimeout(function () { scrollLock = false; sweep('scroll'); }, 500);
    }, { passive: true });

    document.addEventListener('click', onPick, true);
    window.addEventListener('pageshow', function () { state.seen = new WeakMap(); queue('pageshow'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    /* document_start 也先扫一次，抢在弹窗绘制前 */
    setTimeout(function () { try { sweep('init'); sweepAds('init'); } catch (e) {} }, 0);
  } else {
    boot();
  }
})();
