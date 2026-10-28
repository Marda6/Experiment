// Симуляция — вид Simulation первой панели, перенос из ENCY UI (packages/project, вкладка Simulate).
// Дерево кода: станок → установы → операции → постпроцессорный код (Header, Approach и уровни — группы).
// Строки окрашены по движению: холостой ход, подвод, врезание и отвод, рабочая подача.
// Два режима управления, как в ENCY: компактный — кнопки над деревом (по умолчанию) и широкий — панель
// внизу сцены с таймлайном; она прячется под край, как полоса функций сверху, скрепка закрепляет.
// Ошибки — столкновения держателя: ромб на строке, на операции и выше, метки на таймлайне, переходы ← →,
// счётчик со списком, остановка на столкновении. Двойной клик по строке кода (или клик по её точке) —
// окно NC-блока. Код, длительности и столкновения — примерные, детерминированные, как в ENCY UI.
// tree, nameOf (tree.js), statusIcon (status-icons.js), INSPECTOR_ICONS, PIN_ICON,
// workspace, LAYERS_INSET — из других скриптов

const SIM_BASE_RATE = 120; // секунд программы за секунду при скорости 100%
const SIM_SPEED_MAX = 200; // ползунок — до двойной скорости
const SIM_ZOOM_CAP = 25; // сцену приблизили — скорость не выше 25%, своя вернётся после отдаления
const SIM_DETENTS = [25, 50, 75, 100, 150, 200];
const SIM_COMPACT_KEY = 'prototype-sim-compact';
const SIM_PIN_KEY = 'prototype-simbar-pinned';

const simEl = document.getElementById('sim');
const simDockEl = document.getElementById('sim-dock');
const simHeadActionsEl = document.getElementById('sim-head-actions');
const simTreeEl = document.getElementById('sim-tree');
const simSearchEl = simEl.querySelector('.sim-search');
const simBarEl = document.getElementById('simbar');
const ncPanelEl = document.getElementById('ncpanel');
const simFiltersEl = document.getElementById('filters');

/* ---------- Иконки ENCY UI (перекрашены: currentColor, акцент и цвета статусов темы) ---------- */

const SIM_DIAMOND = (cx, cy) => `<rect x="${cx - 2.8}" y="${cy - 2.8}" width="5.6" height="5.6" rx="1.2" transform="rotate(45 ${cx} ${cy})" fill="currentColor"/><circle cx="${cx}" cy="${cy}" r="1.1" fill="var(--sim-hole)"/>`;
const SIM_ICONS = {
  stopX: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4v8L1.9 8z"/><path d="M14.6 4v8L8.5 8z"/></svg>',
  fwd: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.4 4v8L7.5 8z"/><path d="M8 4v8l6.1-4z"/></svg>',
  play: '<svg class="sim-play__play" viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8l8.5 5.2-8.5 5.2z"/></svg><svg class="sim-play__pause" viewBox="0 0 16 16" fill="currentColor"><rect x="3.6" y="3" width="3.2" height="10" rx="1"/><rect x="9.2" y="3" width="3.2" height="10" rx="1"/></svg>',
  reset: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 6.6A5.2 5.2 0 1 1 2.8 9.4"/><path d="M3 3.4v3.4h3.4"/></svg>',
  toStart: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="4" width="1.8" height="8" rx="0.9"/><path d="M13 4v8l-6.4-4z"/></svg>',
  stepBack: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9.8 3.5L5.3 8l4.5 4.5"/></svg>',
  stepFwd: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.2 3.5L10.7 8l-4.5 4.5"/></svg>',
  toNext: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 4v8l6.4-4z"/><rect x="11.2" y="4" width="1.8" height="8" rx="0.9"/></svg>',
  collLeft: `<svg viewBox="0 0 16 16"><path d="M6.2 3.5L1.7 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>${SIM_DIAMOND(11, 8)}</svg>`,
  collRight: `<svg viewBox="0 0 16 16">${SIM_DIAMOND(5, 8)}<path d="M9.8 3.5L14.3 8l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  collUp: `<svg viewBox="0 0 16 16"><path d="M4.6 5.6L8 2.2l3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>${SIM_DIAMOND(8, 11)}</svg>`,
  collDown: `<svg viewBox="0 0 16 16">${SIM_DIAMOND(8, 5)}<path d="M4.6 10.4L8 13.8l3.4-3.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 4.8v4M8 11.2v.01"/></svg>',
  triangle: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.6l6 10.8H2z"/><path d="M8 7v3M8 11.6v.01"/></svg>',
  stops: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="4.6" y="2.6" width="6.8" height="6.8" rx="1" transform="rotate(45 8 6)"/><path d="M8 12.4v1.4"/></svg>',
  gear: '<svg viewBox="0 0 16 16"><path fill-rule="evenodd" fill="currentColor" d="M6.70 2.76L6.79 0.70L9.21 0.70L9.30 2.76L10.79 3.37L12.30 1.98L14.02 3.70L12.63 5.21L13.24 6.70L15.30 6.79L15.30 9.21L13.24 9.30L12.63 10.79L14.02 12.30L12.30 14.02L10.79 12.63L9.30 13.24L9.21 15.30L6.79 15.30L6.70 13.24L5.21 12.63L3.70 14.02L1.98 12.30L3.37 10.79L2.76 9.30L0.70 9.21L0.70 6.79L2.76 6.70L3.37 5.21L1.98 3.70L3.70 1.98L5.21 3.37Z M10.60 8A2.6 2.6 0 1 0 5.40 8A2.6 2.6 0 1 0 10.60 8Z"/></svg>',
  chev: '<svg viewBox="0 0 8 5" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l3 3 3-3"/></svg>',
  edit: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.6 2.9l2.5 2.5-7.6 7.6H3v-2.5z"/><path d="M9.2 4.3l2.5 2.5"/></svg>',
  close: '<svg viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.25" stroke-linecap="round"/></svg>',
  expand: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 5.2L8 1.8l3.4 3.4"/><path d="M4.6 10.8L8 14.2l3.4-3.4"/></svg>',
  collapse: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 2.4L8 5.8l3.4-3.4"/><path d="M4.6 13.6L8 10.2l3.4 3.4"/></svg>',
  // охват: выбранная операция / от начала до выбранной / все (scope-current / tocur / all)
  scopeCurrent: '<svg viewBox="0 0 28 28" fill="none"><path class="sim-scope__on" d="M8.84 10.74 4.72 8.08C4.43 7.9 4 8.05 4 8.34v5.32c0 .29.43.44.72.26l4.12-2.66c.21-.14.21-.38 0-.52Z"/><path class="sim-scope__on-line" d="M6 6h18M11 11h13"/><path class="sim-scope__off-line" d="M6 21h18M6 16h18"/></svg>',
  scopeToCurrent: '<svg viewBox="0 0 28 28" fill="none"><path class="sim-scope__on" d="M8.84 15.74 4.72 13.08C4.43 12.9 4 13.05 4 13.34v5.32c0 .29.43.44.72.26l4.12-2.66c.21-.14.21-.38 0-.52Z"/><path class="sim-scope__on-line" d="M6 6h18M6 11h18"/><path class="sim-scope__off-line" d="M6 21h18M11 16h13"/></svg>',
  scopeAll: '<svg viewBox="0 0 28 28" fill="none"><path class="sim-scope__on" d="M7.26 21.87 9.92 18.57C10.1 18.35 9.95 18 9.66 18H4.34c-.29 0-.44.35-.26.57l2.66 3.3c.14.17.38.17.52 0Z"/><path class="sim-scope__on-line" d="M7 5v13M11 6h13M11 21h13M11 11h13M11 16h13"/></svg>',
  // Info в окне блока
  time: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2.2 1.3" stroke-linecap="round"/></svg>',
  feed: '<svg viewBox="0 0 16 16"><path d="M2.5 5.5h8M2.5 10.5h8" stroke="var(--accent)" stroke-width="1.5" stroke-linecap="round"/><circle cx="13" cy="5.5" r="1.2" fill="var(--accent)"/><circle cx="13" cy="10.5" r="1.2" fill="var(--accent)"/></svg>',
  length: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M3 13l1-3.5L10.5 3a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2L6.5 12 3 13z"/><path d="M9.5 4.5l2 2" stroke-linecap="round"/></svg>',
  blocks: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="2.5" y="2.5" width="4" height="4" rx="1" fill-opacity="0.8"/><rect x="9.5" y="2.5" width="4" height="4" rx="1" fill-opacity="0.45"/><rect x="2.5" y="9.5" width="4" height="4" rx="1" fill-opacity="0.45"/><rect x="9.5" y="9.5" width="4" height="4" rx="1" fill-opacity="0.8"/></svg>',
  // условия остановки (st-gouge / st-optstop / st-stop)
  gouge: '<svg viewBox="0 0 28 28" fill="none"><path d="M14.5 20.5h-7a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1H12" stroke="currentColor"/><rect x="13" y="6" width="8" height="8" rx="1" fill="var(--status-error)"/><circle cx="20.5" cy="19.5" r="4.5" fill="var(--status-warn)"/><rect x="20" y="17" width="1" height="3" fill="var(--sim-hole)"/><rect x="20" y="21" width="1" height="1" fill="var(--sim-hole)"/></svg>',
  optStop: '<svg viewBox="0 0 28 28" fill="none"><path d="M7 18V8l4 4 4-4v10M18 11l3-3v7" stroke="currentColor" stroke-linejoin="round"/><rect x="14.5" y="14.5" width="10" height="10" rx="5" fill="var(--status-error)" stroke="var(--sim-hole)"/><path fill-rule="evenodd" d="M18 21v-3h1v3h-1Zm2 0v-3h1v3h-1Z" fill="var(--sim-hole)"/></svg>',
  stopCmd: '<svg viewBox="0 0 28 28" fill="currentColor"><rect x="6" y="7" width="2" height="2" rx="1"/><rect x="6" y="11" width="2" height="2" rx="1"/><rect x="6" y="15" width="2" height="2" rx="1"/><rect x="6" y="19" width="2" height="2" rx="1"/><rect x="10" y="7" width="12" height="2"/><rect x="10" y="11" width="12" height="2"/><rect x="10" y="15" width="12" height="2"/><rect x="10" y="19" width="5" height="2"/><rect x="14.5" y="14.5" width="10" height="10" rx="5" fill="var(--status-error)" stroke="var(--sim-hole)"/><path fill-rule="evenodd" d="M18 21v-3h1v3h-1Zm2 0v-3h1v3h-1Z" fill="var(--sim-hole)"/></svg>',
  check: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l2.3 2.3L9.5 3.5"/></svg>',
};

const simEsc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function simFmt(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/* ---------- Данные: операции из дерева, их код, длительности, столкновения ---------- */

// Детерминированные «случайные» числа — как в ENCY UI, без генератора
const simNum = (seed, k, a, b) => a + (b - a) * (Math.sin(seed * 0.7 + k * 1.3) * 0.5 + 0.5);
const simFix = (value) => value.toFixed(3);

// Код операции: PPFUN, Header и Approach, три уровня обработки (группы), PPFUN.
// m — движение (rapid / approach / feed — врезание и отвод / work), head — строка-заголовок движения (жирная)
function simCode(name, toolNo, seed) {
  const x = (k) => simFix(simNum(seed, k, -40, 260));
  const y = (k) => simFix(simNum(seed, k + 50, -10, 220));
  const top = 60 + (seed % 7) + 0.283;
  const levels = [0, 5, 10].map((step) => top - step);
  return [
    { t: `PPFUN: 58, 250, ${x(1)}, ${y(2)}, 25, 756.2…` },
    { group: 'Header', items: [
      { t: `COMMENT: "${name}"` },
      { t: `LOADTL: #${toolNo} (0), H#-${toolNo}, D#${toolNo}` },
      { t: `SPINDL: On, ${160 + toolNo * 20} rpm` },
    ] },
    { group: 'Approach', items: [
      { t: 'PPRINT: "#Approach:[Approach by default]"' },
      { t: 'RAPID: 10000', m: 'rapid', head: true },
      { t: `MultiGOTO: Y${y(3)}, X${x(4)}`, m: 'rapid' },
      { t: `MultiGOTO: Z${simFix(top + 17)}`, m: 'rapid' },
    ] },
    ...levels.map((z, k) => ({ group: `Level: ${simFix(z)}`, items: [
      { t: 'RAPID: 10000', m: 'rapid', head: true },
      { t: `X${x(10 + k)}, Y${y(10 + k)}, Z${simFix(z + 17)}`, m: 'rapid' },
      { t: `X${x(10 + k)}, Y${y(10 + k)}, Z${simFix(z + 1)}`, m: 'rapid' },
      { t: 'COOLNT: On, #1' },
      { t: 'F: APPROACH 200mm/min.', m: 'approach', head: true },
      { t: `X${x(10 + k)}, Y${y(10 + k)}, Z${simFix(z)}`, m: 'approach' },
      { t: 'F: ENGAGE 200mm/min.', m: 'feed', head: true },
      { t: 'PLANE: XY' },
      { t: `R16, X${x(20 + k)}, Y${y(20 + k)}, Z${simFix(z)}`, m: 'feed' },
      { t: 'F: WORK 200mm/min.', m: 'work', head: true },
      { t: `X${x(30 + k)}, Y${y(30 + k)}, Z${simFix(z)}`, m: 'work' },
      { t: `R-28, X${x(40 + k)}, Y${y(40 + k)}, Z${simFix(z)}`, m: 'work' },
      { t: `X${x(50 + k)}, Y${y(50 + k)}, Z${simFix(z)}`, m: 'work' },
      { t: `R-28, X${x(60 + k)}, Y${y(60 + k)}, Z${simFix(z)}`, m: 'work' },
      { t: 'F: RETRACT 200mm/min.', m: 'feed', head: true },
      { t: `X${x(70 + k)}, Y${y(70 + k)}, Z${simFix(z + 5)}`, m: 'feed' },
    ] })),
    { t: `PPFUN: 59, 250, ${x(80)}, ${y(81)}, 25…` },
  ];
}

