// Вид первой панели — комбобокс в её шапке: Operations (дерево операций), Model (дерево модели, как в ENCY),
// Simulation (пока не собрана). В видах Model и Simulation нет Inspector — колонку занимает панель (как в ENCY).
// Работа с моделью — не отдельный режим, а другой предмет выделения: выбрали объект в дереве модели
// или грань в сцене — полоса функций и чат переходят к модели; выбрали узел в дереве операций — обратно
// к обработке. Вид — сплит в шапке, как «+ ▾»: клик по названию — следующий вид, ▾ — список.
// В одну операцию сворачивается только дерево операций (двойной клик по названию) — открывая другой вид,
// панель раскрываем.
// operations, treeOpen, render, toggleTree, setPanelHidden — из script.js

const modelTree = document.getElementById('model-tree');
const modelTools = operations.querySelector('.model-tools');
const viewTitle = operations.querySelector('.layer__view-title');
const viewMore = operations.querySelector('.layer__view-more');
const viewNames = viewTitle.querySelector('.layer__view-names');
const viewMenu = document.getElementById('viewmenu');
const inspectorPanel = document.querySelector('.layer--inspector');

// Порядок списка — как в работе: модель, операции, симуляция
const VIEWS = [
  { id: 'model', name: 'Model', context: 'model', noInspector: true },
  { id: 'operations', name: 'Operations', context: 'machining' },
  // Набор функций — как у обработки; Inspector нет, как в ENCY на вкладке Simulation
  { id: 'simulation', name: 'Simulation', context: 'machining', noInspector: true },
];

let treeView = 'operations';
let workContext = 'machining'; // machining | model — за ним следует полоса функций (событие workcontext)
let modelSelected = null; // выделенная строка дерева модели

function announceWork() {
  document.dispatchEvent(new CustomEvent('workcontext', { detail: { context: workContext } }));
}

/* ---------- Дерево модели: разделы ENCY, в Part — деталь из сцены ---------- */

// Разделы — как в дереве модели ENCY: Part, Workpiece, Fixtures, Restrictions.
// В Part — то, что есть в сцене (scene.js): файл Housing, в нём группа и тело. object: 'body' — узел,
// который выбирает и прячет это тело. kind — что это (для контекста чата); иконка у всего, кроме файла, —
// папка, как в ENCY. Галочки — видимость: Fixtures выключены, как в ENCY
const MODEL = {
  name: 'Full Model', kind: 'Model', on: true, children: [
    { name: 'Part', kind: 'Folder', on: true, children: [
      { name: 'Housing.step', kind: 'File', on: true, children: [
        { name: 'Group[1]', kind: 'Group', on: true, children: [
          { name: 'Solid[1]', kind: 'Solid', on: true, object: 'body' },
        ] },
      ] },
    ] },
    { name: 'Workpiece', kind: 'Folder', on: true },
    { name: 'Fixtures', kind: 'Folder', on: false },
    { name: 'Restrictions', kind: 'Folder', on: true },
  ],
};

// Иконки строк — 16px, два тона, как остальные иконки прототипа: папка и файл модели
const ROW_TONE_A = 'fill="currentColor" fill-opacity="0.96"';
const ROW_TONE_B = 'fill="currentColor" fill-opacity="0.48"';
const MODEL_ROW_ICONS = {
  Folder: `<path ${ROW_TONE_B} d="M2 4a1 1 0 0 1 1-1h3.4l1.5 1.5H13a1 1 0 0 1 1 1V6H2z"/><rect ${ROW_TONE_A} x="2" y="7" width="12" height="6.5" rx="1"/>`,
  File: `<path ${ROW_TONE_B} d="M4 1.5h5.5L13 5v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11.5a1 1 0 0 1 1-1z"/><path ${ROW_TONE_A} d="M9.5 1.5V4a1 1 0 0 0 1 1H13z"/>`,
};

