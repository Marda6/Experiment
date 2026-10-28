// Inspector и Chat отрываются от колонки. Тянешь за шапку — панель становится плавающим окном:
// его можно двигать по экрану и тянуть за края. Отпустить над левой колонкой — панель вернётся в слот,
// у правого края экрана — встанет в правый док (две панели там делят высоту, как в колонке).
// Клик по шапке: в колонке — как раньше (script.js); в доке — свернуть/развернуть; плавающая — свернуть до шапки.
// Раскладка запоминается.

const DOCK_KEY = 'prototype-panel-dock';
const TEAR_DISTANCE = 6; // сдвиг, после которого нажатие на шапку — уже перетаскивание
const EDGE_ZONE = 48; // полоса у правого края, где отпускание приклеивает панель к доку
const FLOAT_MIN_H = 160;
const FLOAT_DEFAULT_H = 420;
const LAYER_HEAD = parseFloat(getComputedStyle(root).getPropertyValue('--layer-head'));
const LAYERS_GAP = parseFloat(getComputedStyle(root).getPropertyValue('--layers-gap'));

const dock = workspace.querySelector('.dock');
const dockResizer = workspace.querySelector('.dock-resizer');
const dockHint = workspace.querySelector('.dock-hint');
const DETACHABLE = PANEL_ORDER.filter((panel) => panel !== operations);

// Где панель: left — в колонке, right — в доке, float — плавающая (x, y, w, h — от угла workspace)
const placeOf = new Map(DETACHABLE.map((panel) => [panel, { place: 'left', x: 0, y: 0, w: 0, h: 0, collapsed: false }]));
let dockWidth = LAYERS_DEFAULT;
let dockRatio = 0.5; // доля верхней панели дока в свободной высоте
let gesture = null; // press — нажали на шапку; move — тащим панель; size — тянем край
let suppressClick = false; // после перетаскивания отпускание не считается кликом по шапке

const clampTo = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
const dockPanels = () => [...dock.querySelectorAll(':scope > .layer:not([hidden])')]; // спрятанная (script.js) не в счёт

function setPanelOpen(panel, open) {
  panel.classList.toggle('is-expanded', open);
  panel.querySelector('.layer__header').setAttribute('aria-expanded', String(open));
  panel.querySelector('.layer__body').hidden = !open;
}

// Плавающая панель: держим внутри workspace, шапка всегда достижима
function placeFloat(panel) {
  const state = placeOf.get(panel);
  const { clientWidth: width, clientHeight: height } = workspace;
  state.w = clampTo(state.w, LAYERS_MIN, width - LAYERS_INSET * 2);
  state.h = clampTo(state.h, FLOAT_MIN_H, height - LAYERS_INSET * 2);
  state.x = clampTo(state.x, LAYERS_INSET, width - state.w - LAYERS_INSET);
  state.y = clampTo(state.y, LAYERS_INSET, height - LAYER_HEAD - LAYERS_INSET);
  panel.style.left = `${state.x}px`;
  panel.style.top = `${state.y}px`;
  panel.style.width = `${state.w}px`;
  panel.style.height = `${state.h}px`;
  panel.classList.toggle('is-shaded', state.collapsed);
  setPanelOpen(panel, !state.collapsed);
}

function bringToFront(panel) {
  DETACHABLE.forEach((other) => other.classList.toggle('is-front', other === panel));
}

// Правый док: панели сверху вниз, между двумя открытыми — ручка высоты
const dockSplit = document.createElement('div');
dockSplit.className = 'layers__split';
dockSplit.setAttribute('role', 'separator');
dockSplit.setAttribute('aria-orientation', 'horizontal');
dockSplit.setAttribute('aria-label', 'Высота панелей дока');

