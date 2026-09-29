// Hand-rolled SVG charts: a single-series line/area chart with crosshair and
// a stacked column chart with per-column hover. Both size to their container,
// redraw on resize, support keyboard exploration, and build tooltips with
// textContent. Pair every chart with a table view elsewhere on the page.
import { dnum, diso, fmtDate, moneyCompact } from '../core/util.js';
import { esc } from './html.js';

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(max / step - 1e-9) * step;
  const out = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

function tipOf(container) {
  let t = container.querySelector(':scope > .chart-tip');
  if (!t) {
    t = document.createElement('div');
    t.className = 'chart-tip';
    t.setAttribute('aria-hidden', 'true');
    container.appendChild(t);
  }
  return t;
}
function setTip(tip, title, rows) {
  tip.replaceChildren();
  const h = document.createElement('div');
  h.className = 'tip-title';
  h.textContent = title;
  tip.appendChild(h);
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = 'tip-row';
    if (r.color) {
      const k = document.createElement('span');
      k.className = `tip-key ${r.shape || 'line'}`;
      k.style.background = r.color;
      row.appendChild(k);
    }
    const v = document.createElement('strong');
    v.textContent = r.value;
    row.appendChild(v);
    const l = document.createElement('span');
    l.className = 'tip-label';
    l.textContent = r.label;
    row.appendChild(l);
    tip.appendChild(row);
  }
}
function placeTip(container, tip, x, y) {
  tip.style.display = 'block';
  const cw = container.clientWidth;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  let left = x + 14;
  if (left + tw > cw) left = x - tw - 14;
  if (left < 0) left = Math.max(0, Math.min(cw - tw, x - tw / 2));
  let top = y - th - 12;
  if (top < 0) top = y + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}
const hideTip = (tip) => { tip.style.display = 'none'; };

function observe(el, draw) {
  let w = el.clientWidth;
  draw();
  if (typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - w) > 2) { w = el.clientWidth; draw(); }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

function timeTicks(x0, x1, W) {
  const span = x1 - x0;
  const out = [];
  const a = diso(x0), b = diso(x1);
  const y0 = +a.slice(0, 4), y1 = +b.slice(0, 4);
  if (span > 540) {
    const years = y1 - y0 + 1;
    const maxLabels = Math.max(2, Math.floor(W / 70));
    const every = Math.max(1, Math.ceil(years / maxLabels));
    for (let y = y0 + 1; y <= y1; y++) if ((y - y0) % every === 0) out.push({ d: dnum(`${y}-01-01`), label: String(y) });
  } else {
    const maxLabels = Math.max(2, Math.floor(W / 64));
    const months = Math.round(span / 30.4);
    const every = Math.max(1, Math.ceil(months / maxLabels));
    let y = y0, m = +a.slice(5, 7) + 1;
    if (m > 12) { m = 1; y++; }
    for (let i = 0; ; i++) {
      const iso = `${y}-${String(m).padStart(2, '0')}-01`;
      const d = dnum(iso);
      if (d > x1) break;
      if (i % every === 0) out.push({ d, label: fmtDate(iso, m === 1 ? 'monthShort' : 'short').replace(/ 1$/, '') });
      m++;
      if (m > 12) { m = 1; y++; }
    }
  }
  return out;
}