const CHECK_MARK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-6"/></svg>';

// Узел содержит тело сцены — выбор и видимость касаются тела
const holdsBody = (node) => node.object === 'body' || Boolean(node.children?.some(holdsBody));

function renderModelNode(node, level) {
  const item = document.createElement('li');
  item.className = 'tree__item';
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-level', String(level + 1));
  item.setAttribute('aria-selected', 'false');
  item.modelNode = node;

  const row = document.createElement('div');
  row.className = 'tree__row';
  row.style.setProperty('--level', level);

  const toggle = document.createElement('span');
  toggle.className = 'tree__toggle';

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'model-check';
  check.setAttribute('role', 'checkbox');
  check.setAttribute('aria-checked', String(node.on));
  check.setAttribute('aria-label', `Show ${node.name}`);
  check.title = 'Show';
  check.innerHTML = CHECK_MARK;

  const icon = document.createElement('span');
  icon.className = 'model-icon';
  icon.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${MODEL_ROW_ICONS[node.kind === 'File' ? 'File' : 'Folder']}</svg>`;

  const name = document.createElement('span');
  name.className = 'tree__name';
  name.textContent = node.name;

  row.append(toggle, check, icon, name);
  item.append(row);

  if (node.children) {
    item.classList.add('tree__item--branch');
    item.setAttribute('aria-expanded', 'true');
    const group = document.createElement('ul');
    group.className = 'tree__group';
    group.setAttribute('role', 'group');
    node.children.forEach((child) => group.append(renderModelNode(child, level + 1)));
    item.append(group);
  }
  return item;
}

modelTree.append(renderModelNode(MODEL, 0));

/* ---------- Видимость: галочка родителя переключает всех детей; видно, если отмечены все предки ---------- */

function setModelVisible(item, on) {
  [item, ...item.querySelectorAll('.tree__item')].forEach((each) => {
    each.modelNode.on = on;
    each.querySelector(':scope > .tree__row > .model-check').setAttribute('aria-checked', String(on));
  });
}

function bodyShown() {
  const bodyItem = [...modelTree.querySelectorAll('.tree__item')].find((each) => each.modelNode.object === 'body');
  for (let each = bodyItem; each; each = each.parentElement.closest('.tree__item')) {
    if (!each.modelNode.on) return false;
  }
  return true;
}

function announceVisibility() {
  document.dispatchEvent(new CustomEvent('modelvisibility', { detail: { object: 'body', visible: bodyShown() } }));
}

/* ---------- Выбор в дереве модели: сцена подсвечивает тело, чат берёт объект в контекст ---------- */

function selectModelItem(item) {
  modelSelected?.setAttribute('aria-selected', 'false');
  modelSelected = item;
  item?.setAttribute('aria-selected', 'true');

  const node = item?.modelNode;
  document.dispatchEvent(new CustomEvent('modelselect', {
    detail: node ? { kind: node.kind, name: node.name, object: holdsBody(node) ? 'body' : null } : null,
  }));
  if (node) {
    workContext = 'model';
    announceWork();
  }
}

modelTree.addEventListener('click', (event) => {
  const row = event.target.closest('.tree__row');
  if (!row) return;
  const item = row.parentElement;

  if (event.target.closest('.model-check')) {
    setModelVisible(item, !item.modelNode.on);
    announceVisibility();
    return;
  }

  if (event.target.closest('.tree__toggle') && item.classList.contains('tree__item--branch')) {
    const expanded = item.getAttribute('aria-expanded') === 'true';
    item.setAttribute('aria-expanded', String(!expanded));
    item.querySelector(':scope > .tree__group').hidden = expanded;
    return;
  }
  selectModelItem(item);
});

/* ---------- Панель над деревом модели — как в ENCY: создать и Import ---------- */

// Названия — по иконкам ENCY; функции пока не собраны. Иконки — 20px, два тона, как в полосе функций
const MODEL_TOOLS = [
  {
    id: 'sketch', t: 'Sketch',
    icon: `<rect ${ROW_TONE_B} x="3" y="6" width="10" height="11" rx="1"/><path ${ROW_TONE_A} d="M15.6 2.6 17.4 4.4 9.4 12.4 7 13l.6-2.4z"/>`,
  },
  {
    id: 'solid', t: 'Create solid',
    icon: `<path ${ROW_TONE_A} d="M7 5l5 2.5V14l-5 2.5L2 14V7.5z"/><rect ${ROW_TONE_B} x="14.75" y="2" width="1.5" height="6" rx="0.75"/><rect ${ROW_TONE_B} x="12.5" y="4.25" width="6" height="1.5" rx="0.75"/>`,
  },
  {
    id: 'library', t: 'Library',
    icon: `<rect ${ROW_TONE_A} x="3" y="3" width="6" height="6" rx="1"/><rect ${ROW_TONE_B} x="11" y="3" width="6" height="6" rx="1"/><rect ${ROW_TONE_B} x="3" y="11" width="6" height="6" rx="1"/><circle ${ROW_TONE_A} cx="14" cy="14" r="3"/>`,
  },
  {
    id: 'text', t: 'Text',
    icon: `<path ${ROW_TONE_A} d="M6 3h2l4 13h-2l-1-3.2H5L4 16H2zm-.5 7.8h3L7 6z"/><path ${ROW_TONE_B} fill-rule="evenodd" d="M14.75 10a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zm0 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/><rect ${ROW_TONE_B} x="17.5" y="10" width="1.5" height="6" rx="0.75"/>`,
  },
  {
    id: 'folder', t: 'New folder',
    icon: `<path ${ROW_TONE_B} d="M3 5a1 1 0 0 1 1-1h4l1.5 1.5H16a1 1 0 0 1 1 1V7H3z"/><path ${ROW_TONE_A} fill-rule="evenodd" d="M3 8h14v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zm6.25 2v1.75H7.5v1.5h1.75V15h1.5v-1.75h1.75v-1.5h-1.75V10z"/>`,
  },
];

