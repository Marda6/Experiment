// Фильтры и функции ENCY, перенесённые из прототипа ENCY_UI и приведённые к языку прототипа.
// Раскладка: колонка слева — данные; в левом верхнем углу свободной части сцены — панель фильтров
// (как в ENCY), по центру — панель функций, спрятанная под header. Низ сцены — под кубик вида и панель симуляции,
// header — под проекты (открытие, сохранение, вкладки).
// Иконки — в языке вкладок инспектора, монохромные; акцент только у включённого Smart snap.
// FILTER_ICONS — из filter-icons.js; иконки функций — FN_ICONS ниже, смысл как в ENCY

/* ---------- Фильтры: вертикальная панель в левом верхнем углу сцены ---------- */

const filtersPanel = document.getElementById('filters');

// Как в ENCY: два столбца объектов — что видно на сцене; под линией — что можно выбирать
const FILTER_COLUMNS = [
  [
    { id: 'inspector', title: 'Inspector', on: true },
    { id: 'part', title: 'Part', on: true },
    { id: 'job', title: 'Job', on: true },
    { id: 'workpiece', title: 'Workpiece', on: false },
    { id: 'result', title: 'Result', on: true },
  ],
  [
    { id: 'tool1', title: 'Tool', on: false },
    { id: 'tool2', title: 'Tool', on: true },
    { id: 'fixtures', title: 'Fixtures', on: false },
    { id: 'machine1', title: 'Machine', on: false },
    { id: 'machine2', title: 'Toolpath', on: true },
  ],
];
const FILTER_PICK = [
  { id: 'dot', title: 'Dot', on: true },
  { id: 'curve', title: 'Curve', on: true },
  { id: 'face', title: 'Face', on: true },
  { id: 'mech', title: 'Mech', on: true },
];

function filterCell({ id, title, on }) {
  const cell = document.createElement('button');
  cell.type = 'button';
  cell.className = 'filter-cell';
  cell.dataset.filter = id;
  cell.title = title;
  cell.setAttribute('aria-label', title);
  cell.setAttribute('aria-pressed', String(on));
  cell.innerHTML = FILTER_ICONS[id];
  // Part и Face подключены к сцене (scene.js), остальные пока только переключаются
  cell.addEventListener('click', () => {
    const next = cell.getAttribute('aria-pressed') !== 'true';
    cell.setAttribute('aria-pressed', String(next));
    document.dispatchEvent(new CustomEvent('filterchange', { detail: { id, on: next } }));
  });
  return cell;
}

// Заголовок сворачивает панель. Панель в один столбец 32px — слово не помещается, как в ENCY
// остаётся шеврон, а название — в подсказке
const filtersHead = document.createElement('button');
filtersHead.type = 'button';
filtersHead.className = 'filters__head';
filtersHead.title = 'Filters';
filtersHead.setAttribute('aria-label', 'Filters');
filtersHead.setAttribute('aria-expanded', 'true');
// Свёрнутая панель — иконка фильтров (воронка ENCY st-funnel: тонкий контур), раскрытая — шеврон «свернуть»
filtersHead.innerHTML = '<svg class="filters__icon" viewBox="0 0 16 16" aria-hidden="true">'
  + '<path d="M3 3.5H13C13.2761 3.5 13.5 3.72386 13.5 4V5.58594C13.5 5.71849 13.4472 5.84572 13.3535 5.93945L9.93945 9.35352C9.65818 9.63479 9.50004 10.0163 9.5 10.4141V12.3818C9.5 12.5712 9.39299 12.7444 9.22363 12.8291L7.22363 13.8291C6.89118 13.9953 6.5 13.7535 6.5 13.3818V10.4141C6.49996 10.0163 6.34182 9.63478 6.06055 9.35352L2.64648 5.93945C2.55275 5.84572 2.50004 5.71849 2.5 5.58594V4L2.50977 3.89941C2.55629 3.67145 2.75829 3.5 3 3.5Z"/></svg>'
  + '<svg class="filters__chev" viewBox="0 0 8 5" aria-hidden="true"><path d="M1 1l3 3 3-3" /></svg>';
