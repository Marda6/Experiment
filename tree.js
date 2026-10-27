// Дерево операций: станок → setup → operations (детали и группы пока скрыты).
// Данные пока сгенерированы, чтобы показать объём в сотни операций.

const OPERATION_POOLS = {
  Roughing: ['Face milling', 'Adaptive roughing', 'Pocket roughing', 'Rest roughing', 'Slot roughing'],
  'Semi-finishing': ['Z-level semi-finish', 'Parallel semi-finish', 'Rest machining', 'Contour 2D'],
  Finishing: ['Z-level finishing', 'Parallel finishing', 'Scallop finishing', 'Pencil', 'Floor finishing', 'Wall finishing'],
  Holes: ['Spot drilling', 'Drilling Ø6.8', 'Tapping M8', 'Drilling Ø10', 'Reaming Ø10H7', 'Counterbore Ø14'],
  Chamfers: ['Chamfer 0.5×45°', 'Deburring', 'Edge break'],
};

// Инструмент каждой операции: номер в магазине и название
const OPERATION_TOOLS = {
  'Face milling': ['T1', 'Ø50 face mill'],
  'Adaptive roughing': ['T2', 'Ø12 end mill'],
  'Pocket roughing': ['T2', 'Ø12 end mill'],
  'Rest roughing': ['T4', 'Ø6 end mill'],
  'Slot roughing': ['T3', 'Ø8 end mill'],
  'Z-level semi-finish': ['T5', 'Ø8 ball mill'],
  'Parallel semi-finish': ['T5', 'Ø8 ball mill'],
  'Rest machining': ['T4', 'Ø6 end mill'],
  'Contour 2D': ['T3', 'Ø8 end mill'],
  'Z-level finishing': ['T6', 'Ø6 ball mill'],
  'Parallel finishing': ['T6', 'Ø6 ball mill'],
  'Scallop finishing': ['T7', 'Ø4 ball mill'],
  Pencil: ['T8', 'Ø2 ball mill'],
  'Floor finishing': ['T9', 'Ø10 bull nose R1'],
  'Wall finishing': ['T3', 'Ø8 end mill'],
  'Spot drilling': ['T10', 'Spot drill 90°'],
  'Drilling Ø6.8': ['T11', 'Drill Ø6.8'],
  'Tapping M8': ['T12', 'Tap M8'],
  'Drilling Ø10': ['T13', 'Drill Ø10'],
  'Reaming Ø10H7': ['T14', 'Reamer Ø10H7'],
  'Counterbore Ø14': ['T15', 'Counterbore Ø14'],
  'Chamfer 0.5×45°': ['T16', 'Chamfer mill 90°'],
  Deburring: ['T16', 'Chamfer mill 90°'],
  'Edge break': ['T16', 'Chamfer mill 90°'],
};

const GROUPS = Object.keys(OPERATION_POOLS);
const OPERATION_COUNTS = [22, 14, 30, 30, 10]; // операций в каждой группе установа

// Все операции стартуют в начальном статусе — «не рассчитано»; дальше статусы меняют Calculate и сброс
function makeOperations(group, count) {
  const pool = OPERATION_POOLS[group];
  return Array.from({ length: count }, (_, i) => {
    const base = pool[i % pool.length];
    const round = Math.floor(i / pool.length);
    return {
      name: base + (round ? ` ${round + 1}` : ''),
      group, // группа в дереве не показывается, но нужна ассистенту в чате
      tool: OPERATION_TOOLS[base],
      status: 'not-calculated',
    };
  });
}

// Детали и группы пока не показываем — операции лежат прямо в установе, по порядку групп
const treeData = {
  name: 'DMU 50',
  children: ['Setup 1', 'Setup 2'].map((setup) => ({
    name: setup,
    children: GROUPS.flatMap((group, g) => makeOperations(group, OPERATION_COUNTS[g])),
  })),
};

// Статус ветки — худший среди операций внутри
function statusOf(node) {
  if (!node.children) return node.status;
  return node.children
    .map(statusOf)
    .reduce((worst, status) => (STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(worst) ? status : worst));
}

function renderNode(node, level) {
  const item = document.createElement('li');
  item.className = 'tree__item';
  item.setAttribute('role', 'treeitem');
  item.setAttribute('aria-level', String(level + 1));
  item.setAttribute('aria-selected', 'false');

  const row = document.createElement('div');
  row.className = 'tree__row';
  row.style.setProperty('--level', level);

  const toggle = document.createElement('span');
  toggle.className = 'tree__toggle';

  const name = document.createElement('span');
  name.className = 'tree__name';
  name.textContent = node.name;

  row.append(toggle, name);
  item.append(row);

  // Столбик инструмента: номер — ссылка на инструмент, рядом название
  if (node.tool) {
    const [number, toolName] = node.tool;
    item.dataset.group = node.group;
    item.dataset.tool = number;
    item.dataset.toolName = toolName;

    const tool = document.createElement('span');
    tool.className = 'tree__tool';

    const link = document.createElement('a');
    link.className = 'tree__tool-number';
    link.href = `#tool-${number}`;
    link.textContent = number;

    const label = document.createElement('span');
    label.className = 'tree__tool-name';
    label.textContent = toolName;

    tool.append(link, label);
    row.append(tool);
  }

  // Статус — у операций и у веток, последним столбиком справа
  const status = statusOf(node);
  item.dataset.status = status;
  row.append(statusIcon(status));

  if (node.children) {
    item.classList.add('tree__item--branch');
    item.setAttribute('aria-expanded', 'true');

    const group = document.createElement('ul');
    group.className = 'tree__group';
    group.setAttribute('role', 'group');
    node.children.forEach((child) => group.append(renderNode(child, level + 1)));
    item.append(group);
  }

  return item;
}

