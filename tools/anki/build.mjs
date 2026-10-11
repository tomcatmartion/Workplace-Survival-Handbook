#!/usr/bin/env node
// Anki 牌组：一条一张问答卡，按节分子牌组。零依赖，用 Node 自带的 node:sqlite（要 Node ≥ 22.13）。
// 笔记 guid 是「wsh-节号-条号」，牌组和笔记类型 id 写死，所以重新导入时 Anki 更新内容、保留复习记录。
// 删条目让条号整体减一时，老用户的复习记录会错位一条，这是已知代价。
//   node tools/anki/build.mjs     产物在 dist/Workplace-Survival-Handbook.apkg
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadBook, ROOT } from '../lib/book.mjs';
import { zip } from '../lib/zip.mjs';

const DECK_ID = 2026100901;
const MODEL_ID = 2026100902;
const { sections } = await loadBook();
const TITLE = '职场答疑手册--打工创业职场人手一份';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fld = s => esc(s).replace(/\n/g, '<br>');

/* ---------- 建库 ---------- */
const { DatabaseSync } = await import('node:sqlite');
const tmp = path.join(ROOT, 'dist');
await mkdir(tmp, { recursive: true });
const dbPath = path.join(tmp, '_wsh.anki2');
try { (await import('node:fs')).rmSync(dbPath, { force: true }); } catch {}

const db = new DatabaseSync(dbPath);
db.exec(`
CREATE TABLE col (
  id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null,
  conf text not null, models text not null, decks text not null, dconf text not null, tags text not null
);
CREATE TABLE notes (id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld text not null,
  csum integer not null, flags integer not null, data text not null);
CREATE TABLE cards (id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null,
  due integer not null, ivl integer not null, factor integer not null, reps integer not null,
  lapses integer not null, left integer not null, odue integer not null, odid integer not null,
  flags integer not null, data text not null);
CREATE TABLE graves (usn integer not null, oid integer not null, type integer not null);
CREATE TABLE revlog (id integer primary key, cid integer not null, usn integer not null,
  ease integer not null, ivl integer not null, lastIvl integer not null, factor integer not null,
  time integer not null, type integer not null);
CREATE INDEX ix_notes_usn on notes (usn);
CREATE INDEX ix_cards_usn on cards (usn);
CREATE INDEX ix_revlog_usn on revlog (usn);
CREATE INDEX ix_cards_nid on cards (nid);
CREATE INDEX ix_cards_did on cards (did);
`);

const conf = JSON.stringify({
  activeDecks: [DECK_ID], addToCur: true, curDeck: DECK_ID, newSpread: 0,
  collapseTime: 1200, timeLim: 0, estTimes: true, dueCounts: true,
  curModel: MODEL_ID, nextPos: 1, sortType: 'noteFld', sortBackwards: false,
  schedVer: 2, rollover: 4
});
const models = JSON.stringify({
  [MODEL_ID]: {
    id: MODEL_ID, name: '职场打工创业·条目', type: 0, mod: 0,
    usn: -1, sortf: 0, did: DECK_ID,
    tmpls: [{ name: '正面→背面', ord: 0, qfmt: '{{正面}}', afmt: '{{正面}}<hr id=answer>{{背面}}', did: null, bqfmt: '', bafmt: '' }],
    flds: [{ name: '正面', ord: 0, sticky: false, rtl: false, font: 'PingFang SC', size: 18 },
           { name: '背面', ord: 1, sticky: false, rtl: false, font: 'PingFang SC', size: 16 }],
    css: '.card{font-family:"PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.8;text-align:left;color:#1f2328;background:#fff}'
  }
});
const decks = JSON.stringify({
  [DECK_ID]: { id: DECK_ID, name: TITLE, mod: 0, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0],
    conf: 1, desc: '按性价比排序的职场与创业条目，一条一张卡。', dyn: 0, collapsed: false, extendNew: 0, extendRev: 0 }
});
const deckMap = JSON.parse(decks);
for (const s of sections) {
  const id = DECK_ID * 100 + Number(s.n);
  deckMap[id] = { id, name: `${TITLE}::${s.n}. ${s.title}`, mod: 0, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0],
    conf: 1, desc: '', dyn: 0, collapsed: false, extendNew: 0, extendRev: 0 };
}
const dconf = JSON.stringify({ 1: { id: 1, name: '默认', mod: 0, usn: -1, maxTaken: 60, autoplay: true, timer: 0,
  replayq: true, new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 20 },
  rev: { bury: false, ease4: 1.3, ivlFct: 1, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
  lapse: { delays: [10], leechAction: 1, leechFails: 8, minInt: 1, mult: 0 },
  dyn: false, newMix: 0, newPerDayMinimum: 0, interdayLearningMix: 0, reviewOrder: 0, newSortOrder: 0, newGatherPriority: 0, buryInterdayLearning: false } });