filtersHead.addEventListener('click', () => {
  const open = !filtersPanel.classList.contains('is-open');
  filtersPanel.classList.toggle('is-open', open);
  filtersHead.setAttribute('aria-expanded', String(open));
});

const filtersBody = document.createElement('div');
filtersBody.className = 'filters__body';

const filterColumns = document.createElement('div');
filterColumns.className = 'filters__cols';
filterColumns.setAttribute('role', 'group');
filterColumns.setAttribute('aria-label', 'Show');
FILTER_COLUMNS.forEach((column) => {
  const col = document.createElement('div');
  col.className = 'filters__col';
  col.append(...column.map(filterCell));
  filterColumns.append(col);
});

const filtersLine = document.createElement('div');
filtersLine.className = 'filters__line';

const filterPick = document.createElement('div');
filterPick.className = 'filters__grid';
filterPick.setAttribute('role', 'group');
filterPick.setAttribute('aria-label', 'Select');
filterPick.append(...FILTER_PICK.map(filterCell));

filtersBody.append(filterColumns, filtersLine, filterPick);
filtersPanel.append(filtersHead, filtersBody);

/* ---------- Функции: по центру сцены, прячутся под header, скрепка закрепляет ---------- */

const fnBar = document.getElementById('fnbar');

// Названия и подсказки — из ENCY. Два набора, как в ENCY: обработка и модель (там их меняла вкладка режима,
// здесь — что выбрано: узел дерева операций или тело / грань модели, событие workcontext из model.js).
// Замеры общие, Smart snap включён в обоих сразу
const FN_MEASURE = [
  { id: 'snap', t: 'Smart snap', d: 'Enable/disable smart snap', toggle: true },
  { id: 'measure', t: 'Measure tool', d: 'This tool shows a linear part annotation dimension between two points' },
  { id: 'geom', t: 'Geometry measuring', d: 'Measurement of geometrical parameters of the model' },
];
const FN_MACHINING = [
  FN_MEASURE,
  [
    { id: 'post', t: 'Postprocessor', d: 'Generate NC-code by postprocessor' },
    { id: 'report', t: 'Machining report', d: 'Generate machining report' },
    { id: 'tools', t: 'Tools', d: 'Tool list of the project', menu: ['Load tool list', null, 'Import tools to the project…', 'Save list of project tools as…', 'Delete all unused tools from the project', 'Adapt machine for advanced tools'] },
  ],
  [
    { id: 'mcp', t: 'Machine control panel', d: 'Opens window to see and change the machine state' },
    { id: 'axes', t: 'Graph of the axes', d: 'Graph of change the machine state' },
    { id: 'verify', t: 'Verify compare', d: 'Compare machining result with part' },
    { id: 'reach', t: 'Tool reach inspector', d: 'Opens inspector to see tool reach' },
  ],
];
const FN_MODEL = [
  FN_MEASURE,
  [
    { id: 'transform', t: 'Spatial transformations', d: 'Spatial transformations of selected objects' },
    { id: 'triangulate', t: 'Surface triangulation', d: 'Triangulation of selected surfaces' },
    { id: 'intersect', t: 'Intersect', d: 'Getting curves as section of 3D model by plane' },
    { id: 'project', t: 'Surfaces boundary projection', d: 'Projections of the selected surfaces boundary on plane' },
    { id: 'isolines', t: 'Extract isolines', d: 'Extract face isolines' },
    { id: 'sew', t: 'Sew Faces', d: 'Sewing surfaces on 3D model' },
    { id: 'patch', t: 'Patch hole', d: 'Triangulation of selected curves or patching holes in meshes' },
    { id: 'join', t: 'Join curves', d: 'Join of selected curves' },
    { id: 'extend', t: 'Extend surface', d: 'Extend surface' },
  ],
];
const FN_SETS = { machining: FN_MACHINING, model: FN_MODEL };
const toolsItem = FN_MACHINING.flat().find((item) => item.menu);

