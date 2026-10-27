// SPDX-FileCopyrightText: 2026 Paywall Buster contributors
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

/* Paywall Buster — repair.js (v2.0, document_end)
 *
 * 解决 v1.0 的真实故障：「弹窗没了，正文也没了」。
 * 四件事，按顺序：
 *   1) rescue     : 把被 CSS/站点样式藏起来的【正文容器】救回来（带正文判据，不误救广告/推荐块）
 *   2) unlock     : 解除正文内部被折叠/模糊/渐隐/分段的段落
 *   3) sources    : 从页面【内嵌数据】抽全文：JSON-LD articleBody / Arc XP Fusion / __NEXT_DATA__ / 预置状态
 *   4) backfill   : DOM 正文明显短于内嵌数据时，把全文渲染到正文下方
 * 全部操作幂等，重复执行不叠加。
 */
(function () {
  'use strict';
  if (window.__PB_REPAIR__) { return; }

  var ARTICLE_SEL = [
    '[itemprop="articleBody"]',
    '[data-testid*="ArticleBody" i]',
    '[class*="article-body" i]',
    '[class*="articleBody" i]',
    '[class*="article__body" i]',
    '[class*="article-content" i]',
    '[class*="articleContent" i]',
    '[class*="story-body" i]',
    /* v2.0 多平台：中文与各国常见正文容器（微信 / 知乎 / CSDN / 财新 / 澎湃 / 通用 CMS） */
    '#js_content',
    '.rich_media_content',
    '[class*="rich_media" i]',
    '[class*="article_content" i]',
    '[class*="article__content" i]',
    '[class*="art_content" i]',
    '[class*="detail-content" i]',
    '[class*="post-content" i]',
    '[class*="entry-content" i]',
    '[class*="content-article" i]',
    '[class*="article-con" i]',
    '.markdown-body',
    '.RichText',
    'article',
    'main'
  ].join(',');

  var STRONG_SEL = '[class*="paywall" i],[id*="paywall" i],[class*="pay-wall" i],[class*="regwall" i],' +
                   '[class*="subscriber-wall" i],[class*="subscription-wall" i],[class*="content-gate" i],' +
                   '[class*="article-gate" i],[data-paywall],[hidden],[aria-hidden="true"],article,main';

  var PARA_MIN = 3;      /* 至少 3 个 <p> 才算"像正文" */
  var CHAR_MIN = 400;    /* 至少 400 字符才算"像正文" */

  var state = { rescued: 0, unlocked: 0, backfilled: false, lastDomChars: 0, seenDom: 0 };

  /* v2.0：站点档案（src/profiles.js 在同一隔离世界先注入）。用 hostname 去掉 www 做 key。 */
  var HOST = location.hostname.replace(/^www\./, '');
  function PROF() {
    try { return window.__PB_PROFILES__ || null; } catch (e) { return null; }
  }
  function siteProfile() {
    var p = PROF();
    return (p && p.sites && p.sites[HOST]) || null;
  }
  /* 服务端截断的供应商：正文根本没下发，DOM 里补不出来，只做提示不去刷日志 */
  var SERVER_SIDE = /^(substack|ghost|medium)/i;
  /* CMP 同意层不碰（清掉只会让站点拿不到内容），与 content.js 的 CMP_RE 保持同一口径 */
  var CMP_RE = /(sp_message_|sp-message|onetrust|optanon|fides-|fides_|didomi|qc-cmp|cookiebot|cybotcookiebot|usercentrics|truste|iubenda|osano|termly|ketch-consent|privacy-mgmt)/i;
  function isCMP(el) {
    try {
      var n = el;
      for (var i = 0; n && i < 4; i++) {
        if (CMP_RE.test((n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : ''))) { return true; }
        n = n.parentElement;
      }
    } catch (e) {}
    return false;
  }

  function sel(el) {
    if (!el || el.nodeType !== 1) { return '?'; }
    var s = el.tagName.toLowerCase();
    if (el.id) { s += '#' + el.id; }
    var c = (el.className && typeof el.className === 'string') ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    if (c) { s += '.' + c; }
    return s.slice(0, 90);
  }

  function paraCount(el) {
    if (!el || !el.querySelectorAll) { return 0; }
    return el.querySelectorAll('p').length;
  }

  /* 判定一个元素"像正文"：段落够多、文本够长，或直接是 articleBody */
  function looksLikeArticle(el) {
    if (!el || el.nodeType !== 1) { return false; }
    var txt = el.textContent || '';
    if (txt.length < CHAR_MIN) { return false; }
    var ps = paraCount(el);
    if (ps < PARA_MIN && !el.matches('[itemprop="articleBody"],[data-testid*="ArticleBody" i]')) { return false; }
    return true;
  }

  /* ---------------- 1. 救援被隐藏的正文容器 ---------------- */

  function rescue() {
    var hit = 0;
    var nodes;
    try { nodes = document.querySelectorAll(STRONG_SEL); } catch (e) { return 0; }

    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el === document.body || el === document.documentElement) { continue; }
      if (el.hasAttribute('data-pb-rescued')) { continue; }
      if (el.closest('#pb-reader')) { continue; }
      /* 祖先已经被救过，或祖先本来就是可见的正文容器，跳过 */
      if (el.closest('[data-pb-rescued]')) { continue; }
      if (!looksLikeArticle(el)) { continue; }

      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      var hiddenGeom = el.getClientRects().length === 0;
      var csHidden = cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0;
      if (!hiddenGeom && !csHidden) { continue; }

      el.setAttribute('data-pb-rescued', '1');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
      el.style.setProperty('height', 'auto', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('overflow', 'visible', 'important');
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('inert');
      hit++;
      log('rescue', el);
    }

    state.rescued += hit;
    return hit;
  }

  /* ---------------- 2. 解除正文内部的折叠 / 模糊 / 渐隐 ---------------- */

  function articleRoot() {
    var best = null;
    var bestLen = 0;
    var nodes;
    try { nodes = document.querySelectorAll(ARTICLE_SEL); } catch (e) { return null; }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest('#pb-reader') || el.id === 'pb-fulltext') { continue; }
      var len = (el.textContent || '').trim().length;
      if (len > bestLen) { bestLen = len; best = el; }
    }
    return best || null;
  }

  var PAY_TEXT = /(subscribe|subscription|sign in to continue|log in to continue|register to continue|unlimited access|free trial|already a subscriber|订阅|付费|登录后阅读)/i;

  /* top-layer <dialog> 的 ::backdrop 无法用 CSS 摘掉，只能 close() */
  function closeDialogs() {
    var n = 0;
    var dlgs;
    try { dlgs = document.querySelectorAll('dialog[open]'); } catch (e) { return 0; }
    for (var i = 0; i < dlgs.length; i++) {
      var d = dlgs[i];
      if (d.id === 'pb-reader') { continue; }
      var txt = (d.textContent || '').slice(0, 1500);
      if (!PAY_TEXT.test(txt)) { continue; }
      if (d.querySelector('article') || (d.querySelectorAll('p').length >= 3 && txt.length > 600)) { continue; }
      try { d.close(); } catch (e) {}
      d.removeAttribute('open');
      d.setAttribute('data-pb-closed', '1');
      d.style.setProperty('display', 'none', 'important');
      n++; log('dialog', d);
    }
    return n;
  }

  function unlock() {
    var root = articleRoot();
    if (!root) { return 0; }
    var n = 0;

    /* 2a. 显式 hidden / aria-hidden / inline display:none 的块 */
    var flagged;
    try {
      flagged = root.querySelectorAll('[hidden],[aria-hidden="true"],[inert],[style*="display:none"],[style*="display: none"],[style*="visibility:hidden"],[style*="visibility: hidden"]');
    } catch (e) { flagged = []; }
    for (var i = 0; i < flagged.length; i++) {
      var el = flagged[i];
      var txt = (el.textContent || '').trim();
      if (txt.length < 40) { continue; }              /* 空壳/图标不动 */
      if (isCMP(el)) { continue; }                    /* 同意管理层不动 */
      if (el.querySelector('script,style,noscript')) { /* 仍继续，只是记录 */ }
      el.removeAttribute('hidden');
      el.removeAttribute('aria-hidden');
      el.removeAttribute('inert');
      el.style.setProperty('display', 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      n++;
    }

    /* 2b. 段落级：模糊、透明、高度截断 */
    var blocks;
    try {
      blocks = root.querySelectorAll('p,figure,blockquote,li,div');
      if (blocks.length > 4000) { blocks = root.querySelectorAll('p,figure,blockquote'); }
    } catch (e) { blocks = []; }
    for (var j = 0; j < blocks.length; j++) {
      var b = blocks[j];
      if ((b.textContent || '').trim().length < 30) { continue; }
      var cs;
      try { cs = getComputedStyle(b); } catch (e) { continue; }
      var changed = false;
      if (cs.filter && cs.filter !== 'none' && /blur|grayscale/i.test(cs.filter)) {
        b.style.setProperty('filter', 'none', 'important'); changed = true;
      }
      if (parseFloat(cs.opacity) < 0.5 && parseFloat(cs.opacity) > 0) {
        b.style.setProperty('opacity', '1', 'important'); changed = true;
      }
      if (cs.maxHeight && cs.maxHeight !== 'none' && b.scrollHeight > 0 && b.scrollHeight > parseFloat(cs.maxHeight)) {
        b.style.setProperty('max-height', 'none', 'important');
        b.style.setProperty('overflow', 'visible', 'important'); changed = true;
      }
      /* 固定高度 + overflow:hidden 的"展开阅读更多"折叠 */
      if (cs.overflow === 'hidden' && cs.height !== 'auto' && b.scrollHeight > b.clientHeight + 40 && b.clientHeight > 0) {
        b.style.setProperty('height', 'auto', 'important');
        b.style.setProperty('max-height', 'none', 'important');
        b.style.setProperty('overflow', 'visible', 'important'); changed = true;
      }
      if (changed) { n++; if (n <= 5) { log('unlock', b); } }
    }

    /* 2c. 正文根自身的分段/渐隐 */
    if (root) {
      var rc;
      try { rc = getComputedStyle(root); } catch (e) { rc = null; }
      if (rc && (rc.maxHeight !== 'none' || rc.overflow === 'hidden')) {
        root.style.setProperty('max-height', 'none', 'important');
        root.style.setProperty('overflow', 'visible', 'important');
      }
      root.style.setProperty('filter', 'none', 'important');
    }

    /* 2d-pre. 站点档案里声明了 clip 选择器时，优先按它精确解锁。
     *   祖先链扫描（2d）上限 10 跳、且要求 root 找得到；有的站正文根在
     *   shadow/iframe 或 root 判据不成立，此时档案里的选择器是唯一线索。
     *   对每个命中元素仍做 overflow 实测，避免把正常容器解坏。 */
    var sp = siteProfile();
    if (sp && sp.clip) {
      var clips = [];
      try { clips = document.querySelectorAll(sp.clip); } catch (e) { clips = []; }
      for (var ci = 0; ci < clips.length; ci++) {
        var cel = clips[ci];
        if (cel.getAttribute('data-pb-uncut') === '1') { continue; }
        var cc = null;
        try { cc = getComputedStyle(cel); } catch (e) { cc = null; }
        if (!cc) { continue; }
        var cCapped = cc.maxHeight !== 'none' && parseFloat(cc.maxHeight) > 0;
        var cClipped = (cc.overflow === 'hidden' || cc.overflowY === 'hidden');
        if (!(cCapped || cClipped)) { continue; }
        if (cel.scrollHeight <= cel.clientHeight + 40) { continue; }
        var cBefore = cel.scrollHeight + '>' + cel.clientHeight;
        cel.style.setProperty('max-height', 'none', 'important');
        cel.style.setProperty('overflow', 'visible', 'important');
        if (cc.height !== 'auto' && parseFloat(cc.height) < cel.scrollHeight - 40) {
          cel.style.setProperty('height', 'auto', 'important');
        }
        cel.setAttribute('data-pb-uncut', '1');
        log('uncut', cel, 'profile ' + cBefore);
        n++;
      }
    }

    /* 2d. 正文祖先链：metered 裁剪层（max-height + overflow:hidden）
     *     典型 Reuters: div.regular-article-layout-module__restricted__xxx
     *     max-height:1219.5px / overflow:hidden / scrollHeight 6946 vs clientHeight 1220
     *     —— 正文全在 DOM 里，只是被上层容器裁掉，滚动范围被压到几百像素。 */
    var anc = root.parentElement;
    var hop = 0;
    while (anc && anc !== document.documentElement && hop < 10) {
      var ac = null;
      try { ac = getComputedStyle(anc); } catch (e) { ac = null; }
      if (ac) {
        var capped = ac.maxHeight !== 'none' && parseFloat(ac.maxHeight) > 0;
        var clipped = (ac.overflow === 'hidden' || ac.overflowY === 'hidden');
        var overflowed = anc.scrollHeight > anc.clientHeight + 60;
        if ((capped || clipped) && overflowed) {
          var beforeSize = anc.scrollHeight + '>' + anc.clientHeight;  /* 必须在解锁前取，解锁后两者相等 */
          anc.style.setProperty('max-height', 'none', 'important');
          anc.style.setProperty('overflow', 'visible', 'important');
          if (ac.height !== 'auto' && parseFloat(ac.height) < anc.scrollHeight - 60) {
            anc.style.setProperty('height', 'auto', 'important');
          }
          anc.setAttribute('data-pb-uncut', '1');
          log('uncut', anc, beforeSize);
          n++;
        }
      }
      anc = anc.parentElement;
      hop++;
    }

    if (n) { state.unlocked += n; }
    return n;
  }

  /* ---------------- 3. 内嵌数据全文抽取 ---------------- */

  function stripHtml(s) {
    return String(s || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|blockquote|section)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0*39;|&apos;/g, "'")
      .replace(/[ \t]+/g, ' ');
  }

  function toParas(text) {
    return String(text || '')
      .split(/\n+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 1; });
  }

  /* 在任意对象里按 key 名找长字符串 / 数组（深度受限） */
  function deepFind(obj, keys, depth, acc) {
    if (!obj || typeof obj !== 'object' || depth > 7) { return acc; }
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length && i < 400; i++) { deepFind(obj[i], keys, depth + 1, acc); }
      return acc;
    }
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) { continue; }
      var v = obj[k];
      if (typeof v === 'string') {
        if (keys.test(k) && v.length > 400) { acc.push(v); }
      } else if (v && typeof v === 'object') {
        deepFind(v, keys, depth + 1, acc);
      }
    }
    return acc;
  }

  function jsonLdSource() {
    var out = [];
    var scripts;
    try { scripts = document.querySelectorAll('script[type="application/ld+json"]'); } catch (e) { return out; }
    for (var i = 0; i < scripts.length; i++) {
      var raw = scripts[i].textContent || '';
      if (raw.length < 200) { continue; }
      var data;
      try { data = JSON.parse(raw.replace(/^\s*<!--/, '').replace(/-->\s*$/, '')); } catch (e) { continue; }
      var bodies = deepFind(data, /^(articleBody|article_body|body)$/i, 0, []);
      for (var b = 0; b < bodies.length; b++) {
        out.push({ name: 'json-ld', text: stripHtml(bodies[b]) });
      }
    }
    return out;
  }

  function findKeyDeep(obj, key, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) { return null; }
    if (Array.isArray(obj[key])) { return obj[key]; }
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) { continue; }
      if (k === key && Array.isArray(obj[k])) { return obj[k]; }
      var v = obj[k];
      if (v && typeof v === 'object') {
        var r = findKeyDeep(v, key, depth + 1);
        if (r) { return r; }
      }
    }
    return null;
  }

  /* Arc XP（Reuters / WaPo 等）把正文放在 Fusion.globalContent.content_elements */
  function fusionSource() {
    var out = [];
    var F = window.Fusion;
    if (!F) { return out; }
    var caches = [F.globalContent, F.contentCache, F.content, F.globalContentCache];
    for (var i = 0; i < caches.length; i++) {
      var els = findKeyDeep(caches[i], 'content_elements', 0);
      if (!els || !els.length) { continue; }
      var paras = [];
      for (var j = 0; j < els.length; j++) {
        var e = els[j];
        if (!e || typeof e !== 'object') { continue; }
        var t = e.type || e._type || '';
        var raw = (typeof e.content === 'string' && e.content) ? e.content : '';
        if (!raw && typeof e.text === 'string') { raw = e.text; }
        if (!raw) { continue; }
        if (/text|header|subhead|paragraph|blurb|quote/i.test(t) || raw.length > 120) {
          paras.push(stripHtml(raw));
        }
      }
      if (paras.length) {
        out.push({ name: 'fusion', text: paras.join('\n\n') });
        break;
      }
    }
    return out;
  }

  function nextDataSource() {
    var out = [];
    var el = document.getElementById('__NEXT_DATA__');
    if (!el || !el.textContent) { return out; }
    var data;
    try { data = JSON.parse(el.textContent); } catch (e) { return out; }
    var hits = deepFind(data, /^(articleBody|article_body|body|content|paragraphs)$/i, 0, []);
    for (var i = 0; i < hits.length; i++) {
      out.push({ name: 'next-data', text: stripHtml(hits[i]) });
    }
    return out;
  }

  function globalStateSource() {
    var out = [];
    var names = ['__PRELOADED_STATE__', '__INITIAL_STATE__', '__APOLLO_STATE__', '__DATA__', 'pageData', '__NUXT__'];
    for (var i = 0; i < names.length; i++) {
      var v;
      try { v = window[names[i]]; } catch (e) { continue; }
      if (!v || typeof v !== 'object') { continue; }
      var hits = deepFind(v, /^(articleBody|article_body|paragraphs|bodyText)$/i, 0, []);
      for (var j = 0; j < hits.length; j++) {
        out.push({ name: names[i], text: stripHtml(hits[j]) });
      }
    }
    return out;
  }

  function domText() {
    var root = articleRoot();
    if (!root) { return { paras: [], chars: 0, root: null }; }
    var ps = root.querySelectorAll('p, h2, h3, li, blockquote');
    var arr = [];
    for (var i = 0; i < ps.length; i++) {
      var t = (ps[i].textContent || '').trim();
      if (t.length > 1) { arr.push(t); }
      if (arr.length > 400) { break; }
    }
    var joined = arr.join('\n');
    return { paras: arr, chars: joined.length, root: root };
  }

  function allSources() {
    var list = [];
    var groups = [jsonLdSource(), fusionSource(), nextDataSource(), globalStateSource()];
    for (var i = 0; i < groups.length; i++) {
      for (var j = 0; j < groups[i].length; j++) {
        var s = groups[i][j];
        var paras = toParas(s.text);
        list.push({ name: s.name, chars: paras.join('\n').length, paras: paras });
      }
    }
    list.sort(function (a, b) { return b.chars - a.chars; });
    return list;
  }

  /* ---------------- 4. 回填全文 ---------------- */

  function backfill() {
    if (state.backfilled) { return 0; }
    var dom = domText();
    if (dom.chars > 900) { return 0; }              /* DOM 本来就有正文，不插 */

    var srcs = allSources();
    if (!srcs.length) { return 0; }
    var best = srcs[0];
    if (best.chars < 800) { return 0; }
    if (best.chars < dom.chars * 1.6) { return 0; } /* 只多一点点就别插 */

    var host = dom.root || document.body;
    if (!host) { return 0; }

    var box = document.createElement('section');
    box.id = 'pb-fulltext';
    box.setAttribute('data-pb-fulltext', '1');
    var head = document.createElement('div');
    head.className = 'pb-ft-head';
    head.textContent = '全文 · 来自页面内嵌数据（' + best.name + '）';
    box.appendChild(head);
    var bodyBox = document.createElement('div');
    bodyBox.className = 'pb-ft-body';
    for (var i = 0; i < best.paras.length && i < 400; i++) {
      var p = document.createElement('p');
      p.textContent = best.paras[i];
      bodyBox.appendChild(p);
    }
    box.appendChild(bodyBox);

    if (host.tagName === 'BODY') {
      host.appendChild(box);
    } else {
      host.parentNode ? host.parentNode.insertBefore(box, host.nextSibling) : host.appendChild(box);
    }

    state.backfilled = true;
    log('backfill', box, best.name + ' / ' + best.chars + ' chars');
    return 1;
  }

  /* ---------------- 诊断 ---------------- */

  function diag() {
    var dom = domText();
    var srcs = allSources();
    var suspects = [];
    try {
      var nodes = document.querySelectorAll(STRONG_SEL);
      for (var i = 0; i < nodes.length && suspects.length < 12; i++) {
        var el = nodes[i];
        if (!looksLikeArticle(el)) { continue; }
        if (el.getClientRects().length > 0 && !el.hasAttribute('data-pb-rescued')) { continue; }
        suspects.push({ sel: sel(el), chars: (el.textContent || '').length, paras: paraCount(el), rescued: el.hasAttribute('data-pb-rescued') });
      }
    } catch (e) {}

    return {
      url: location.href,
      host: location.hostname,
      title: document.title,
      dom: { root: dom.root ? sel(dom.root) : null, paras: dom.paras.length, chars: dom.chars },
      sources: srcs.slice(0, 5).map(function (s) { return { name: s.name, chars: s.chars }; }),
      rescued: state.rescued,
      unlocked: state.unlocked,
      backfilled: state.backfilled,
      fulltextChars: (function () {
        var f = document.getElementById('pb-fulltext');
        return f ? (f.textContent || '').length : 0;
      })(),
      profile: (function () {
        var out = { site: siteProfile() ? HOST : null, vendors: [], textExtra: false, clipped: 0 };
        try {
          var p = PROF();
          if (p && p.vendors) {
            var blob = '';
            try {
              blob = Array.prototype.map.call(document.querySelectorAll('script[src],iframe[src],link[href]'), function (n) {
                return n.src || n.href || '';
              }).join(' ');
            } catch (e) {}
            Object.keys(p.vendors).forEach(function (k) {
              var v = p.vendors[k];
              if (v && v.probe && v.probe.test(blob)) { out.vendors.push(v.name || k); }
            });
          }
          if (siteProfile() && siteProfile().textExtra) { out.textExtra = true; }
          out.clipped = document.querySelectorAll('[data-pb-uncut]').length;
          out.serverSide = out.vendors.some(function (v) { return SERVER_SIDE.test(String(v).toLowerCase()); });
          out.hardWall = !!(siteProfile() && siteProfile().hardWall);
          out.hardWallNotice = !!document.getElementById('pb-hardwall-notice');
        } catch (e) {}
        return out;
      })(),
      suspects: suspects
    };
  }

  /* ---------------- 服务端硬截断提示 ---------------- */
  /* 有些站的付费墙是【服务端】下发：DOM 里本来就只有摘要，前端怎么改都补不回来
   * （实测：财新 #Main_Content_Val 480 字 vs 页面自报 3710 字；机器之心同型）。
   * profiles 里标了 hardWall 的站点，检测到正文明显短于页面自报字数时，只给一条可关闭的
   * 提示，不做无用的正文改造，避免用户误以为扩展失效。 */
  var HARDWALL_MIN = 1200;

  function hardWallNotice() {
    var p = siteProfile();
    if (!p || !p.hardWall) { return 0; }
    if (document.getElementById('pb-hardwall-notice')) { return 0; }
    var dom = domText();
    if (!dom.root || dom.chars >= HARDWALL_MIN) { return 0; }
    var claimed = 0;
    try {
      var m = (document.body.textContent || '').match(/(?:本文|全文|本篇)[^0-9]{0,6}(\d{3,6})\s*字/);
      if (m) { claimed = parseInt(m[1], 10) || 0; }
    } catch (e) {}
    if (claimed && dom.chars > claimed * 0.9) { return 0; }
    var box = document.createElement('div');
    box.id = 'pb-hardwall-notice';
    box.setAttribute('data-pb-ad-protect', '1');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483646;max-width:320px;padding:10px 34px 10px 12px;'
      + 'background:#2a1b12;color:#ffd9a8;border:1px solid #6b4a2f;border-radius:8px;'
      + 'font:12px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.45);';
    box.textContent = '本页正文在服务器端被付费墙截断（当前仅 ' + dom.chars + ' 字'
      + (claimed ? '，页面自报 ' + claimed + ' 字' : '') + '），浏览器端补不回来。';
    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '\u00d7';
    x.style.cssText = 'position:absolute;top:2px;right:6px;background:none;border:0;color:#ffd9a8;font-size:16px;cursor:pointer;line-height:1;';
    x.addEventListener('click', function () { box.remove(); });
    box.appendChild(x);
    document.body.appendChild(box);
    log('hardwall', null, dom.chars + '/' + (claimed || '?'));
    return 1;
  }

  /* ---------------- 日志（存 window 供排查） ---------------- */

  function log(kind, el, extra) {
    try {
      window.__PB_REPAIR_LOG__ = window.__PB_REPAIR_LOG__ || [];
      window.__PB_REPAIR_LOG__.push({ t: Date.now(), kind: kind, sel: el ? sel(el) : null, extra: extra || null });
      if (window.__PB_REPAIR_LOG__.length > 60) { window.__PB_REPAIR_LOG__.shift(); }
    } catch (e) {}
  }

  /* ---------------- 编排 ---------------- */

  function run() {
    try { closeDialogs(); } catch (e) {}
    try { rescue(); } catch (e) {}
    try { unlock(); } catch (e) {}
    try { backfill(); } catch (e) {}
    try { hardWallNotice(); } catch (e) {}
  }

  window.__PB_REPAIR__ = { run: run, diag: diag, rescue: rescue, unlock: unlock, backfill: backfill, hardWallNotice: hardWallNotice, closeDialogs: closeDialogs, sources: allSources, state: state };

  var scheduled = false;
  function queue() {
    if (scheduled) { return; }
    scheduled = true;
    setTimeout(function () { scheduled = false; run(); }, 250);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    run();
  } else {
    document.addEventListener('DOMContentLoaded', run, { once: true });
    window.addEventListener('load', run, { once: true });
  }

  try {
    var mo = new MutationObserver(queue);
    mo.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  /* 前 30 秒密集，之后低频兜底（站点常在付费墙脚本回调后才插入正文） */
  var fastUntil = Date.now() + 30000;
  setInterval(function () {
    if (document.hidden) { return; }
    run();
  }, 1500);
  setInterval(function () {
    if (document.hidden || Date.now() > fastUntil) { return; }
    run();
  }, 500);
  setTimeout(run, 3000);
  setTimeout(run, 8000);
})();
