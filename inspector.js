// Inspector — примерка инспектора ENCY: слева рейка вкладок (Core icn_inspector),
// справа заголовок вкладки и строки «подпись | контрол». Набор вкладок зависит от узла,
// выбранного в дереве, как в ENCY. Параметры — из прототипа ENCY_UI, значения примерные.
// INSPECTOR_ICONS — из inspector-icons.js; selectedItem — из tree.js

const inspectorBody = document.querySelector('#inspector-body');

// Вкладки по типу узла (детали и группы пока скрыты). Hole — только у сверлильных операций
const INSPECTOR_CONTEXT = {
  machine: ['Setup', 'Machine', 'Links', 'Fixture'],
  setup: ['Setup', 'Links', 'Workpiece', 'Fixture', 'Restriction'],
  operation: ['Setup', 'Job', 'Hole', 'Strategy', 'Parameters', 'Links', 'Tool', 'Speeds', 'Fixture'],
};
const NODE_KINDS = ['machine', 'setup', 'operation']; // по aria-level узла дерева
const DRILLING = /drill|tapping|reaming|counterbore/i;
const TAB_TITLES = { Tool: 'Tool Assembly' };

// Строки вкладок. ctl: input · dropdown · toggle · toggleInput · readonly; head — заголовок группы; divider — линия
const INSPECTOR_TABS = {
  Setup: [
    { label: 'Coordinate system', ctl: 'dropdown', val: 'World', opts: ['World', 'Part', 'Custom'] },
    { label: 'Origin X', ctl: 'input', val: '0.000', indent: 1 },
    { label: 'Origin Y', ctl: 'input', val: '0.000', indent: 1 },
    { label: 'Origin Z', ctl: 'input', val: '0.000', indent: 1 },
    { label: 'Clearance', ctl: 'toggleInput', on: false, val: '10.000' },
    { label: 'Stock', ctl: 'dropdown', val: 'From solid', opts: ['From solid', 'Box', 'Cylinder'] },
    { label: 'Orientation', ctl: 'dropdown', val: 'Z up', opts: ['Z up', 'Y up', 'X up'], indent: 1 },
    { label: 'Top height', ctl: 'dropdown', val: 'Model top', opts: ['Model top', 'Stock top'], indent: 1 },
    { label: 'Flip Z', ctl: 'toggle', on: true, indent: 1 },
    { label: 'Safe Z', ctl: 'input', val: '25.000' },
    { label: 'Rapid Z', ctl: 'input', val: '5.000' },
  ],
  Machine: [
    { label: 'Machine', ctl: 'dropdown', val: 'DMU 50', opts: ['DMU 50', 'HAAS VF-4', 'Mill-turn machine'] },
    { label: 'Machine limits', ctl: 'toggle', on: true },
    { type: 'divider' },
    { head: 'Tool coordinates in WCS', group: 'tcw' },
    { label: 'X', ctl: 'readonly', val: '-2.727', indent: 1, group: 'tcw' },
    { label: 'Y', ctl: 'readonly', val: '42.019', indent: 1, group: 'tcw' },
    { label: 'Z', ctl: 'readonly', val: '740.566', indent: 1, group: 'tcw' },
  ],
  Job: [
    { label: 'Job', ctl: 'dropdown', val: 'Main program', opts: ['Main program', 'Subprogram 1'] },
    { label: 'Program number', ctl: 'input', val: 'O1001' },
    { label: 'Comment', ctl: 'input', val: 'Housing, side A' },
  ],
  Hole: [
    { label: 'Hole type', ctl: 'dropdown', val: 'Through', opts: ['Through', 'Blind'] },
    { label: 'Depth', ctl: 'input', val: '20 mm', indent: 1 },
    { label: 'Peck drilling', ctl: 'toggleInput', on: false, val: '2 mm' },
  ],
  Strategy: [
    { label: 'Pattern', ctl: 'dropdown', val: 'Parallel', opts: ['Parallel', 'Offset', 'Spiral', 'Adaptive'] },
    { label: 'Stepover', ctl: 'input', val: '2.000', indent: 1 },
    { label: 'Stock to leave', ctl: 'input', val: '0.200', indent: 1 },
    { label: 'Climb milling', ctl: 'toggle', on: true },
  ],
  Parameters: [
    { label: 'Tolerance', ctl: 'input', val: '0.01 mm' },
    { label: 'Stock to leave', ctl: 'input', val: '0.2 mm' },
    { label: 'Step down', ctl: 'input', val: '1.5 mm' },
    { label: 'Rest machining', ctl: 'toggle', on: false },
  ],
  Links: [
    { head: 'Approach/Return', group: 'ar' },
    { label: 'Approach', ctl: 'dropdown', val: 'Avoid collisions', opts: ['Avoid collisions', 'Direct', 'Along the tool axis'], indent: 1, group: 'ar' },
    { label: 'Return', ctl: 'dropdown', val: 'Avoid collisions', opts: ['Avoid collisions', 'Direct', 'Along the tool axis'], indent: 1, group: 'ar' },
    { label: 'Tool change position', ctl: 'dropdown', val: 'From previous', opts: ['From previous', 'Home', 'Custom'], indent: 1, group: 'ar' },
    { type: 'divider' },
    { head: 'Safe motions', group: 'safe' },
    { label: 'Safe surface', ctl: 'dropdown', val: 'Plane', opts: ['Plane', 'Cylinder', 'Sphere'], indent: 1, group: 'safe' },
    { label: 'Safe level', ctl: 'input', val: '10 mm from the top', indent: 1, group: 'safe' },
    { label: 'Avoid collisions at rapid', ctl: 'toggle', on: false, indent: 1, group: 'safe' },
    { label: 'Check workpiece', ctl: 'toggle', on: false, indent: 1, group: 'safe' },
    { label: 'Safe distance', ctl: 'input', val: '20 mm', indent: 1, group: 'safe' },
  ],
  // Tool — инструмент выбранной операции (номер и название из дерева)
  Tool: (item) => {
    const { tool = '—', toolName = '—' } = item?.dataset ?? {};
    const diameter = toolName.match(/Ø([\d.]+)/)?.[1];
    return [
      { label: 'Tool', ctl: 'dropdown', val: toolName, opts: [toolName] },
      { label: 'Number', ctl: 'readonly', val: tool },
      { label: 'Corrector', ctl: 'dropdown', val: 'Auto', opts: ['Auto', 'D1', 'D2'] },
      { type: 'divider' },
      { head: 'Geometry', group: 'geom' },
      { label: 'Diameter', ctl: 'readonly', val: diameter ? `${diameter} mm` : '—', indent: 1, group: 'geom' },
      { label: 'Length (L)', ctl: 'readonly', val: '75 mm', indent: 1, group: 'geom' },
      { label: 'Working length (WL)', ctl: 'readonly', val: '30 mm', indent: 1, group: 'geom' },
      { head: 'Holder', group: 'holder' },
      { label: 'Holder', ctl: 'dropdown', val: 'HSK-A63 ER32', opts: ['HSK-A63 ER32', 'HSK-A63 Weldon'], indent: 1, group: 'holder' },
      { label: 'Holder length', ctl: 'readonly', val: '100 mm', indent: 1, group: 'holder' },
    ];
  },
  Speeds: [
    { label: 'Spindle speed', ctl: 'input', val: '12000 rpm' },
    { label: 'Feed rate', ctl: 'input', val: '1200 mm/min', indent: 1 },
    { label: 'Plunge rate', ctl: 'input', val: '300 mm/min', indent: 1 },
    { label: 'Units', ctl: 'dropdown', val: 'mm/min', opts: ['mm/min', 'mm/tooth'] },
    { label: 'Adaptive feed', ctl: 'toggle', on: false },
  ],
  Fixture: [
    { label: 'Type', ctl: 'dropdown', val: 'Vise', opts: ['Vise', 'Chuck', 'Clamps'] },
    { label: 'Offset', ctl: 'input', val: '0.000', indent: 1 },
    { label: 'Clamp', ctl: 'toggle', on: false },
  ],
  Workpiece: [
    { label: 'Workpiece', ctl: 'dropdown', val: 'Auto – result of the previous operation', opts: ['Auto – result of the previous operation', 'Box', 'Cylinder', 'From solid'] },
    { label: 'Offset', ctl: 'input', val: '1 mm', indent: 1 },
  ],
  Restriction: [
    { label: 'Restriction', ctl: 'dropdown', val: 'None', opts: ['None', 'Box', 'Curves', 'Faces'] },
    { label: 'Tool position', ctl: 'dropdown', val: 'Center', opts: ['Center', 'Inside', 'Outside'], indent: 1 },
    { label: 'Offset', ctl: 'input', val: '0 mm', indent: 1 },
  ],
};

