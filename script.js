const root = document.documentElement;

// Меню логотипа: выбор темы. Закрывается логотипом, кликом мимо и Escape; ↑/↓ — по пунктам
const logoButton = document.querySelector('.logo');
const menu = document.getElementById('app-menu');
const themeItems = [...menu.querySelectorAll('[data-theme-value]')];

function setMenuOpen(open) {
  menu.hidden = !open;
  logoButton.setAttribute('aria-expanded', String(open));
  logoButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  if (open) (themeItems.find((item) => item.getAttribute('aria-checked') === 'true') ?? themeItems[0]).focus();
}

logoButton.addEventListener('click', () => setMenuOpen(menu.hidden));

document.addEventListener('pointerdown', (event) => {
  if (!menu.hidden && !menu.contains(event.target) && !logoButton.contains(event.target)) setMenuOpen(false);
});

menu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setMenuOpen(false);
    logoButton.focus();
    return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const index = themeItems.indexOf(document.activeElement);
  themeItems[(index + step + themeItems.length) % themeItems.length].focus();
});

// Темы: data-theme на <html>, выбор запоминается. 3D-сцена слушает событие themechange.
// Custom и Custom Dark — из акцента: их цвета ставит applyCustomPalette (accent.js)
const THEME_KEY = 'prototype-theme';

function applyTheme(name) {
  const theme = themeItems.some((item) => item.dataset.themeValue === name) ? name : 'stone';
  root.dataset.theme = theme;
  applyCustomPalette(theme);
  themeItems.forEach((item) => item.setAttribute('aria-checked', String(item.dataset.themeValue === theme)));
  localStorage.setItem(THEME_KEY, theme);
  document.dispatchEvent(new CustomEvent('themechange'));
}

themeItems.forEach((item) => item.addEventListener('click', () => applyTheme(item.dataset.themeValue)));
applyTheme(root.dataset.theme);

// Кнопки окна (как в ENCY). В браузере «развернуть» — полноэкранный режим;
// свернуть и закрыть окно страница не может — эти кнопки пока только на вид
const maximizeButton = document.querySelector('[data-window-action="maximize"]');

maximizeButton.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else root.requestFullscreen?.();
});

document.addEventListener('fullscreenchange', () => {
  const label = document.fullscreenElement ? 'Restore' : 'Maximize';
  maximizeButton.title = label;
  maximizeButton.setAttribute('aria-label', label);
});

// Колонка панелей: сверху дерево Operations, ниже слот для Inspector или Chat.
// — Шапка Operations: дерево ↔ режим одной операции.
// — Шапка Inspector/Chat: открыть её в слоте (вместо другой) или свернуть.
// Три режима: дерево + панель (по умолчанию), одна операция + панель, только дерево.
// Что-то одно открыто всегда. Между деревом и панелью — ручка высоты.
// Inspector и Chat можно вынуть из колонки (docking.js) — панель уходит вместе со своей ручкой над ней
const column = document.querySelector('.layers');
const PANEL_ORDER = [...column.querySelectorAll(':scope > .layer')]; // исходный порядок в колонке
const operations = column.querySelector('.layer--operations');
const splitOf = new Map(PANEL_ORDER.slice(1).map((panel) => [panel, panel.previousElementSibling]));
const splits = [...splitOf.values()];

// Спрятанная панель (Inspector в виде Model — model.js) не занимает места и не делит высоту
const columnPanels = () => PANEL_ORDER.filter((panel) => panel.parentElement === column && !panel.hidden);
const columnSplits = () => splits.filter((split) => split.parentElement === column && !split.hidden);

const SPLIT_MIN = 96; // минимальная высота дерева и панели при делении
const SPLIT_KEY_STEP = 16;

let treeOpen = true;
let slotPanel = column.querySelector('.layer--inspector'); // открытая в слоте; null — свёрнуты
let lastPanel = slotPanel; // её откроем, если дерево свернули, а слот пуст
let treeHeight = null; // высота дерева при делении, px; null — пополам

const basisOf = (panel) => parseFloat(getComputedStyle(panel).flexBasis);

// Высота, которую делят дерево и панель: колонка минус зазоры и свёрнутые панели
function splitSpace() {
  const collapsed = columnPanels()
    .filter((panel) => panel !== operations && panel !== slotPanel)
    .reduce((sum, panel) => sum + basisOf(panel), 0);
  const gaps = columnSplits().reduce((sum, split) => sum + split.offsetHeight, 0);
  return column.clientHeight - gaps - collapsed;
}

const clampTree = (height, space) => Math.min(Math.max(height, SPLIT_MIN), space - SPLIT_MIN);

function currentTreeHeight(space = splitSpace()) {
  return clampTree(treeHeight ?? space / 2, space);
}

