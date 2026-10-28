// Действия над деревом операций. В шапке — сброс статусов, Calculate и сплит-кнопка Add, под шапкой —
// поиск и раскрыть/свернуть всё. Calculate и сброс действуют на выделенный узел (операция или установ целиком),
// без выделения — на всё дерево. Иконки — из ENCY (tb-calc, tb-plus, icn/reset), цвета из темы.
// tree, operationItems, selectedItem, selectItem, renderNode, setStatus, refreshBranchStatuses,
// refreshOperationIndex, nameOf, OPERATION_POOLS, OPERATION_TOOLS — из tree.js

const calcButton = document.querySelector('.bar-btn--calc');
const calcPercent = calcButton.querySelector('.calc-label--pct');
const calcRing = calcButton.querySelector('.calc-ring');
const addButton = document.querySelector('.bar-btn--add'); // + — добавить операцию последнего типа
const moreButton = document.querySelector('.bar-btn--add + .bar-btn--more'); // ▾ — меню типов
const addMenu = document.getElementById('addmenu');
const searchInput = document.querySelector('.layer--operations > .tree-tools .tree-search__input');
const searchCount = document.querySelector('.layer--operations > .tree-tools .tree-search__count');
const searchClear = document.querySelector('.layer--operations > .tree-tools .tree-search__clear');

// Проект изменился — вкладка в header помечается «не сохранено» (projects.js)
const markProjectChanged = () => document.dispatchEvent(new CustomEvent('projectchange'));

function scopeOperations() {
  if (!selectedItem) return operationItems;
  if (!selectedItem.classList.contains('tree__item--branch')) return [selectedItem];
  return [...selectedItem.querySelectorAll('.tree__item:not(.tree__item--branch)')];
}

// Строка вне видимой части дерева — прокручиваем к ней (если дерево раскрыто)
function scrollRowIntoView(item) {
  const row = item.querySelector(':scope > .tree__row');
  const view = tree.getBoundingClientRect();
  const rect = row.getBoundingClientRect();
  if (!view.height || (rect.top >= view.top && rect.bottom <= view.bottom)) return;
  tree.scrollTop += rect.top - view.top - (view.height - rect.height) / 2;
}

/* ---------- Calculate: шаги статуса ENCY — половина круга → полный → готово (или ошибка: calcResultOf, toolpaths.js) ---------- */

const CALC_PENDING = ['not-calculated', 'calculated', 'progress-1', 'progress-2'];
const CALC_KEEP = ['error', 'warning', 'warning-outline']; // ошибки и предупреждения правит пользователь
const CALC_STEPS = ['progress-1', 'progress-2', 'done'];
const CALC_TOTAL_MS = 6000; // весь расчёт укладывается примерно в 6 секунд…
const CALC_STEP_MS = [15, 120]; // …но шаг не быстрее 15 и не медленнее 120 мс — одну операцию видно

let calcRun = null; // { queue, total, current, stage, step, timer }

// Доля пройденных шагов: готовые операции целиком плюс шаги текущей
function calcProgress(run) {
  const finished = run.total - run.queue.length - (run.current ? 1 : 0);
  return (finished * CALC_STEPS.length + (run.current ? run.stage : 0)) / (run.total * CALC_STEPS.length);
}

// Пока считает — кольцо и проценты; наведение или фокус — ■ Stop (CSS)
function setCalcUi(running) {
  calcButton.classList.toggle('is-running', running);
  const percent = running ? Math.floor(calcProgress(calcRun) * 100) : 0;
  calcPercent.textContent = `${percent}%`;
  calcRing.style.strokeDasharray = `${percent} 100`;
  calcButton.title = running ? `Stop calculation (${percent}%)` : 'Calculate toolpaths of the selected node';
}

function stopCalc() {
  if (!calcRun) return;
  clearTimeout(calcRun.timer);
  // прерванная операция остаётся не рассчитанной
  if (calcRun.current) setStatus(calcRun.current, 'not-calculated');
  refreshBranchStatuses();
  calcRun = null;
  setCalcUi(false);
}