function renderDock() {
  const docked = dockPanels();
  dock.hidden = !docked.length;
  dockResizer.hidden = !docked.length;
  // ручку не переставляем, если она уже на месте: перестановка снимает захват указателя —
  // при перетаскивании ручка отставала бы от мыши и застревала
  if (docked.length > 1) {
    if (docked[0].nextElementSibling !== dockSplit) docked[0].after(dockSplit);
  } else {
    dockSplit.remove();
  }

  const both = docked.length > 1 && docked.every((panel) => !placeOf.get(panel).collapsed);
  docked.forEach((panel, index) => {
    const open = !placeOf.get(panel).collapsed;
    setPanelOpen(panel, open);
    panel.style.flexGrow = !open ? 0 : !both ? 1 : index === 0 ? dockRatio : 1 - dockRatio;
  });
  dockSplit.classList.toggle('is-active', both);
  dockSplit.tabIndex = both ? 0 : -1;

  // Все панели дока свёрнуты — док ужимается до шапок (название и грип) у правого края, на узком
  // экране нет длинной пустой полосы; развернули — снова своей ширины. Ширину свёрнутому не тянут
  const allCollapsed = docked.length > 0 && docked.every((panel) => placeOf.get(panel).collapsed);
  dock.classList.toggle('is-collapsed', allCollapsed);
  dockResizer.hidden = !docked.length || allCollapsed;

  root.style.setProperty('--dock-width', `${dockWidth}px`);
  dockResizer.setAttribute('aria-valuenow', String(dockWidth));
  // свободная часть сцены сужается справа — полоса функций центрируется по ней
  const occupied = allCollapsed ? dock.offsetWidth : dockWidth;
  workspace.style.setProperty('--free-right', docked.length ? `${LAYERS_INSET + occupied + LAYERS_GAP}px` : '0px');
}

// Переставить панель: left — в колонку, right — в док на место index, float — плавающей
function setPlace(panel, place, index = Infinity) {
  const state = placeOf.get(panel);
  if (panel.parentElement === column) releaseFromColumn(panel);
  panel.classList.remove('is-floating', 'is-shaded');
  ['left', 'top', 'width', 'height'].forEach((property) => panel.style.removeProperty(property));
  state.place = place;

  if (place === 'left') {
    returnToColumn(panel);
  } else if (place === 'right') {
    dock.insertBefore(panel, dockPanels().filter((other) => other !== panel)[index] ?? null);
  } else {
    panel.classList.add('is-floating');
    workspace.append(panel);
    placeFloat(panel);
  }
  renderDock();
}

// Куда встанет панель, если отпустить в точке (x, y) workspace
function zoneAt(x, y, panel) {
  const width = workspace.clientWidth;
  if (x <= LAYERS_INSET + layersWidth + LAYERS_GAP) return { place: 'left' };
  const others = dockPanels().filter((other) => other !== panel);
  const dockLeft = width - LAYERS_INSET - dockWidth - LAYERS_GAP;
  if (x >= width - EDGE_ZONE || (others.length && x >= dockLeft)) {
    return { place: 'right', index: others.length && y < workspace.clientHeight / 2 ? 0 : others.length };
  }
  return null;
}

