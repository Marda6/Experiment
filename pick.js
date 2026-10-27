// Выбор в интерфейсе для CamAgent — как стрелка в Claude. Кнопка-курсор в шапке CamAgent (работает и у свёрнутой
// панели) включает режим:
// подсвечивается то, что можно взять в контекст (параметр Inspector, вкладка, узел дерева операций, объект
// модели, строка кода симуляции, функция, фильтр), рядом — подпись «тип: что». Клик — чип в контексте
// сообщения (addContextPick, chat.js), режим выключается; Shift+клик — взять ещё. Грань — кликом по детали
// в сцене: её выбирает scene.js, и она попадает в контекст как обычно. Пока выбираем, интерфейс не реагирует
// на клики (сцену можно вращать). Esc или кнопка — выйти. Взяли хоть что-то — по выходу CamAgent разворачивается
// и курсор встаёт в поле ввода.
// nameOf, selectedItem (tree.js), simOps (simulation.js), addContextPick (chat.js)

const pickButton = document.querySelector('.chat__pick');
const pickOutline = document.createElement('div');
pickOutline.className = 'pick-outline';
pickOutline.hidden = true;
pickOutline.innerHTML = '<span class="pick-outline__tag"></span>';
document.body.append(pickOutline);
const pickTag = pickOutline.querySelector('.pick-outline__tag');

let picking = false;
let pickHover = null; // { el, pick } — что сейчас под курсором
let pickedNow = 0; // сколько взято за этот заход
const camAgentPanel = document.querySelector('.layer--chat');

// Развернуть CamAgent, где бы он ни стоял (колонка, док, плавающий): клик по шапке — у каждого места свой
function openCamAgent() {
  if (!camAgentPanel.classList.contains('is-expanded')) camAgentPanel.querySelector('.layer__header').click();
  camAgentPanel.querySelector('.chat__input')?.focus({ preventScroll: true });
}

// Значение строки Inspector: переключатель, поле, список, только чтение
function inspectorValue(row) {
  const control = row.querySelector('.irow__ctl');
  if (!control) return '';
  const parts = [];
  const toggle = control.querySelector('.ictl-switch');
  if (toggle) parts.push(toggle.getAttribute('aria-checked') === 'true' ? 'On' : 'Off');
  const input = control.querySelector('input');
  if (input) parts.push(input.value);
  const select = control.querySelector('select');
  if (select) parts.push(select.value);
  const readonly = control.querySelector('.ictl-readonly');
  if (readonly) parts.push(readonly.textContent);
  return parts.join(', ');
}

const simLabel = (row) => row.querySelector('.sim-row__label')?.textContent ?? '';

// Что можно выбрать и как это назвать: [селектор, (элемент) → { kind, name }]. Порядок — от частного к общему
const PICKABLES = [
  ['.irow', (row) => {
    const tab = document.querySelector('#inspector-body .insp__title')?.textContent ?? 'Inspector';
    if (row.classList.contains('irow--head')) return { kind: 'Parameters', name: `${tab} › ${row.textContent.trim()}` };
    const label = row.querySelector('.irow__text')?.textContent ?? '';
    const value = inspectorValue(row);
    return { kind: 'Parameter', name: `${tab} › ${label}${value ? ` = ${value}` : ''}` };
  }],
  ['.insp__tab', (tab) => ({ kind: 'Inspector tab', name: tab.getAttribute('aria-label') })],
  ['#operations-tree .tree__row', (row) => {
    const item = row.parentElement;
    const kind = ['Machine', 'Setup', 'Operation'][Number(item.getAttribute('aria-level')) - 1] ?? 'Node';
    return { kind, name: nameOf(item) + (item.dataset.tool ? ` · ${item.dataset.tool}` : '') };
  }],
  ['#model-tree .tree__row', (row) => ({ kind: row.parentElement.modelNode.kind, name: row.parentElement.modelNode.name })],
  ['.sim-row', (row) => {
    if (row.dataset.node === 'machine') return { kind: 'Machine', name: simLabel(row) };
    if (row.dataset.node) return { kind: 'Setup', name: simLabel(row) };
    const op = simOps[Number(row.dataset.op)];
    if (!op) return null;
    if (row.dataset.group) return { kind: 'Code group', name: `${op.name} · ${simLabel(row)}` };
    if (row.classList.contains('sim-row--code')) return { kind: 'Code', name: `${op.name} · ${simLabel(row)}` };
    return { kind: 'Operation', name: `${op.name}${op.tool ? ` · ${op.tool}` : ''}` };
  }],
  ['.current__info', () => (selectedItem ? { kind: 'Operation', name: nameOf(selectedItem) } : null)],
  ['.oplist__option', (option) => ({ kind: 'Operation', name: option.querySelector('.oplist__name')?.textContent })],
  ['.fnbar__btn[data-fn]', (button) => ({ kind: 'Function', name: button.getAttribute('aria-label') })],
  ['.filter-cell', (cell) => ({ kind: 'Filter', name: cell.getAttribute('aria-label') })],
  ['.model-tools__btn', (button) => ({ kind: 'Model tool', name: button.title })],
];