function calcStep() {
  const run = calcRun;
  if (!run.current) {
    run.current = run.queue.shift();
    run.stage = 0;
  }

  // последний шаг — итог расчёта: траектория со столкновением — ошибка
  const last = run.stage === CALC_STEPS.length - 1;
  setStatus(run.current, last ? calcResultOf(run.current) : CALC_STEPS[run.stage]);
  refreshBranchStatuses();
  run.stage += 1;

  if (run.stage === CALC_STEPS.length) {
    run.current = null;
    if (!run.queue.length) {
      calcRun = null;
      setCalcUi(false);
      markProjectChanged();
      return;
    }
  }
  setCalcUi(true);
  run.timer = setTimeout(calcStep, run.step);
}

function startCalc() {
  const scope = scopeOperations();
  let queue = scope.filter((item) => CALC_PENDING.includes(item.dataset.status));
  // всё уже посчитано — пересчитываем заново
  if (!queue.length) queue = scope.filter((item) => !CALC_KEEP.includes(item.dataset.status));
  if (!queue.length) return;

  const step = Math.min(Math.max(CALC_TOTAL_MS / (queue.length * CALC_STEPS.length), CALC_STEP_MS[0]), CALC_STEP_MS[1]);
  calcRun = { queue, total: queue.length, current: null, stage: 0, step, timer: null };
  calcStep();
}

calcButton.addEventListener('click', () => (calcRun ? stopCalc() : startCalc()));

/* ---------- Add: + — последний выбранный тип, ▾ — меню типов операций по группам ---------- */

let lastAddType = { base: 'Face milling', group: 'Roughing' };

function setLastAddType(base, group) {
  lastAddType = { base, group };
  addButton.title = `Add operation: ${base}`;
  addButton.setAttribute('aria-label', `Add operation: ${base}`);
}

addButton.addEventListener('click', () => addOperation(lastAddType.base, lastAddType.group));

const addOptions = [];

Object.entries(OPERATION_POOLS).forEach(([group, operations]) => {
  const section = document.createElement('div');
  section.className = 'addmenu__group';
  section.setAttribute('role', 'group');
  section.setAttribute('aria-label', group);

  const heading = document.createElement('div');
  heading.className = 'addmenu__heading';
  heading.setAttribute('aria-hidden', 'true');
  heading.textContent = group;
  section.append(heading);

  operations.forEach((base) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'addmenu__item';
    option.setAttribute('role', 'menuitem');
    option.innerHTML = '<span class="addmenu__name"></span><span class="addmenu__tool"></span>';
    option.querySelector('.addmenu__name').textContent = base;
    option.querySelector('.addmenu__tool').textContent = OPERATION_TOOLS[base][0];
    option.addEventListener('click', () => {
      setAddMenuOpen(false);
      setLastAddType(base, group);
      addOperation(base, group);
    });
    addOptions.push(option);
    section.append(option);
  });

  addMenu.append(section);
});

function setAddMenuOpen(open) {
  addMenu.hidden = !open;
  moreButton.setAttribute('aria-expanded', String(open));
  if (open) (addOptions.find((option) => option.querySelector('.addmenu__name').textContent === lastAddType.base) ?? addOptions[0]).focus();
}

moreButton.addEventListener('click', () => setAddMenuOpen(addMenu.hidden));

addMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setAddMenuOpen(false);
    moreButton.focus();
    return;
  }
  const index = addOptions.indexOf(document.activeElement);
  const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: addOptions.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  addOptions[Math.min(Math.max(next, 0), addOptions.length - 1)].focus();
});

document.addEventListener('pointerdown', (event) => {
  if (!addMenu.hidden && !addMenu.contains(event.target) && !moreButton.contains(event.target)) setAddMenuOpen(false);
});

