// SPDX-FileCopyrightText: 2026 Paywall Buster contributors
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

/* Paywall Buster — service worker：徽标计数 + 付费墙脚本拦截（可选） */
'use strict';

var NEWS_DOMAINS = ['reuters.com', 'ft.com', 'wsj.com', 'nytimes.com', 'washingtonpost.com', 'thetimes.co.uk', 'economist.com'];
var PAYWALL_PATTERNS = ['*paywall*', '*regwall*', '*subscriber-wall*', '*subscription-wall*', '*metered*'];

function buildRules() {
  var rules = [];
  var id = 1;
  NEWS_DOMAINS.forEach(function (dom) {
    PAYWALL_PATTERNS.forEach(function (pat) {
      rules.push({
        id: id++,
        priority: 1,
        action: { type: 'block' },
        condition: {
          urlFilter: pat,
          initiatorDomains: [dom],
          resourceTypes: ['script', 'xmlhttprequest', 'sub_frame', 'image']
        }
      });
    });
  });
  return rules;
}

async function syncScriptBlock(on) {
  try {
    var old = await chrome.declarativeNetRequest.getDynamicRules();
    var removeRuleIds = old.map(function (r) { return r.id; });
    var addRules = on ? buildRules() : [];
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds, addRules: addRules });
  } catch (e) {
    console.warn('[PaywallBuster] DNR sync failed', e);
  }
}

chrome.runtime.onInstalled.addListener(async function () {
  var cfg = await chrome.storage.local.get(['enabled', 'blockScripts']);
  if (cfg.enabled === undefined) await chrome.storage.local.set({ enabled: true });
  if (cfg.blockScripts === undefined) await chrome.storage.local.set({ blockScripts: false });
  syncScriptBlock(cfg.blockScripts === true);
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'local') return;
  if (changes.blockScripts) syncScriptBlock(changes.blockScripts.newValue === true);
});

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  if (!msg || !msg.type) return;
  if (msg.type === 'pb:badge' && sender.tab && sender.tab.id >= 0) {
    var n = msg.n || 0;
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: n > 0 ? String(n) : '' });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: '#e2342c' });
    reply({ ok: true });
  }
  if (msg.type === 'pb:openTab') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup.html') });
    reply({ ok: true });
  }
});

chrome.commands.onCommand.addListener(async function (cmd) {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return;
  var tab = tabs[0];
  if (cmd === 'read-mode') {
    chrome.tabs.sendMessage(tab.id, { type: 'pb:read' }).catch(function () {});
    return;
  }
  if (cmd === 'toggle-site') {
    var host = '';
    try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch (e) { return; }
    var st = await chrome.storage.local.get(['siteOff']);
    var off = st.siteOff || [];
    var i = off.indexOf(host);
    if (i >= 0) off.splice(i, 1); else off.push(host);
    await chrome.storage.local.set({ siteOff: off });
    chrome.tabs.reload(tab.id);
  }
});