MODEL_TOOLS.forEach((tool) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool-btn model-tools__btn';
  button.title = tool.t;
  button.setAttribute('aria-label', tool.t);
  button.innerHTML = `<svg class="model-tools__icon" viewBox="0 0 20 20" aria-hidden="true">${tool.icon}</svg>`;
  modelTools.append(button);
});

/* ---------- Import в шапке — как «+» у операций ---------- */

// Import сразу открывает файл: модель встаёт в Part — отмечена и выбрана, проект меняется.
// Геометрию файла сцена пока не показывает. ▾ — варианты импорта, пока не собраны
const importButton = operations.querySelector('.bar-btn--import');
const importFile = operations.querySelector('.model-file');

function addModelFile(file) {
  const part = [...modelTree.querySelectorAll('.tree__item')].find((each) => each.modelNode.name === 'Part');
  const node = { name: file.name, kind: 'File', on: part.modelNode.on };
  part.modelNode.children.push(node);

  const item = renderModelNode(node, Number(part.getAttribute('aria-level')));
  part.querySelector(':scope > .tree__group').append(item);
  part.setAttribute('aria-expanded', 'true');
  part.querySelector(':scope > .tree__group').hidden = false;

  selectModelItem(item);
  item.scrollIntoView({ block: 'nearest' });
  markProjectChanged();
}

importButton.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', () => {
  const files = [...importFile.files];
  importFile.value = '';
  files.forEach(addModelFile);
});

/* ---------- Выбор в сцене и в дереве операций ---------- */

// Грань — тоже модель. Грань и объект дерева вместе не выбраны: выбрали грань — строка снимается
document.addEventListener('faceselect', (event) => {
  if (!event.detail) return;
  if (modelSelected) selectModelItem(null);
  workContext = 'model';
  announceWork();
});