// Новая операция — после выделенной; если выделен установ — в его конец; иначе в конец первого установа
function addOperation(base, group) {
  let after = null;
  let list;
  if (selectedItem && !selectedItem.classList.contains('tree__item--branch')) {
    after = selectedItem;
    list = selectedItem.parentElement;
  } else {
    const setup = selectedItem?.getAttribute('aria-level') === '2' ? selectedItem : tree.querySelector('.tree__item[aria-level="2"]');
    list = setup.querySelector(':scope > .tree__group');
  }

  // Имя без повторов внутри установа: Face milling → Face milling 6
  const setupItem = list.closest('.tree__item');
  const same = [...setupItem.querySelectorAll('.tree__item:not(.tree__item--branch)')]
    .filter((item) => nameOf(item) === base || nameOf(item).startsWith(`${base} `)).length;

  const node = { name: same ? `${base} ${same + 1}` : base, type: base, group, tool: OPERATION_TOOLS[base], status: 'not-calculated' };
  const item = renderNode(node, Number(setupItem.getAttribute('aria-level')));
  if (after) after.after(item);
  else list.append(item);

  refreshBranchStatuses();
  refreshOperationIndex();
  selectItem(item, { reveal: true });
  scrollRowIntoView(item);
  markProjectChanged();
}

/* ---------- Поиск: по названию, T-номеру и названию инструмента ---------- */

function applySearch() {
  const query = searchInput.value.trim().toLowerCase();
  searchClear.hidden = !query;
  tree.classList.toggle('is-filtering', Boolean(query));

  if (!query) {
    tree.querySelectorAll('.is-filtered-out').forEach((item) => item.classList.remove('is-filtered-out'));
    searchCount.textContent = '';
    return;
  }

  let matches = 0;
  operationItems.forEach((item) => {
    const text = `${nameOf(item)} ${item.dataset.tool} ${item.dataset.toolName}`.toLowerCase();
    const hit = text.includes(query);
    item.classList.toggle('is-filtered-out', !hit);
    if (hit) matches += 1;
  });

  // ветки без совпадений внутри прячем
  tree.querySelectorAll('.tree__item--branch').forEach((branch) => {
    const visible = branch.querySelector('.tree__item:not(.tree__item--branch):not(.is-filtered-out)');
    branch.classList.toggle('is-filtered-out', !visible);
  });
  searchCount.textContent = String(matches);
}

function clearSearch() {
  searchInput.value = '';
  applySearch();
}

searchInput.addEventListener('input', applySearch);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') clearSearch();
});
searchClear.addEventListener('click', () => {
  clearSearch();
  searchInput.focus();
});

document.addEventListener('treechange', applySearch);

/* ---------- Свернуть / раскрыть всё (одна кнопка), сброс статусов ---------- */

const foldButton = document.querySelector('.layer--operations > .tree-tools .tool-btn--fold');

// Раскрыт хоть один установ — кнопка сворачивает, иначе раскрывает
const anySetupOpen = () => Boolean(tree.querySelector('.tree__item[aria-level="2"][aria-expanded="true"]'));

function syncFoldButton() {
  const collapsed = !anySetupOpen();
  const label = collapsed ? 'Expand all' : 'Collapse all';
  foldButton.classList.toggle('is-collapsed', collapsed);
  foldButton.title = label;
  foldButton.setAttribute('aria-label', label);
}

function setAllExpanded(expanded) {
  tree.querySelectorAll('.tree__item--branch').forEach((branch) => {
    const open = expanded || branch.getAttribute('aria-level') === '1'; // станок всегда раскрыт
    branch.setAttribute('aria-expanded', String(open));
    branch.querySelector(':scope > .tree__group').hidden = !open;
  });
}

function resetStatuses() {
  stopCalc();
  scopeOperations().forEach((item) => setStatus(item, 'not-calculated'));
  refreshBranchStatuses();
  markProjectChanged();
}

const TREE_ACTIONS = {
  fold: () => {
    setAllExpanded(!anySetupOpen());
    syncFoldButton();
  },
  reset: resetStatuses,
};

// ветки раскрывают и вручную (треугольник, выбор из списка) — иконка следит за деревом
tree.addEventListener('click', syncFoldButton);
document.addEventListener('treeselect', syncFoldButton);
syncFoldButton();

document.querySelectorAll('[data-tree-action]').forEach((button) => {
  button.addEventListener('click', () => TREE_ACTIONS[button.dataset.treeAction]());
});

/* ---------- Сортировка и связи подвода/отвода — в ряду поиска (строка Sort · Approach/Return в ENCY) ---------- */