let inspectorTab = 'Strategy'; // открытая вкладка; если у узла её нет — первая

/* ---------- Контролы ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function switchControl(on, label) {
  const toggle = el('button', 'ictl-switch');
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(on));
  toggle.setAttribute('aria-label', label);
  toggle.addEventListener('click', () => toggle.setAttribute('aria-checked', String(toggle.getAttribute('aria-checked') !== 'true')));
  return toggle;
}

function inputControl(value, label) {
  const input = el('input', 'ictl-input');
  input.value = value;
  input.setAttribute('aria-label', label);
  return input;
}

function control(row) {
  const box = el('div', 'irow__ctl');
  if (row.ctl === 'input') box.append(inputControl(row.val, row.label));
  if (row.ctl === 'readonly') box.append(el('span', 'ictl-readonly', row.val));
  if (row.ctl === 'toggle') box.append(switchControl(row.on, row.label));
  if (row.ctl === 'toggleInput') box.append(switchControl(row.on, row.label), inputControl(row.val, row.label));
  if (row.ctl === 'dropdown') {
    const wrap = el('span', 'ictl-dropdown');
    const select = el('select', 'ictl-select');
    select.setAttribute('aria-label', row.label);
    (row.opts ?? [row.val]).forEach((option) => select.append(new Option(option, option, false, option === row.val)));
    wrap.append(select);
    box.append(wrap);
  }
  return box;
}

/* ---------- Строки ---------- */