function render() {
  const isSplit = treeOpen && slotPanel;
  let ratio = 1;

  if (isSplit) {
    // доля дерева в свободном месте сверх свёрнутых высот — так flex-grow даёт нужную высоту
    const space = splitSpace();
    const free = space - basisOf(operations) - basisOf(slotPanel);
    ratio = (currentTreeHeight(space) - basisOf(operations)) / free;
  }

  const panels = columnPanels();
  panels.forEach((panel) => {
    const expanded = panel === operations ? treeOpen : panel === slotPanel;
    panel.classList.toggle('is-expanded', expanded);
    panel.querySelector('.layer__header')?.setAttribute('aria-expanded', String(expanded)); // у первой панели шапки-кнопки нет
    const body = panel.querySelector('.layer__body');
    if (body) body.hidden = !expanded;

    let grow = 0;
    if (expanded) grow = !isSplit ? 1 : panel === operations ? ratio : 1 - ratio;
    panel.style.flexGrow = grow;
  });

  // Ручка активна в зазорах между деревом и открытой панелью
  const lowerIndex = panels.indexOf(slotPanel);
  columnSplits().forEach((split, index) => {
    // в режиме одной операции ручка под ней тоже тянется — вниз разворачивает дерево
    const unfolds = index === 0 && !treeOpen && Boolean(slotPanel) && operations.dataset.view === 'operations';
    const active = (Boolean(isSplit) && index < lowerIndex) || unfolds;
    split.classList.toggle('is-active', active);
    split.classList.toggle('is-fold', index === 0); // сразу под деревом: до упора вверх / двойной клик — одна операция
    split.title = index === 0 ? 'Drag up to the end or double-click: single operation' : '';
    split.tabIndex = active ? 0 : -1;
    split.setAttribute('aria-hidden', String(!active));
    if (active) split.setAttribute('aria-valuenow', String(Math.round(treeOrSingleHeight())));
  });
}

function toggleTree() {
  if (treeOpen) {
    treeOpen = false;
    slotPanel ??= lastPanel; // в колонке не осталось панелей — дерево сворачивается в одну операцию
  } else {
    treeOpen = true;
  }
  render();
}

function togglePanel(panel) {
  if (slotPanel === panel) {
    slotPanel = null;
    treeOpen = true;
  } else {
    slotPanel = panel;
    lastPanel = panel;
  }
  render();
}

// Дерево ↔ одна операция — двойной клик по разделителю сразу под деревом (ниже) и шестерёнка (tree-tools.js)

// Шапки панелей вне колонки (справа, плавающие) обрабатывает docking.js
PANEL_ORDER
  .filter((panel) => panel !== operations)
  .forEach((panel) => panel.querySelector('.layer__header').addEventListener('click', () => {
    if (panel.parentElement === column) togglePanel(panel);
  }));

// Вынуть панель из колонки: открытой была она — дерево забирает всю высоту
function releaseFromColumn(panel) {
  splitOf.get(panel).remove();
  panel.remove();
  if (slotPanel === panel) {
    slotPanel = null;
    treeOpen = true;
  }
  if (lastPanel === panel) lastPanel = columnPanels().find((other) => other !== operations) ?? null;
  render();
}

// Спрятать панель целиком — вместе с ручкой над ней. Была открыта в слоте — дерево забирает высоту,
// а когда панель вернётся, она снова откроется в слоте. Правый док узнаёт по событию panelvisibility
let slotBeforeHide = null;

function setPanelHidden(panel, hidden) {
  if (panel.hidden === hidden) return;
  panel.hidden = hidden;
  splitOf.get(panel).hidden = hidden;

  if (hidden && slotPanel === panel) {
    slotBeforeHide = panel;
    slotPanel = null;
    treeOpen = true;
  }
  if (hidden && lastPanel === panel) lastPanel = columnPanels().find((other) => other !== operations) ?? null;
  if (!hidden && slotBeforeHide === panel) {
    slotBeforeHide = null;
    if (panel.parentElement === column) {
      slotPanel = panel;
      lastPanel = panel;
    }
  }
  render();
  document.dispatchEvent(new CustomEvent('panelvisibility', { detail: { panel, hidden } }));
}

// Вернуть в колонку — на своё место по исходному порядку и открытой в слоте
function returnToColumn(panel) {
  const next = PANEL_ORDER.slice(PANEL_ORDER.indexOf(panel) + 1).find((other) => other.parentElement === column);
  (next ? splitOf.get(next) : column.querySelector('.addmenu')).before(splitOf.get(panel), panel);
  slotPanel = panel;
  lastPanel = panel;
  render();
}

render();

// Клик по текущей операции — раскрыть дерево и, когда оно развернётся, прокрутить к выделенной строке
function scrollToSelected(event) {
  // transitionend всплывает и от дерева (opacity) — ждём именно раскрытия панели
  if (event.target !== operations || event.propertyName !== 'flex-grow') return;
  operations.removeEventListener('transitionend', scrollToSelected);

  const tree = operations.querySelector('.tree');
  const row = tree.querySelector('.tree__item[aria-selected="true"] > .tree__row');
  if (!row) return;
  const offset = row.getBoundingClientRect().top - tree.getBoundingClientRect().top;
  tree.scrollTop += offset - (tree.clientHeight - row.offsetHeight) / 2;
}