// points: [{x:'YYYY-MM-DD', y:number, ...}] sorted by x.
// splitAt: ISO date; points after it render as a dashed "projected" line.
export function lineChart(el, { points, height = 240, yFormat = moneyCompact, label = 'Line chart', color = 'var(--series-1)', splitAt = null, markers = [], tip }) {
  if (!points.length) { el.innerHTML = ''; return () => {}; }
  let idx = -1;
  const draw = () => {
    const W = Math.max(260, el.clientWidth);
    const H = height;
    const m = { l: 58, r: 18, t: 16, b: 30 };
    const xs = points.map((p) => dnum(p.x));
    const x0 = xs[0], x1 = xs[xs.length - 1];
    const ymax = Math.max(1, ...points.map((p) => p.y));
    const ticks = niceTicks(ymax, 4);
    const ytop = ticks[ticks.length - 1];
    const X = (d) => m.l + (x1 === x0 ? 0 : ((d - x0) / (x1 - x0)) * (W - m.l - m.r));
    const Y = (v) => m.t + (1 - v / ytop) * (H - m.t - m.b);
    const P = points.map((p, i) => [X(xs[i]), Y(p.y)]);
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
    for (const v of ticks) {
      const y = Y(v).toFixed(1);
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis-label" x="${m.l - 10}" y="${+y + 4}" text-anchor="end">${esc(yFormat(v))}</text>`;
    }
    s += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    for (const t of timeTicks(x0, x1, W)) {
      const x = X(t.d);
      if (x < m.l + 8 || x > W - m.r - 8) continue;
      s += `<text class="axis-label" x="${x.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(t.label)}</text>`;
    }
    const split = splitAt ? points.findIndex((p) => p.x > splitAt) : -1;
    const seg = (a, b) => P.slice(a, b).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
    const area = `M${P[0][0].toFixed(1)} ${Y(0)}${P.map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join('')}L${P[P.length - 1][0].toFixed(1)} ${Y(0)}Z`;
    s += `<path d="${area}" fill="${color}" opacity=".1"/>`;
    if (split > 0) {
      s += `<path d="${seg(0, split)}" class="line" stroke="${color}"/>`;
      s += `<path d="${seg(split - 1, P.length)}" class="line projected" stroke="${color}"/>`;
    } else if (split === 0) {
      s += `<path d="${seg(0, P.length)}" class="line projected" stroke="${color}"/>`;
    } else {
      s += `<path d="${seg(0, P.length)}" class="line" stroke="${color}"/>`;
    }
    for (const mk of markers) {
      const d = dnum(mk.x);
      if (d < x0 || d > x1) continue;
      const x = X(d).toFixed(1);
      if (mk.kind === 'rule') {
        s += `<line class="rule" x1="${x}" x2="${x}" y1="${m.t}" y2="${Y(0)}"/><text class="rule-label" x="${+x + 5}" y="${m.t + 10}">${esc(mk.label)}</text>`;
      } else {
        const y = Y(mk.y).toFixed(1);
        const anchor = +x > W - 120 ? 'end' : 'start';
        const dx = anchor === 'end' ? -10 : 10;
        s += `<circle cx="${x}" cy="${y}" r="5" fill="${color}" stroke="var(--surface)" stroke-width="2"/><text class="mark-label" x="${+x + dx}" y="${+y - 10}" text-anchor="${anchor}">${esc(mk.label)}</text>`;
      }
    }
    s += `<line class="xhair" x1="0" x2="0" y1="${m.t}" y2="${Y(0)}" style="display:none"/><circle class="hover-dot" r="5" fill="${color}" stroke="var(--surface)" stroke-width="2" style="display:none"/>`;
    s += `<rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>`;
    s += '</svg>';
    el.innerHTML = s;
    const svg = el.querySelector('svg');
    const xh = svg.querySelector('.xhair'), dot = svg.querySelector('.hover-dot');
    const tipEl = tipOf(el);
    const show = (i) => {
      idx = Math.max(0, Math.min(points.length - 1, i));
      const [x, y] = P[idx];
      xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.style.display = '';
      dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.style.display = '';
      const t = tip ? tip(points[idx]) : { title: fmtDate(points[idx].x), rows: [{ label, value: yFormat(points[idx].y), color }] };
      setTip(tipEl, t.title, t.rows);
      placeTip(el, tipEl, x, y);
    };
    const hide = () => { xh.style.display = 'none'; dot.style.display = 'none'; hideTip(tipEl); };
    const nearest = (px) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < P.length; i++) { const d = Math.abs(P[i][0] - px); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect();
      show(nearest(e.clientX - r.left));
    });
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== el) hide(); });
    el.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.shiftKey ? 12 : 1;
        show((idx < 0 ? 0 : idx) + (e.key === 'ArrowRight' ? step : -step));
      } else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(points.length - 1); }
      else if (e.key === 'Escape') hide();
    };
    el.onfocus = () => show(idx < 0 ? (splitAt ? Math.max(0, points.findIndex((p) => p.x > splitAt) - 1) : 0) : idx);
    el.onblur = hide;
  };
  el.tabIndex = 0;
  el.classList.add('chart');
  el.setAttribute('aria-label', `${label}. Use arrow keys to explore values.`);
  el.setAttribute('role', 'group');
  return observe(el, draw);
}

