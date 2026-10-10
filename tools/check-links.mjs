#!/usr/bin/env node
// 每周一由 .github/workflows/links.yml 跑一遍，结果在那次运行的 Summary 页。
// 工作流本身永远是绿的：只有「确定失效」那档要修（404、410、DOI 在 doi.org 查无此号）。
// 「没连上」多半是 gov.cn 挡境外机房 IP，「加密握手不兼容」是老政府站，浏览器能开。
//
//   node tools/check-links.mjs
//   本地走代理：NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 node tools/check-links.mjs
//
// 修法按顺序：① 同一机构官网的新地址；② 换一份能逐字核对同一事实的官方原文；
// ③ 实在没有，用 web.archive.org 的存档链接，并在条目里注明「原页面已下线，链接为某年某月某日的网页存档」。
import { loadBook } from './lib/book.mjs';

const { sections } = await loadBook();
const all = new Set();
for (const s of sections) for (const e of s.entries) {
  for (const t of [e.src, e.note]) for (const m of String(t).matchAll(/https?:\/\/[^\s<>）)]+/g)) all.add(m[0].replace(/[。，；>]+$/, ''));
}
const links = [...all].sort();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const TIMEOUT = 20000;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function head(u) {
  const t0 = Date.now();
  try {
    const res = await fetch(u, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT), headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } });
    return { status: res.status, ms: Date.now() - t0 };
  } catch (err) {
    const name = err.name || '';
    if (name === 'TimeoutError' || name === 'AbortError') return { net: '超时', ms: Date.now() - t0 };
    if (/certificate|SSL|TLS/i.test(err.message)) return { net: '加密握手不兼容' };
    return { net: '没连上' };
  }
}

const dead = [], flaky = [];
for (const u of links) {
  const r = await head(u);
  if (r.status === 404 || r.status === 410) dead.push(`${u} → HTTP ${r.status}`);
  else if (r.net) flaky.push(`${u} → ${r.net}`);
  await sleep(120);
}

console.log(`共 ${links.length} 条链接。`);
console.log(`确定失效 ${dead.length} 条（要修）：`);
for (const d of dead) console.log('  - ' + d);
console.log(`连不上 ${flaky.length} 条（多半是 gov.cn 挡境外 IP 或老站握手问题，浏览器能开就不算失效）：`);
for (const f of flaky) console.log('  - ' + f);