let simOps = []; // { item, name, tool, toolName, code, blocks, entries, start, dur, open }
let simSetups = []; // { name, first, last } — диапазон операций
let simTotal = 0;
let simCollisions = []; // { t, op, block } — по времени
let simDirty = true; // дерево операций поменялось — пересобрать при входе в вид

function simBuild() {
  simOps = [];
  simSetups = [];
  let start = 0;
  tree.querySelectorAll('.tree__item[aria-level="2"]').forEach((setupItem) => {
    const first = simOps.length;
    setupItem.querySelectorAll('.tree__item:not(.tree__item--branch)').forEach((item) => {
      const index = simOps.length;
      const toolNo = Number(item.dataset.tool?.slice(1)) || 1;
      const code = simCode(nameOf(item), toolNo, index);
      // строки кода подряд (блоки); у записи кода — её блок или диапазон блоков группы
      const blocks = [];
      const entries = code.map((entry, e) => {
        const from = blocks.length;
        (entry.group ? entry.items : [entry]).forEach((line) => blocks.push({ ...line, entry: e }));
        return { from, to: blocks.length - 1 };
      });
      const dur = 18 + ((index * 37) % 71); // 18–88 с, как в ENCY UI
      simOps.push({ item, name: nameOf(item), tool: item.dataset.tool ?? '', toolName: item.dataset.toolName ?? '', code, blocks, entries, start, dur, open: false });
      start += dur;
    });
    if (simOps.length > first) simSetups.push({ name: nameOf(setupItem), first, last: simOps.length - 1, open: true });
  });
  simTotal = start;

  // столкновения — из траекторий (toolpaths.js): там, где держатель задевает деталь
  simCollisions = [];
  simOps.forEach((op, index) => {
    const share = toolpathFor(op.item).collision?.share;
    if (share === undefined) return;
    simCollisions.push({ t: op.start + op.dur * share, op: index, block: Math.floor(share * op.blocks.length) });
  });

  simT = Math.min(simT, simTotal);
  simSel = { op: Math.min(simSel.op, simOps.length - 1), block: -1 };
  simAutoOp = null;
  simAutoGroup = null;
  simGroupOpen.clear();
}

const simOpAt = (t) => {
  for (let i = 0; i < simOps.length; i += 1) if (t < simOps[i].start + simOps[i].dur) return i;
  return simOps.length - 1;
};
const simBlockAt = (op, t) => Math.min(op.blocks.length - 1, Math.max(0, Math.floor(((t - op.start) / op.dur) * op.blocks.length)));
const simBlockRange = (i, b) => {
  const op = simOps[i];
  const n = op.blocks.length;
  return { a: op.start + (b / n) * op.dur, b: op.start + ((b + 1) / n) * op.dur };
};

/* ---------- Состояние ---------- */

let simVisible = false;
let simT = 0;
let simPlaying = false;
let simRaf = 0;
let simLast = 0;
let simBlockEnd = null; // окно блока проигрывает только свой блок
let simSel = { op: 0, block: -1 }; // выделение — оно же строка под указателем времени; -1 — строка операции
let simAutoOp = null; // операцию и группу раскрыло выделение — закроются, когда оно уйдёт
let simAutoGroup = null;
const simGroupOpen = new Set(); // "op:entry"
let simSpeedUser = 50;
let simZoom = 1;
let simZoomed = false;
let simCollDetect = true;
const simStops = { collision: true, gouge: false, opt: false, end: false };
let simCompact = localStorage.getItem(SIM_COMPACT_KEY) !== '0';
let simQuery = ''; // поиск: операции, T#, группы и строки кода
let simMachineOpen = true; // станок и установы раскрываются, как в дереве операций

