#!/usr/bin/env node
// 「说人话」检查：长度、研究行话、抽象说法。
// 读者只看这一行，所以它必须自足：不写样本量、不写分组和研究设计、不带要读者自己翻译的比喻。
//   node tools/check-plain.mjs
import { loadBook } from './lib/book.mjs';

const MAX = 120;
const JARGON = [/\bHR\b/, /\bRR\b/, /\bOR\b/, /\bCI\b/, /\bRCT\b/, /荟萃/, /队列/, /随机/, /样本/, /分组/, /对照组/, /安慰剂/, /意向性/, /meta/i, /95%/];
const VAGUE = [/另一头/, /那一侧/, /产出/, /换了张皮/, /挡箭牌/, /值得注意的是/, /本质上/];

const { sections } = await loadBook();
let bad = 0;
for (const s of sections) {
  for (const e of s.entries) {
    if (!e.human) { console.log(`第 ${e.sec} 节第 ${e.n} 条（${e.title}）：缺「说人话」，检索页上不显示卡片正文`); bad++; continue; }
    const h = e.human;
    const where = `第 ${e.sec} 节第 ${e.n} 条（${e.title}）`;
    if (h.length > MAX) { console.log(`${where}：说人话 ${h.length} 字，超过 ${MAX} 字`); bad++; }
    const sentences = h.split(/[。！？]/).filter(Boolean);
    if (sentences.length < 2 || sentences.length > 4) { console.log(`${where}：说人话 ${sentences.length} 句，应在 2 到 4 句之间`); bad++; }
    for (const re of JARGON) if (re.test(h)) { console.log(`${where}：说人话里出现研究行话 ${re}`); bad++; }
    for (const re of VAGUE) if (re.test(h)) { console.log(`${where}：说人话里出现要读者自己翻译的说法 ${re}`); bad++; }
    // 句子层面的硬标准：一句不超过 50 字
    for (const sent of sentences) if (sent.length > 50) { console.log(`${where}：说人话里有一句 ${sent.length} 字，超过 50 字`); bad++; }
  }
}
console.log(bad ? `说人话检查：${bad} 处不合格。` : '说人话检查通过。');
process.exit(bad ? 1 : 0);
