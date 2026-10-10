#!/usr/bin/env node
// 离线单文件 HTML：把正文和 docs 长文内联进 index.html 的 window.__CORPUS__，
// 双击就能看、离线可用，微信里也能直接传。零依赖。
//   node tools/offline/build.mjs     产物在 dist/Workplace-Survival-Handbook.html
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, docFilesFromReadme, bookFilesFromReadme } from '../lib/book.mjs';

const readme = await readFile(path.join(ROOT, 'README.md'), 'utf8');
const bookFiles = bookFilesFromReadme(readme);
const docFiles = docFilesFromReadme(readme);

const parts = {};
for (const f of bookFiles) parts[f] = await readFile(path.join(ROOT, f), 'utf8');
const docs = {};
for (const f of docFiles) docs[f] = await readFile(path.join(ROOT, f), 'utf8');

let html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
const payload = JSON.stringify({ readme, parts, docs });
if (!/<script>\s*\/\* ---------- 常量 ----------/.test(html) && !/<script>/.test(html)) throw new Error('index.html 里找不到要注入的位置');

// 注入点：第一个 <script> 之前，这样 EMBED 在 init() 启动时已经就位
html = html.replace('<script>', `<script>window.__CORPUS__=${payload};</script>\n<script>`);

const dist = path.join(ROOT, 'dist');
await mkdir(dist, { recursive: true });
const out = path.join(dist, 'Workplace-Survival-Handbook.html');
await writeFile(out, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
console.log(`离线单文件已生成：dist/Workplace-Survival-Handbook.html（${kb} KB，${bookFiles.length} 个正文文件、${docFiles.length} 篇长文内联）`);