const simGroupKey = (i, b) => {
  if (b < 0) return null;
  const e = simOps[i].blocks[b].entry;
  return simOps[i].code[e].group ? `${i}:${e}` : null;
};

// Выделение раскрывает свою операцию и группу; раскрытое им закрывается, когда оно уходит
function simFollowSelection() {
  const { op: i, block: b } = simSel;
  const key = simGroupKey(i, b);
  if (simAutoOp !== null && simAutoOp !== i) {
    simOps[simAutoOp].open = false;
    simAutoOp = null;
  }
  if (simAutoGroup && simAutoGroup !== key) {
    simGroupOpen.delete(simAutoGroup);
    simAutoGroup = null;
  }
  if (b >= 0 && !simOps[i].open) {
    simOps[i].open = true;
    simAutoOp = i;
  }
  if (key && !simGroupOpen.has(key)) {
    simGroupOpen.add(key);
    simAutoGroup = key;
  }
}

/* ---------- Ошибки ---------- */

// Столкновения по операциям: Map(op → Set(block)). Проверка выключена — ошибок нет
function simErrors() {
  const map = new Map();
  if (!simCollDetect) return map;
  simCollisions.forEach(({ op, block }) => {
    if (!map.has(op)) map.set(op, new Set());
    map.get(op).add(block);
  });
  return map;
}

// Статус строки — иконки статусов прототипа с подписями симуляции
const SIM_STATUS_TITLES = { error: 'Holder collision', done: 'Simulated', 'not-calculated': 'Not simulated yet' };
const simStatusCache = {};
function simStatus(kind) {
  if (!simStatusCache[kind]) {
    const icon = statusIcon(kind);
    icon.title = SIM_STATUS_TITLES[kind];
    icon.setAttribute('aria-label', SIM_STATUS_TITLES[kind]);
    simStatusCache[kind] = icon.outerHTML;
  }
  return simStatusCache[kind];
}

/* ---------- Дерево кода ---------- */

function simRender() {
  if (!simOps.length) {
    simTreeEl.innerHTML = '<p class="layer-empty">No operations to simulate.</p>';
    return;
  }
  const errors = simErrors();
  // Поиск: видны операции, где совпало название, T#, группа или строка кода; совпавший код раскрыт,
  // остальные его строки скрыты
  const match = (text) => text.toLowerCase().includes(simQuery);
  let matches = 0;
  const curOp = simOpAt(simT);
  const curBlock = simBlockAt(simOps[curOp], simT);
  const passed = (i, b) => i < curOp || (i === curOp && b < curBlock);
  const opDone = (i) => simT >= simOps[i].start + simOps[i].dur;
  const branchStatus = (from, to) => {
    for (let i = from; i <= to; i += 1) if (errors.has(i)) return 'error';
    return opDone(to) ? 'done' : 'not-calculated';
  };

  // треугольник раскрытия рисует CSS у .is-branch
  const row = ({ level, cls = '', data = '', icon = '', label, extra = '', mark = '' }) =>
    `<div class="sim-row ${cls}" style="--level:${level}" ${data}>` +
    `<span class="sim-row__toggle"></span>${icon}` +
    `<span class="sim-row__label">${simEsc(label)}</span>${extra}` +
    `<span class="sim-row__mark">${mark}</span></div>`;

  const codeMark = (i, b) => {
    if (errors.get(i)?.has(b)) return simStatus('error');
    return passed(i, b) ? `<span class="sim-check">${SIM_ICONS.check}</span>` : '<span class="sim-dot"></span>';
  };

  const codeRow = (i, b, level) => {
    const block = simOps[i].blocks[b];
    const cls = ['sim-row--code', block.m ? `sim-row--${block.m}` : '', block.head ? 'is-head' : '',
      i === simSel.op && b === simSel.block ? 'is-current' : ''].join(' ');
    return row({ level, cls, data: `data-op="${i}" data-block="${b}"`, label: block.t, mark: codeMark(i, b) });
  };

  // Станок и установы раскрываются треугольником, как в дереве операций; при поиске раскрыто всё
  const machineOpen = simMachineOpen || Boolean(simQuery);
  let html = row({
    level: 0, cls: `sim-row--branch is-branch${machineOpen ? ' is-open' : ''}`, data: 'data-node="machine"',
    icon: treeNodeIconHtml('machine'),
    label: nameOf(tree.querySelector('.tree__item')),
    mark: simStatus(branchStatus(0, simOps.length - 1)),
  });

  simSetups.forEach((setup, s) => {
    if (!machineOpen) return;
    const setupOpen = setup.open || Boolean(simQuery);
    let setupHtml = '';

    for (let i = setup.first; i <= setup.last && setupOpen; i += 1) {
      const op = simOps[i];
      // при поиске: какие записи кода совпали (группа целиком — по названию, иначе — свои строки)
      let shownBlocks = null;
      let nameMatch = true;
      if (simQuery) {
        nameMatch = match(op.name) || match(op.tool);
        shownBlocks = new Set();
        op.code.forEach((entry, e) => {
          const { from, to } = op.entries[e];
          const groupMatch = Boolean(entry.group) && match(entry.group);
          for (let b = from; b <= to; b += 1) if (groupMatch || match(op.blocks[b].t)) shownBlocks.add(b);
          if (groupMatch) matches += 1;
        });
        matches += (nameMatch ? 1 : 0) + [...shownBlocks].filter((b) => match(op.blocks[b].t)).length;
        if (!nameMatch && !shownBlocks.size) continue;
      }
      const open = op.open || Boolean(shownBlocks?.size);
      const current = i === simSel.op && (simSel.block < 0 || !open);
      const opErr = errors.has(i);
      setupHtml += row({
        level: 2,
        cls: `sim-row--op is-branch${open ? ' is-open' : ''}${current ? ' is-current' : ''}`,
        data: `data-op="${i}"`,
        icon: treeNodeIconHtml('operation', op.item.dataset.type),
        label: op.name,
        extra: `<span class="sim-row__tool">${simEsc(op.tool)}</span>`,
        mark: simStatus(opErr ? 'error' : opDone(i) ? 'done' : 'not-calculated'),
      });
      if (!open) continue;
      // совпало только название — код как обычно; совпал код — только совпавшие строки
      const filter = shownBlocks?.size ? shownBlocks : null;

      op.code.forEach((entry, e) => {
        const { from, to } = op.entries[e];
        if (!entry.group) {
          if (!filter || filter.has(from)) setupHtml += codeRow(i, from, 3);
          return;
        }
        const key = `${i}:${e}`;
        let any = !filter;
        for (let b = from; b <= to && !any; b += 1) if (filter.has(b)) any = true;
        if (!any) return;
        const open = simGroupOpen.has(key) || Boolean(filter);
        const inside = i === simSel.op && simSel.block >= from && simSel.block <= to;
        let groupErr = false;
        for (let b = from; b <= to; b += 1) if (errors.get(i)?.has(b)) groupErr = true;
        const groupMark = groupErr ? simStatus('error')
          : passed(i, to) ? `<span class="sim-check">${SIM_ICONS.check}</span>` : '<span class="sim-dot"></span>';
        setupHtml += row({
          level: 3,
          cls: `sim-row--group is-branch${open ? ' is-open' : ''}${inside && !open ? ' is-current' : ''}`,
          data: `data-op="${i}" data-group="${key}" data-block="${from}"`,
          label: entry.group,
          mark: groupMark,
        });
        if (open) for (let b = from; b <= to; b += 1) if (!filter || filter.has(b)) setupHtml += codeRow(i, b, 4);
      });
    }

    // установ — если в нём что-то видно
    if (setupHtml || !simQuery) {
      html += row({
        level: 1, cls: `sim-row--branch is-branch${setupOpen ? ' is-open' : ''}`, data: `data-node="${s}"`,
        icon: treeNodeIconHtml('setup'),
        label: setup.name, mark: simStatus(branchStatus(setup.first, setup.last)),
      }) + setupHtml;
    }
  });
  simTreeEl.innerHTML = html;
  simSyncSearch(matches);
}

function simScrollToCurrent(block = 'nearest') {
  simTreeEl.querySelector('.sim-row.is-current')?.scrollIntoView({ block });
}