operations.querySelector('.current__info').addEventListener('click', () => {
  treeOpen = true;
  render();
  operations.addEventListener('transitionend', scrollToSelected);
});

// Ручка высоты: тянуть мышью, стрелки ↑/↓ с фокусом на ручке. Ручка сразу под деревом (в виде Operations):
// дотянули дерево до минимума и дальше — режим одной операции, из него вниз — снова дерево;
// двойной клик — дерево ↔ одна операция
const FOLD_SNAP = 16; // запас за порогом, чтобы режимы не мигали на границе
let splitDrag = null;

function setTreeHeight(height) {
  treeHeight = clampTree(height, splitSpace());
  render();
}

// Высота дерева, которую просят ручкой: ниже минимума с запасом — одна операция;
// из одной операции — ниже её блока с запасом — снова дерево этой высоты
function dragTreeTo(height) {
  if (treeOpen && operations.dataset.view === 'operations' && height <= SPLIT_MIN - FOLD_SNAP) {
    treeOpen = false;
    render();
    return;
  }
  if (!treeOpen) {
    if (height < basisOf(operations) + FOLD_SNAP) return;
    treeOpen = true;
  }
  setTreeHeight(height);
}

// объявлена функцией: render() зовёт её ещё до этого места при загрузке
function treeOrSingleHeight() {
  return treeOpen ? currentTreeHeight() : basisOf(operations);
}

function endSplitDrag() {
  splitDrag = null;
  root.classList.remove('is-splitting');
}

splits.forEach((split) => {
  split.addEventListener('pointerdown', (event) => {
    if (!split.classList.contains('is-active') || event.button !== 0) return;
    splitDrag = { startY: event.clientY, startHeight: treeOrSingleHeight() };
    split.setPointerCapture(event.pointerId);
    root.classList.add('is-splitting');
  });

  split.addEventListener('pointermove', (event) => {
    if (splitDrag) dragTreeTo(splitDrag.startHeight + event.clientY - splitDrag.startY);
  });

  split.addEventListener('pointerup', endSplitDrag);
  split.addEventListener('pointercancel', endSplitDrag);

  split.addEventListener('dblclick', () => {
    if (split !== columnSplits()[0] || operations.dataset.view !== 'operations') return;
    toggleTree();
  });

  split.addEventListener('keydown', (event) => {
    const step = { ArrowUp: -SPLIT_KEY_STEP, ArrowDown: SPLIT_KEY_STEP }[event.key];
    if (!step || !split.classList.contains('is-active')) return;
    event.preventDefault();
    dragTreeTo(treeOrSingleHeight() + step);
  });
});

// Ширина колонки: дерево и все панели берут одну переменную --layers-width.
// Тянуть мышью, стрелки ←/→ с фокусом на ручке, двойной клик — сброс.
const workspace = document.querySelector('.workspace');
const resizer = document.querySelector('.layers-resizer');

const LAYERS_MIN = 240;
const LAYERS_MAX = 720;
const LAYERS_KEY_STEP = 16;
const LAYERS_DEFAULT = parseFloat(getComputedStyle(root).getPropertyValue('--layers-width'));
const LAYERS_INSET = parseFloat(getComputedStyle(root).getPropertyValue('--layers-inset'));

let layersWidth = LAYERS_DEFAULT;
let drag = null;

function setLayersWidth(width) {
  const max = Math.min(LAYERS_MAX, workspace.clientWidth - LAYERS_INSET * 2);
  layersWidth = Math.round(Math.min(Math.max(width, LAYERS_MIN), max));
  root.style.setProperty('--layers-width', `${layersWidth}px`);
  resizer.setAttribute('aria-valuenow', String(layersWidth));
}

resizer.setAttribute('aria-valuemin', String(LAYERS_MIN));
resizer.setAttribute('aria-valuemax', String(LAYERS_MAX));
setLayersWidth(LAYERS_DEFAULT);

resizer.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  drag = { startX: event.clientX, startWidth: layersWidth };
  resizer.setPointerCapture(event.pointerId);
  root.classList.add('is-resizing');
});

resizer.addEventListener('pointermove', (event) => {
  if (drag) setLayersWidth(drag.startWidth + event.clientX - drag.startX);
});

function endDrag() {
  drag = null;
  root.classList.remove('is-resizing');
}

resizer.addEventListener('pointerup', endDrag);
resizer.addEventListener('pointercancel', endDrag);
resizer.addEventListener('dblclick', () => setLayersWidth(LAYERS_DEFAULT));

resizer.addEventListener('keydown', (event) => {
  const step = { ArrowLeft: -LAYERS_KEY_STEP, ArrowRight: LAYERS_KEY_STEP }[event.key];
  if (!step) return;
  event.preventDefault();
  setLayersWidth(layersWidth + step);
});

// Окно изменилось — колонка не должна вылезать за view, деление высоты пересчитываем
window.addEventListener('resize', () => {
  setLayersWidth(layersWidth);
  render();
});