// Иконки в языке Core icn_inspector (как вкладки инспектора): 20px, залитые геометрические фигуры,
// скругление 1px, два тона — основной (TONE_A, 96%) и вторичный (TONE_B, 48%)
const TONE_A = 'fill="currentColor" fill-opacity="0.96"';
const TONE_B = 'fill="currentColor" fill-opacity="0.48"';
const svgInner = (svg) => svg.replace(/^<svg[^>]*>|<\/svg>$/g, '');

const FN_ICONS = {
  // Smart snap — магнит: полюса светлее
  snap: `<path ${TONE_B} d="M4 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5H4z"/><path ${TONE_B} d="M12 4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5h-4z"/><path ${TONE_A} d="M4 6.5h4V10a2 2 0 0 0 4 0V6.5h4V10a6 6 0 0 1-12 0z"/>`,
  // Measure tool — размер между двумя точками: опоры и двойная стрелка
  measure: `<rect ${TONE_B} x="3" y="5" width="1.5" height="10" rx="0.75"/><rect ${TONE_B} x="15.5" y="5" width="1.5" height="10" rx="0.75"/><path ${TONE_A} d="M5.5 10 9 7v2h2V7l3.5 3-3.5 3v-2H9v2z"/>`,
  // Geometry measuring — угол: основание и луч, между ними сектор
  geom: `<path ${TONE_B} d="M4 16 9.4 10.1A8 8 0 0 1 12 16z"/><rect ${TONE_A} x="3" y="15" width="14" height="2" rx="1"/><path ${TONE_A} d="M3.3 15.3 13.5 4.2l1.5 1.3L4.8 16.7z"/>`,
  // Postprocessor — код: скобки и косая черта
  post: `<path ${TONE_A} d="M7.3 5.3 8.7 6.7 5.4 10l3.3 3.3-1.4 1.4L2.6 10z"/><path ${TONE_A} d="M12.7 5.3 11.3 6.7 14.6 10l-3.3 3.3 1.4 1.4L17.4 10z"/><path ${TONE_B} d="M10.9 4l1.7.6L9.1 16l-1.7-.6z"/>`,
  // Machining report — документ: лист, загнутый угол и строки
  report: `<path ${TONE_B} d="M5 3h7l4 4v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path ${TONE_A} d="M12 3v3a1 1 0 0 0 1 1h3z"/><rect ${TONE_A} x="7" y="10" width="6" height="1.5" rx="0.75"/><rect ${TONE_A} x="7" y="13" width="4" height="1.5" rx="0.75"/>`,
  // Tools — та же фреза, что у вкладки Tool в инспекторе
  tools: svgInner(INSPECTOR_ICONS.tool),
  // Machine control panel — пульт: корпус, экран, ручка и кнопка
  mcp: `<rect ${TONE_B} x="3" y="4" width="14" height="12" rx="1"/><rect ${TONE_A} x="5" y="6" width="10" height="4" rx="0.5"/><circle ${TONE_A} cx="7" cy="13" r="1.5"/><rect ${TONE_A} x="10" y="12.25" width="5" height="1.5" rx="0.75"/>`,
  // Graph of the axes — оси и график состояния
  axes: `<rect ${TONE_B} x="3" y="3" width="1.5" height="14" rx="0.75"/><rect ${TONE_B} x="3" y="15.5" width="14" height="1.5" rx="0.75"/><path ${TONE_A} d="M6 15v-4l3-3 3 2 4-5v10z"/>`,
  // Verify compare — результат против детали: две формы внахлёст
  verify: `<rect ${TONE_B} x="7" y="3" width="10" height="10" rx="1"/><rect ${TONE_A} x="3" y="7" width="10" height="10" rx="1"/>`,
  // Tool reach inspector — инструмент в патроне и размер вылета
  reach: `<rect ${TONE_A} x="5" y="3" width="8" height="4" rx="1"/><path ${TONE_A} d="M8 7h2v8.5a1 1 0 0 1-2 0z"/><rect ${TONE_B} x="14.5" y="7" width="1.5" height="10" rx="0.75"/><rect ${TONE_B} x="13.5" y="7" width="3.5" height="1.5" rx="0.75"/><rect ${TONE_B} x="13.5" y="15.5" width="3.5" height="1.5" rx="0.75"/>`,

  // Модель
  // Spatial transformations — квадрат и он же, повёрнутый и перенесённый
  transform: `<rect ${TONE_B} x="3" y="10" width="7" height="7" rx="1"/><path ${TONE_A} d="M14.5 2.5 18.5 6.5 14.5 10.5 10.5 6.5z"/>`,
  // Surface triangulation — грань, разбитая диагональю на два треугольника
  triangulate: `<path ${TONE_B} d="M4 4h11L4 15z"/><path ${TONE_A} d="M16 5v11H5z"/>`,
  // Intersect — тело и секущая плоскость
  intersect: `<rect ${TONE_B} x="5" y="3" width="10" height="14" rx="1"/><rect ${TONE_A} x="2" y="9" width="16" height="2" rx="1"/>`,
  // Surfaces boundary projection — поверхность, линии проекции и плоскость
  project: `<rect ${TONE_A} x="5" y="3" width="10" height="5" rx="1"/><rect ${TONE_B} x="5.5" y="9.5" width="1.5" height="4" rx="0.75"/><rect ${TONE_B} x="13" y="9.5" width="1.5" height="4" rx="0.75"/><rect ${TONE_A} x="3" y="15" width="14" height="2" rx="1"/>`,
  // Extract isolines — грань и линии на ней
  isolines: `<rect ${TONE_B} x="3" y="3" width="14" height="14" rx="1"/><rect ${TONE_A} x="6" y="5" width="1.5" height="10" rx="0.75"/><rect ${TONE_A} x="9.25" y="5" width="1.5" height="10" rx="0.75"/><rect ${TONE_A} x="12.5" y="5" width="1.5" height="10" rx="0.75"/>`,
  // Sew Faces — две грани и стежки через шов
  sew: `<rect ${TONE_A} x="3" y="4" width="6.5" height="12" rx="1"/><rect ${TONE_B} x="10.5" y="4" width="6.5" height="12" rx="1"/><rect ${TONE_A} x="8" y="6.25" width="4.5" height="1.5" rx="0.75"/><rect ${TONE_A} x="8" y="9.25" width="4.5" height="1.5" rx="0.75"/><rect ${TONE_A} x="8" y="12.25" width="4.5" height="1.5" rx="0.75"/>`,
  // Patch hole — грань с отверстием и заплатка в нём
  patch: `<path ${TONE_B} fill-rule="evenodd" d="M4 3h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 4v6h6V7z"/><rect ${TONE_A} x="8" y="8" width="4" height="4" rx="0.5"/>`,
  // Join curves — две кривые и узел, где они сходятся
  join: `<rect ${TONE_B} x="2.5" y="12" width="7" height="2" rx="1"/><path ${TONE_A} d="M9.22 12.37 15.72 4.37 17.28 5.63 10.78 13.63z"/><circle ${TONE_A} cx="10" cy="13" r="2.25"/>`,
  // Extend surface — поверхность и её продолжение
  extend: `<rect ${TONE_A} x="3" y="5" width="7" height="10" rx="1"/><path ${TONE_B} d="M11 5h3l3 5-3 5h-3z"/>`,
};