// categories: [{label, title}] ; series: [{name, color, values:[]}]
export function stackedColumns(el, { categories, series, height = 240, yFormat = moneyCompact, label = 'Column chart', totalLabel = 'Total', highlight = [] }) {
  if (!categories.length) { el.innerHTML = ''; return () => {}; }
  let idx = -1;
  const draw = () => {
    const W = Math.max(260, el.clientWidth);
    const H = height;
    const m = { l: 58, r: 12, t: 12, b: 30 };
    const totals = categories.map((_, i) => series.reduce((s, se) => s + Math.max(0, se.values[i] || 0), 0));
    const ticks = niceTicks(Math.max(1, ...totals), 4);
    const ytop = ticks[ticks.length - 1];
    const Y = (v) => m.t + (1 - v / ytop) * (H - m.t - m.b);
    const band = (W - m.l - m.r) / categories.length;
    const bw = Math.max(4, Math.min(24, band * 0.62));
    const gap = 2;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">`;
    for (const v of ticks) {
      const y = Y(v).toFixed(1);
      s += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y}" y2="${y}"/><text class="axis-label" x="${m.l - 10}" y="${+y + 4}" text-anchor="end">${esc(yFormat(v))}</text>`;
    }
    const every = Math.max(1, Math.ceil(categories.length / Math.max(2, Math.floor((W - m.l) / 46))));
    categories.forEach((c, i) => {
      const cx = m.l + band * i + band / 2;
      const x = cx - bw / 2;
      let acc = 0;
      const segs = series.map((se) => Math.max(0, se.values[i] || 0));
      const topIdx = segs.reduce((t, v, k) => (v > 0 ? k : t), -1);
      segs.forEach((v, k) => {
        if (v <= 0) return;
        const yTop = Y(acc + v), yBot = Y(acc);
        let h = yBot - yTop;
        const isTop = k === topIdx;
        if (!isTop) h = Math.max(0.5, h - gap);
        const yy = yBot - h;
        const color = series[k].color;
        if (isTop && h > 4) {
          const r = Math.min(4, bw / 2, h);
          s += `<path class="bar" data-i="${i}" fill="${color}" d="M${x.toFixed(1)} ${yBot.toFixed(1)}V${(yy + r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${-r}h${(bw - 2 * r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}V${yBot.toFixed(1)}Z"/>`;
        } else {
          s += `<rect class="bar" data-i="${i}" fill="${color}" x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, h).toFixed(1)}"/>`;
        }
        acc += v;
      });
      if (highlight.includes(i)) {
        s += `<text class="mark-label" x="${cx.toFixed(1)}" y="${(Y(totals[i]) - 6).toFixed(1)}" text-anchor="middle">${esc(yFormat(totals[i]))}</text>`;
      }
      if (i % every === 0) s += `<text class="axis-label" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(c.label)}</text>`;
      s += `<rect class="hit" data-i="${i}" x="${(m.l + band * i).toFixed(1)}" y="${m.t}" width="${band.toFixed(1)}" height="${H - m.t - m.b}" fill="transparent"/>`;
    });
    s += `<line class="baseline" x1="${m.l}" x2="${W - m.r}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    s += '</svg>';
    el.innerHTML = s;
    const svg = el.querySelector('svg');
    const tipEl = tipOf(el);
    const show = (i) => {
      idx = Math.max(0, Math.min(categories.length - 1, i));
      svg.querySelectorAll('.bar').forEach((b) => b.classList.toggle('dim', +b.dataset.i !== idx));
      const rows = series.map((se) => ({ label: se.name, value: yFormat(se.values[idx] || 0, true), color: se.color, shape: 'box' }));
      if (series.length > 1) rows.push({ label: totalLabel, value: yFormat(totals[idx], true) });
      setTip(tipEl, categories[idx].title || categories[idx].label, rows);
      placeTip(el, tipEl, m.l + band * idx + band / 2, Y(totals[idx]));
    };
    const hide = () => { svg.querySelectorAll('.bar.dim').forEach((b) => b.classList.remove('dim')); hideTip(tipEl); };
    svg.addEventListener('pointermove', (e) => {
      const t = e.target.closest('[data-i]');
      if (t) show(+t.dataset.i);
    });
    svg.addEventListener('pointerleave', () => { if (document.activeElement !== el) hide(); });
    el.onkeydown = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show((idx < 0 ? 0 : idx) + (e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(categories.length - 1); }
      else if (e.key === 'Escape') hide();
    };
    el.onfocus = () => show(idx < 0 ? 0 : idx);
    el.onblur = hide;
  };
  el.tabIndex = 0;
  el.classList.add('chart');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `${label}. Use arrow keys to explore values.`);
  return observe(el, draw);
}

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span class="legend-item"><span class="legend-key ${i.shape || 'box'}" style="--c:${i.color}"></span>${esc(i.label)}</span>`).join('')}</div>`;
}
