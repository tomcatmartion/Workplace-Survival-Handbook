// 超长的收益、备注和来源在 EPUB / PDF 里拆成子条目，正文 md 不动。
// 规则有两份：这份给 EPUB、PDF；index.html 里 // <split-rules> 那段给检索页和离线版。
// 改一边要同步改另一边，`node tools/check-split.mjs` 拿全书逐条比对两边结果。

/** 在句号处断开，且下一句开始引用新依据时才拆。 */
const NEW_BASIS = /^(X看《|《[^》]+》|刑法第|民法典第|另一项试验|另一项研究|案例[一二三四五六七八九十]|再一项|同法第|该解释|该意见|国务院 \(|全国人大常委会|人力资源社会保障部|财政部|国家税务总局)/;

export function splitLong(text, limit = 300) {
  const s = String(text || '');
  if (s.length <= limit) return [s];
  const out = [];
  let buf = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    buf += ch;
    // 括号里的句号不算断句点
    if (ch === '。') {
      const rest = s.slice(i + 1);
      if (buf.length > 0 && NEW_BASIS.test(rest.trimStart())) { out.push(buf); buf = ''; }
    }
    i++;
  }
  if (buf) out.push(buf);
  return out;
}

/** 来源栏按括号外的「；」一条一行。 */
export function splitSources(src) {
  const s = String(src || '');
  if (!s) return [];
  const out = [];
  let buf = '', depth = 0;
  for (const ch of s) {
    if (ch === '（' || ch === '(') depth++;
    if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
    if (ch === '；' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

/** 逐条产出要渲染的子行。 */
export function itemLines(e) {
  const lines = [];
  if (e.cost) lines.push(['成本', e.cost, false]);
  if (e.human) lines.push(['说人话', e.human, false]);
  if (e.gain) for (const p of splitLong(e.gain)) lines.push(['收益', p, true]);
  if (e.grade) lines.push(['证据等级', e.grade, false]);
  if (e.src) for (const p of splitSources(e.src)) lines.push(['来源', p, true]);
  if (e.note) for (const p of splitLong(e.note)) lines.push(['备注', p, true]);
  return lines;
}