const fnIcon = (id) => `<svg class="fnbar__icon" viewBox="0 0 20 20" aria-hidden="true">${FN_ICONS[id]}</svg>`;

const fnTip = document.createElement('div');
fnTip.className = 'fnbar__tip';
fnTip.hidden = true;

const fnMenu = document.createElement('div');
fnMenu.className = 'fnbar__menu';
fnMenu.setAttribute('role', 'menu');
fnMenu.hidden = true;

let tipTimer = 0;
let snapOn = false; // Smart snap — общий для обоих наборов

function hideTip() {
  clearTimeout(tipTimer);
  fnTip.hidden = true;
}

// Подсказка как в ENCY: название, линия, что делает — под кнопкой, после короткой паузы
function showTipLater(button, item) {
  hideTip();
  if (!fnMenu.hidden) return;
  tipTimer = setTimeout(() => {
    fnTip.innerHTML = '<b></b><span></span>';
    fnTip.querySelector('b').textContent = item.t;
    fnTip.querySelector('span').textContent = item.d;
    fnTip.style.left = `${button.offsetLeft}px`;
    fnTip.hidden = false;
  }, 450);
}

function setFnMenuOpen(open) {
  const button = fnBar.querySelector('[data-fn="tools"]');
  fnMenu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  fnBar.classList.toggle('is-held', open); // пока меню открыто, панель не прячется
  if (!open) return;

  hideTip();
  fnMenu.replaceChildren(...toolsItem.menu.map((label) => {
    if (!label) {
      const line = document.createElement('div');
      line.className = 'fnbar__menu-line';
      return line;
    }
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'fnbar__menu-item';
    entry.setAttribute('role', 'menuitem');
    entry.textContent = label;
    entry.addEventListener('click', () => setFnMenuOpen(false));
    return entry;
  }));
  fnMenu.style.left = `${button.offsetLeft}px`;
  fnMenu.querySelector('.fnbar__menu-item').focus();
}