document.addEventListener('treeselect', () => {
  workContext = 'machining';
  announceWork();
});

/* ---------- Вид панели: название, ▾ и список ---------- */

// В названии все виды стоят в одной ячейке, видно текущий — ширина не прыгает при смене вида
const viewNameSpans = VIEWS.map((view) => {
  const span = document.createElement('span');
  span.dataset.view = view.id;
  span.textContent = view.name;
  return span;
});
viewNames.append(...viewNameSpans);

// Список без галочек: текущий вид — лёгкая подложка
const viewOptions = VIEWS.map((view) => {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'viewmenu__item';
  option.setAttribute('role', 'option');
  option.dataset.view = view.id;
  option.textContent = view.name;
  option.addEventListener('click', () => {
    setTreeView(view.id);
    setViewMenuOpen(false);
    viewMore.focus();
  });
  return option;
});
viewMenu.append(...viewOptions);

function setViewMenuOpen(open) {
  viewMenu.hidden = !open;
  viewMore.setAttribute('aria-expanded', String(open));
  if (open) viewOptions.find((option) => option.dataset.view === treeView).focus();
}

viewMore.addEventListener('click', () => setViewMenuOpen(viewMenu.hidden));

// Клик по названию — сразу следующий вид по кругу. В Operations двойной клик — дерево ↔ одна операция,
// поэтому там одиночный клик ждёт, не будет ли второго. Второй щелчок, начатый в другом виде, не сворачивает
// (быстрый двойной клик из Model просто переводит в Operations). С клавиатуры (detail 0) — сразу
const DOUBLE_CLICK_WAIT = 300;
let titleClickTimer = 0;

const nextView = () => VIEWS[(VIEWS.findIndex((view) => view.id === treeView) + 1) % VIEWS.length];

viewTitle.addEventListener('click', (event) => {
  if (event.detail > 1) {
    if (!titleClickTimer) return;
    clearTimeout(titleClickTimer);
    titleClickTimer = 0;
    toggleTree();
    return;
  }
  if (event.detail === 1 && treeView === 'operations') {
    titleClickTimer = setTimeout(() => {
      titleClickTimer = 0;
      setTreeView(nextView().id);
    }, DOUBLE_CLICK_WAIT);
    return;
  }
  setTreeView(nextView().id);
});

viewMenu.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setViewMenuOpen(false);
    viewMore.focus();
    return;
  }
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  event.preventDefault();
  const index = viewOptions.indexOf(document.activeElement);
  viewOptions[(index + step + viewOptions.length) % viewOptions.length].focus();
});

document.addEventListener('pointerdown', (event) => {
  if (!viewMenu.hidden && !viewMenu.contains(event.target) && !viewMore.contains(event.target)) setViewMenuOpen(false);
});

function setTreeView(id) {
  const view = VIEWS.find((item) => item.id === id);
  treeView = id;
  operations.dataset.view = id;
  viewNameSpans.forEach((span) => span.classList.toggle('is-current', span.dataset.view === id));
  viewOptions.forEach((option) => option.setAttribute('aria-selected', String(option.dataset.view === id)));
  // Подсказка — что будет по клику
  const hint = `Next: ${nextView().name}` + (id === 'operations' ? ' · Double-click: one operation' : '');
  viewTitle.title = hint;
  viewTitle.setAttribute('aria-label', `${view.name}. ${hint}`);

  if (id !== 'operations' && !treeOpen) {
    treeOpen = true;
    render();
  }
  // В Model и Simulation нет Inspector — где бы он ни стоял (колонка, правый док, плавающий)
  setPanelHidden(inspectorPanel, Boolean(view.noInspector));

  workContext = view.context;
  announceWork();
  // Симуляция (simulation.js) просыпается в своём виде и засыпает в других
  document.dispatchEvent(new CustomEvent('treeview', { detail: { view: id } }));
}

setTreeView(treeView);
