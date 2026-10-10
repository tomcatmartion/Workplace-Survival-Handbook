// 全书结构解析。EPUB、离线单文件、Anki 牌组、sync-stats、check-* 全都用这一份，
// 新增节或长文不用改脚本：文件清单从 README 里扒。
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');

/** 性价比的三项成本权重。改这里等于改全书的档位规则，sync-stats 会要求同步。 */
export const COST_W = { money: { '0': 0, 少: 1, 中: 1, 多: 2 }, time: { '0': 0, 少: 0, 中: 1, 多: 2, 无: 0 }, will: { 否: 0, 些: 1, 中: 1, 是: 2 } };

/** 收益量级 + 三项成本 → 性价比档。和 index.html 里的 e.ratio 是同一条规则。 */
export function ratioOf(level, money, time, will) {
  const cs = (COST_W.money[money] ?? 0) + (COST_W.time[time] ?? 0) + (COST_W.will[will] ?? 0);
  if (level === '大') return cs === 0 ? '极高' : cs <= 2 ? '高' : '一般';
  if (level === '中') return cs === 0 ? '高' : '一般';
  return '一般';
}

export async function readRoot(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

/** README 里「长文」那一格的链接，靠这个正则扒。写成 <a href> 就不被认。 */
export function docFilesFromReadme(md) {
  return [...new Set(Array.from(md.matchAll(/\]\((docs\/[^)#/]+\.md)\)/g), m => m[1]))].sort();
}

/** book/ 下的正文文件清单。README 是唯一的事实来源。 */
export function bookFilesFromReadme(md) {
  return [...new Set(Array.from(md.matchAll(/\]\((book\/[^)]+\.md)\)/g), m => m[1]))].sort();
}

/** 解析一个节文件的正文，返回 { n, title, intro, entries }。 */
export function parseSectionFile(text, fallbackN) {
  const lines = text.split(/\r?\n/);
  let n = fallbackN, title = '';
  const intro = [];
  const entries = [];
  let entry = null;
  const flush = () => { if (entry) entries.push(entry); entry = null; };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = /^# (?:(\d+)\. )?(.+)$/.exec(line)) && !title) {
      if (m[1]) n = m[1];
      title = m[2].trim();
      continue;
    }
    if ((m = /^### (?:(\d+)\. )?(.+)$/.exec(line))) {
      flush();
      entry = { sec: n, n: m[1] || String(entries.length + 1), title: m[2].trim(), cost: '', human: '', gain: '', grade: '', src: '', kase: '', note: '', money: '', time: '', will: '', level: '', lens: '' };
      continue;
    }
    if ((m = /^\x3c!--\s*成本标签:\s*(.*?)\s*-->/.exec(line)) && entry) {
      for (const kv of m[1].split(/\s+/)) {
        const p = kv.split('=');
        if (p[0] === '钱') entry.money = p[1];
        if (p[0] === '时间') entry.time = p[1];
        if (p[0] === '毅力') entry.will = p[1];
        if (p[0] === '收益') entry.level = p[1];
        if (p[0] === '口径') entry.lens = p[1];
      }
      continue;
    }
    if (entry) {
      if ((m = /^- 成本：(.*)$/.exec(line))) entry.cost = m[1];
      else if ((m = /^- 说人话：(.*)$/.exec(line))) entry.human = m[1];
      else if ((m = /^- 收益：(.*)$/.exec(line))) entry.gain = m[1];
      else if ((m = /^- 证据等级：\s*([ABC])/.exec(line))) entry.grade = m[1];
      else if ((m = /^- 来源：(.*)$/.exec(line))) entry.src = m[1];
      else if ((m = /^- 案例：(.*)$/.exec(line))) entry.kase = m[1];
      else if ((m = /^- 备注：(.*)$/.exec(line))) entry.note = m[1];
      continue;
    }
    if (line && title) intro.push(line);
  }
  flush();
  for (const e of entries) {
    e.dispute = /^争议/.test(e.note);
    e.todo = /待核实|TODO/.test(e.src + e.gain + e.note + e.cost);
    e.ratio = ratioOf(e.level, e.money, e.time, e.will);
  }
  return { n, title, intro, entries };
}

/** 读全书。返回 { sections, files }。 */
export async function loadBook() {
  const md = await readRoot('README.md');
  const files = bookFilesFromReadme(md);
  const sections = [];
  for (let i = 0; i < files.length; i++) {
    const text = await readRoot(files[i]);
    sections.push({ ...parseSectionFile(text, String(i + 1)), file: files[i] });
  }
  return { sections, files, readme: md };
}

/** 全书统计。README 徽章、index.html 页脚、og.html 三个数字都从这里来。 */
export function statsOf(sections, readmeMd) {
  const entries = sections.flatMap(s => s.entries);
  const count = g => entries.filter(e => e.grade === g).length;
  const ratio = r => entries.filter(e => e.ratio === r).length;
  const links = entries.reduce((a, e) => a + (e.src.match(/https?:\/\//g) || []).length + (e.note.match(/https?:\/\//g) || []).length, 0);
  return {
    sections: sections.length,
    entries: entries.length,
    a: count('A'), b: count('B'), c: count('C'),
    dispute: entries.filter(e => e.dispute).length,
    todo: entries.filter(e => e.todo).length,
    links,
    rHigh: ratio('极高'), rMid: ratio('高'), rLow: ratio('一般'),
    written: sections.filter(s => s.entries.length > 0).length
  };
}