function fnButton(item) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fnbar__btn';
  button.dataset.fn = item.id;
  button.fnItem = item; // для списка «⋯», если кнопке не хватит места
  button.setAttribute('aria-label', item.t);
  button.innerHTML = fnIcon(item.id);
  if (item.toggle) button.setAttribute('aria-pressed', String(snapOn));
  if (item.menu) {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
  }

  button.addEventListener('pointerenter', () => showTipLater(button, item));
  button.addEventListener('pointerleave', hideTip);
  button.addEventListener('focus', () => showTipLater(button, item));
  button.addEventListener('blur', hideTip);
  button.addEventListener('click', () => {
    hideTip();
    if (item.toggle) {
      snapOn = !snapOn;
      button.setAttribute('aria-pressed', String(snapOn));
    }
    if (item.menu) setFnMenuOpen(fnMenu.hidden);
  });
  return button;
}

function fnDivider() {
  const divider = document.createElement('span');
  divider.className = 'fnbar__sep';
  divider.setAttribute('role', 'separator');
  divider.setAttribute('aria-orientation', 'vertical');
  return divider;
}

// Набор кнопок перед скрепкой; меняется целиком, когда меняется контекст работы
let fnSet = null;
let fnNodes = [];

function renderFnBar(set) {
  if (set === fnSet) return;
  fnSet = set;
  hideTip();
  if (!fnMenu.hidden) setFnMenuOpen(false);
  fnNodes.forEach((node) => node.remove());
  fnNodes = FN_SETS[set].flatMap((group, index) => [...(index ? [fnDivider()] : []), ...group.map(fnButton)]);
  fnMore.before(...fnNodes);
  fitFnBar();
}
// Скрепка — закрепить панель открытой (запоминается)
const FNBAR_PIN_KEY = 'prototype-fnbar-pinned';
const PIN_ICON = `<svg class="fnbar__icon" viewBox="0 0 20 20" aria-hidden="true"><path ${TONE_A} d="M7 3h6v1.5l-1 1V9l2.5 2.5V13h-9v-1.5L8 9V5.5l-1-1z"/><rect ${TONE_B} x="9.25" y="13" width="1.5" height="5" rx="0.75"/></svg>`;

