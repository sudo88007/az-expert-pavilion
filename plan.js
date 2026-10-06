/* Phase A plan backgrounds: realistic "satellite" look (default) and dark blueprint look.
   Both are generated from the villa coordinates, so everything lines up with the clickable villas.
   Overrides paDrawnPlan from phasea.js (this file loads after it). */
let paStyle = localStorage.getItem('az.planStyle') || 'sat';
let _paCells = null, _paCache = {};
function paClip(poly, a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, nx = b.x - a.x, ny = b.y - a.y, d = p => (p.x - mx) * nx + (p.y - my) * ny, out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], dp = d(p), dq = d(q);
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
  }
  return out;
}
function paCells() {
  if (_paCells) return _paCells; const R = 31;
  return _paCells = PA_VILLAS.map(v => {
    let poly = Array.from({ length: 10 }, (_, k) => ({ x: v.x + R * 1.15 * Math.cos(k * Math.PI / 5), y: v.y + R * .9 * Math.sin(k * Math.PI / 5) }));
    PA_VILLAS.forEach(o => { if (o !== v && Math.hypot(o.x - v.x, o.y - v.y) < 75 && poly.length) poly = paClip(poly, v, o); });
    return poly;
  });
}
const pts = p => p.map(q => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
const shrink = (p, c, k) => p.map(q => ({ x: c.x + (q.x - c.x) * k, y: c.y + (q.y - c.y) * k }));
const ROADS = {
  loop: 'M195 82 C330 148 470 142 590 125 C680 118 705 190 700 262 C690 340 585 365 570 450 C560 520 575 575 545 650',
  edge: 'M190 78 C330 140 480 135 600 118 C690 108 742 150 745 240 C745 330 640 360 610 470 C600 560 600 620 560 660',
  a: 'M180 160 L215 168 C300 155 380 160 412 165 L395 350 C440 390 460 400 485 405',
  b: 'M105 285 C130 250 160 200 180 160 M105 285 L130 540 C240 570 340 620 410 690',
  c: 'M215 300 C240 440 300 470 420 560 L520 660',
  w1: 'M430 160 L370 340 C400 380 440 395 470 410',
  w2: 'M560 215 C585 260 540 320 505 380'
};

function paSatPlan() {
  if (_paCache.sat) return _paCache.sat;
  let seed = 11; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const cells = paCells(), roofs = ['#b4725a', '#c98b6b', '#e6e0d2', '#d8cfbd', '#9a6a56', '#a8a29a'], garden = ['#587a3c', '#6b8e4e', '#7a9a58', '#c2b08a'];
  let plots = '', houses = '', trees = '';
  PA_VILLAS.forEach((v, i) => {
    const c = cells[i]; if (c.length < 3) return;
    const tone = ['#d6c6a0', '#cbb98f', '#d9cba8', '#c9b489'][Math.floor(rnd() * 4)];
    plots += `<polygon points="${pts(c)}" fill="${tone}" stroke="#f1e9d2" stroke-width=".9" stroke-linejoin="round"/>`;
    plots += `<polygon points="${pts(shrink(c, v, .8))}" fill="${garden[Math.floor(rnd() * 4)]}" opacity=".78"/>`;
    const ang = (rnd() * 40 - 20) + (v.x < 200 ? -25 : v.y < 130 ? 5 : 0), w = 13 + rnd() * 4, h = 9 + rnd() * 3, roof = roofs[Math.floor(rnd() * 6)];
    houses += `<g transform="translate(${v.x},${v.y}) rotate(${ang.toFixed(0)})"><rect x="${-w / 2 + 2}" y="${-h / 2 + 2.5}" width="${w}" height="${h}" fill="#000" opacity=".38" filter="url(#sat-blur)"/><rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="1" fill="${roof}" stroke="rgba(0,0,0,.25)" stroke-width=".5"/><rect x="${-w / 2 + 2}" y="${-h / 2 + 2}" width="${w * .45}" height="${h - 4}" fill="rgba(255,255,255,.18)"/>${rnd() > .55 ? `<rect x="${w / 2 + 1.5}" y="${-2}" width="6" height="4" rx="1" fill="#38bdf8" stroke="#e0f2fe" stroke-width=".5"/>` : ''}</g>`;
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.28, d = 9 + rnd() * 9, r = 1.8 + rnd() * 1.8; trees += `<circle cx="${(v.x + Math.cos(a) * d).toFixed(1)}" cy="${(v.y + Math.sin(a) * d * .8).toFixed(1)}" r="${r.toFixed(1)}" fill="#2f5a2a" opacity=".9"/><circle cx="${(v.x + Math.cos(a) * d - .6).toFixed(1)}" cy="${(v.y + Math.sin(a) * d * .8 - .6).toFixed(1)}" r="${(r * .55).toFixed(1)}" fill="#4f8a3f"/>`; }
  });
  const road = (d, wd, col, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
  const asphalt = ['loop', 'a', 'b', 'c'].map(k => road(ROADS[k], 11, '#8d8a80') + road(ROADS[k], 9, '#3d4046')).join('') +
    ['loop', 'a', 'b', 'c'].map(k => road(ROADS[k], .8, '#e8e2c8', 'stroke-dasharray="5 5" opacity=".7"')).join('') +
    road(ROADS.loop, 3, '#5f8a3d', 'opacity=".9" transform="translate(0,0)"').replace('stroke-width="3"', 'stroke-width="2.2"') +
    [ROADS.w1, ROADS.w2].map(d => road(d, 4, '#cfc6b0') + road(d, 2.4, '#e9e2cf')).join('');
  return _paCache.sat = `
  <defs>
    <filter id="sat-blur"><feGaussianBlur stdDeviation="1"/></filter>
    <filter id="sat-sand" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 .55  0 0 0 0 .46  0 0 0 0 .3  0 0 0 .9 0"/></filter>
    <filter id="sat-tone" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .01" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .16  0 0 0 1.1 -.35"/></filter>
    <radialGradient id="sat-vig" cx="50%" cy="48%" r="72%"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a1208" stop-opacity=".6"/></radialGradient>
  </defs>
  <rect width="910" height="719" fill="#c7b58c"/>
  <rect width="910" height="719" filter="url(#sat-tone)" opacity=".8"/>
  <rect width="910" height="719" filter="url(#sat-sand)" opacity=".28"/>
  ${road(ROADS.edge, 3, '#a89870', 'opacity=".8"')}
  ${plots}${asphalt}${houses}${trees}${paAmenities()}
  <rect width="910" height="719" fill="url(#sat-vig)" pointer-events="none"/>
  <text x="16" y="708" font-size="8" fill="rgba(255,255,255,.7)">Simulated aerial view – load your own imagery via “Plan background”</text>`;
}

function paBlueprintPlan() {
  if (_paCache.bp) return _paCache.bp;
  const cells = paCells();
  return _paCache.bp = `
  <defs>
    <radialGradient id="pa-sky" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#16233f"/><stop offset="1" stop-color="#070b14"/></radialGradient>
    <pattern id="pa-grid" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="rgba(148,163,184,.07)" stroke-width="1"/></pattern>
    <filter id="pa-glow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="910" height="719" fill="url(#pa-sky)"/><rect width="910" height="719" fill="url(#pa-grid)"/>
  <g fill="rgba(30,41,59,.55)" stroke="rgba(239,68,68,.75)" stroke-width=".8" stroke-linejoin="round">${cells.map(p => `<polygon points="${pts(p)}"/>`).join('')}</g>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#pa-glow)">
    <path d="${ROADS.edge}" stroke="#fb7185" stroke-width="1.4" opacity=".6"/>
    ${['loop', 'a', 'b', 'c'].map(k => `<path d="${ROADS[k]}" stroke="#22c55e" stroke-width="2.4"/>`).join('')}
    ${['w1', 'w2'].map(k => `<path d="${ROADS[k]}" stroke="#e2e8f0" stroke-width="3" opacity=".55"/>`).join('')}
  </g>
  <text x="455" y="300" text-anchor="middle" font-size="44" font-weight="700" fill="rgba(148,163,184,.10)" letter-spacing="8">PHASE A</text>`;
}
/* Landmarks: clubhouse & sports park, lake, entrance gate, street names, future-phase zone, title plate */
function paAmenities() {
  const palm = (x, y, s = 1) => `<g transform="translate(${x},${y}) scale(${s})"><circle r="4.2" fill="#000" opacity=".28" cx="1.5" cy="2"/><circle r="4" fill="#2f6a2c"/><circle r="2.2" fill="#5aa145"/><circle r=".8" fill="#8bc66a"/></g>`;
  const court = (x, y) => `<g><rect x="${x}" y="${y}" width="34" height="18" fill="#2f6f9a" stroke="#e6f1f7" stroke-width=".7"/><path d="M${x + 17} ${y}V${y + 18}M${x + 4} ${y + 3}H${x + 30}V${y + 15}H${x + 4}Z" fill="none" stroke="#e6f1f7" stroke-width=".5"/></g>`;
  const label = (x, y, t, s = 7) => `<text x="${x}" y="${y}" font-size="${s}" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="2.2" paint-order="stroke" letter-spacing="1" text-anchor="middle">${t}</text>`;
  const road = ['loop|MAIN BOULEVARD|22', 'a|GARDEN ROAD|35', 'b|PARK AVENUE|55', 'c|RIDGE ROAD|38'].map(s => s.split('|'));
  return `
  <defs>${road.map(r => `<path id="rd-${r[0]}" d="${ROADS[r[0]]}"/>`).join('')}
    <radialGradient id="lake" cx="45%" cy="45%" r="65%"><stop offset="0" stop-color="#5fd0d6"/><stop offset=".7" stop-color="#2a8fa6"/><stop offset="1" stop-color="#1d6a82"/></radialGradient>
    <linearGradient id="pool" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7fe5f0"/><stop offset="1" stop-color="#2bb3d1"/></linearGradient></defs>
  <g font-size="6.5" fill="#f3efe0" letter-spacing="2.5" font-weight="600">${road.map(r => `<text dy="2.3"><textPath href="#rd-${r[0]}" startOffset="${r[2]}%">${r[1]}</textPath></text>`).join('')}</g>

  <!-- Clubhouse & sports park -->
  <g><rect x="28" y="598" width="214" height="100" rx="12" fill="#6d9650" stroke="#e8dfc4" stroke-width="1.4"/>
   <rect x="36" y="606" width="198" height="84" rx="8" fill="#5c8a43"/>
   <rect x="93" y="614" width="46" height="30" fill="#000" opacity=".3" filter="url(#sat-blur)" transform="translate(3,3)"/><rect x="93" y="614" width="46" height="30" rx="2" fill="#ece6d8" stroke="#8a8374" stroke-width=".6"/><rect x="98" y="619" width="36" height="20" fill="#c98b6b"/>
   <rect x="42" y="612" width="44" height="24" rx="5" fill="url(#pool)" stroke="#f1ead6" stroke-width="1.4"/><path d="M48 620q6 -4 12 0t12 0t8 0M48 628q6 -4 12 0t12 0t8 0" fill="none" stroke="#fff" stroke-width=".6" opacity=".6"/>
   ${court(150, 612)}${court(150, 636)}
   <rect x="150" y="662" width="34" height="22" fill="#55585e"/><path d="M155 664v18M162 664v18M169 664v18M176 664v18" stroke="#e8e2c8" stroke-width=".5"/>
   ${[[190, 614], [226, 618], [190, 690], [226, 688], [32, 650], [34, 690], [140, 690], [60, 660], [85, 672], [110, 660], [125, 676]].map(p => palm(p[0], p[1])).join('')}
   ${label(135, 705, 'CLUBHOUSE &amp; SPORTS PARK', 6.5)}</g>

  <!-- Lake park -->
  <g><path d="M635 640 C650 592 735 575 800 600 C860 622 872 678 815 700 C750 718 650 705 635 640Z" fill="#cdb98b" stroke="#e9dcb8" stroke-width="1.5"/>
   <path d="M652 640 C664 604 735 594 790 614 C840 632 850 672 806 688 C750 702 662 690 652 640Z" fill="url(#lake)"/>
   <path d="M690 630q14 -6 28 0t28 0t28 0M700 650q14 -6 28 0t28 0t28 0M690 668q14 -6 28 0t28 0" fill="none" stroke="#d8f6f8" stroke-width=".8" opacity=".55"/>
   ${[[640, 612], [650, 585], [880, 650], [820, 592], [700, 705], [770, 712], [865, 685]].map(p => palm(p[0], p[1], 1.2)).join('')}
   ${label(745, 646, 'LAKE PARK', 7)}</g>

  <!-- Future phase -->
  <g><rect x="782" y="290" width="112" height="200" rx="10" fill="rgba(255,255,255,.07)" stroke="#fff" stroke-width="1.2" stroke-dasharray="6 4" opacity=".85"/>${label(838, 392, 'FUTURE PHASE B', 7)}</g>

  <!-- Main entrance -->
  <g><rect x="520" y="664" width="46" height="18" fill="#000" opacity=".3" filter="url(#sat-blur)"/>
   <rect x="522" y="660" width="7" height="12" rx="1" fill="#f3ead2" stroke="#8a7f66" stroke-width=".6"/><rect x="552" y="660" width="7" height="12" rx="1" fill="#f3ead2" stroke="#8a7f66" stroke-width=".6"/><rect x="522" y="658" width="37" height="4" rx="1.5" fill="#d9c796" stroke="#8a7f66" stroke-width=".5"/>
   <rect x="566" y="664" width="12" height="9" rx="1" fill="#ece6d8" stroke="#8a8374" stroke-width=".5"/>
   ${label(541, 696, 'MAIN ENTRANCE', 7)}<path d="M541 686v-8m0 0l-3 4m3 -4l3 4" stroke="#fff" stroke-width="1.2" fill="none"/></g>

  <!-- Title plate -->
  <g><rect x="12" y="10" width="236" height="40" rx="9" fill="rgba(8,12,24,.72)" stroke="rgba(255,255,255,.25)"/><text x="24" y="28" font-size="14" font-weight="700" fill="#fff" letter-spacing="1.5">AZ EXPERT</text><text x="24" y="42" font-size="7.5" fill="#67e8f9" letter-spacing="2.5">PAVILION PROJECT · PHASE A · 174 VILLAS</text></g>`;
}
function paLegend() {
  const L = { status: [['Not started', '#64748b'], ['In progress', '#60a5fa'], ['Completed', '#34d399'], ['On hold', '#a78bfa'], ['No data', '#334155']], risk: [['On track', '#34d399'], ['Some issues', '#fbbf24'], ['High risk', '#fb7185'], ['No data', '#334155']], cost: [['Within budget', '#34d399'], ['Up to 10% over', '#fbbf24'], ['>10% over', '#fb7185'], ['No data', '#334155']], progress: [['0%', 'hsl(0 75% 52%)'], ['50%', 'hsl(65 75% 52%)'], ['100%', 'hsl(130 75% 52%)'], ['No data', '#334155']] }[paMode];
  return L.map(l => `<span><i style="background:${l[1]}"></i>${l[0]}</span>`).join('') + '<span class="muted">● dot = delay / overrun · bar = progress</span>';
}
function paDrawnPlan() { return paStyle === 'sat' ? paSatPlan() : paBlueprintPlan(); }