// Подсказка: рамка там, где панель встанет. В колонке — нижняя половина (под деревом),
// в доке — весь док или половина рядом с уже стоящей панелью
function showHint(zone, panel) {
  dockHint.hidden = !zone;
  if (!zone) return;
  const full = workspace.clientHeight - LAYERS_INSET * 2;
  const half = (full - LAYERS_GAP) / 2;
  let left = LAYERS_INSET;
  let width = layersWidth;
  let top = LAYERS_INSET + half + LAYERS_GAP;
  let height = half;

  if (zone.place === 'right') {
    width = dockWidth;
    left = workspace.clientWidth - LAYERS_INSET - dockWidth;
    const shared = dockPanels().some((other) => other !== panel);
    top = shared && zone.index > 0 ? LAYERS_INSET + half + LAYERS_GAP : LAYERS_INSET;
    height = shared ? half : full;
  }
  Object.assign(dockHint.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
}

function save() {
  const panels = Object.fromEntries(DETACHABLE.map((panel) => [panel.dataset.panel, placeOf.get(panel)]));
  const order = dockPanels().map((panel) => panel.dataset.panel);
  localStorage.setItem(DOCK_KEY, JSON.stringify({ panels, order, dockWidth, dockRatio }));
}

// Оторвать панель: она остаётся под курсором там же, где была; свёрнутая — раскрывается
function startMove(event) {
  const { panel } = gesture;
  const state = placeOf.get(panel);
  const rect = panel.getBoundingClientRect();
  const area = workspace.getBoundingClientRect();
  const grabX = gesture.startX - rect.left;
  const grabY = gesture.startY - rect.top;

  panel.classList.add('is-dragging');
  if (state.place !== 'float') {
    const open = panel.classList.contains('is-expanded');
    Object.assign(state, {
      x: rect.left - area.left,
      y: rect.top - area.top,
      w: rect.width,
      h: open ? rect.height : state.h || FLOAT_DEFAULT_H,
      collapsed: false,
    });
    setPlace(panel, 'float');
  }
  bringToFront(panel);
  gesture = { kind: 'move', panel, grabX: Math.min(grabX, state.w - LAYER_HEAD), grabY, zone: null };
  root.style.setProperty('--drag-cursor', 'grabbing');
  root.classList.add('is-docking');
  suppressClick = true;
}

function movePanel(event) {
  const { panel, grabX, grabY } = gesture;
  const state = placeOf.get(panel);
  const area = workspace.getBoundingClientRect();
  state.x = event.clientX - area.left - grabX;
  state.y = event.clientY - area.top - grabY;
  placeFloat(panel);

  gesture.zone = zoneAt(event.clientX - area.left, event.clientY - area.top, panel);
  showHint(gesture.zone, panel);
  panel.classList.toggle('is-over-dock', Boolean(gesture.zone));
}

function sizePanel(event) {
  const { panel, edge, startX, startY, from } = gesture;
  const state = placeOf.get(panel);
  const dx = event.clientX - startX;
  const dy = event.clientY - startY;
  const { clientWidth: width, clientHeight: height } = workspace;

  if (edge.includes('e')) state.w = clampTo(from.w + dx, LAYERS_MIN, width - LAYERS_INSET - from.x);
  if (edge.includes('s')) state.h = clampTo(from.h + dy, FLOAT_MIN_H, height - LAYERS_INSET - from.y);
  if (edge.includes('w')) {
    state.w = clampTo(from.w - dx, LAYERS_MIN, from.x + from.w - LAYERS_INSET);
    state.x = from.x + from.w - state.w;
  }
  if (edge.includes('n')) {
    state.h = clampTo(from.h - dy, FLOAT_MIN_H, from.y + from.h - LAYERS_INSET);
    state.y = from.y + from.h - state.h;
  }
  placeFloat(panel);
}

window.addEventListener('pointermove', (event) => {
  if (!gesture) return;
  if (gesture.kind === 'press') {
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < TEAR_DISTANCE) return;
    startMove(event);
  }
  if (gesture.kind === 'move') movePanel(event);
  if (gesture.kind === 'size') sizePanel(event);
});

function endGesture() {
  if (!gesture) return;
  const { kind, panel, zone } = gesture;
  gesture = null;
  root.classList.remove('is-docking');
  setTimeout(() => {
    suppressClick = false;
  });
  if (kind === 'press') return;

  panel.classList.remove('is-dragging', 'is-over-dock', 'is-sizing');
  dockHint.hidden = true;
  if (zone) {
    placeOf.get(panel).collapsed = false;
    setPlace(panel, zone.place, zone.index);
  }
  save();
}

window.addEventListener('pointerup', endGesture);
window.addEventListener('pointercancel', endGesture);

// Края плавающей панели: тянуть — менять размер. У свёрнутой — только ширина
const EDGE_CURSORS = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize',
};

DETACHABLE.forEach((panel) => {
  const header = panel.querySelector('.layer__header');

  header.addEventListener('pointerdown', (event) => {
    if (event.button === 0) gesture = { kind: 'press', panel, startX: event.clientX, startY: event.clientY };
  });

  // перетаскивание закончилось над шапкой — это не клик (ловим до обработчиков самой шапки)
  panel.addEventListener('click', (event) => {
    if (!suppressClick || !event.target.closest('.layer__header')) return;
    event.stopPropagation();
    event.preventDefault();
  }, true);

  header.addEventListener('click', () => {
    const state = placeOf.get(panel);
    if (state.place === 'left') return;
    state.collapsed = !state.collapsed;
    if (state.place === 'right') renderDock();
    else placeFloat(panel);
    save();
  });

  panel.addEventListener('pointerdown', () => {
    if (placeOf.get(panel).place === 'float') bringToFront(panel);
  }, true);

  Object.keys(EDGE_CURSORS).forEach((edge) => {
    const handle = document.createElement('div');
    handle.className = `float-edge float-edge--${edge}`;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const { x, y, w, h } = placeOf.get(panel);
      gesture = { kind: 'size', panel, edge, startX: event.clientX, startY: event.clientY, from: { x, y, w, h } };
      panel.classList.add('is-sizing');
      root.style.setProperty('--drag-cursor', EDGE_CURSORS[edge]);
      root.classList.add('is-docking');
    });
    panel.append(handle);
  });
});

// Ширина дока: как у колонки — тянуть, стрелки ←/→, двойной клик — сброс
let dockDrag = null;

