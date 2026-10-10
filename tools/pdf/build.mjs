#!/usr/bin/env node
// PDF：pandoc 把 Markdown 转成 typst，typst 排版（A4、每节另起一页、页眉带节名、目录带页码）。
// 本地要 pandoc ≥ 3.1 和 typst ≥ 0.13，用环境变量 PANDOC、TYPST 指到可执行文件。
// CI 里按 .github/workflows/book.yml 顶部 env 里钉的版本下载，并装 fonts-noto-cjk 供中文排版。
//   node tools/pdf/build.mjs         产物在 dist/Workplace-Survival-Handbook.pdf
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import { posix } from 'node:path';
import { loadBook, ROOT, docFilesFromReadme } from '../lib/book.mjs';
import { itemLines } from '../lib/split-items.mjs';

const run = promisify(execFile);
const PANDOC = process.env.PANDOC || 'pandoc';
const TYPST = process.env.TYPST || 'typst';

const TITLE = '职场打工创业高性价比大全';
const SUBTITLE = '用最少的钱、时间和精力，换回最多的收入、时间和人身自由';
const REPO = 'https://github.com/tomcatmartion/Workplace-Survival-Handbook';
const SITE = 'https://tomcatmartion.github.io/Workplace-Survival-Handbook/';

// 北京时间，形如 2026-10-11 01:20
const STAMP = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ');
const COMMIT = await run('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).then(r => r.stdout.trim()).catch(() => '');

const { sections, readme } = await loadBook();

/* ---------- 仓库内相对链接改成 GitHub 绝对网址，书外链接才不会在 PDF 里点不动 ---------- */
const rewriteLinks = (md, src) => md.replace(/\]\(([^)\s]+)\)/g, (all, href) => {
  if (/^(https?:|mailto:|#)/.test(href)) return all;
  const [p] = href.split('#');
  const target = posix.normalize(posix.join(posix.dirname(src), p));
  const kind = target.endsWith('/') ? 'tree' : 'blob';
  return `](${REPO}/${kind}/main/${target})`;
});

/* ---------- 先把全书摊成一份 markdown，交给 pandoc ---------- */
const out = [];
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
await writeFile(mdPath, rewriteLinks(out.join('\n').replace(/<!--[\s\S]*?-->/g, ''), 'README.md'), 'utf8');

try {
  await run(PANDOC, ['-f', 'gfm+attributes', '-t', 'typst', '--wrap=none', mdPath, '-o', typPath], { maxBuffer: 64 * 1024 * 1024 });
  let template = await readFile(path.join(ROOT, 'tools/pdf/template.typ'), 'utf8');
  const body = await readFile(typPath, 'utf8');
  template = template
    .replaceAll('$booktitle$', TITLE)
    .replaceAll('$subtitle$', SUBTITLE)
    .replaceAll('$builddate$', STAMP)
    .replaceAll('$commit$', COMMIT.slice(0, 7) || '未知')
    .replaceAll('$site$', SITE)
    .replaceAll('$repo$', REPO)
    .replace('$body$', body);
  const outTyp = path.join(dist, 'book.typ');
  await writeFile(outTyp, template, 'utf8');
  // 必须带 --root 指向仓库根：封面用 /og.png 这种根相对路径
  await run(TYPST, ['compile', outTyp, path.join(dist, 'Workplace-Survival-Handbook.pdf'), '--root', ROOT], { maxBuffer: 64 * 1024 * 1024 });
  console.log('PDF 已生成：dist/Workplace-Survival-Handbook.pdf');
} catch (err) {
  console.error('PDF 生成失败：' + (err.stderr || err.message));
  console.error('需要 pandoc ≥ 3.1 和 typst ≥ 0.13，可用环境变量 PANDOC、TYPST 指到可执行文件。');
  process.exit(1);
} finally {
  await rm(tmp, { recursive: true, force: true }).catch(() => {});
}