simTreeEl.addEventListener('click', (event) => {
  // станок и установ: треугольник — раскрыть / свернуть
  const nodeEl = event.target.closest('.sim-row[data-node]');
  if (nodeEl) {
    if (!event.target.closest('.sim-row__toggle')) return;
    if (nodeEl.dataset.node === 'machine') simMachineOpen = !simMachineOpen;
    else simSetups[Number(nodeEl.dataset.node)].open = !simSetups[Number(nodeEl.dataset.node)].open;
    simRender();
    return;
  }

  const rowEl = event.target.closest('.sim-row[data-op]');
  if (!rowEl) return;
  const i = Number(rowEl.dataset.op);
  const op = simOps[i];

  // треугольник — только раскрыть / свернуть
  if (event.target.closest('.sim-row__toggle') && rowEl.classList.contains('is-branch')) {
    if (rowEl.dataset.group) {
      const key = rowEl.dataset.group;
      if (simGroupOpen.has(key)) simGroupOpen.delete(key);
      else simGroupOpen.add(key);
      if (simAutoGroup === key) simAutoGroup = null;
    } else {
      op.open = !op.open;
      if (simAutoOp === i) simAutoOp = null;
    }
    simRender();
    return;
  }

  // статус операции — окно блока на её столкновении (или на первом блоке)
  if (!rowEl.dataset.block && event.target.closest('.sim-row__mark')) {
    const hit = simCollDetect ? simCollisions.find((c) => c.op === i) : null;
    ncShow(i, hit ? hit.block : 0);
    return;
  }
  // точка / статус строки кода — окно блока
  if (rowEl.dataset.block && event.target.closest('.sim-row__mark')) {
    ncShow(i, Number(rowEl.dataset.block));
    return;
  }

  simSel = { op: i, block: rowEl.dataset.block ? Number(rowEl.dataset.block) : -1 };
  simFollowSelection();
  simRender();
  ncFollow();
});

simTreeEl.addEventListener('dblclick', (event) => {
  const rowEl = event.target.closest('.sim-row[data-block]');
  if (rowEl) ncShow(Number(rowEl.dataset.op), Number(rowEl.dataset.block));
});

/* ---------- Кнопки и ползунок скорости ---------- */

function simButton({ title, icon, cls = '', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `sim-btn ${cls}`.trim();
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = icon;
  if (onClick) button.addEventListener('click', onClick);
  return button;
}

function simSep() {
  const sep = document.createElement('span');
  sep.className = 'sim-sep';
  return sep;
}

function simSpacer() {
  const spacer = document.createElement('span');
  spacer.className = 'sim-spacer';
  return spacer;
}

const simPlayButtons = [];
function simPlayButton(onClick = simTogglePlay) {
  const button = simButton({ title: 'Play', icon: SIM_ICONS.play, cls: 'sim-btn--play', onClick });
  simPlayButtons.push(button);
  return button;
}

// Столкновения ← → (две пары — в компактном управлении и в широкой панели): на концах — недоступны
const simCollPrevButtons = [];
const simCollNextButtons = [];
function simCollButton(dir, icon) {
  const button = simButton({
    title: dir < 0 ? 'Previous collision' : 'Next collision', icon, cls: 'sim-btn--error',
    onClick: () => simGotoCollision(dir),
  });
  (dir < 0 ? simCollPrevButtons : simCollNextButtons).push(button);
  return button;
}

// Охват симуляции — действия: мгновенно считают диапазон, указатель встаёт на результат
const SIM_SCOPES = [
  { id: 'current', title: 'Simulate selected operation', icon: SIM_ICONS.scopeCurrent },
  { id: 'tocurrent', title: 'Simulate from start to selected', icon: SIM_ICONS.scopeToCurrent },
  { id: 'all', title: 'Simulate all operations', icon: SIM_ICONS.scopeAll },
];
const simScopeButtons = () => SIM_SCOPES.map((scope) => simButton({
  title: scope.title, icon: scope.icon, cls: 'sim-btn--scope', onClick: () => simRunScope(scope.id),
}));

// Ползунок скорости: клик или перетаскивание, на круглых значениях — фиксаторы.
// Приблизили сцену — скорость ограничена 25%, своя видна кольцом и вернётся после отдаления
const simSpeedBoxes = [];
const simSpeedValues = [];
function simSpeedControl(size) {
  const box = document.createElement('div');
  box.className = `sim-speed sim-speed--${size}`;
  box.innerHTML = '<i class="sim-speed__track"></i><i class="sim-speed__fill"></i>'
    + [25, 50, 75].map((p) => `<i class="sim-speed__dot" style="left:${p}%"></i>`).join('')
    + '<i class="sim-speed__ghost" hidden></i>'
    + `<i class="sim-speed__knob">${size === 'wide' ? '<span class="sim-speed__tip"></span>' : ''}</i>`;
  box.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    box.setPointerCapture(event.pointerId);
    box.classList.add('is-dragging');
    const set = (ev) => {
      const rect = box.getBoundingClientRect();
      let value = Math.round(Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1) * SIM_SPEED_MAX);
      value = Math.max(5, value);
      SIM_DETENTS.forEach((detent) => { if (Math.abs(value - detent) < 8) value = detent; });
      simSpeedUser = value;
      simSyncSpeed();
    };
    set(event);
    const move = (ev) => set(ev);
    const up = () => {
      box.classList.remove('is-dragging');
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', up);
      box.removeEventListener('pointercancel', up);
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
  });
  simSpeedBoxes.push(box);
  return box;
}

function simSpeedValue() {
  const value = document.createElement('span');
  value.className = 'sim-speed-value';
  simSpeedValues.push(value);
  return value;
}

const simEffSpeed = () => (simZoomed ? Math.min(simSpeedUser, SIM_ZOOM_CAP) : simSpeedUser);

function simSyncSpeed() {
  const eff = simEffSpeed();
  const capped = simZoomed && simSpeedUser > SIM_ZOOM_CAP;
  const pos = `${(eff / SIM_SPEED_MAX) * 100}%`;
  simSpeedBoxes.forEach((box) => {
    box.querySelector('.sim-speed__fill').style.width = pos;
    box.querySelector('.sim-speed__knob').style.left = pos;
    const ghost = box.querySelector('.sim-speed__ghost');
    ghost.hidden = !capped;
    ghost.style.left = `${(simSpeedUser / SIM_SPEED_MAX) * 100}%`;
    box.classList.toggle('is-capped', capped);
    const tip = box.querySelector('.sim-speed__tip');
    if (tip) tip.textContent = capped ? `${eff}% · zoom` : `${eff}%`;
    box.title = `Simulation speed: ${eff}%${capped ? ` (hand-set ${simSpeedUser}% returns after zoom out)` : ''}`;
  });
  simSpeedValues.forEach((value) => {
    value.textContent = `${eff}%`;
    value.classList.toggle('is-capped', capped);
  });
}

// Колесо над сценой — это зум камеры: приблизили — скорость ограничена, отдалили — вернулась
document.querySelector('.view').addEventListener('wheel', (event) => {
  if (!simVisible) return;
  simZoom = Math.min(Math.max(simZoom * (event.deltaY < 0 ? 1.12 : 0.9), 0.5), 4);
  simZoomed = simZoom > 1.15;
  simSyncSpeed();
}, { passive: true });

/* ---------- Компактное управление (по умолчанию): транспорт — в шапке панели, охват и столкновения — над деревом ---------- */

function simRow(...children) {
  const rowEl = document.createElement('div');
  rowEl.className = 'sim-dock__row';
  rowEl.append(...children);
  return rowEl;
}

const simWarnButton = simButton({
  title: 'Simulation parameters', icon: SIM_ICONS.warn, cls: 'sim-btn--warn',
  onClick: (event) => simTogglePop(simPopAll, event.currentTarget, true),
});

// В шапке рядом с «Simulation ▾» — экономит строку высоты
simHeadActionsEl.append(
  simSpeedControl('mini'),
  simButton({ title: 'Reset simulation', icon: SIM_ICONS.stopX, cls: 'sim-btn--error', onClick: simReset }),
  simSep(),
  simButton({ title: 'Step back', icon: SIM_ICONS.back, onClick: () => simStep(-1) }),
  simPlayButton(),
  simButton({ title: 'Step forward', icon: SIM_ICONS.fwd, onClick: () => simStep(1) }),
);

simDockEl.append(
  simRow(
    ...simScopeButtons(),
    simSpacer(),
    simCollButton(-1, SIM_ICONS.collUp),
    simCollButton(1, SIM_ICONS.collDown),
    simWarnButton,
  ),
);

/* ---------- Под шапкой: свернуть / раскрыть всё и поиск — как у дерева операций ---------- */

const simFoldButton = simSearchEl.querySelector('.tool-btn--fold');
const simSearchInput = simSearchEl.querySelector('.tree-search__input');
const simSearchCount = simSearchEl.querySelector('.tree-search__count');
const simSearchClear = simSearchEl.querySelector('.tree-search__clear');

// Одна кнопка: иконка — доступное действие. Что-то раскрыто — свернуть всё, иначе — раскрыть операции
function simSyncFold() {
  const anyOpen = simOps.some((op) => op.open);
  simFoldButton.classList.toggle('is-collapsed', !anyOpen);
  simFoldButton.title = anyOpen ? 'Collapse all' : 'Expand all operations';
  simFoldButton.setAttribute('aria-label', simFoldButton.title);
}

simFoldButton.addEventListener('click', () => {
  const anyOpen = simOps.some((op) => op.open);
  simOps.forEach((op) => { op.open = !anyOpen; });
  if (anyOpen) simGroupOpen.clear();
  simAutoOp = null;
  simAutoGroup = null;
  simRender();
});

