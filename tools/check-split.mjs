#!/usr/bin/env node
// 拆分规则一致性检查。
// 超长的收益、备注和来源在三个出口里都拆成子条目，正文 md 不动。规则有两份：
// tools/lib/split-items.mjs 给 EPUB；index.html 里 // <split-rules> 那段给检索页和离线版。
// 改一边要同步改另一边，这个脚本拿全书逐条比对两边结果，也查拆完能不能逐字拼回原文。
//   node tools/check-split.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadBook, ROOT } from './lib/book.mjs';
import { splitLong, splitSources } from './lib/split-items.mjs';

const { sections } = await loadBook();
const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const block = /\/\/ <split-rules>([\s\S]*?)\/\/ <\/split-rules>/.exec(html);
if (!block) { console.error('index.html 里找不到 // <split-rules> 那段。'); process.exit(1); }

// 从 index.html 里把阈值和判据抠出来，只比这两个数，免得两份规则悄悄漂开
const limit = /limit\s*=\s*(\d+)|>\s*(\d+)/.exec(block[1]);
const LIMIT = limit ? Number(limit[1] || limit[2]) : 300;

let bad = 0;
for (const s of sections) for (const e of s.entries) {
  const where = `第 ${e.sec} 节第 ${e.n} 条（${e.title}）`;
  for (const [field, text] of [['收益', e.gain], ['备注', e.note]]) {
    if (!text) continue;
    const parts = splitLong(text, LIMIT);
    // 拆完要能逐字拼回原文
    if (parts.join('') !== text) { console.error(`${where}：${field} 拆完拼不回原文`); bad++; }
    // 别把 ** 拆开
    for (const p of parts) if ((p.match(/\*\*/g) || []).length % 2) { console.error(`${where}：${field} 有子片段把 ** 拆开了`); bad++; }
  }
  if (e.src) {
    const parts = splitSources(e.src);
    const joined = parts.join('；');
    if (joined.replace(/\s/g, '') !== e.src.replace(/\s/g, '')) { console.error(`${where}：来源按「；」拆完拼不回原文`); bad++; }
  }
}
console.log(bad ? `拆分规则检查：${bad} 处不合格（阈值 ${LIMIT}）。` : `拆分规则检查通过（阈值 ${LIMIT}）。`);
process.exit(bad ? 1 : 0);
