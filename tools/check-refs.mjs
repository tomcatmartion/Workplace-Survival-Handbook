#!/usr/bin/env node
// 交叉引用检查 + 生成 docs/引用对照.md
//
// 正文里的「第 X 条」只记条号不记内容。插入或删除条目会让后面的引用集体顺延，
// 而顺延后的条号通常仍在范围内，光查越界抓不到。所以把每处引用「实际指向的标题」
// 摊开写进对照表并入库：改完条目重新生成，git diff 里凡是条号没动而标题变了的，
// 就是被顺延撞歪的引用。
//
//   node tools/check-refs.mjs           生成对照表（会写文件）
//   node tools/check-refs.mjs --check   只检查，有问题退出码 1
//   node tools/check-refs.mjs --suspect 列出没有锚点/锚点太短的全部位置
//
// 注意：--suspect 一样会重写 docs/引用对照.md，子代理不要跑。
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadBook, ROOT } from './lib/book.mjs';

const ARGV = process.argv.slice(2);
const CHECK = ARGV.includes('--check');
const SUSPECT = ARGV.includes('--suspect');
const DRY = CHECK && !SUSPECT;

/* ---------- 引用识别 ---------- */
// 只认阿拉伯数字条号：「第八十五条」这种中文数字写法一律是法条，不进对照表。
const REF_RE = /第\s*(\d+)\s*节\s*第\s*(\d+)\s*条|第\s*(\d+)\s*条/g;

// 法条过滤：紧挨在「第 N 条」之前的这一小段里出现下列形状，就当法条跳过。
// 判据是「紧挨着有没有引文标记」，不是「前 16 个字里有没有法字」——
// 后者会把「具体办法」「查法」「违法」全连累掉。
function looksLikeStatute(before) {
  const t = before.slice(-24);
  if (/[《][^》]*[》]\s*$/.test(t)) return true;
  if (/[〔][^〕]*[〕]\s*$/.test(t)) return true;
  if (/\d+\s*号\s*$/.test(t)) return true;
  if (/该(解释|意见|规定|办法|通知|决定|细则)\s*$/.test(t)) return true;
  if (/(解释|意见)\s*第?\s*$/.test(t)) return true;
  if (/[\u4e00-\u9fa5]{2,14}(法|条例|规定|办法|解释|意见|通知|决定|细则|大纲|目录|公约|准则)\s*$/.test(t)) return true;
  return false;
}

/* ---------- 锚点 ---------- */
// 整句里连着三个汉字和目标标题对上，或者引用后面紧跟「（锚点词）」且和标题对得上，才算数。
function anchorOk(context, after, title) {
  const explicit = /^[（(]([^）)]{2,20})[）)]/.exec(after || '');
  if (explicit) {
    const a = explicit[1];
    for (let i = 0; i + 2 <= a.length; i++) if (title.includes(a.slice(i, i + 2))) return true;
  }
  for (let i = 0; i + 3 <= title.length; i++) if (context.includes(title.slice(i, i + 3))) return true;
  return false;
}

// 取引用所在的那个句子：按句号切，取含匹配的那一段。
function sentenceOf(text, index) {
  let start = text.lastIndexOf('。', index);
  let end = text.indexOf('。', index);
  start = start < 0 ? 0 : start + 1;
  end = end < 0 ? text.length : end;
  return text.slice(start, end);
}

const { sections } = await loadBook();
const byKey = new Map();
for (const s of sections) for (const e of s.entries) byKey.set(`${e.sec}-${e.n}`, e);

/* ---------- 扫描 ---------- */
const rows = [];
const problems = [];
const suspects = [];