function buildRow(row) {
  if (row.type === 'divider') return el('div', 'irow-divider');

  const line = el('div', row.head ? 'irow irow--head' : 'irow');
  line.style.setProperty('--indent', row.indent ?? 0);
  if (row.group && !row.head) line.dataset.group = row.group;

  const label = el('div', 'irow__label');
  if (row.head) {
    // заголовок группы — кнопка, сворачивает строки своей группы
    const head = el('button', 'irow__head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'true');
    head.append(el('span', 'irow__chev'), el('span', 'irow__text', row.head));
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(open));
      inspectorBody.querySelectorAll(`.irow[data-group="${row.group}"]`).forEach((child) => { child.hidden = !open; });
    });
    label.append(head);
    line.append(label);
    return line;
  }

  label.append(el('span', 'irow__text', row.label));
  label.title = row.label;
  line.append(label, control(row));
  return line;
}

/* ---------- Разделитель «подпись | контрол» (как в дереве, divider.js) ---------- */

// Подписи — доля ширины (как столбик инструмента в дереве): по умолчанию подписи и контролы поровну,
// панель шире — оба шире в той же пропорции. Разделитель задаёт новую долю, двойной клик — снова поровну
const INSP_LABEL_SHARE = 0.5;
const INSP_LABEL_MIN = 80;
const INSP_CONTROL_MIN = 100; // контролу оставляем не меньше

let inspLabel = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--insp-label'));
let inspShare = INSP_LABEL_SHARE;

// Один на все перерисовки — ширина подписей сохраняется при смене узла и вкладки
const inspSplit = el('div', 'col-split insp-split');
inspSplit.setAttribute('role', 'separator');
inspSplit.setAttribute('aria-orientation', 'vertical');
inspSplit.setAttribute('aria-label', 'Ширина столбика подписей');
inspSplit.tabIndex = 0;

const inspMainWidth = () => inspectorBody.querySelector('.insp__main')?.clientWidth ?? 0;

function applyInspLabel(width) {
  const main = inspMainWidth();
  const max = main ? Math.max(main - INSP_CONTROL_MIN, INSP_LABEL_MIN) : width;
  inspLabel = Math.round(Math.min(Math.max(width, INSP_LABEL_MIN), max));
  document.documentElement.style.setProperty('--insp-label', `${inspLabel}px`);
  inspSplit.setAttribute('aria-valuenow', String(inspLabel));
}

function setInspLabel(width) {
  applyInspLabel(width);
  if (inspMainWidth()) inspShare = inspLabel / inspMainWidth();
}

// Ширина поменялась — подписи держат свою долю (спрятанный инспектор не трогаем)
function syncInspLabel() {
  if (inspMainWidth()) applyInspLabel(inspShare * inspMainWidth());
}

attachColumnDivider(inspSplit, {
  get: () => inspLabel,
  set: setInspLabel,
  reset: () => {
    inspShare = INSP_LABEL_SHARE;
    syncInspLabel();
  },
});

new ResizeObserver(syncInspLabel).observe(inspectorBody);

/* ---------- Рейка и вкладка ---------- */

function tabsFor(item) {
  const kind = NODE_KINDS[Number(item.getAttribute('aria-level')) - 1];
  const tabs = INSPECTOR_CONTEXT[kind];
  return kind === 'operation' && !DRILLING.test(nameOf(item)) ? tabs.filter((tab) => tab !== 'Hole') : tabs;
}

function renderInspector() {
  const item = selectedItem;

  if (!item) {
    inspectorBody.replaceChildren(el('p', 'insp-empty', 'Select an operation or a node in the Operations tree.'));
    return;
  }

  const tabs = tabsFor(item);
  if (!tabs.includes(inspectorTab)) inspectorTab = tabs[0];

  const rail = el('div', 'insp__rail');
  rail.setAttribute('role', 'tablist');
  rail.setAttribute('aria-orientation', 'vertical');
  tabs.forEach((tab) => {
    const button = el('button', 'insp__tab');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab === inspectorTab));
    button.setAttribute('aria-label', TAB_TITLES[tab] ?? tab);
    button.title = TAB_TITLES[tab] ?? tab;
    button.innerHTML = INSPECTOR_ICONS[tab.toLowerCase()];
    button.addEventListener('click', () => {
      inspectorTab = tab;
      renderInspector();
    });
    rail.append(button);
  });

  const main = el('div', 'insp__main');
  main.setAttribute('role', 'tabpanel');
  main.append(el('div', 'insp__title', TAB_TITLES[inspectorTab] ?? inspectorTab));
  const rows = typeof INSPECTOR_TABS[inspectorTab] === 'function' ? INSPECTOR_TABS[inspectorTab](item) : INSPECTOR_TABS[inspectorTab];
  rows.forEach((row) => main.append(buildRow(row)));

  const inspector = el('div', 'insp');
  inspector.append(rail, main, inspSplit);
  inspectorBody.replaceChildren(inspector);
}

document.addEventListener('treeselect', renderInspector);
renderInspector();