function pickAt(target) {
  if (!(target instanceof Element) || pickButton.contains(target)) return null;
  for (const [selector, describe] of PICKABLES) {
    const el = target.closest(selector);
    if (!el) continue;
    const pick = describe(el);
    return pick?.name ? { el, pick } : null;
  }
  return null;
}

function showOutline(hit) {
  pickOutline.hidden = !hit;
  if (!hit) return;
  const rect = hit.el.getBoundingClientRect();
  pickOutline.style.left = `${rect.left}px`;
  pickOutline.style.top = `${rect.top}px`;
  pickOutline.style.width = `${rect.width}px`;
  pickOutline.style.height = `${rect.height}px`;
  pickOutline.classList.toggle('is-tag-below', rect.top < 22);
  pickTag.textContent = `${hit.pick.kind}: ${hit.pick.name}`;
}

function setPicking(on) {
  picking = on;
  pickButton.setAttribute('aria-pressed', String(on));
  document.documentElement.classList.toggle('is-picking', on);
  if (on) {
    pickedNow = 0;
    return;
  }
  pickHover = null;
  pickOutline.hidden = true;
  if (pickedNow) openCamAgent();
}

pickButton.addEventListener('click', () => setPicking(!picking));

// Пока выбираем: курсор над чем-то, что можно взять, — рамка и подпись
document.addEventListener('pointermove', (event) => {
  if (!picking) return;
  pickHover = pickAt(event.target);
  showOutline(pickHover);
}, true);

// прокрутили под курсором — рамка следует за строкой
document.addEventListener('scroll', () => {
  if (picking && pickHover) showOutline(pickHover);
}, true);

// Интерфейс не реагирует: ни нажатий, ни фокуса, ни раскрытия списков. Сцена — нет: её можно вращать,
// а клик по детали выбирает грань (scene.js)
const passesThrough = (target) => pickButton.contains(target) || Boolean(target.closest?.('canvas'));

['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'dblclick'].forEach((type) => {
  document.addEventListener(type, (event) => {
    if (!picking || passesThrough(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
});

document.addEventListener('click', (event) => {
  if (!picking || passesThrough(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  const hit = pickAt(event.target);
  if (!hit) return;
  addContextPick(hit.pick);
  pickedNow += 1;
  if (!event.shiftKey) setPicking(false);
}, true);

// Грань выбрана в сцене — она уже в контексте (chat.js), режим выключаем
document.addEventListener('faceselect', (event) => {
  if (!picking || !event.detail) return;
  pickedNow += 1;
  setPicking(false);
});

document.addEventListener('keydown', (event) => {
  if (!picking || event.key !== 'Escape') return;
  event.stopPropagation();
  setPicking(false);
}, true);