function scan(text, source, secN) {
  if (!text) return;
  REF_RE.lastIndex = 0;
  let m;
  while ((m = REF_RE.exec(text))) {
    const sec = m[1] || secN;
    const no = m[2] || m[3];
    if (!sec) continue;                                    // 长文里没有「本节」，裸的「第 N 条」一律当法条
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (!m[1] && looksLikeStatute(before)) continue;        // 同节的裸条号还要过法条过滤
    const target = byKey.get(`${sec}-${no}`);
    const ctx = sentenceOf(text, m.index);
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 24);
    rows.push({
      出处: source,
      上下文: ctx.trim().slice(0, 40),
      引用: m[0],
      指向: target ? `第 ${target.sec} 节第 ${target.n} 条 ${target.title}` : '（越界：这一条不存在）'
    });
    if (!target) { problems.push(`${source}：${m[0]} 越界（第 ${sec} 节没有第 ${no} 条）`); continue; }
    if (!anchorOk(ctx, after, target.title)) {
      const where = `${source}：${m[0]} → 第 ${target.sec} 节第 ${target.n} 条（${target.title}）`;
      problems.push(`${where} 缺锚点`);
      suspects.push(where + '\n    上下文：' + ctx.trim().slice(0, 80));
    }
  }
}

for (const s of sections) {
  if (s.intro.join('\n')) scan(s.intro.join('\n'), `第 ${s.n} 节 节首引言`, s.n);
  for (const e of s.entries) {
    const where = `第 ${e.sec} 节第 ${e.n} 条（${e.title}）`;
    scan(e.cost, where, e.sec);
    scan(e.gain, where, e.sec);
    scan(e.note, where, e.sec);
    scan(e.human, where, e.sec);
  }
}

// docs/ 下的长文。目录「核实记录」和引用对照表本身不扫。
const { readdir, readFile } = await import('node:fs/promises');
const docs = await readdir(path.join(ROOT, 'docs'), { withFileTypes: true });
for (const d of docs) {
  if (!d.isFile() || !d.name.endsWith('.md') || d.name === '引用对照.md') continue;
  const text = await readFile(path.join(ROOT, 'docs', d.name), 'utf8');
  scan(text, `docs/${d.name}`, '');
}

/* ---------- 输出 ---------- */
const table = [
  '# 交叉引用对照表',
  '',
  '本文件由 `node tools/check-refs.mjs` 生成，不要手改。',
  '',
  '正文里的「第 X 条」只记条号不记内容，插入或删除条目会让后面的引用集体错位，',
  '而错位后的条号往往仍在范围内，光查越界抓不到。所以把每处引用**实际指向的标题**',
  '摊开写在这里并入库：改完条目重新生成，`git diff` 里凡是条号没动而标题变了的，',
  '就是被顺延撞歪的引用。',
  '',
  '扫描范围：`book/` 下每节的条目正文和节首引言，加上 `docs/` 下的长文。长文里没有',
  '「本节」，裸的「第 N 条」一律当法条跳过，所以长文引用要写全「第 X 节第 Y 条」。',
  '「出处」列里，条目写「第 N 条」，节首写「节首」，长文写文件名。',
  '',
  '另一道保险是**锚点**：每处引用的前后文里都得有一个词和目标条目标题对得上',
  '（「医疗救助见第 11 条」里的「医疗救助」，或显式写成「见第 16 条（借条和担保）」）。',
  '`node tools/check-refs.mjs --check` 会把没有锚点的裸条号判为失败——那种引用一旦',
  '被撞歪，对照表的 diff 也看不出异常，只能靠锚点兜住。',
  '',
  `共 ${rows.length} 处引用。`,
  '',
  '| 出处 | 引用处的上下文 | 引用 | 指向的条目 |',
  '| --- | --- | --- | --- |',
  ...rows.map(r => `| ${r.出处} | ${r.上下文.replace(/\|/g, '\\|')} | ${r.引用} | ${r.指向.replace(/\|/g, '\\|')} |`)
].join('\n') + '\n';

if (!DRY) await writeFile(path.join(ROOT, 'docs/引用对照.md'), table, 'utf8');

if (SUSPECT) {
  console.log(suspects.length ? suspects.join('\n') : '没有可疑引用。');
}
if (problems.length) {
  console.error(`交叉引用检查未通过，${problems.length} 处：`);
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`交叉引用检查通过：${rows.length} 处引用，全部带锚点。`);
