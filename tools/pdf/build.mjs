#!/usr/bin/env node
// PDF：pandoc 转 typst，typst 排版（A4、每节另起一页、页眉带节名、目录带页码、书签到条目级）。
// 本地要 pandoc ≥ 3.1 和 typst ≥ 0.13，用环境变量 PANDOC、TYPST 指到可执行文件。
// CI 里按 .github/workflows/book.yml 顶部 env 里钉的版本下载。
//   node tools/pdf/build.mjs         产物在 dist/Workplace-Survival-Handbook.pdf
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { loadBook, ROOT, docFilesFromReadme } from '../lib/book.mjs';
import { itemLines } from '../lib/split-items.mjs';

const run = promisify(execFile);
const PANDOC = process.env.PANDOC || 'pandoc';
const TYPST = process.env.TYPST || 'typst';

const { sections, readme } = await loadBook();
const TITLE = '职场打工创业高性价比大全';

/* ---------- 先把全书摊成一份 markdown，交给 pandoc ---------- */
const out = [`---\ntitle: ${TITLE}\n---\n`];
for (const s of sections) {
  out.push(`# ${s.n}. ${s.title}\n`);
  for (const p of s.intro) if (!/^>/.test(p)) out.push(p + '\n');
  if (!s.entries.length) out.push('\n> 这一节还在框架阶段，条目清单已经定好，正文还没逐条写出。\n');
  for (const e of s.entries) {
    out.push(`## ${e.sec}.${e.n} ${e.title}\n`);
    const tags = [`性价比 ${e.ratio}`, `收益 ${e.level || '?'}`, `证据 ${e.grade} 级`, `钱 ${e.money || '?'}`, `时间 ${e.time || '?'}`, `毅力 ${e.will || '?'}`];
    if (e.dispute) tags.push('争议');
    if (e.todo) tags.push('待核实');
    out.push(`_${tags.join(' · ')}_\n`);
    for (const [label, text] of itemLines(e)) out.push(`**${label}：** ${text}\n`);
  }
}
for (const f of docFilesFromReadme(readme)) {
  const md = await readFile(path.join(ROOT, f), 'utf8');
  out.push(`# ${path.basename(f, '.md')}\n\n${md}\n`);
}

const dist = path.join(ROOT, 'dist');
await mkdir(dist, { recursive: true });
const tmp = await mkdtemp(path.join(os.tmpdir(), 'wsh-pdf-'));
const mdPath = path.join(tmp, 'book.md');
const typPath = path.join(tmp, 'book.typ');
await writeFile(mdPath, out.join('\n'), 'utf8');

try {
  await run(PANDOC, ['-f', 'markdown', '-t', 'typst', '--wrap=none', mdPath, '-o', typPath], { maxBuffer: 64 * 1024 * 1024 });
  const template = await readFile(path.join(ROOT, 'tools/pdf/template.typ'), 'utf8');
  await writeFile(typPath, template.replace('$BODY$', await readFile(typPath, 'utf8')), 'utf8');
  await run(TYPST, ['compile', '--font-path', '/System/Library/Fonts', typPath, path.join(dist, 'Workplace-Survival-Handbook.pdf')], { maxBuffer: 64 * 1024 * 1024 });
  console.log('PDF 已生成：dist/Workplace-Survival-Handbook.pdf');
} catch (err) {
  console.error('PDF 生成失败：' + err.message);
  console.error('需要 pandoc ≥ 3.1 和 typst ≥ 0.13，可用环境变量 PANDOC、TYPST 指到可执行文件。');
  process.exit(1);
} finally {
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