const now = Math.floor(Date.now() / 1000);
db.prepare('INSERT INTO col VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run(1, now, now, now, 11, 0, 0, 0, conf, models, JSON.stringify(deckMap), dconf, '{}');

const insNote = db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
const insCard = db.prepare('INSERT INTO cards VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
let nid = 1700000000000, cid = 1700000000000;
let n = 0;
for (const s of sections) {
  const did = DECK_ID * 100 + Number(s.n);
  for (const e of s.entries) {
    const front = `${fld(e.title)}<br><small style="color:#7b838c">第 ${e.sec} 节第 ${e.n} 条 · ${esc(s.title)}</small>`;
    const back = [
      e.human ? `<div style="font-size:17px"><b>说人话：</b>${fld(e.human)}</div>` : '',
      e.cost ? `<div><b>成本：</b>${fld(e.cost)}</div>` : '',
      `<div><b>性价比：</b>${e.ratio}（收益 ${e.level || '?'}，钱 ${e.money || '?'}，时间 ${e.time || '?'}，毅力 ${e.will || '?'}）</div>`,
      `<div><b>证据等级：</b>${e.grade} 级${e.dispute ? ' · 争议' : ''}${e.todo ? ' · 待核实' : ''}</div>`,
      e.gain ? `<div><b>收益：</b>${fld(e.gain)}</div>` : '',
      e.note ? `<div><b>备注：</b>${fld(e.note)}</div>` : '',
      `<div style="color:#7b838c;font-size:13px">在线版：https://tomcatmartion.github.io/Workplace-Survival-Handbook/#e-${e.sec}-${e.n}</div>`
    ].filter(Boolean).join('');
    const tags = [`节${e.sec}`, `证据${e.grade}级`, `性价比${e.ratio}`, `口径${e.lens || '未标'}`];
    if (e.dispute) tags.push('争议');
    if (e.todo) tags.push('待核实');
    const tagStr = ' ' + tags.join(' ') + ' ';
    const flds = [front, back].join('\x1f');
    insNote.run(nid, `wsh-${e.sec}-${e.n}`, MODEL_ID, now, -1, tagStr, flds, e.title, 0, 0, '');
    insCard.run(cid, nid, did, 0, now, -1, 0, 0, n + 1, 0, 0, 0, 0, 0, 0, 0, 0, '');
    nid++; cid++; n++;
  }
}
db.close();

const dbBuf = (await import('node:fs')).readFileSync(dbPath);
const buf = zip([{ name: 'collection.anki2', data: dbBuf }, { name: 'media', data: '{}' }]);
await writeFile(path.join(ROOT, 'dist/Workplace-Survival-Handbook.apkg'), buf);
(await import('node:fs')).rmSync(dbPath, { force: true });
console.log(`Anki 牌组已生成：dist/Workplace-Survival-Handbook.apkg（${n} 张卡，${sections.length} 个子牌组）`);