const sortButton = document.querySelector('.layer--operations > .tree-tools .tree-sort');
const linksButton = document.querySelector('.layer--operations > .tree-tools .tree-links');

// Сортировка меняет только показ внутри установа (CSS order): нумерация, листалка и расчёт — в порядке программы
const TREE_SORTS = [
  { id: 'program', name: 'Program order' },
  { id: 'name', name: 'Name' },
  { id: 'tool', name: 'Tool' },
  { id: 'status', name: 'Status' },
];
const toolNumber = (item) => Number(item.dataset.tool?.slice(1)) || 0;
const TREE_SORT_COMPARE = {
  name: (a, b) => nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true }),
  tool: (a, b) => toolNumber(a) - toolNumber(b),
  status: (a, b) => STATUS_ORDER.indexOf(a.dataset.status) - STATUS_ORDER.indexOf(b.dataset.status), // ошибки — первыми
};
let treeSort = 'program';

function applyTreeSort() {
  tree.classList.toggle('is-sorted', treeSort !== 'program');
  tree.querySelectorAll('.tree__item[aria-level="2"] > .tree__group').forEach((group) => {
    const items = [...group.children];
    if (treeSort === 'program') {
      items.forEach((item) => item.style.removeProperty('order'));
      return;
    }
    // сортировка устойчивая: при равенстве — порядок программы
    [...items].sort(TREE_SORT_COMPARE[treeSort]).forEach((item, rank) => { item.style.order = rank; });
  });
  const sort = TREE_SORTS.find((option) => option.id === treeSort);
  sortButton.title = `Sort: ${sort.name}`;
  sortButton.classList.toggle('is-active', treeSort !== 'program');
}

// новые операции встают по текущей сортировке
document.addEventListener('treechange', applyTreeSort);

// Связи подвода/отвода между операциями: линия между их статусами, как в ENCY. Auto — подвод/отвод
// считаются сами (иконка связи — акцентом). При сортировке не по программе линии прячутся — соседи случайные
let linksAuto = true;
let linksOn = true;

function syncLinks() {
  tree.classList.toggle('is-linked', linksOn);
  linksButton.classList.toggle('is-auto', linksAuto);
  linksButton.title = `Approach/Return: ${linksAuto ? 'Auto' : 'Manual'}${linksOn ? '' : ' · links removed'}`;
}

// Выпадающие списки — под кнопкой, от её левого края; Esc и клик мимо закрывают
const treeMenu = document.createElement('div');
treeMenu.className = 'treemenu';
treeMenu.setAttribute('role', 'menu');
treeMenu.hidden = true;
document.body.append(treeMenu);
let treeMenuOwner = null;

function closeTreeMenu() {
  treeMenu.hidden = true;
  treeMenuOwner?.setAttribute('aria-expanded', 'false');
  treeMenuOwner = null;
}

function openTreeMenu(owner, rows) {
  const same = treeMenuOwner === owner;
  closeTreeMenu();
  if (same) return;
  treeMenu.replaceChildren(...rows);
  treeMenu.hidden = false;
  treeMenuOwner = owner;
  owner.setAttribute('aria-expanded', 'true');
  const rect = owner.getBoundingClientRect();
  treeMenu.style.top = `${rect.bottom + 4}px`;
  treeMenu.style.left = `${Math.min(rect.left, innerWidth - treeMenu.offsetWidth - 8)}px`;
  treeMenu.querySelector('button')?.focus();
}

function treeMenuItem(label, { icon = '', current = false, onPick, keepOpen = false } = {}) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'viewmenu__item treemenu__item';
  item.setAttribute('role', 'menuitem');
  if (current) item.setAttribute('aria-selected', 'true');
  item.innerHTML = `${icon}<span class="viewmenu__name"></span>`;
  item.querySelector('.viewmenu__name').textContent = label;
  item.addEventListener('click', () => {
    onPick?.(item);
    if (!keepOpen) {
      const owner = treeMenuOwner;
      closeTreeMenu();
      owner?.focus();
    }
  });
  return item;
}