function simSyncSearch(matches) {
  simSearchCount.textContent = simQuery ? String(matches) : '';
  simSearchClear.hidden = !simQuery;
  simSyncFold();
}

simSearchInput.addEventListener('input', () => {
  simQuery = simSearchInput.value.trim().toLowerCase();
  simRender();
});

function simClearSearch() {
  simSearchInput.value = '';
  simQuery = '';
  simRender();
  simSearchInput.focus();
}

simSearchClear.addEventListener('click', simClearSearch);
simSearchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && simQuery) {
    event.stopPropagation();
    simClearSearch();
  }
});

/* ---------- Широкая панель — внизу сцены, с таймлайном ---------- */

const simBarRow = document.createElement('div');
simBarRow.className = 'simbar__row';

const simCollBadge = document.createElement('button');
simCollBadge.type = 'button';
simCollBadge.className = 'simbar__badge';
simCollBadge.title = 'Collision list';
simCollBadge.innerHTML = `${SIM_ICONS.triangle}<span></span>`;
simCollBadge.addEventListener('click', (event) => {
  simRenderCollisionList();
  simTogglePop(simPopColl, event.currentTarget, true);
});

const simStopsChip = document.createElement('button');
simStopsChip.type = 'button';
simStopsChip.className = 'simbar__stops';
simStopsChip.title = 'Stop conditions';
simStopsChip.innerHTML = `${SIM_ICONS.stops}<span></span>${SIM_ICONS.chev}`;
simStopsChip.addEventListener('click', (event) => simTogglePop(simPopStops, event.currentTarget));

const simOpChip = document.createElement('span');
simOpChip.className = 'simbar__op';
simOpChip.innerHTML = '<b></b><em></em><span></span>';

const simTimeEl = document.createElement('span');
simTimeEl.className = 'simbar__time';

const simBarPin = document.createElement('button');
simBarPin.type = 'button';
simBarPin.className = 'fnbar__btn fnbar__pin';
simBarPin.innerHTML = PIN_ICON;
simBarPin.addEventListener('click', () => simSetPinned(!simBarEl.classList.contains('is-pinned')));

// Где управление (в панели / под сценой) — в настройках показа (шестерёнка в шапке, tree-tools.js)
simBarRow.append(
  ...simScopeButtons(),
  simSep(),
  simButton({ title: 'Reset simulation', icon: SIM_ICONS.reset, onClick: simReset }),
  simButton({ title: 'To operation start', icon: SIM_ICONS.toStart, cls: 'sim-btn--secondary', onClick: simToOpStart }),
  simButton({ title: 'Step back (code line)', icon: SIM_ICONS.stepBack, onClick: () => simStep(-1) }),
  simPlayButton(),
  simButton({ title: 'Step forward (code line)', icon: SIM_ICONS.stepFwd, onClick: () => simStep(1) }),
  simButton({ title: 'Next operation', icon: SIM_ICONS.toNext, cls: 'sim-btn--secondary', onClick: simToNextOp }),
  simSep(),
  simCollButton(-1, SIM_ICONS.collLeft),
  simCollBadge,
  simCollButton(1, SIM_ICONS.collRight),
  simSep(),
  simSpeedControl('wide'),
  simSpeedValue(),
  simSep(),
  simStopsChip,
  simButton({ title: 'Simulation settings', icon: SIM_ICONS.gear, onClick: (event) => simTogglePop(simPopParams, event.currentTarget) }),
  simSpacer(),
  simOpChip,
  simTimeEl,
  simSep(),
  simBarPin,
);

// Таймлайн: станок (к самому началу), линейка, операции — клипы, метки столкновений и установов, указатель
const simTimeline = document.createElement('div');
simTimeline.className = 'simbar__timeline';
const simMachineAnchor = simButton({
  title: 'Machine — to the very start', icon: `<svg viewBox="0 0 20 20">${INSPECTOR_ICONS.machine.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`,
  cls: 'sim-btn--anchor', onClick: () => simReset(),
});
const simTimelineMain = document.createElement('div');
simTimelineMain.className = 'sim-tl';
const simRuler = document.createElement('div');
simRuler.className = 'sim-tl__ruler';
const simTrack = document.createElement('div');
simTrack.className = 'sim-tl__track';
simTimelineMain.append(simRuler, simTrack);
simTimeline.append(simMachineAnchor, simTimelineMain);

simBarEl.append(simBarRow, simTimeline);

let simClips = [];
let simPlayhead = null;

function simBuildTimeline() {
  if (!simTotal) {
    simRuler.replaceChildren();
    simTrack.replaceChildren();
    simClips = [];
    return;
  }
  const step = simTotal > 3600 ? 600 : simTotal > 1200 ? 300 : 60;
  let ruler = '';
  for (let t = step; t < simTotal; t += step) ruler += `<i style="left:${(t / simTotal) * 100}%"></i>`;
  simRuler.innerHTML = ruler;

  let track = simOps.map((op) => `<div class="sim-tl__clip" style="flex:${op.dur}" title="${simEsc(op.name)} · ${simFmt(op.dur)}"><span>${simEsc(op.name)}</span></div>`).join('');
  // на длинных программах ромб не помещается — простые засечки
  const tick = simOps.length > 24 ? ' is-tick' : '';
  simCollisions.forEach((c) => {
    track += `<i class="sim-tl__mark sim-tl__mark--coll${tick}" style="left:${(c.t / simTotal) * 100}%" title="Collision · ${simFmt(c.t)}"></i>`;
  });
  simSetups.forEach((setup) => {
    const t = simOps[setup.first].start;
    track += `<i class="sim-tl__mark sim-tl__mark--setup" style="left:${(t / simTotal) * 100}%" title="${simEsc(setup.name)} · ${simFmt(t)}"></i>`;
  });
  track += '<div class="sim-tl__playhead"><span class="sim-tl__tip"></span></div>';
  simTrack.innerHTML = track;
  simClips = [...simTrack.querySelectorAll('.sim-tl__clip')];
  simPlayhead = simTrack.querySelector('.sim-tl__playhead');
}

// Клик и перетаскивание по таймлайну — перемотка
simTrack.addEventListener('pointerdown', (event) => {
  if (!simTotal) return;
  event.preventDefault();
  simTrack.setPointerCapture(event.pointerId);
  simTimeline.classList.add('is-scrubbing');
  const set = (ev) => {
    const rect = simTrack.getBoundingClientRect();
    simSeek(((ev.clientX - rect.left) / rect.width) * simTotal);
  };
  set(event);
  const move = (ev) => set(ev);
  const up = () => {
    simTimeline.classList.remove('is-scrubbing');
    simTrack.removeEventListener('pointermove', move);
    simTrack.removeEventListener('pointerup', up);
    simTrack.removeEventListener('pointercancel', up);
  };
  simTrack.addEventListener('pointermove', move);
  simTrack.addEventListener('pointerup', up);
  simTrack.addEventListener('pointercancel', up);
});

/* ---------- Указатель времени: таймлайн, подписи, кнопки, дерево и окно блока за ним ---------- */

function simSyncPlayhead() {
  if (!simOps.length) return;
  const opIndex = simOpAt(simT);
  const op = simOps[opIndex];
  const block = simBlockAt(op, simT);

  simClips.forEach((clip, i) => {
    clip.classList.toggle('is-current', i === opIndex);
    clip.classList.toggle('is-done', simT >= simOps[i].start + simOps[i].dur);
  });
  if (simPlayhead) {
    simPlayhead.style.left = `${(simT / simTotal) * 100}%`;
    simPlayhead.querySelector('.sim-tl__tip').textContent = simFmt(simT);
  }
  const atCollision = simCollDetect && simCollisions.some((c) => Math.abs(c.t - simT) < 0.3);
  simTrack.classList.toggle('is-at-collision', atCollision);
  simTimeEl.textContent = `${simFmt(simT)} / ${simFmt(simTotal)}`;
  simOpChip.querySelector('b').textContent = op.name;
  simOpChip.querySelector('em').textContent = op.tool;
  simOpChip.querySelector('span').textContent = op.toolName;

  const hasNext = simCollDetect && simCollisions.some((c) => c.t > simT + 0.5);
  const hasPrev = simCollDetect && simCollisions.some((c) => c.t < simT - 0.5);
  simCollNextButtons.forEach((button) => { button.disabled = !hasNext; });
  simCollPrevButtons.forEach((button) => { button.disabled = !hasPrev; });

  if (opIndex !== simSel.op || block !== simSel.block) {
    simSel = { op: opIndex, block };
    simFollowSelection();
    if (simVisible) {
      simRender();
      simScrollToCurrent();
    }
    ncSync();
  }
}

function simSyncPlaying() {
  simEl.classList.toggle('is-playing', simPlaying);
  simHeadActionsEl.classList.toggle('is-playing', simPlaying);
  simBarEl.classList.toggle('is-playing', simPlaying);
  ncPanelEl.classList.toggle('is-playing', simPlaying && simBlockEnd !== null);
  simPlayButtons.forEach((button) => {
    button.title = simPlaying ? 'Pause' : 'Play';
    button.setAttribute('aria-label', button.title);
  });
}

