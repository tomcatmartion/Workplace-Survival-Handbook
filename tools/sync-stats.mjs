#!/usr/bin/env node
// 一键同步全书统计数字：重算条目数、节数、A/B/C 数、争议数、待核实数、链接数和性价比三档，
// 回写 README、index.html 和 tools/og.html，再用全新的 user-data-dir 重出 og.png。
//
//   node tools/sync-stats.mjs           改数字并重出 og.png
//   node tools/sync-stats.mjs --check   只查不改，数字过时就退出码 1（CI 用它）
//   node tools/sync-stats.mjs --no-screenshot   只改数字，不动 og.png
//
// 新增要随统计变的数字，就往下面的 EDITS 表里加一行，别在正文里另写死一处。
import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { loadBook, statsOf, ROOT, COST_W, ratioOf } from './lib/book.mjs';

const run = promisify(execFile);
const ARGV = process.argv.slice(2);
const CHECK = ARGV.includes('--check');
const SHOT = !ARGV.includes('--no-screenshot');

const { sections, readme } = await loadBook();
const st = statsOf(sections, readme);

/* ---------- 要回写的数字 ---------- */
// 每条：文件、匹配旧数字的正则、按统计值生成新串的函数。
// 正则里留一个组，替换时整段重写，所以正文里怎么写都行，不用对齐。
const EDITS = [
  ['README.md', /(\d+)\s*条建议/, () => `${st.entries} 条建议`],
  ['README.md', /(%E6%9D%A1%E7%9B%AE-)(\d+)(%20%E6%9D%A1)/, (m) => m[1] + st.entries + m[3]],
  ['README.md', /(%E8%AF%81%E6%8D%AE%E5%88%86%E7%BA%A7-A%20)\d+(%20%C2%B7%20B%20)\d+(%20%C2%B7%20C%20)\d+/,
    () => `%E8%AF%81%E6%8D%AE%E5%88%86%E7%BA%A7-A%20${st.a}%20%C2%B7%20B%20${st.b}%20%C2%B7%20C%20${st.c}`],
  ['README.md', /(%E5%8E%9F%E5%A7%8B%E6%96%87%E7%8C%AE-)(\d+)(%20%E6%9D%A1%E9%93%BE%E6%8E%A5)/, (m) => m[1] + st.links + m[3]],
  ['README.md', /全书 \d+ 条中 A 级 \d+ 条、B 级 \d+ 条、C 级 \d+ 条，另有 \d+ 处标注了待核实/,
    () => `全书 ${st.entries} 条中 A 级 ${st.a} 条、B 级 ${st.b} 条、C 级 ${st.c} 条，另有 ${st.todo} 处标注了待核实`],
  ['README.md', /只留下引到了法条或官方文件原文的 \d+ 条/, () => `只留下引到了法条或官方文件原文的 ${st.a} 条`],
  ['index.html', /全书 (\d+) 节(?: \d+ 条)?/, () => `全书 ${st.sections} 节 ${st.entries} 条`],
  ['tools/og.html', /<b id="og-sec">\d+<\/b>/, () => `<b id="og-sec">${st.sections}</b>`],
  ['tools/og.html', /<b id="og-n">\d+<\/b>/, () => `<b id="og-n">${st.entries}</b>`],
  ['tools/og.html', /<b id="og-a">\d+<\/b>/, () => `<b id="og-a">${st.a}</b>`],
  ['tools/og.html', /<b id="og-link">\d+<\/b>/, () => `<b id="og-link">${st.links}</b>`]
];

/* ---------- 一致性自检：档位规则和 index.html 绑定 ---------- */
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const costLine = /const COST_W = \{[^}]+\}/.exec(html);
const ratioLine = /e\.ratio = e\.level === '大'[\s\S]{0,180}?;/.exec(html);
if (!costLine || !ratioLine) {
  console.error('index.html 里找不到 COST_W 或 e.ratio 那两行，档位规则可能对不上了。');
  process.exit(1);
}
// 拿一条抽样条目，比对脚本算的和 index.html 规则描述是否同构
const sample = sections.flatMap(s => s.entries)[0];
if (sample && ratioOf(sample.level, sample.money, sample.time, sample.will) !== sample.ratio) {
  console.error('档位规则和 lib/book.mjs 不一致，先同步再跑统计。');
  process.exit(1);
}

/* ---------- 执行 ---------- */
const byFile = new Map();
for (const [file, re, gen] of EDITS) {
  if (!byFile.has(file)) byFile.set(file, []);
  byFile.get(file).push([re, gen]);
}

let stale = 0;
for (const [file, list] of byFile) {
  const p = path.join(ROOT, file);
  let text = await readFile(p, 'utf8');
  for (const [re, gen] of list) {
    if (!re.test(text)) { console.error(`${file}：找不到要同步的数字 ${re}`); stale++; continue; }
    const m = re.exec(text);
    const next = gen(m);
    if (text.slice(m.index, m.index + m[0].length) === next) continue;
    stale++;
    if (!CHECK) text = text.slice(0, m.index) + next + text.slice(m.index + m[0].length);
  }
  if (!CHECK) await writeFile(p, text, 'utf8');
}

const report = `节 ${st.sections}（已写出 ${st.written}）· 条目 ${st.entries} · A ${st.a} / B ${st.b} / C ${st.c} · 争议 ${st.dispute} · 待核实 ${st.todo} · 链接 ${st.links} · 性价比 极高 ${st.rHigh} / 高 ${st.rMid} / 一般 ${st.rLow}`;

if (CHECK) {
  if (stale) { console.error(`统计数字检查未通过：${stale} 处过时。应为：${report}`); process.exit(1); }
  console.log('统计数字检查通过：' + report);
  process.exit(0);
}

console.log('已同步：' + report + (stale ? `（改了 ${stale} 处）` : '（无需改动）'));

/* ---------- 重出 og.png ---------- */
if (!SHOT) process.exit(0);

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
  ];
  return c.find(p => { try { return require('node:fs').statSync(p).isFile(); } catch { return false; } });
}
const chrome = findChrome();
if (!chrome) { console.log('没找到 Chrome，og.png 未重出。设置环境变量 CHROME 指到可执行文件再跑一次。'); process.exit(0); }
const dir = await mkdtemp(path.join(os.tmpdir(), 'og-'));
const out = path.join(ROOT, 'og.png');
try {
  await run(chrome, [
    '--headless=new', `--user-data-dir=${dir}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1200,630', `--screenshot=${out}`, '--default-background-color=00000000',
    'file://' + path.join(ROOT, 'tools/og.html')
  ], { timeout: 60000 });
  const s = await stat(out);
  if (s.size < 20_000 || s.size > 500_000) console.log(`提示：og.png ${s.size} 字节，落在常见区间之外，看一眼版式有没有变。`);
  else console.log(`og.png 已重出（${s.size} 字节）。`);
} catch (err) {
  console.log('og.png 未重出：' + err.message);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}
