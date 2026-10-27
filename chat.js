// CamAgent — чат с ИИ-ассистентом (панель .layer--chat). Пока ответы имитируются локально: ассистент «думает»,
// затем печатает ответ по словам. Отвечает на языке вопроса (RU/EN) и опирается
// на дерево операций и контекст — то, что выбрано (операция, грань детали), и прикреплённые файлы.
// Поле без кнопки Send: Enter — отправить (пока ассистент отвечает — в очередь), + — файлы,
// микрофон — голосовой ввод, ■ — остановить ответ; под полем — режим и модель.
const chatPanel = document.querySelector('.layer--chat');
const messages = chatPanel.querySelector('.chat__messages');
const emptyState = chatPanel.querySelector('.chat__empty');
const form = chatPanel.querySelector('.chat__composer');
const contextBar = chatPanel.querySelector('.chat__context');
const input = chatPanel.querySelector('.chat__input');
const attachButton = chatPanel.querySelector('.chat__attach');
const fileInput = chatPanel.querySelector('.chat__file');
const stopButton = chatPanel.querySelector('.chat__stop');
const micButton = chatPanel.querySelector('.chat__mic');
const spinner = chatPanel.querySelector('.chat__spinner');
const note = chatPanel.querySelector('.chat__note');

const INPUT_MAX_HEIGHT = 160;
let reply = null; // текущий ответ ассистента: { message, timer }
const queue = []; // сообщения, отправленные, пока ассистент отвечал: { message, question, context }

/* ---------- Контекст: что выбрано сейчас ---------- */

const TREE_KINDS = ['Machine', 'Setup', 'Operation']; // по aria-level узла дерева (детали и группы пока скрыты)
const FACE_NAMES = {
  top: { en: 'Top', ru: 'Верхняя' },
  bottom: { en: 'Bottom', ru: 'Нижняя' },
  front: { en: 'Front', ru: 'Передняя' },
  back: { en: 'Back', ru: 'Задняя' },
  left: { en: 'Left', ru: 'Левая' },
  right: { en: 'Right', ru: 'Правая' },
};

// Выбор приходит событиями от дерева операций (treeselect), дерева модели (modelselect) и 3D-вида (faceselect).
// Крестик на чипе убирает его до следующего выбора
const selection = { operation: selectedItem, model: null, face: null };
const dismissed = { operation: false, model: false, face: false };
let attachments = []; // прикреплённые файлы — уходят с ближайшим сообщением

function contextItems() {
  const items = [];
  const { operation, model, face } = selection;
  if (operation && !dismissed.operation) {
    const kind = TREE_KINDS[Number(operation.getAttribute('aria-level')) - 1];
    items.push({ key: 'operation', kind, name: nameOf(operation), operation });
  }
  if (model && !dismissed.model) {
    items.push({ key: 'model', kind: model.kind, name: model.name, model });
  }
  if (face && !dismissed.face) {
    items.push({ key: 'face', kind: 'Face', name: `${face.part} · ${FACE_NAMES[face.face].en}`, face });
  }
  attachments.forEach((file) => items.push({ key: 'file', kind: 'File', name: file.name, file }));
  return items;
}

function createChip({ kind, name }, onRemove) {
  const chip = document.createElement('span');
  chip.className = onRemove ? 'chip' : 'chip chip--static';
  chip.title = `${kind}: ${name}`;
  chip.innerHTML = '<span class="chip__kind"></span><span class="chip__name"></span>';
  chip.querySelector('.chip__kind').textContent = kind;
  chip.querySelector('.chip__name').textContent = name;

  if (onRemove) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip__remove';
    remove.setAttribute('aria-label', `Убрать из контекста: ${name}`);
    remove.innerHTML = '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M1.5 1.5l5 5M6.5 1.5l-5 5" /></svg>';
    remove.addEventListener('click', onRemove);
    chip.append(remove);
  }
  return chip;
}

function renderContext() {
  const items = contextItems();
  contextBar.replaceChildren(...items.map((item) => createChip(item, () => {
    if (item.key === 'file') attachments = attachments.filter((file) => file !== item.file);
    else dismissed[item.key] = true;
    renderContext();
    input.focus();
  })));
  contextBar.hidden = !items.length;
}

document.addEventListener('treeselect', (event) => {
  selection.operation = event.detail.item;
  dismissed.operation = false;
  renderContext();
});

document.addEventListener('modelselect', (event) => {
  selection.model = event.detail;
  dismissed.model = false;
  renderContext();
});

document.addEventListener('faceselect', (event) => {
  selection.face = event.detail;
  dismissed.face = false;
  renderContext();
});