sortButton.addEventListener('click', () => openTreeMenu(sortButton, TREE_SORTS.map((option) => treeMenuItem(option.name, {
  current: option.id === treeSort,
  onPick: () => {
    treeSort = option.id;
    applyTreeSort();
  },
}))));

// ENCY fig-appr1 / fig-appr2: связать — связь акцентом; снять связи — красный крестик
const LINK_ROW_ICON = '<svg class="treemenu__icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><rect x="6.5" y="7.5" width="6" height="4" rx="1.5" stroke="currentColor"/><rect x="6.5" y="16.5" width="6" height="4" rx="1.5" stroke="currentColor"/><path d="M17 12 14 9.5 17 7z" fill="var(--accent)"/><path d="M18 9.5h1.5c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2h-5" stroke="var(--accent)"/></svg>';
const UNLINK_ROW_ICON = '<svg class="treemenu__icon" viewBox="0 0 28 28" fill="none" aria-hidden="true"><path d="M9 12 6 9.5 9 7z" fill="currentColor"/><path d="M10 9.5h1.5c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2h-5" stroke="currentColor"/><path d="M18 16l4-4M22 16l-4-4" stroke="var(--status-error)" stroke-linecap="round"/></svg>';

// Пункт с переключателем: меню не закрывается, переключатель показывает состояние
// item.setOn(on) — показать состояние, поменявшееся снаружи (зависимые переключатели)
function treeMenuSwitch(label, on, onToggle) {
  let state = on;
  const item = treeMenuItem(label, {
    keepOpen: true,
    onPick: () => {
      item.setOn(!state);
      onToggle(state);
    },
  });
  item.setAttribute('role', 'menuitemcheckbox');
  const toggle = document.createElement('span');
  toggle.className = 'ictl-switch';
  item.append(toggle);
  item.setOn = (next) => {
    state = next;
    item.setAttribute('aria-checked', String(state));
    toggle.setAttribute('aria-checked', String(state));
  };
  item.setOn(state);
  return item;
}

linksButton.addEventListener('click', () => {
  const auto = treeMenuSwitch('Approach/Return: Auto', linksAuto, (on) => {
    linksAuto = on;
    syncLinks();
  });
  const line = document.createElement('div');
  line.className = 'treemenu__line';
  openTreeMenu(linksButton, [
    auto,
    line,
    treeMenuItem('Link approach/return', { icon: LINK_ROW_ICON, onPick: () => { linksOn = true; syncLinks(); } }),
    treeMenuItem('Remove links', { icon: UNLINK_ROW_ICON, onPick: () => { linksOn = false; syncLinks(); } }),
  ]);
});

treeMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const owner = treeMenuOwner;
    closeTreeMenu();
    owner?.focus();
    return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const items = [...treeMenu.querySelectorAll('button:not(:disabled)')];
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
});

document.addEventListener('pointerdown', (event) => {
  if (treeMenu.hidden || treeMenu.contains(event.target) || treeMenuOwner?.contains(event.target)) return;
  closeTreeMenu();
});

applyTreeSort();
syncLinks();

/* ---------- Настройки показа (шестерёнка — самая левая в шапке, во всех видах): список — свой у вида ---------- */

// Пользователь сам выбирает: поиск, сортировка, связи. Выключено всё — ряда нет, дерево выше.
// «Свернуть / раскрыть всё» видна, пока виден ряд. Выбор запоминается
const TREE_TOOLS_KEY = 'prototype-tree-tools';
const toolsRow = document.querySelector('.layer--operations > .tree-tools');
const settingsButton = document.querySelector('.bar-btn--settings');
const TREE_TOOL_PARTS = [
  { id: 'search', name: 'Search', el: toolsRow.querySelector('.tree-search') },
  { id: 'sort', name: 'Sort', el: sortButton },
  { id: 'links', name: 'Approach/Return', el: linksButton },
];

let treeToolsShown = { search: true, sort: true, links: true };
try {
  treeToolsShown = { ...treeToolsShown, ...JSON.parse(localStorage.getItem(TREE_TOOLS_KEY) ?? '{}') };
} catch {
  // испорченная запись — показываем всё
}
// сохранённое раньше «Sort / связи без поиска» — с поиском (ряд держится на нём)
if (treeToolsShown.sort || treeToolsShown.links) treeToolsShown.search = true;