const pinDivider = document.createElement('span');
pinDivider.className = 'fnbar__sep';
const pinButton = document.createElement('button');
pinButton.type = 'button';
pinButton.className = 'fnbar__btn fnbar__pin';
pinButton.innerHTML = PIN_ICON;
pinButton.addEventListener('click', () => setFnPinned(!fnBar.classList.contains('is-pinned')));

function setFnPinned(pinned) {
  fnBar.classList.toggle('is-pinned', pinned);
  pinButton.setAttribute('aria-pressed', String(pinned));
  pinButton.title = pinned ? 'Unpin: hide under the header' : 'Pin the panel';
  pinButton.setAttribute('aria-label', pinButton.title);
  localStorage.setItem(FNBAR_PIN_KEY, pinned ? '1' : '');
}

/* ---------- Не хватает места — лишние кнопки уходят за «⋯» ---------- */

// Полоса стоит по центру свободной части сцены. Если ей тесно между фильтрами и правым доком, кнопки
// справа налево прячутся в список «⋯» перед скрепкой: там они с иконкой и названием, у Tools — его пункты.
// Пересчёт — когда меняется ширина окна, колонки, дока и набор функций
const FNBAR_SIDE_GAP = 4; // зазор до фильтров и дока
const MORE_ICON = `<svg class="fnbar__icon" viewBox="0 0 20 20" aria-hidden="true"><circle ${TONE_A} cx="5" cy="10" r="1.5"/><circle ${TONE_A} cx="10" cy="10" r="1.5"/><circle ${TONE_A} cx="15" cy="10" r="1.5"/></svg>`;
const dockBox = document.querySelector('.dock');

const fnMore = document.createElement('button');
fnMore.type = 'button';
fnMore.className = 'fnbar__btn fnbar__more';
fnMore.title = 'More';
fnMore.setAttribute('aria-label', 'More functions');
fnMore.setAttribute('aria-haspopup', 'menu');
fnMore.setAttribute('aria-expanded', 'false');
fnMore.innerHTML = MORE_ICON;
fnMore.hidden = true;

const fnOverflow = document.createElement('div');
fnOverflow.className = 'fnbar__menu';
fnOverflow.setAttribute('role', 'menu');
fnOverflow.hidden = true;

// Сколько места у полосы: она по центру — вдвое меньшее из расстояний до фильтров и до дока (края окна)
function fnRoom() {
  const center = parseFloat(getComputedStyle(fnBar).left);
  const left = filtersPanel.offsetLeft + filtersPanel.offsetWidth + FNBAR_SIDE_GAP;
  const right = dockBox.hidden ? workspace.clientWidth - LAYERS_INSET : dockBox.offsetLeft - FNBAR_SIDE_GAP;
  return 2 * Math.min(center - left, right - center);
}

const isFnButton = (node) => node.classList.contains('fnbar__btn');

// Разделитель, после которого в группе не осталось видимых кнопок, тоже прячем
function tidyFnSeparators() {
  fnNodes.forEach((node, index) => {
    if (isFnButton(node)) return;
    const rest = fnNodes.slice(index + 1);
    const end = rest.findIndex((other) => !isFnButton(other));
    node.hidden = !(end < 0 ? rest : rest.slice(0, end)).some((other) => !other.hidden);
  });
}

function fitFnBar() {
  setOverflowOpen(false);
  if (!fnMenu.hidden) setFnMenuOpen(false);
  fnNodes.forEach((node) => { node.hidden = false; });
  fnMore.hidden = true;

  const room = fnRoom();
  if (fnBar.offsetWidth <= room) return;

  fnMore.hidden = false;
  const buttons = fnNodes.filter(isFnButton);
  for (let index = buttons.length - 1; index > 0 && fnBar.offsetWidth > room; index -= 1) {
    buttons[index].hidden = true;
    tidyFnSeparators();
  }
}