/* ---------- Транспорт ---------- */

function simTick(ts) {
  if (!simPlaying) {
    simRaf = 0;
    return;
  }
  const dt = simLast ? (ts - simLast) / 1000 : 0;
  simLast = ts;
  const prev = simT;
  let next = Math.min(simTotal, simT + dt * SIM_BASE_RATE * (simEffSpeed() / 100));
  // условие остановки: точно на первом столкновении, которое пересекли
  if (simStops.collision && simCollDetect) {
    const hit = simCollisions.find((c) => c.t > prev && c.t <= next);
    if (hit) {
      next = hit.t;
      simPlaying = false;
    }
  }
  // окно блока проигрывает только свой блок
  if (simBlockEnd !== null && next >= simBlockEnd) {
    next = simBlockEnd;
    simPlaying = false;
  }
  simT = next;
  if (simT >= simTotal) simPlaying = false;
  if (!simPlaying) {
    simBlockEnd = null;
    simLast = 0;
  }
  simSyncPlayhead();
  simSyncPlaying();
  simRaf = simPlaying ? requestAnimationFrame(simTick) : 0;
}

function simStart() {
  simPlaying = true;
  simLast = 0;
  simSyncPlaying();
  if (!simRaf) simRaf = requestAnimationFrame(simTick);
}

function simTogglePlay() {
  if (simPlaying) {
    simPause();
    return;
  }
  simBlockEnd = null;
  if (simT >= simTotal) simT = 0;
  simStart();
}

function simPause() {
  simPlaying = false;
  simBlockEnd = null;
  simLast = 0;
  simSyncPlaying();
}

function simSeek(t) {
  simT = Math.min(Math.max(t, 0), simTotal);
  simSyncPlayhead();
}

function simReset() {
  simPause();
  simSeek(0);
}

// К началу операции; если уже у начала — к предыдущей
function simToOpStart() {
  const i = simOpAt(simT);
  const start = simOps[i].start;
  simSeek(simT - start > 2 ? start : simOps[Math.max(0, i - 1)].start);
}

function simToNextOp() {
  const i = simOpAt(simT);
  simSeek(i + 1 < simOps.length ? simOps[i + 1].start : simTotal);
}

// Шаг по строкам кода; на краю операции — в соседнюю
function simStep(dir) {
  if (!simOps.length) return;
  simPause();
  const op = simOps[simSel.op];
  const n = op.blocks.length;
  const b = simSel.block + dir;
  if (b >= n) {
    if (simSel.op + 1 < simOps.length) simSeek(simOps[simSel.op + 1].start + 0.01);
    return;
  }
  if (b < 0) {
    if (simSel.op === 0) {
      simSeek(0);
      return;
    }
    const prev = simOps[simSel.op - 1];
    simSeek(prev.start + ((prev.blocks.length - 0.5) / prev.blocks.length) * prev.dur);
    return;
  }
  simSeek(op.start + ((b + 0.5) / n) * op.dur);
}

// Охват: выбранная операция, от начала до выбранной, все — мгновенно, указатель встаёт на результат
// (или на первое столкновение диапазона, если на нём останавливаемся)
function simRunScope(scope) {
  if (!simOps.length) return;
  simPause();
  const op = simOps[simSel.op];
  const from = scope === 'current' ? op.start : 0;
  const to = scope === 'all' ? simTotal : op.start + op.dur - 0.01;
  const stop = simStops.collision && simCollDetect ? simCollisions.find((c) => c.t >= from && c.t <= to) : null;
  simSeek(stop ? stop.t : to);
  simScrollToCurrent('center');
}

// Столкновения: следующее / предыдущее, без перехода через край
function simGotoCollision(dir) {
  if (!simCollDetect) return;
  const target = dir > 0
    ? simCollisions.find((c) => c.t > simT + 0.5)
    : [...simCollisions].reverse().find((c) => c.t < simT - 0.5);
  if (!target) return;
  simPause();
  simSeek(target.t);
  simScrollToCurrent('center');
}

/* ---------- Окно NC-блока ---------- */

ncPanelEl.innerHTML = `
  <div class="nc__head"><span class="nc__title"></span><button class="nc__close" type="button" title="Close" aria-label="Close">${SIM_ICONS.close}</button></div>
  <div class="nc__sub"><span class="nc__op"></span><span class="nc__move"></span></div>
  <div class="nc__error" hidden>${simStatus('error')}<span><b>Holder collision</b><span>Tool holder hits the workpiece in this block</span></span></div>
  <div class="nc__controls"></div>
  <div class="nc__section">End point</div><div class="nc__grid" data-grid="ep"></div>
  <div class="nc__section">Machine point</div><div class="nc__grid" data-grid="mp"></div>
  <div class="nc__section">Axes</div><div class="nc__grid" data-grid="ax"></div>
  <div class="nc__section">Info</div>
  <div class="nc__info">
    <div class="nc__row">${SIM_ICONS.time}<span>Machining time</span><b data-info="time"></b></div>
    <div class="nc__row">${SIM_ICONS.feed}<span>Feed</span><b data-info="feed"></b></div>
    <div class="nc__row">${SIM_ICONS.length}<span>Block length</span><b data-info="len"></b></div>
    <div class="nc__row">${SIM_ICONS.blocks}<span>Block number</span><b data-info="no"></b></div>
  </div>`;

const ncEditButton = simButton({ title: 'Edit block values', icon: SIM_ICONS.edit, onClick: () => ncSetEdit(!ncEditing) });
ncPanelEl.querySelector('.nc__controls').append(
  simButton({ title: 'Previous block', icon: SIM_ICONS.stepBack, onClick: () => simStep(-1) }),
  simPlayButton(ncPlayBlock),
  simButton({ title: 'Next block', icon: SIM_ICONS.stepFwd, onClick: () => simStep(1) }),
  simSep(),
  simSpeedControl('mini'),
  simSpeedValue(),
  simSep(),
  ncEditButton,
);
ncPanelEl.querySelector('.nc__close').addEventListener('click', () => ncClose());

let ncOpen = false;
let ncEditing = false;
const NC_MOVES = { rapid: 'Rapid', approach: 'Approach', feed: 'Feed', work: 'Work' };

const ncNumber = (value) => (value < 0 ? '−' : '') + Math.abs(value).toFixed(3);

// Числа блока — детерминированно из номера операции и строки, как в ENCY UI
function ncData(i, b) {
  const seed = i * 131 + b * 17;
  const block = simOps[i].blocks[b];
  const f = (k, a, c) => simNum(seed, k, a, c);
  const rapid = block.m === 'rapid';
  const moving = Boolean(block.m);
  return {
    type: /^R-?\d/.test(block.t) ? 'MultiARC' : /^F:|^RAPID/.test(block.t) ? 'Feed' : 'MultiGOTO', // дуга — R16, R-28
    move: NC_MOVES[block.m] ?? 'Auxiliary',
    ep: [f(1, -60, 60), f(2, -4, 4), f(3, 20, 150), f(4, 120, 160), f(5, -50, -30), f(6, 20, 30)],
    mp: [f(7, -60, 60), f(8, -4, 4), f(9, 100, 140), f(10, 140, 160), f(11, -45, -35), f(12, 15, 25)],
    ax: [f(13, -10, 10), f(14, -80, -70), f(15, 110, 130), f(16, 70, 85), f(17, 40, 55), f(18, -150, -140)],
    time: simOps[i].dur / simOps[i].blocks.length,
    feed: rapid ? '10000 mm/min' : moving ? '200 mm/min' : '—',
    len: rapid ? f(19, 0.05, 0.4) : moving ? f(20, 0.002, 0.06) : 0,
    no: 100 + i * 240 + b * 12,
  };
}

function ncGrid(name, keys, values) {
  ncPanelEl.querySelector(`[data-grid="${name}"]`).innerHTML = keys
    .map((key, k) => `<div class="nc__cell"><b>${key}</b><span>${ncNumber(values[k])}</span></div>`).join('');
}