function applyTreeTools() {
  TREE_TOOL_PARTS.forEach((part) => { part.el.hidden = !treeToolsShown[part.id]; });
  const any = TREE_TOOL_PARTS.some((part) => treeToolsShown[part.id]);
  toolsRow.hidden = !any;
  operationsPanel.classList.toggle('is-tools-hidden', !any);
  localStorage.setItem(TREE_TOOLS_KEY, JSON.stringify(treeToolsShown));
}

function treeMenuLabel(text) {
  const label = document.createElement('div');
  label.className = 'treemenu__label';
  label.textContent = text;
  return label;
}

// Model — ряд инструментов модели под шапкой; Simulation — поиск под шапкой. Выбор запоминается
const MODEL_TOOLS_KEY = 'prototype-model-tools';
const SIM_SEARCH_KEY = 'prototype-sim-search';
const modelToolsRow = document.querySelector('.layer--operations .model-tools');
const simSearchRow = document.querySelector('.layer--operations .sim-search');
modelToolsRow.hidden = localStorage.getItem(MODEL_TOOLS_KEY) === '0';
simSearchRow.hidden = localStorage.getItem(SIM_SEARCH_KEY) === '0';

function treeMenuRowSwitch(label, row, key) {
  return treeMenuSwitch(label, !row.hidden, (on) => {
    row.hidden = !on;
    localStorage.setItem(key, on ? '1' : '0');
  });
}

const VIEW_SETTINGS = {
  // Ряд держится на поиске: Sort или связи без поиска — пустая строка, которая всё равно занимает высоту.
  // Включили Sort / связи — включается и поиск; выключили поиск — уходят и они (ряда нет)
  operations: () => {
    const switches = TREE_TOOL_PARTS.map((part) => treeMenuSwitch(part.name, treeToolsShown[part.id], (on) => {
      treeToolsShown[part.id] = on;
      if (part.id !== 'search' && on) treeToolsShown.search = true;
      if (part.id === 'search' && !on) Object.assign(treeToolsShown, { sort: false, links: false });
      applyTreeTools();
      switches.forEach((item, index) => item.setOn(treeToolsShown[TREE_TOOL_PARTS[index].id]));
    }));
    // Режим одной операции — первым; то же, что двойной клик по разделителю под деревом (script.js).
    // В нём ряда под шапкой нет — его настройки неактивны и держат состояние развёрнутого дерева
    const line = document.createElement('div');
    line.className = 'treemenu__line';
    const label = treeMenuLabel('Show under the header');
    const syncDisabled = () => {
      [label, ...switches].forEach((item) => item.classList.toggle('is-disabled', !treeOpen));
      switches.forEach((item) => { item.disabled = !treeOpen; });
    };
    const single = treeMenuSwitch('Single operation', !treeOpen, (on) => {
      if (on === treeOpen) toggleTree();
      syncDisabled();
    });
    syncDisabled();
    return [single, line, label, ...switches];
  },
  model: () => [
    treeMenuLabel('Show under the header'),
    treeMenuRowSwitch('Model tools', modelToolsRow, MODEL_TOOLS_KEY),
  ],
  // Режим Timeline — первым, как «одна операция»: включён — управление симуляцией под сценой с таймлайном,
  // выключен — компактно в шапке панели (как в ENCY по умолчанию)
  simulation: () => {
    const line = document.createElement('div');
    line.className = 'treemenu__line';
    const timeline = treeMenuSwitch('Timeline', !simCompact, (on) => simSetCompact(!on));
    timeline.title = 'Simulation controls under the 3D view, with a timeline';
    return [
      timeline,
      line,
      treeMenuLabel('Show under the header'),
      treeMenuRowSwitch('Search', simSearchRow, SIM_SEARCH_KEY),
    ];
  },
};

settingsButton.addEventListener('click', () => openTreeMenu(settingsButton, VIEW_SETTINGS[operations.dataset.view]()));

applyTreeTools();