renderContext();

/* ---------- Сообщения ---------- */

function isNearBottom() {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 40;
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

function addMessage(role, text, context = []) {
  emptyState.hidden = true;

  const message = document.createElement('div');
  message.className = `chat__message chat__message--${role}`;

  if (role === 'assistant') {
    const author = document.createElement('span');
    author.className = 'chat__author';
    author.textContent = `CamAgent · ${chatSettings.model}`;
    message.append(author);
  }

  // Сообщение запоминает свой контекст — над текстом, без крестиков
  if (context.length) {
    const bar = document.createElement('div');
    bar.className = 'chat__message-context';
    bar.append(...context.map((item) => createChip(item)));
    message.append(bar);
  }

  const body = document.createElement('div');
  body.className = 'chat__text';
  body.textContent = text;
  message.append(body);

  messages.append(message);
  scrollToBottom();
  return message;
}

/* ---------- Ответы ассистента (имитация) ---------- */

const isRussian = (text) => /[а-яё]/i.test(text);

function pluralRu(n, [one, few, many]) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const operationsWord = (n, ru) =>
  ru ? `${n} ${pluralRu(n, ['операция', 'операции', 'операций'])}` : `${n} operation${n === 1 ? '' : 's'}`;

// nameOf / pathOf — из tree.js
const operationCount = (item) => item.querySelectorAll('.tree__item:not(.tree__item--branch)').length;
const childBranches = (item) => [...item.querySelectorAll(':scope > .tree__group > .tree__item--branch')];

const GROUP_NOTES = {
  Roughing: {
    en: 'Roughing removes the bulk of the stock quickly and leaves an even allowance for the next passes. The priority is material removal rate and a stable tool load.',
    ru: 'Черновая обработка быстро снимает основной объём заготовки и оставляет ровный припуск под следующие проходы. Главное здесь — производительность и стабильная нагрузка на инструмент.',
  },
  'Semi-finishing': {
    en: 'Semi-finishing evens out the stepped allowance left after roughing, so the finishing tool cuts a constant thin layer.',
    ru: 'Получистовая обработка выравнивает ступенчатый припуск после черновой, чтобы чистовой инструмент снимал постоянный тонкий слой.',
  },
  Finishing: {
    en: 'Finishing produces the final surface and tolerance: small stepover, light depth of cut, high spindle speed.',
    ru: 'Чистовая обработка даёт итоговую поверхность и точность: малый шаг, небольшая глубина резания, высокие обороты.',
  },
  Holes: {
    en: 'A hole-making cycle. Order matters: spot drill → drill → tap or ream, each step with its own tool.',
    ru: 'Цикл обработки отверстий. Важен порядок: центровка → сверление → резьба или развёртка, у каждого шага свой инструмент.',
  },
  Chamfers: {
    en: 'Edge treatment: breaks sharp edges after the main machining so the part is safe to handle and assemble.',
    ru: 'Обработка кромок: снимает острые края после основной обработки, чтобы деталь была безопасной при сборке.',
  },
};

function countReply(question, ru) {
  const text = question.toLowerCase();
  const branches = [...tree.querySelectorAll('.tree__item--branch')];
  const match = branches.find((item) => text.includes(nameOf(item).toLowerCase()));

  // Ничего конкретного не назвали — считаем всё дерево
  const name = match ? nameOf(match) : nameOf(branches[0]);
  const items = match ? branches.filter((item) => nameOf(item) === name) : [branches[0]];
  const total = items.reduce((sum, item) => sum + operationCount(item), 0);

  // Одноимённых узлов несколько (группы) — разбивка по местам, иначе — по дочерним узлам
  const lines = items.length > 1
    ? items.map((item) => `— ${pathOf(item)}: ${operationCount(item)}`)
    : childBranches(items[0]).map((child) => `— ${nameOf(child)}: ${operationCount(child)}`);

  const head = ru ? `В ${name} — ${operationsWord(total, true)}.` : `${name} has ${operationsWord(total, false)}.`;
  return lines.length ? `${head}\n\n${lines.join('\n')}` : head;
}

function selectedReply(ru, item = selectedItem) {
  if (!item) {
    return ru
      ? 'Пока ничего не выбрано. Выберите операцию в дереве Operations и спросите ещё раз.'
      : 'Nothing is selected yet. Pick an operation in the Operations tree and ask again.';
  }

  const name = nameOf(item);
  const path = pathOf(item);

  if (item.classList.contains('tree__item--branch')) {
    const count = operationsWord(operationCount(item), ru);
    return ru ? `${name} — это узел дерева, в нём ${count}.` : `${name} is a tree node with ${count}.`;
  }

  const group = item.dataset.group; // группа в дереве скрыта, но хранится у операции
  const note = GROUP_NOTES[group]?.[ru ? 'ru' : 'en'] ?? '';
  return `${name}\n${path}\n\n${note}`;
}

// Какие операции обрабатывают грань (имитация по типу грани)
const FACE_OPERATIONS = {
  top: ['Face milling', 'Pocket roughing', 'Floor finishing'],
  bottom: ['Face milling', 'Adaptive roughing'],
  side: ['Contour 2D', 'Wall finishing', 'Drilling Ø6.8', 'Tapping M8'],
};

function faceReply({ part, face }, ru) {
  const list = (FACE_OPERATIONS[face] ?? FACE_OPERATIONS.side).map((op) => `— ${op}`).join('\n');
  const name = FACE_NAMES[face][ru ? 'ru' : 'en'];
  const flipped = face === 'bottom';
  const setup = flipped ? 'Setup 2' : 'Setup 1';

  return ru
    ? `${name} грань детали ${part}.\n\nЕё обрабатывают:\n${list}\n\nОбработка в ${setup}${flipped ? ', после переворота детали' : ''}.`
    : `${name} face of ${part}.\n\nMachined by:\n${list}\n\nThis happens in ${setup}${flipped ? ', after the part is flipped' : ''}.`;
}

// Вопрос не распознан, но есть контекст — показываем, что видим, и что можно спросить
function contextReply(context, ru) {
  const lines = context.map((item) => `— ${item.kind}: ${item.name}`).join('\n');
  return ru
    ? `В контексте:\n${lines}\n\nСпросите, что делает операция, какие операции обрабатывают грань или какой взять инструмент.`
    : `In context:\n${lines}\n\nAsk me what the operation does, which operations machine the face, or which tools to use.`;
}

const REPLIES = {
  greeting: {
    en: "Hi! I'm CamAgent. I can see the operations tree — ask me about operations, setups, tools or cycle time.",
    ru: 'Привет! Я CamAgent. Я вижу дерево операций — спрашивайте про операции, установы, инструмент или время обработки.',
  },
  time: {
    en: 'A few ways to cut cycle time:\n— Replace pocket roughing with adaptive roughing: higher feed at the same tool load.\n— Merge semi-finishing passes where the allowance is small.\n— Group holes by tool to avoid extra tool changes.\n— Reorder operations to shorten rapid moves between setups.',
    ru: 'Что можно сделать, чтобы сократить время:\n— Заменить черновую выборку кармана на адаптивную: выше подача при той же нагрузке.\n— Объединить получистовые проходы там, где припуск небольшой.\n— Сгруппировать отверстия по инструменту, чтобы не было лишних смен.\n— Переставить операции так, чтобы сократить холостые перемещения между установами.',
  },
  tools: {
    en: 'For this part I would start with:\n— Ø50 face mill for facing\n— Ø12 carbide end mill for adaptive roughing\n— Ø6 ball mill for Z-level and scallop finishing\n— 90° spot drill, Ø6.8 and Ø10 drills, M8 tap for holes',
    ru: 'Для этой детали я бы начал с такого набора:\n— торцевая фреза Ø50 для торцевания\n— твердосплавная концевая фреза Ø12 для адаптивной черновой\n— сферическая фреза Ø6 для чистовой по Z и scallop\n— центровка 90°, свёрла Ø6.8 и Ø10, метчик M8 для отверстий',
  },
  fallback: {
    en: "I'm a CamAgent prototype, so my answers are simulated for now. Try asking:\n— how many operations are in Setup 1\n— explain the selected operation\n— how to reduce cycle time\n— which tools to use",
    ru: 'Я пока прототип, мои ответы имитируются. Попробуйте спросить:\n— сколько операций в Setup 1\n— что делает выбранная операция\n— как сократить время обработки\n— какой инструмент взять',
  },
};

function buildReply(question, context = []) {
  const ru = isRussian(question);
  const lang = ru ? 'ru' : 'en';
  const q = question.toLowerCase();
  const operation = context.find((item) => item.key === 'operation')?.operation;
  const face = context.find((item) => item.key === 'face')?.face;

  if (/how many|count|сколько|количеств/.test(q)) return countReply(question, ru);
  if (/cycle|time|faster|speed|время|быстрее|ускор|сократ/.test(q)) return REPLIES.time[lang];
  if (/tool|cutter|drill|инструмент|фрез|сверл/.test(q)) return REPLIES.tools[lang];
  if (face && /face|surface|грань|грани|поверхн|сторон/.test(q)) return faceReply(face, ru);
  if (/selected|this|explain|what is|выбран|эт[аоиу]|объясни|что делает|что это/.test(q)) {
    // «Это» — то, что в контексте: сначала операция, потом грань
    if (operation) return selectedReply(ru, operation);
    if (face) return faceReply(face, ru);
    return selectedReply(ru);
  }
  if (/^(hi|hello|hey|привет|здравств|добрый)/.test(q)) return REPLIES.greeting[lang];
  if (context.length) return contextReply(context, ru);
  return REPLIES.fallback[lang];
}

/* ---------- Печать ответа ---------- */

// Пока отвечает: в поле ■ Stop, у модели — кольцо, Enter ставит сообщение в очередь
function setBusy(busy) {
  stopButton.hidden = !busy;
  spinner.hidden = !busy;
  input.placeholder = busy ? 'Enter to queue…' : 'Message CamAgent…';
}

function finishReply() {
  clearTimeout(reply.timer);
  reply.message.classList.remove('is-streaming');
  reply = null;
  setBusy(false);

  // следующее из очереди
  const next = queue.shift();
  if (next) {
    next.message.classList.remove('is-queued');
    next.message.querySelector('.chat__queued')?.remove();
    respond(next.question, next.context);
  }
}

function respond(question, context) {
  const message = addMessage('assistant', '');
  const body = message.querySelector('.chat__text');
  const tokens = buildReply(question, context).match(/\S+\s*/g) ?? [];
  let index = 0;

  message.classList.add('is-streaming');

  const typeNext = () => {
    const follow = isNearBottom();
    body.textContent += tokens[index++];
    if (follow) scrollToBottom();

    if (index < tokens.length) reply.timer = setTimeout(typeNext, 20 + Math.random() * 40);
    else finishReply();
  };

  // Пауза «на подумать», потом печать по словам
  reply = { message, timer: setTimeout(typeNext, 500 + Math.random() * 500) };
  setBusy(true);
}

function send(text) {
  const question = text.trim();
  if (!question) return;

  // файлы уходят с этим сообщением, выделение остаётся контекстом и дальше
  const context = contextItems();
  attachments = [];
  renderContext();
  input.value = '';
  autosize();

  const message = addMessage('user', question, context);
  if (reply) {
    message.classList.add('is-queued');
    const label = document.createElement('span');
    label.className = 'chat__queued';
    label.textContent = 'Queued';
    message.append(label);
    queue.push({ message, question, context });
    return;
  }
  respond(question, context);
}

stopButton.addEventListener('click', () => {
  if (reply) finishReply();
  input.focus();
});

/* ---------- Поле ввода ---------- */

function autosize() {
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, INPUT_MAX_HEIGHT)}px`;
}

input.addEventListener('input', autosize);

// Enter — отправить (пока ассистент отвечает — в очередь), Shift+Enter — новая строка
input.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  send(input.value);
});

form.addEventListener('submit', (event) => event.preventDefault());

chatPanel.querySelectorAll('.chat__suggestion').forEach((button) => {
  button.addEventListener('click', () => send(button.textContent));
});

// Открыли Chat — сразу курсор в поле ввода
chatPanel.querySelector('.layer__header').addEventListener('click', () => {
  if (chatPanel.classList.contains('is-expanded')) input.focus({ preventScroll: true });
});

/* ---------- Файлы: + открывает выбор, файлы — чипами в контексте ---------- */

attachButton.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  attachments = [...attachments, ...fileInput.files];
  fileInput.value = '';
  renderContext();
  input.focus();
});

/* ---------- Подсказка в строке под полем (очередь, голос) ---------- */

function showNote(text, { sticky = false } = {}) {
  note.textContent = text;
  clearTimeout(showNote.timer);
  if (text && !sticky) showNote.timer = setTimeout(() => { note.textContent = ''; }, 3000);
}

/* ---------- Голосовой ввод — распознавание речи браузера ---------- */

const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

function setRecording(on) {
  micButton.classList.toggle('is-recording', on);
  micButton.setAttribute('aria-pressed', String(on));
}

micButton.addEventListener('click', () => {
  if (recognition) {
    recognition.stop();
    return;
  }
  if (!SpeechRecognitionApi) {
    showNote('Voice input is not supported in this browser');
    return;
  }

  recognition = new SpeechRecognitionApi();
  recognition.lang = navigator.language || 'ru-RU';
  recognition.interimResults = true;
  recognition.continuous = true;

  // распознанное дописываем к тому, что уже набрано
  const typed = input.value.trim();
  recognition.onresult = (event) => {
    const spoken = [...event.results].map((result) => result[0].transcript).join('');
    input.value = typed ? `${typed} ${spoken}` : spoken;
    autosize();
  };
  recognition.onerror = (event) => {
    showNote(event.error === 'not-allowed' ? 'Microphone access is blocked' : 'Voice input stopped');
  };
  recognition.onend = () => {
    recognition = null;
    setRecording(false);
    if (note.textContent.startsWith('Listening')) showNote('');
    input.focus();
  };

  recognition.start();
  setRecording(true);
  showNote('Listening… click the mic to stop', { sticky: true });
});

/* ---------- Режим и модель ---------- */

const CHAT_MODES = [
  { id: 'Auto', hint: 'Can change operations and parameters' },
  { id: 'Ask', hint: 'Answers only, changes nothing' },
  { id: 'Plan', hint: 'Proposes steps before changing' },
];
const CHAT_MODELS = ['Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5'];
const CHAT_EFFORTS = [
  { id: 'Standard', hint: 'Faster answers' },
  { id: 'Extra', hint: 'Thinks longer on harder questions' },
];

const chatSettings = { mode: 'Auto', model: 'Opus 5.5', effort: 'Extra' };

const pickers = {
  mode: chatPanel.querySelector('.chat__picker[data-picker="mode"]'),
  model: chatPanel.querySelector('.chat__picker[data-picker="model"]'),
};
const menus = {
  mode: chatPanel.querySelector('.chat__menu[data-menu="mode"]'),
  model: chatPanel.querySelector('.chat__menu[data-menu="model"]'),
};

const CHECK_SVG = '<svg class="chat__menu-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5l2.5 2.5 4.5-6" /></svg>';

function menuLabel(text) {
  const label = document.createElement('div');
  label.className = 'chat__menu-label';
  label.textContent = text;
  return label;
}

function menuItem(text, hint, checked, onPick) {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'chat__menu-item';
  item.setAttribute('role', 'menuitemradio');
  item.setAttribute('aria-checked', String(checked));
  item.innerHTML = `${CHECK_SVG}<span></span>`;
  item.querySelector('span').textContent = text;
  if (hint) {
    const small = document.createElement('span');
    small.className = 'chat__menu-hint';
    small.textContent = hint;
    item.append(small);
  }
  item.addEventListener('click', () => {
    onPick();
    renderPickers();
    closeMenus();
    input.focus();
  });
  return item;
}

function renderPickers() {
  pickers.mode.querySelector('.chat__picker-value').textContent = chatSettings.mode;
  pickers.model.querySelector('.chat__picker-value').textContent = chatSettings.model;
  pickers.model.querySelector('.chat__picker-extra').textContent = chatSettings.effort === 'Extra' ? 'Extra' : '';

  menus.mode.replaceChildren(
    menuLabel('Mode'),
    ...CHAT_MODES.map(({ id, hint }) => menuItem(id, hint, id === chatSettings.mode, () => { chatSettings.mode = id; })),
  );

  const divider = document.createElement('div');
  divider.className = 'chat__menu-divider';
  menus.model.replaceChildren(
    menuLabel('Model'),
    ...CHAT_MODELS.map((model) => menuItem(model, '', model === chatSettings.model, () => { chatSettings.model = model; })),
    divider,
    menuLabel('Effort'),
    ...CHAT_EFFORTS.map(({ id, hint }) => menuItem(id, hint, id === chatSettings.effort, () => { chatSettings.effort = id; })),
  );
}

function closeMenus() {
  Object.entries(menus).forEach(([key, menu]) => {
    menu.hidden = true;
    pickers[key].setAttribute('aria-expanded', 'false');
  });
}

Object.entries(pickers).forEach(([key, picker]) => {
  picker.addEventListener('click', () => {
    const open = menus[key].hidden;
    closeMenus();
    if (!open) return;
    menus[key].hidden = false;
    picker.setAttribute('aria-expanded', 'true');
    (menus[key].querySelector('[aria-checked="true"]') ?? menus[key].querySelector('.chat__menu-item')).focus();
  });
});

// В меню: ↑/↓ по пунктам, Escape закрывает
Object.entries(menus).forEach(([key, menu]) => {
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenus();
      pickers[key].focus();
      return;
    }
    const items = [...menu.querySelectorAll('.chat__menu-item')];
    const index = items.indexOf(document.activeElement);
    const next = { ArrowDown: index + 1, ArrowUp: index - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    items[(next + items.length) % items.length].focus();
  });
});

document.addEventListener('pointerdown', (event) => {
  const inside = [...Object.values(menus), ...Object.values(pickers)].some((element) => element.contains(event.target));
  if (!inside) closeMenus();
});

renderPickers();