const tree = document.querySelector('.tree');
tree.append(renderNode(treeData, 0));

// Все операции (листья) в порядке дерева — для нумерации и листалки.
// Дерево меняется (добавили операцию) — пересобираем и сообщаем событием treechange
let operationItems = [...tree.querySelectorAll('.tree__item:not(.tree__item--branch)')];

function refreshOperationIndex() {
  operationItems = [...tree.querySelectorAll('.tree__item:not(.tree__item--branch)')];
  document.dispatchEvent(new CustomEvent('treechange'));
}

// Статус операции меняется на ходу (расчёт, сброс) — иконка заменяется, ветки пересчитываются
function setStatus(item, status) {
  item.dataset.status = status;
  item.querySelector(':scope > .tree__row > .status').replaceWith(statusIcon(status));
}

function refreshBranchStatuses() {
  // снизу вверх: у ветки худший статус среди операций внутри
  [...tree.querySelectorAll('.tree__item--branch')].reverse().forEach((branch) => {
    const statuses = [...branch.querySelectorAll('.tree__item:not(.tree__item--branch)')].map((item) => item.dataset.status);
    if (!statuses.length) return;
    const worst = statuses.reduce((a, b) => (STATUS_ORDER.indexOf(b) < STATUS_ORDER.indexOf(a) ? b : a));
    if (branch.dataset.status !== worst) setStatus(branch, worst);
  });
}

function nameOf(item) {
  return item.querySelector(':scope > .tree__row .tree__name').textContent;
}

// Путь без станка: Setup 1
function pathOf(item) {
  const names = [];
  for (let parent = item.parentElement.closest('.tree__item'); parent; parent = parent.parentElement.closest('.tree__item')) {
    names.unshift(nameOf(parent));
  }
  return names.slice(1).join(' › ');
}

// Разделитель между названием и инструментом: линия видна при наведении, тянется (divider.js)
const operationsPanel = document.querySelector('.layer--operations');
const toolSplit = operationsPanel.querySelector('.tree-split');

const TOOL_COLUMN_DEFAULT = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tool-column'));
const TOOL_COLUMN_MIN = 64;
const TOOL_COLUMN_STEP = 8;
const NAME_COLUMN_MIN = 200; // названию с отступами уровней оставляем не меньше

// Столбик инструмента — доля ширины дерева (как столбики инспектора): панель шире — шире и название,
// и инструмент. Первая доля — от ширины по умолчанию; разделитель задаёт новую, двойной клик — исходную
let toolColumn = TOOL_COLUMN_DEFAULT;
let toolShare = null;
let toolShareDefault = null;

function applyToolColumn(width) {
  const max = Math.max(tree.clientWidth - NAME_COLUMN_MIN, TOOL_COLUMN_MIN);
  toolColumn = Math.round(Math.min(Math.max(width, TOOL_COLUMN_MIN), max));
  document.documentElement.style.setProperty('--tool-column', `${toolColumn}px`);
  toolSplit.setAttribute('aria-valuenow', String(toolColumn));
}

function setToolColumn(width) {
  applyToolColumn(width);
  if (tree.clientWidth) toolShare = toolColumn / tree.clientWidth;
}

// Ширина дерева поменялась (колонку растянули, появился скроллбар) — столбик держит свою долю.
// Спрятанное дерево (другой вид, одна операция) не трогаем
function syncToolSplit() {
  if (!tree.clientWidth) return;
  operationsPanel.style.setProperty('--tree-scrollbar', `${tree.offsetWidth - tree.clientWidth}px`);
  toolShareDefault ??= TOOL_COLUMN_DEFAULT / tree.clientWidth;
  toolShare ??= toolShareDefault;
  applyToolColumn(toolShare * tree.clientWidth);
}

syncToolSplit();
new ResizeObserver(syncToolSplit).observe(tree);

// Столбик инструмента справа — тянем влево, он шире (divider.js)
attachColumnDivider(toolSplit, {
  get: () => toolColumn,
  set: setToolColumn,
  reset: () => {
    toolShare = toolShareDefault;
    syncToolSplit();
  },
  sign: -1,
  step: TOOL_COLUMN_STEP,
});

// Выделение. Остальные (режим одной операции, чат) узнают о нём по событию treeselect
let selectedItem = null;

function selectItem(item, { reveal = false } = {}) {
  selectedItem?.setAttribute('aria-selected', 'false');
  item.setAttribute('aria-selected', 'true');
  selectedItem = item;

  // Выбрали не из дерева (листалка, список) — раскрываем свёрнутые ветки над строкой
  if (reveal) {
    for (let parent = item.parentElement.closest('.tree__item'); parent; parent = parent.parentElement.closest('.tree__item')) {
      parent.setAttribute('aria-expanded', 'true');
      parent.querySelector(':scope > .tree__group').hidden = false;
    }
  }

  document.dispatchEvent(new CustomEvent('treeselect', { detail: { item } }));
}

// Треугольник сворачивает/разворачивает ветку, клик по строке — выделение

tree.addEventListener('click', (event) => {
  const row = event.target.closest('.tree__row');
  if (!row) return;
  const item = row.parentElement;

  if (event.target.closest('.tree__toggle') && item.classList.contains('tree__item--branch')) {
    const expanded = item.getAttribute('aria-expanded') === 'true';
    item.setAttribute('aria-expanded', String(!expanded));
    item.querySelector(':scope > .tree__group').hidden = expanded;
    return;
  }

  selectItem(item);

  // Ссылка на инструмент пока никуда не ведёт — только выделяет операцию
  if (event.target.closest('.tree__tool-number')) event.preventDefault();
});

// Что-то выбрано всегда: при открытии — станок (корень дерева)
selectItem(tree.querySelector('.tree__item'));