function setDockWidth(width) {
  const max = Math.min(LAYERS_MAX, workspace.clientWidth - LAYERS_INSET * 2);
  dockWidth = Math.round(clampTo(width, LAYERS_MIN, max));
  renderDock();
}

dockResizer.setAttribute('aria-valuemin', String(LAYERS_MIN));
dockResizer.setAttribute('aria-valuemax', String(LAYERS_MAX));

dockResizer.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dockDrag = { startX: event.clientX, startWidth: dockWidth };
  dockResizer.setPointerCapture(event.pointerId);
  root.classList.add('is-resizing');
});

dockResizer.addEventListener('pointermove', (event) => {
  if (dockDrag) setDockWidth(dockDrag.startWidth - (event.clientX - dockDrag.startX));
});

function endDockDrag() {
  if (!dockDrag) return;
  dockDrag = null;
  root.classList.remove('is-resizing');
  save();
}

dockResizer.addEventListener('pointerup', endDockDrag);
dockResizer.addEventListener('pointercancel', endDockDrag);

dockResizer.addEventListener('dblclick', () => {
  setDockWidth(LAYERS_DEFAULT);
  save();
});

dockResizer.addEventListener('keydown', (event) => {
  const step = { ArrowLeft: LAYERS_KEY_STEP, ArrowRight: -LAYERS_KEY_STEP }[event.key];
  if (!step) return;
  event.preventDefault();
  setDockWidth(dockWidth + step);
  save();
});

// Высота панелей дока: тянуть, стрелки ↑/↓, двойной клик — пополам
let dockSplitDrag = null;

function setDockTopHeight(height) {
  const space = dock.clientHeight - dockSplit.offsetHeight;
  dockRatio = (clampTo(height, SPLIT_MIN, space - SPLIT_MIN) - LAYER_HEAD) / (space - LAYER_HEAD * 2);
  renderDock();
}

const dockTopHeight = () => dockPanels()[0].getBoundingClientRect().height;

dockSplit.addEventListener('pointerdown', (event) => {
  if (!dockSplit.classList.contains('is-active') || event.button !== 0) return;
  dockSplitDrag = { startY: event.clientY, startHeight: dockTopHeight() };
  dockSplit.setPointerCapture(event.pointerId);
  root.classList.add('is-splitting');
});

dockSplit.addEventListener('pointermove', (event) => {
  if (dockSplitDrag) setDockTopHeight(dockSplitDrag.startHeight + event.clientY - dockSplitDrag.startY);
});

function endDockSplitDrag() {
  if (!dockSplitDrag) return;
  dockSplitDrag = null;
  root.classList.remove('is-splitting');
  save();
}

dockSplit.addEventListener('pointerup', endDockSplitDrag);
dockSplit.addEventListener('pointercancel', endDockSplitDrag);

dockSplit.addEventListener('dblclick', () => {
  dockRatio = 0.5;
  renderDock();
  save();
});

dockSplit.addEventListener('keydown', (event) => {
  const step = { ArrowUp: -SPLIT_KEY_STEP, ArrowDown: SPLIT_KEY_STEP }[event.key];
  if (!step || !dockSplit.classList.contains('is-active')) return;
  event.preventDefault();
  setDockTopHeight(dockTopHeight() + step);
  save();
});

// Окно изменилось — плавающие панели и док остаются в пределах экрана
window.addEventListener('resize', () => {
  DETACHABLE.filter((panel) => placeOf.get(panel).place === 'float').forEach(placeFloat);
  setDockWidth(dockWidth);
});

// Восстановить раскладку без анимации: сначала док в сохранённом порядке, потом плавающие
function restoreDocking() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(DOCK_KEY));
  } catch {
    saved = null;
  }
  if (!saved?.panels) return;

  dockWidth = saved.dockWidth ?? dockWidth;
  dockRatio = saved.dockRatio ?? dockRatio;
  const rank = (panel) => (saved.order ?? []).indexOf(panel.dataset.panel);

  root.classList.add('is-still');
  [...DETACHABLE]
    .sort((a, b) => rank(a) - rank(b))
    .forEach((panel) => {
      const state = saved.panels[panel.dataset.panel];
      if (!state || state.place === 'left') return;
      Object.assign(placeOf.get(panel), state, { place: 'left' });
      setPlace(panel, state.place);
    });
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('is-still')));
}

restoreDocking();
renderDock();
document.addEventListener('panelvisibility', renderDock);