function overflowEntry(label, { item, button, sub = false } = {}) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = sub ? 'fnbar__menu-item fnbar__menu-item--sub' : 'fnbar__menu-item';
  entry.setAttribute('role', item?.toggle ? 'menuitemcheckbox' : 'menuitem');
  if (item?.toggle) entry.setAttribute('aria-checked', String(snapOn));
  entry.innerHTML = `${item ? fnIcon(item.id) : ''}<span></span>`;
  entry.querySelector('span').textContent = label;
  entry.addEventListener('click', () => {
    if (item?.toggle) {
      snapOn = !snapOn;
      button.setAttribute('aria-pressed', String(snapOn));
    }
    setOverflowOpen(false);
    fnMore.focus();
  });
  return entry;
}

// Спрятанные кнопки по группам (между группами — линия, как разделители в полосе)
function overflowRows() {
  let group = 0;
  let lastGroup = null;
  const rows = [];
  fnNodes.forEach((node) => {
    if (!isFnButton(node)) {
      group += 1;
      return;
    }
    if (!node.hidden) return;
    if (lastGroup !== null && group !== lastGroup) {
      const line = document.createElement('div');
      line.className = 'fnbar__menu-line';
      rows.push(line);
    }
    lastGroup = group;

    const item = node.fnItem;
    if (!item.menu) {
      rows.push(overflowEntry(item.t, { item, button: node }));
      return;
    }
    // Tools — заголовок и его пункты под ним
    const head = document.createElement('div');
    head.className = 'fnbar__menu-head';
    head.innerHTML = `${fnIcon(item.id)}<span></span>`;
    head.querySelector('span').textContent = item.t;
    rows.push(head, ...item.menu.filter(Boolean).map((label) => overflowEntry(label, { sub: true })));
  });
  return rows;
}

function setOverflowOpen(open) {
  fnOverflow.hidden = !open;
  fnMore.setAttribute('aria-expanded', String(open));
  fnBar.classList.toggle('is-held', open || !fnMenu.hidden); // пока список открыт, панель не прячется
  if (!open) return;

  hideTip();
  if (!fnMenu.hidden) setFnMenuOpen(false);
  fnOverflow.replaceChildren(...overflowRows());
  // список прижат к правому краю «⋯»
  fnOverflow.style.left = `${fnMore.offsetLeft + fnMore.offsetWidth - fnOverflow.offsetWidth}px`;
  fnOverflow.querySelector('button')?.focus();
}

fnMore.addEventListener('click', () => setOverflowOpen(fnOverflow.hidden));

fnOverflow.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setOverflowOpen(false);
    fnMore.focus();
    return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const entries = [...fnOverflow.querySelectorAll('button')];
  const index = entries.indexOf(document.activeElement);
  entries[(index + step + entries.length) % entries.length].focus();
});

document.addEventListener('pointerdown', (event) => {
  if (!fnOverflow.hidden && !fnOverflow.contains(event.target) && !fnMore.contains(event.target)) setOverflowOpen(false);
});

new ResizeObserver(() => fitFnBar()).observe(workspace);
const fnRoomObserver = new ResizeObserver(() => fitFnBar());
fnRoomObserver.observe(document.querySelector('.layers'));
fnRoomObserver.observe(dockBox);

fnBar.append(fnMore, pinDivider, pinButton, fnTip, fnMenu, fnOverflow);
setFnPinned(localStorage.getItem(FNBAR_PIN_KEY) === '1');
renderFnBar('machining');
document.addEventListener('workcontext', (event) => renderFnBar(event.detail.context));

// Меню Tools: Escape и клик мимо закрывают
fnMenu.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  setFnMenuOpen(false);
  fnBar.querySelector('[data-fn="tools"]').focus();
});

document.addEventListener('pointerdown', (event) => {
  if (fnMenu.hidden || fnMenu.contains(event.target) || event.target.closest('[data-fn="tools"]')) return;
  setFnMenuOpen(false);
});
