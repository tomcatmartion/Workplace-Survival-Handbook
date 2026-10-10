#!/usr/bin/env node
// EPUB 生成。只依赖 marked（package.json 里钉了版本），zip 用 tools/lib/zip.mjs 自己打。
//   cd tools/epub && npm ci && npm run build     产物在 ../../dist/
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import { loadBook, ROOT, docFilesFromReadme } from '../lib/book.mjs';
import { itemLines } from '../lib/split-items.mjs';
import { zip } from '../lib/zip.mjs';

const { sections, readme } = await loadBook();
const TITLE = '打工创业职场人手一份的职场答疑手册';
const css = await readFile(path.join(ROOT, 'tools/epub/style.css'), 'utf8');

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const inline = s => marked.parseInline(String(s ?? ''));

/* ---------- 一节一个 xhtml ---------- */
const chapters = [];
for (const s of sections) {
  let h = `<h1>${s.n}. ${esc(s.title)}</h1>\n`;
  if (s.intro.length) h += s.intro.filter(x => !/^>/.test(x)).map(p => `<p>${inline(p)}</p>`).join('\n') + '\n';
  if (!s.entries.length) h += '<p class="empty">这一节还在框架阶段，条目清单已经定好，正文还没逐条写出。</p>\n';
  for (const e of s.entries) {
    h += `<div class="item"><h2>${e.sec}.${e.n} ${esc(e.title)}</h2>\n`;
    const tags = [`性价比 ${e.ratio}`, `收益 ${e.level || '?'}`, `证据 ${e.grade} 级`, `钱 ${e.money || '?'}`, `时间 ${e.time || '?'}`, `毅力 ${e.will || '?'}`];
    if (e.dispute) tags.push('争议');
    if (e.todo) tags.push('待核实');
    h += `<p class="tags">${tags.map(esc).join(' · ')}</p>\n`;
    for (const [label, text] of itemLines(e)) h += `<p><b>${label}：</b>${inline(text)}</p>\n`;
    h += '</div>\n';
  }
  const file = `OEBPS/sec-${String(s.n).padStart(2, '0')}.xhtml`;
  chapters.push({ file, title: `${s.n}. ${s.title}` });
  chapters.at(-1).body = `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">\n<head><title>${esc(s.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n${h}</body>\n</html>\n`;
}

/* ---------- 长文 ---------- */
const docFiles = docFilesFromReadme(readme);
for (const f of docFiles) {
  const md = await readFile(path.join(ROOT, f), 'utf8');
  const body = `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">\n<head><title>${esc(f)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n<body>\n${marked.parse(md)}</body>\n</html>\n`;
  chapters.push({ file: 'OEBPS/' + path.basename(f, '.md') + '.xhtml', title: path.basename(f, '.md'), body });
}

/* ---------- 打包 ---------- */
const files = [{ name: 'mimetype', data: 'application/epub+zip', store: true }];
const container = `<?xml version="1.0" encoding="UTF-8"?>\n<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`;
files.push({ name: 'META-INF/container.xml', data: container });
files.push({ name: 'OEBPS/style.css', data: css });
for (const c of chapters) files.push({ name: c.file, data: c.body });

const manifest = chapters.map((c, i) => `<item id="c${i}" href="${path.basename(c.file)}" media-type="application/xhtml+xml"/>`).join('\n  ');
const spine = chapters.map((c, i) => `<itemref idref="c${i}"/>`).join('\n  ');
const nav = chapters.map(c => `<li><a href="${path.basename(c.file)}">${esc(c.title)}</a></li>`).join('\n  ');
const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" xml:lang="zh-CN" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:workplace-survival-handbook</dc:identifier>
    <dc:title>${esc(TITLE)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>打工创业职场人手一份的职场答疑手册</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
  </metadata>
  <manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="css" href="style.css" media-type="text/css"/>
  ${manifest}
  </manifest>
  <spine>
  ${spine}
  </spine>
</package>
`;
files.push({ name: 'OEBPS/content.opf', data: opf });
files.push({ name: 'OEBPS/nav.xhtml', data: `<?xml version="1.0" encoding="utf-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" xmlns:epub="http://www.idpf.org/2007/ops">\n<head><title>目录</title></head>\n<body><nav epub:type="toc"><h1>目录</h1><ol>\n  ${nav}\n</ol></nav></body>\n</html>\n` });

const dist = path.join(ROOT, 'dist');
await mkdir(dist, { recursive: true });
const buf = zip(files);
await writeFile(path.join(dist, 'Workplace-Survival-Handbook.epub'), buf);
console.log(`EPUB 已生成：dist/Workplace-Survival-Handbook.epub（${(buf.length / 1024).toFixed(0)} KB，${chapters.length} 章）`);
