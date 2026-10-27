// SPDX-FileCopyrightText: 2026 Paywall Buster contributors
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

'use strict';

var $ = function (id) { return document.getElementById(id); };
var tabId = null;
var host = '';

function siteKey(h) { return (h || '').replace(/^www\./, ''); }

function flash(text) {
  $('msg').textContent = text || '';
  clearTimeout(flash._t);
  flash._t = setTimeout(function () { $('msg').textContent = ''; }, 1800);
}

function send(msg) {
  return new Promise(function (resolve) {
    if (tabId == null) { return resolve(null); }
    try {
      chrome.tabs.sendMessage(tabId, msg, function (res) {
        void chrome.runtime.lastError;
        resolve(res || null);
      });
    } catch (e) { resolve(null); }
  });
}

/* v2.0：显示当前页命中的平台档案（站点名 / 付费墙供应商），一眼看出规则为什么生效 */
function showProfile(profile) {
  var box = $('prof');
  if (!box) { return; }
  var list = Array.isArray(profile) ? profile : [];
  if (!list.length) { box.hidden = true; return; }
  box.hidden = false;
  box.textContent = '命中的平台档案：' + list.join(' + ');
}

function renderLog(log, adLog) {
  var box = $('log');
  /* 广告条目排在弹窗条目之后：先看"墙清没清干净"，再看广告 */
  var items = (log || []).map(function (it) { return { sel: it.sel, why: it.why, ad: false }; })
    .concat((adLog || []).map(function (it) { return { sel: it.sel, why: it.why, ad: true }; }));
  if (!items.length) {
    box.innerHTML = '<div class="empty">暂无记录</div>';
    return;
  }
  box.innerHTML = '';
  items.slice(0, 14).forEach(function (it) {
    var d = document.createElement('div');
    d.className = 'item';
    var s = document.createElement('div');
    s.className = 'sel';
    if (it.ad) { s.classList.add('ad'); s.textContent = '▸ ' + it.sel; } else { s.textContent = it.sel; }
    var w = document.createElement('div');
    w.className = 'why';
    w.textContent = (it.ad ? '[广告] ' : '') + it.why;
    d.appendChild(s);
    d.appendChild(w);
    box.appendChild(d);
  });
}

async function init() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length) {
    tabId = tabs[0].id;
    try { host = new URL(tabs[0].url).hostname; } catch (e) { host = ''; }
  }
  $('host').textContent = host || '当前页面不可注入（chrome:// 等）';

  var cfg = await chrome.storage.local.get(['enabled', 'siteOff', 'blockScripts']);
  $('enabled').checked = cfg.enabled !== false;
  $('blockScripts').checked = cfg.blockScripts === true;
  var off = cfg.siteOff || [];
  $('siteOn').checked = off.indexOf(siteKey(host)) < 0;

  var res = await send({ type: 'pb:scan' });
  if (res) {
    $('count').textContent = res.removed || 0;
    $('adCount').textContent = res.ads || 0;
    renderLog(res.log, res.adLog);
    showProfile(res.profile);
    if (res.active === false) { $('siteOn').checked = false; }
  }
}

$('enabled').addEventListener('change', function (e) {
  chrome.storage.local.set({ enabled: e.target.checked });
  flash(e.target.checked ? '已全局开启' : '已全局关闭');
});

$('siteOn').addEventListener('change', async function (e) {
  var key = siteKey(host);
  var st = await chrome.storage.local.get(['siteOff']);
  var off = st.siteOff || [];
  var i = off.indexOf(key);
  if (e.target.checked) { if (i >= 0) { off.splice(i, 1); } } else { if (i < 0) { off.push(key); } }
  await chrome.storage.local.set({ siteOff: off });
  if (tabId != null) { chrome.tabs.reload(tabId); }
});

$('blockScripts').addEventListener('change', function (e) {
  chrome.storage.local.set({ blockScripts: e.target.checked });
  flash(e.target.checked ? '脚本拦截已开' : '脚本拦截已关');
});

$('scan').addEventListener('click', async function () {
  var res = await send({ type: 'pb:scan' });
  if (res) {
    $('count').textContent = res.removed || 0;
    $('adCount').textContent = res.ads || 0;
    renderLog(res.log, res.adLog);
    showProfile(res.profile);
    flash('已清理：弹窗 ' + (res.removed || 0) + ' · 广告 ' + (res.ads || 0));
  } else { flash('本页无内容脚本'); }
});

$('pick').addEventListener('click', async function () {
  var res = await send({ type: 'pb:pick' });
  $('pick').classList.toggle('on', !!(res && res.picking));
  if (!res) { flash('本页无内容脚本'); return; }
  window.close();
});

$('read').addEventListener('click', async function () {
  var res = await send({ type: 'pb:read' });
  if (!res) { flash('本页无内容脚本'); return; }
  window.close();
});

$('diag').addEventListener('click', async function () {
  var res = await send({ type: 'pb:diag' });
  var box = $('diagbox');
  if (!res) { flash('本页无内容脚本（刷新页面再试）'); return; }
  if (!box) { return; }
  var d = res.diag || {};
  var lines = [
    'URL: ' + (d.url || res.href || ''),
    '正文容器: ' + ((d.dom && d.dom.root) || '未找到'),
    'DOM 段落/字符: ' + ((d.dom && d.dom.paras) || 0) + ' 段 / ' + ((d.dom && d.dom.chars) || 0) + ' 字符',
    '内嵌全文源: ' + ((d.sources || []).map(function (s) { return s.name + '=' + s.chars; }).join(', ') || '无'),
    '已救援容器: ' + (d.rescued || 0) + ' / 已解锁段落: ' + (d.unlocked || 0),
    '回填全文: ' + (d.backfilled ? ('是，' + (d.fulltextChars || 0) + ' 字符') : '否'),
    '疑似仍被隐藏: ' + ((d.suspects || []).length) + ' 个',
    '命中的平台档案: ' + ((res.profile || []).join(' + ') || '通用规则'),
    '裁剪层已解锁: ' + (((d.profile || {}).clipped) || 0) + ' 个 · 供应商: ' + ((((d.profile || {}).vendors) || []).join('/') || '无'),
    '已屏蔽广告位: ' + (res.ads || 0) + ' 个',
    '广告规则命中: ' + ((res.adLog || []).slice(0, 6).map(function (a) { return a.sel; }).join(' | ') || '无')
  ];
  box.textContent = lines.join('\n') + '\n\n' + JSON.stringify(d, null, 2);
  box.hidden = false;
  box.select && box.select();
});

$('reset').addEventListener('click', async function () {
  var res = await send({ type: 'pb:reset' });
  flash(res ? '已清除本站手动规则' : '本页无内容脚本');
});

init();