function ncSync() {
  if (!ncOpen) return;
  if (ncEditing) ncSetEdit(false); // перешли к другому блоку — правка заканчивается
  const i = simSel.op;
  const b = Math.max(0, simSel.block);
  const block = simOps[i].blocks[b];
  const data = ncData(i, b);
  const title = ncPanelEl.querySelector('.nc__title');
  title.textContent = block.t;
  title.title = block.t;
  ncPanelEl.querySelector('.nc__op').textContent = `${simOps[i].name} · ${simOps[i].tool}`;
  const move = ncPanelEl.querySelector('.nc__move');
  move.textContent = `${data.type} · ${data.move}`;
  move.className = `nc__move${block.m ? ` sim-move--${block.m}` : ''}`;
  ncGrid('ep', ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'], data.ep);
  ncGrid('mp', ['X', 'Y', 'Z', 'RX', 'RY', 'RZ'], data.mp);
  ncGrid('ax', ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'], data.ax);
  const sec = Math.round(data.time);
  ncPanelEl.querySelector('[data-info="time"]').textContent = `00:${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  ncPanelEl.querySelector('[data-info="feed"]').textContent = data.feed;
  ncPanelEl.querySelector('[data-info="len"]').textContent = `${data.len.toFixed(3)} m`;
  ncPanelEl.querySelector('[data-info="no"]').textContent = data.no;
  const isError = Boolean(simErrors().get(i)?.has(b));
  ncPanelEl.querySelector('.nc__error').hidden = !isError;
  ncPanelEl.classList.toggle('has-error', isError);
}

// Окно — справа от фильтров, на высоте строки, в пределах сцены
function ncPlace() {
  const area = workspace.getBoundingClientRect();
  const rowEl = simTreeEl.querySelector('.sim-row.is-current') ?? simTreeEl;
  const top = rowEl.getBoundingClientRect().top - area.top;
  ncPanelEl.style.left = `${simFiltersEl.offsetLeft + simFiltersEl.offsetWidth + LAYERS_INSET}px`;
  ncPanelEl.style.top = `${Math.min(Math.max(top, LAYERS_INSET), workspace.clientHeight - ncPanelEl.offsetHeight - LAYERS_INSET)}px`;
}

// Открыть на блоке: указатель встаёт на блок — транспорт и стрелки действуют на него
function ncShow(i, b) {
  simPause();
  simSeek(simBlockRange(i, b).a + 0.01);
  simSel = { op: i, block: b };
  simFollowSelection();
  ncOpen = true;
  ncPanelEl.hidden = false;
  simRender();
  ncSync();
  ncPlace();
}

function ncClose() {
  ncOpen = false;
  ncPanelEl.hidden = true;
  if (ncEditing) ncSetEdit(false);
}

// Открытое окно следует за выбором в дереве: указатель — на выбранный блок (первый блок операции)
function ncFollow() {
  if (!ncOpen) return;
  const i = simSel.op;
  const b = Math.max(0, simSel.block);
  simPause();
  simSeek(simBlockRange(i, b).a + 0.01);
  ncSync();
}

// Правка: значения ячеек становятся редактируемыми, пока карандаш нажат
function ncSetEdit(on) {
  ncEditing = on;
  ncPanelEl.classList.toggle('is-editing', on);
  ncEditButton.setAttribute('aria-pressed', String(on));
  ncPanelEl.querySelectorAll('.nc__cell span').forEach((cell) => {
    cell.contentEditable = on ? 'true' : 'false';
    cell.spellcheck = false;
  });
  if (on) ncPanelEl.querySelector('.nc__cell span')?.focus();
}

ncPanelEl.addEventListener('keydown', (event) => {
  if (!ncEditing) return;
  event.stopPropagation(); // стрелки и Esc остаются в ячейке
  if (event.key === 'Enter') {
    event.preventDefault();
    event.target.blur();
  }
  if (event.key === 'Escape') ncSetEdit(false);
});

// Проиграть только этот блок
function ncPlayBlock() {
  if (simPlaying) {
    simPause();
    return;
  }
  const range = simBlockRange(simSel.op, Math.max(0, simSel.block));
  simSeek(range.a + 0.01);
  simBlockEnd = range.b - 0.01;
  simStart();
}

/* ---------- Всплывающие окна: параметры, условия остановки, список столкновений ---------- */

function simNode(tag, cls, html = '') {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.innerHTML = html;
  return node;
}

function simSwitch(on, label, onChange) {
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'ictl-switch';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(on));
  toggle.setAttribute('aria-label', label);
  toggle.addEventListener('click', () => {
    const next = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(next));
    onChange?.(next);
  });
  return toggle;
}

function simPopRow({ icon = '', label, on, onChange, cls = '' }) {
  const rowEl = simNode('div', `simpop__row ${cls}`.trim(), `${icon ? `<span class="simpop__icon">${icon}</span>` : ''}<span class="simpop__label">${label}</span>`);
  rowEl.append(simSwitch(on, label, onChange));
  return rowEl;
}

// Ползунок на 3 или N положений / свободный — общий для уровня проверки и допусков
function simPopSlider(cls, initial, steps, onSet) {
  const track = simNode('div', `simpop__slider ${cls}`, '<i class="simpop__slider-fill"></i><i class="simpop__slider-knob"></i>');
  const set = (share) => {
    const value = steps ? Math.round(share * (steps - 1)) / (steps - 1) : share;
    track.querySelector('.simpop__slider-fill').style.width = `${value * 100}%`;
    track.querySelector('.simpop__slider-knob').style.left = `${value * 100}%`;
    onSet?.(value);
  };
  track.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    track.setPointerCapture(event.pointerId);
    const at = (ev) => {
      const rect = track.getBoundingClientRect();
      set(Math.min(Math.max((ev.clientX - rect.left) / rect.width, 0), 1));
    };
    at(event);
    const move = (ev) => at(ev);
    const up = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
  });
  set(initial);
  track.simSet = set;
  return track;
}

// Проверка столкновений: главный переключатель, уровень, описание уровня; «Check for» — врезание в деталь
const SIM_LEVELS = [
  { name: 'Holder', t: 'Holder', s: 'Checks the tool holder only. The fastest option.' },
  { name: 'Machine', t: 'Holder + machine', s: 'Checks holder and machine components. Balanced option for daily work.' },
  { name: 'Hidden nodes', t: 'Holder + machine + hidden nodes', s: 'Checks everything including hidden nodes. The most thorough and the slowest.' },
];
const simDetectBlock = simNode('div', 'simpop__block');
const simDetectHead = simNode('div', 'simpop__head-row', '<span>Collision detection</span>');
simDetectHead.append(simSwitch(true, 'Collision detection', (on) => simSetDetection(on)));
const simLevelLabels = simNode('div', 'simpop__levels', SIM_LEVELS.map((level, k) => `<button type="button" data-level="${k}">${level.name}</button>`).join(''));
const simLevelNote = simNode('div', 'simpop__note', '<b></b><span></span>');
const simLevelSlider = simPopSlider('simpop__slider--levels', 0.5, 3, (value) => {
  const k = Math.round(value * 2);
  simLevelLabels.querySelectorAll('button').forEach((button, n) => button.classList.toggle('is-on', n === k));
  simLevelNote.querySelector('b').textContent = SIM_LEVELS[k].t;
  simLevelNote.querySelector('span').textContent = SIM_LEVELS[k].s;
});
simLevelLabels.addEventListener('click', (event) => {
  const button = event.target.closest('[data-level]');
  if (button) simLevelSlider.simSet(Number(button.dataset.level) / 2);
});
simDetectBlock.append(
  simDetectHead, simLevelLabels, simLevelSlider, simLevelNote,
  simNode('div', 'simpop__line'),
  simNode('div', 'simpop__section', 'Check for'),
  simPopRow({ icon: SIM_ICONS.gouge, label: 'Part gouge', on: false, onChange: (on) => { simStops.gouge = on; } }),
);

// Где останавливаться
const simStopsBlock = simNode('div', 'simpop__block');
const simStopCollisionRow = simPopRow({
  icon: `<svg viewBox="0 0 16 16" class="simpop__error-icon">${SIM_DIAMOND(8, 8)}</svg>`, label: 'Error/collision/gouge', on: true,
  onChange: (on) => { simStops.collision = on; simSyncStopsLabel(); },
});
simStopsBlock.append(
  simNode('div', 'simpop__section', 'Stop at'),
  simStopCollisionRow,
  simPopRow({ icon: SIM_ICONS.optStop, label: 'Optional stop command', on: false, onChange: (on) => { simStops.opt = on; simSyncStopsLabel(); } }),
  simPopRow({ icon: SIM_ICONS.stopCmd, label: 'Stop command', on: false, onChange: (on) => { simStops.end = on; simSyncStopsLabel(); } }),
);

// Параметры: допуски, воспроизведение, копии детали
function simTolerance(label) {
  const box = simNode('div', 'simpop__group');
  const line = simNode('div', 'simpop__tolerance', '<span>Low</span>');
  line.append(simPopSlider('', 0.45, 0), simNode('span', '', 'High'));
  const absolute = simNode('div', 'simpop__row simpop__row--sub');
  const input = simNode('span', 'simpop__input is-off', '<input type="text" value="0.001" disabled aria-label="Absolute tolerance"><em>mm</em>');
  absolute.append(simSwitch(false, 'Use absolute tolerance', (on) => {
    input.classList.toggle('is-off', !on);
    input.querySelector('input').disabled = !on;
  }), simNode('span', 'simpop__label', 'Use absolute tolerance'), input);
  box.append(simNode('div', 'simpop__section', label), line, absolute);
  return box;
}

function simCycleValue(label, values) {
  const rowEl = simNode('div', 'simpop__row', `<span class="simpop__label">${label}</span>`);
  const value = simNode('button', 'simpop__value', values[0]);
  value.type = 'button';
  value.title = 'Click to change';
  value.addEventListener('click', () => { value.textContent = values[(values.indexOf(value.textContent) + 1) % values.length]; });
  rowEl.append(value);
  return rowEl;
}

const simParamsBlock = simNode('div', 'simpop__block');
simParamsBlock.append(
  simNode('div', 'simpop__head-row', '<span>Tolerances</span>'),
  simTolerance('Toolpath tolerance'),
  simTolerance('Tool/Model tolerance'),
  simNode('div', 'simpop__line'),
  simNode('div', 'simpop__head-row', '<span>Playback</span>'),
  simPopRow({ label: 'Smooth simulation', on: true }),
  simCycleValue('Rapid motion', ['x16', 'x1', 'x2', 'x4', 'x8']),
  simPopRow({ label: 'Compensation curve', on: false }),
  simCycleValue('Type', ['Voxel 5D', 'Voxel 3D', 'Mesh']),
  simNode('div', 'simpop__line'),
  simNode('div', 'simpop__head-row', '<span>Part copies</span>'),
  simPopRow({ label: 'One model for all copies', on: false }),
);

function simPopup(title, cls = '') {
  const pop = simNode('div', `simpop ${cls}`.trim(), title ? `<div class="simpop__title">${title}</div>` : '');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  if (title) pop.setAttribute('aria-label', title);
  pop.simBody = simNode('div', 'simpop__body');
  pop.append(pop.simBody);
  document.body.append(pop);
  return pop;
}

const simPopParams = simPopup('Simulation parameters');
const simPopStops = simPopup('', 'simpop--stops');
const simPopAll = simPopup('Simulation parameters'); // компактный режим: всё в одном окне
const simPopColl = simPopup('Collisions', 'simpop--collisions');
const simPops = [simPopParams, simPopStops, simPopAll, simPopColl];

// Блоки переезжают: отдельные окна в широком режиме, одно общее — в компактном
function simAssemble(pop) {
  if (pop === simPopParams) simPopParams.simBody.replaceChildren(simParamsBlock);
  if (pop === simPopStops) simPopStops.simBody.replaceChildren(simDetectBlock, simNode('div', 'simpop__line'), simStopsBlock);
  if (pop === simPopAll) {
    simPopAll.simBody.replaceChildren(simDetectBlock, simNode('div', 'simpop__line'), simStopsBlock,
      simNode('div', 'simpop__line'), simParamsBlock);
  }
}

let simPopAnchor = null;

function simClosePops() {
  simPops.forEach((pop) => { pop.hidden = true; });
  simPopAnchor?.setAttribute('aria-expanded', 'false');
  simPopAnchor = null;
  simBarEl.classList.remove('is-held');
}

// Над широкой панелью, не поверх неё; в компактном режиме — под кнопкой
function simTogglePop(pop, anchor, alignLeft = false) {
  const wasOpen = !pop.hidden;
  simClosePops();
  if (wasOpen) return;
  simAssemble(pop);
  pop.hidden = false;
  simPopAnchor = anchor;
  anchor.setAttribute('aria-expanded', 'true');
  const rect = anchor.getBoundingClientRect();
  const barShown = !simBarEl.hidden && simBarEl.contains(anchor);
  // под кнопкой окно не выше места до низа окна — длинное прокручивается, кнопку не закрывает
  pop.style.maxHeight = barShown ? '' : `${Math.max(200, innerHeight - rect.bottom - 12)}px`;
  const { offsetWidth: w, offsetHeight: h } = pop;
  const left = Math.max(8, Math.min(alignLeft ? rect.left : rect.right - w, innerWidth - w - 8));
  const top = barShown
    ? Math.max(8, simBarEl.getBoundingClientRect().top - h - 4)
    : Math.min(innerHeight - h - 8, rect.bottom + 4);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  if (barShown) simBarEl.classList.add('is-held'); // пока окно открыто, панель не прячется
}

document.addEventListener('pointerdown', (event) => {
  if (!simPopAnchor) return;
  if (simPops.some((pop) => !pop.hidden && pop.contains(event.target)) || simPopAnchor.contains(event.target)) return;
  simClosePops();
});

// Список столкновений: что и где (операция · инструмент · время); клик — перейти
function simRenderCollisionList() {
  const list = simNode('div', 'simpop__list');
  simCollisions.forEach((c) => {
    const item = simNode('button', 'simpop__collision',
      `<svg viewBox="0 0 16 16" class="simpop__error-icon">${SIM_DIAMOND(8, 8)}</svg><span><b>Holder collision</b><span>${simEsc(simOps[c.op].name)} · ${simEsc(simOps[c.op].tool)} · ${simFmt(c.t)}</span></span>`);
    item.type = 'button';
    item.addEventListener('click', () => {
      simPause();
      simSeek(c.t);
      simScrollToCurrent('center');
      simClosePops();
    });
    list.append(item);
  });
  simPopColl.simBody.replaceChildren(list);
}

function simSyncStopsLabel() {
  const names = { collision: 'collision', opt: 'optional stop', end: 'stop command' };
  const on = Object.keys(names).filter((key) => simStops[key] && (key !== 'collision' || simCollDetect));
  simStopsChip.querySelector('span').textContent = !on.length ? 'Stop at: off'
    : on.length === 1 ? `Stop at: ${names[on[0]]}` : `Stop at: ${on.length} conditions`;
}

// Проверка выключена — столкновений нигде нет: метки, счётчик, переходы, условие остановки
function simSetDetection(on) {
  simCollDetect = on;
  simTrack.classList.toggle('is-no-collisions', !on);
  simCollBadge.hidden = !on;
  [...simCollPrevButtons, ...simCollNextButtons].forEach((button) => { button.hidden = !on; });
  simStopCollisionRow.classList.toggle('is-disabled', !on);
  simSyncStopsLabel();
  simRender();
  simSyncPlayhead();
  ncSync();
}

/* ---------- Режимы управления и вид ---------- */

function simSetPinned(pinned) {
  simBarEl.classList.toggle('is-pinned', pinned);
  simBarPin.setAttribute('aria-pressed', String(pinned));
  simBarPin.title = pinned ? 'Unpin: hide under the bottom edge' : 'Pin the panel';
  simBarPin.setAttribute('aria-label', simBarPin.title);
  localStorage.setItem(SIM_PIN_KEY, pinned ? '1' : '');
}

function simApplyMode() {
  simDockEl.hidden = !simCompact;
  simHeadActionsEl.hidden = !simCompact;
  simBarEl.hidden = !simVisible || simCompact;
  simClosePops();
}

// Перешли в широкий режим — панель на мгновение показывается, чтобы было видно, куда она ушла
let simPeekTimer = 0;
function simSetCompact(compact) {
  simCompact = compact;
  localStorage.setItem(SIM_COMPACT_KEY, compact ? '1' : '0');
  simApplyMode();
  if (compact) return;
  clearTimeout(simPeekTimer);
  simBarEl.classList.add('is-peek');
  simPeekTimer = setTimeout(() => simBarEl.classList.remove('is-peek'), 1600);
}

function simRebuild() {
  simBuild();
  simBuildTimeline();
  simDirty = false;
  simCollBadge.querySelector('span').textContent = simCollisions.length;
}

document.addEventListener('treeview', (event) => {
  const visible = event.detail.view === 'simulation';
  if (visible === simVisible) return;
  simVisible = visible;
  if (visible) {
    if (simDirty) simRebuild();
    simRender();
    simSyncSpeed();
    simSyncPlayhead();
    simSyncPlaying();
  } else {
    simPause();
    ncClose();
  }
  simApplyMode();
});

// Дерево операций поменялось (добавили операцию) — код пересобираем; на виду — сразу
// параметры операции поменялись — столкновения могли уйти или появиться
document.addEventListener('paramchange', () => {
  simDirty = true;
});

document.addEventListener('treechange', () => {
  simDirty = true;
  if (!simVisible) return;
  simPause();
  ncClose();
  simRebuild();
  simRender();
  simSyncPlayhead();
});

// Стрелки ↑/↓ — шаг по строкам кода, пока на виду симуляция (не в полях и меню)
document.addEventListener('keydown', (event) => {
  if (!simVisible || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
  const target = event.target;
  if (target.closest?.('input, textarea, select, [contenteditable="true"], [role="menu"], [role="listbox"], .simpop')) return;
  if (target !== document.body && !simEl.contains(target) && !simHeadActionsEl.contains(target) && !ncPanelEl.contains(target)) return;
  event.preventDefault();
  simStep(event.key === 'ArrowDown' ? 1 : -1);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (simPopAnchor) simClosePops();
  else if (ncOpen && !ncEditing) ncClose();
});

simSetPinned(localStorage.getItem(SIM_PIN_KEY) === '1');
simSyncStopsLabel();
simSyncSpeed();
simApplyMode();
