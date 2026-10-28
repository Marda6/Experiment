// История работы CamAgent. Каждый заход агента — запрос и правки «было → стало» с причиной у каждой,
// плюс последствия: траектории пересчитаны, оценка времени. Режим чата: Auto — правит сразу, правки ждут
// просмотра; Plan — сначала предлагает (Apply / Discard); Ask — только советует (chat.js).
// Где видно: карточка под ответом в чате; метка ✦ у операции в дереве (и у веток над ней), пока правки
// не просмотрены; в Inspector — полоса «CamAgent · N changes · Accept · Undo», изменённые строки с прежним
// значением и точки на вкладках рейки.
// Правка: proposed → review → accepted | reverted (в Plan: proposed → accepted | discarded). Откатить можно
// одну правку, операцию или весь заход; параметр, который после агента поменяли руками, откат не трогает (edited).
// Сценарий пока один: «ускорь черновую» — черновую выборку на адаптивную стратегию.
// selectItem, setStatus, refreshBranchStatuses, nameOf, pathOf, tree, operationItems, operationsPanel — tree.js;
// paramValue, setParam, paramKey, renderInspector, showInspectorTab, inspectorDecorators — inspector.js;
// chatActions, isRussian, pluralRu, operationsWord — chat.js; scrollRowIntoView, markProjectChanged — tree-tools.js;
// setTreeView — model.js; openCamAgent — pick.js

const AGENT_MARK_SVG = '<svg class="agent-mark" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z"/></svg>';
const AGENT_UNDO_SVG = '<svg class="agent-undo" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5h5a3 3 0 0 1 0 6H7"/><path d="M7 4 4.5 6.5 7 9"/></svg>';
const AGENT_CHEV_SVG = '<svg class="agent-chev" viewBox="0 0 8 5" aria-hidden="true"><path d="M1 1l3 3 3-3"/></svg>';
const AGENT_CHAT_SVG = '<svg class="agent-chat" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10v7H7.5L4.5 13v-2.5H3z"/></svg>';

const agentRuns = [];
let agentRunCount = 0;

/* ---------- Сценарий: черновая выборка → адаптивная ---------- */

const SPEEDUP_REQUEST = /ускор|быстрее|сократ|оптимиз|speed up|faster|optimi[sz]e|reduce cycle|cut cycle/i;
const ADAPTIVE_FROM = ['Pocket roughing', 'Slot roughing', 'Rest roughing']; // выбранную операцию этих типов — можно
const ADAPTIVE_SCOPE_TYPE = 'Pocket roughing'; // в ветке — только выборка карманов, чтобы правок было обозримо
const ADAPTIVE_SPEEDUP = 0.6; // адаптивная — примерно на 40% быстрее

const ADAPTIVE_RECIPE = [
  {
    tab: 'Strategy', label: 'Pattern', field: 'val', to: 'Adaptive',
    why: {
      en: 'Adaptive clearing keeps the tool engagement constant, so the cutter works with its full flute length without overload.',
      ru: 'Адаптивная траектория держит постоянный угол контакта — фреза работает всей кромкой без перегрузки.',
    },
  },
  {
    tab: 'Strategy', label: 'Stepover', field: 'val', to: '4.800',
    why: {
      en: '40% of the Ø12 cutter — the usual width of cut for adaptive clearing.',
      ru: '40% от Ø12 — обычная ширина резания для адаптивной.',
    },
  },
  {
    tab: 'Parameters', label: 'Step down', field: 'val', to: '12 mm',
    why: {
      en: 'With light radial engagement the cutter can go 1×D deep: wear spreads along the flute.',
      ru: 'При малом радиальном контакте можно идти на 1×D: износ распределяется по кромке.',
    },
  },
  {
    tab: 'Speeds', label: 'Feed rate', field: 'val', to: '2600 mm/min',
    why: {
      en: 'Chip thinning at 40% engagement: the feed goes up, the load per tooth stays the same.',
      ru: 'При контакте 40% стружка тоньше — подачу можно поднять, нагрузка на зуб та же.',
    },
  },
  {
    tab: 'Speeds', label: 'Adaptive feed', field: 'on', to: true,
    why: {
      en: 'Slows the feed down in corners, where engagement spikes.',
      ru: 'Сбавляет подачу в углах, где контакт резко растёт.',
    },
  },
];

// Что менять: выбранную черновую операцию; выбрана ветка (или ничего) — выборку карманов внутри
function speedupTargets(scope) {
  if (scope && !scope.classList.contains('tree__item--branch')) return ADAPTIVE_FROM.includes(scope.dataset.type) ? [scope] : [];
  return [...(scope ?? tree).querySelectorAll(`.tree__item[data-type="${ADAPTIVE_SCOPE_TYPE}"]`)];
}

// Оценка времени операции (имитация, но стабильная): 2–5 минут
const opMinutes = (item) => 2 + ((Math.max(operationItems.indexOf(item), 0) * 7) % 13) * 0.25;

function formatMinutes(minutes) {
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const parametersWord = (n, ru) =>
  (ru ? `${n} ${pluralRu(n, ['параметр', 'параметра', 'параметров'])}` : `${n} parameter${n === 1 ? '' : 's'}`);

function speedupText(run, scope) {
  const { ru } = run;
  const leaf = scope && !scope.classList.contains('tree__item--branch');
  const scopeName = nameOf(scope ?? tree.querySelector('.tree__item'));
  const what = leaf
    ? (ru ? `«${scopeName}»` : scopeName)
    : `${operationsWord(run.ops.length, ru)} ${ru ? 'в' : 'in'} ${scopeName}`;
  const params = parametersWord(run.changes.length, ru);
  const time = `${formatMinutes(run.time.before)} → ${formatMinutes(run.time.after)} (−${Math.round((1 - ADAPTIVE_SPEEDUP) * 100)}%)`;

  if (run.mode === 'Plan') {
    return ru
      ? `Предлагаю перевести черновую выборку на адаптивную стратегию: ${what}, ${params}.\n\nОценка времени: ${time}.\n\nПока ничего не менял — примените, если согласны.`
      : `I suggest switching roughing to adaptive clearing: ${what}, ${params}.\n\nEstimated time: ${time}.\n\nNothing is changed yet — apply it if you agree.`;
  }
  return ru
    ? `Перевёл черновую выборку на адаптивную стратегию: ${what}, ${params}. Траектории пересчитал.\n\nОценка времени: ${time}.\n\nПравки — ниже, у каждой причина; любую можно откатить.`
    : `Switched roughing to adaptive clearing: ${what}, ${params}. Toolpaths are recalculated.\n\nEstimated time: ${time}.\n\nThe changes are below, each with a reason; any of them can be undone.`;
}

// Действие для чата (chat.js): не про ускорение или режим Ask — не наше
function planSpeedup(question, context, mode) {
  if (mode === 'Ask' || !SPEEDUP_REQUEST.test(question)) return null;
  const ru = isRussian(question);
  const scope = context.find((item) => item.key === 'operation')?.operation ?? null;
  const targets = speedupTargets(scope);
  const nothing = (text) => ({ text, done() {} });

  if (!targets.length) {
    return nothing(ru
      ? `«${nameOf(scope)}» ускорить пока не могу: умею переводить на адаптивную только черновую выборку. Выберите черновую операцию или установ.`
      : `I can't speed up ${nameOf(scope)} yet: so far I only switch roughing to adaptive clearing. Select a roughing operation or a setup.`);
  }

  const changes = targets.flatMap((item) => ADAPTIVE_RECIPE.map((step) => {
    const from = paramValue(item, step.tab, step.label)?.[step.field];
    if (from === step.to) return null;
    return { item, tab: step.tab, label: step.label, field: step.field, from, to: step.to, why: step.why[ru ? 'ru' : 'en'], state: 'proposed' };
  }).filter(Boolean));

  if (!changes.length) {
    return nothing(ru
      ? 'Здесь уже адаптивная стратегия с этими режимами — менять нечего.'
      : 'This is already adaptive clearing with these settings — nothing to change.');
  }

  const ops = [...new Set(changes.map((change) => change.item))];
  const before = ops.reduce((sum, item) => sum + opMinutes(item), 0);
  const run = {
    id: ++agentRunCount,
    ru,
    mode,
    ops,
    changes,
    time: { before, after: before * ADAPTIVE_SPEEDUP },
    prevStatus: new Map(), // статус операций до захода — вернуть при полном откате
    open: new Set(ops.length === 1 ? ops : []), // раскрытые в карточке операции
    card: null,
  };

  return {
    text: speedupText(run, scope),
    done: (message) => {
      agentRuns.push(run);
      run.card = document.createElement('div');
      message.append(run.card);
      if (mode === 'Auto') applyRun(run, 'review');
      else renderRunCard(run);
    },
  };
}

chatActions.push(planSpeedup);

/* ---------- Правки: применить, принять, откатить ---------- */

const runOf = (change) => agentRuns.find((run) => run.changes.includes(change));
const valueText = (value) => (typeof value === 'boolean' ? (value ? 'On' : 'Off') : value);
const currentValue = (change) => paramValue(change.item, change.tab, change.label)?.[change.field];

// Правки, которые ждут просмотра: все или у одной операции
const reviewChanges = (item) => agentRuns.flatMap((run) => run.changes.filter((change) => change.state === 'review' && (!item || change.item === item)));

// Применить: параметры — новые, траектории пересчитаны агентом
function applyRun(run, state) {
  run.ops.forEach((item) => {
    run.prevStatus.set(item, item.dataset.status);
    setStatus(item, 'done');
  });
  run.changes.forEach((change) => {
    setParam(change.item, change.tab, change.label, { [change.field]: change.to });
    change.state = state;
  });
  refreshBranchStatuses();
  markProjectChanged();
  refreshAgentViews();
}

function acceptChanges(changes) {
  changes.filter((change) => change.state === 'review').forEach((change) => { change.state = 'accepted'; });
  refreshAgentViews();
}

function discardRun(run) {
  run.changes.forEach((change) => { change.state = 'discarded'; });
  refreshAgentViews();
}

// Откат: вернуть прежнее значение. Поменяли руками после агента — не трогаем.
// Статус: у операции откатили всё — прежний, часть — траектория устарела
function revertChanges(run, changes) {
  const touched = new Set();
  changes.filter((change) => change.state === 'review' || change.state === 'accepted').forEach((change) => {
    touched.add(change.item);
    if (currentValue(change) !== change.to) {
      change.state = 'edited';
      return;
    }
    setParam(change.item, change.tab, change.label, { [change.field]: change.from });
    change.state = 'reverted';
  });
  touched.forEach((item) => {
    const all = run.changes.filter((change) => change.item === item).every((change) => change.state === 'reverted');
    setStatus(item, all ? run.prevStatus.get(item) ?? 'not-calculated' : 'not-calculated');
  });
  refreshBranchStatuses();
  markProjectChanged();
  refreshAgentViews();
}

// Пользователь сам поменял параметр, который агент только что правил, — правка уже его
document.addEventListener('paramchange', ({ detail }) => {
  const edited = reviewChanges(detail.item).filter((change) => change.tab === detail.tab
    && change.label === detail.label && currentValue(change) !== change.to);
  if (!edited.length) return;
  edited.forEach((change) => { change.state = 'edited'; });
  refreshAgentViews();
});

function refreshAgentViews() {
  renderAgentMarks();
  agentRuns.forEach(renderRunCard);
  renderInspector();
}

/* ---------- Переходы: к операции в дереве и Inspector, к заходу в чате ---------- */

function revealOperation(item, changes) {
  if (operationsPanel.dataset.view !== 'operations') setTreeView('operations');
  selectItem(item, { reveal: true });
  scrollRowIntoView(item);
  const first = changes.find((change) => change.state === 'review') ?? changes[0];
  if (first) showInspectorTab(first.tab);
}

function showRunInChat(run) {
  openCamAgent();
  // панель могла быть свёрнута — прокручиваем, когда раскроется
  setTimeout(() => {
    run.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    run.card.classList.remove('is-flash');
    void run.card.offsetWidth;
    run.card.classList.add('is-flash');
  }, 360);
}

/* ---------- Дерево: метка ✦ у операций с непросмотренными правками и у веток над ними ---------- */

function addAgentMark(item, title, branch) {
  const mark = document.createElement('span');
  mark.className = branch ? 'tree__agent tree__agent--branch' : 'tree__agent';
  mark.title = title;
  mark.innerHTML = AGENT_MARK_SVG;
  item.querySelector(':scope > .tree__row > .tree__name').after(mark);
}

function renderAgentMarks() {
  tree.querySelectorAll('.tree__agent').forEach((mark) => mark.remove());
  const counts = new Map();
  reviewChanges().forEach((change) => counts.set(change.item, (counts.get(change.item) ?? 0) + 1));
  const branches = new Set();
  counts.forEach((count, item) => {
    addAgentMark(item, `CamAgent: ${count} change${count === 1 ? '' : 's'} to review`);
    for (let parent = item.parentElement.closest('.tree__item'); parent; parent = parent.parentElement.closest('.tree__item')) {
      branches.add(parent);
    }
  });
  branches.forEach((branch) => addAgentMark(branch, 'CamAgent changes inside — to review', true));
}

/* ---------- Карточка захода в чате ---------- */

const RUN_STATES = { proposed: 'Proposed', review: 'To review', accepted: 'Accepted', reverted: 'Undone', discarded: 'Discarded' };
const CHANGE_STATES = { reverted: 'Undone', edited: 'Edited by you', discarded: 'Discarded' };

function runState(run) {
  const states = run.changes.map((change) => change.state);
  if (states.includes('proposed')) return 'proposed';
  if (states.includes('review')) return 'review';
  if (states.every((state) => state === 'discarded')) return 'discarded';
  if (states.every((state) => state === 'reverted')) return 'reverted';
  return 'accepted';
}

function agentNode(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function agentButton(className, { text, html, title, onClick }) {
  const button = agentNode('button', className);
  button.type = 'button';
  if (html) button.innerHTML = html;
  if (text) button.append(text);
  if (title) {
    button.title = title;
    button.setAttribute('aria-label', title);
  }
  button.addEventListener('click', onClick);
  return button;
}

const canUndo = (change) => change.state === 'review' || change.state === 'accepted';

function renderChange(run, change) {
  const line = agentNode('li', 'agent-change');
  line.dataset.state = change.state;

  const head = agentNode('div', 'agent-change__line');
  const param = agentNode('span', 'agent-change__param');
  param.append(agentNode('span', 'agent-change__tab', `${change.tab} › `), change.label);
  const diff = agentNode('span', 'agent-change__diff');
  diff.append(agentNode('span', 'agent-change__from', valueText(change.from)), ' → ', agentNode('span', 'agent-change__to', valueText(change.to)));
  head.append(param, diff);
  if (CHANGE_STATES[change.state]) head.append(agentNode('span', 'agent-change__state', CHANGE_STATES[change.state]));
  if (canUndo(change)) {
    head.append(agentButton('agent-icon-btn', {
      html: AGENT_UNDO_SVG,
      title: `Undo: ${change.label}`,
      onClick: () => revertChanges(run, [change]),
    }));
  }

  line.append(head, agentNode('div', 'agent-change__why', change.why));
  return line;
}

function renderRunOp(run, item) {
  const own = run.changes.filter((change) => change.item === item);
  const open = run.open.has(item);
  const entry = agentNode('li', 'agent-op');
  entry.dataset.state = own.every((change) => change.state === 'reverted') ? 'reverted' : '';

  const row = agentNode('div', 'agent-op__row');
  const toggle = agentButton('agent-icon-btn agent-op__toggle', {
    html: AGENT_CHEV_SVG,
    title: `${open ? 'Hide' : 'Show'} changes: ${nameOf(item)}`,
    onClick: () => {
      if (open) run.open.delete(item);
      else run.open.add(item);
      renderRunCard(run);
    },
  });
  toggle.setAttribute('aria-expanded', String(open));
  const name = agentButton('agent-op__name', {
    text: nameOf(item),
    onClick: () => revealOperation(item, own),
  });
  name.title = `${pathOf(item)} › ${nameOf(item)} — show in the tree and Inspector`;
  row.append(toggle, name, agentNode('span', 'agent-op__count', String(own.length)));
  if (own.some(canUndo)) {
    row.append(agentButton('agent-icon-btn', {
      html: AGENT_UNDO_SVG,
      title: `Undo changes: ${nameOf(item)}`,
      onClick: () => revertChanges(run, own),
    }));
  }
  entry.append(row);

  if (open) {
    const list = agentNode('ul', 'agent-op__changes');
    list.append(...own.map((change) => renderChange(run, change)));
    entry.append(list);
  }
  return entry;
}

function renderRunCard(run) {
  if (!run.card) return;
  const state = runState(run);
  const card = run.card;
  card.className = `agent-run${card.classList.contains('is-flash') ? ' is-flash' : ''}`;
  card.dataset.state = state;

  const head = agentNode('div', 'agent-run__head');
  head.innerHTML = AGENT_MARK_SVG;
  head.append(
    agentNode('span', 'agent-run__title', `${run.ops.length} operation${run.ops.length === 1 ? '' : 's'} · ${parametersWord(run.changes.length, false)}`),
    agentNode('span', 'agent-run__state', RUN_STATES[state]),
  );

  // операции из разных установов называются одинаково — подписываем установ над его операциями
  const ops = agentNode('ul', 'agent-run__ops');
  const grouped = new Set(run.ops.map(pathOf)).size > 1;
  let lastPath = null;
  run.ops.forEach((item) => {
    const path = pathOf(item);
    if (grouped && path !== lastPath) ops.append(agentNode('li', 'agent-run__group', path));
    lastPath = path;
    ops.append(renderRunOp(run, item));
  });

  const metric = agentNode('div', 'agent-run__metric');
  metric.append(
    agentNode('span', 'agent-run__label', 'Estimated time '),
    agentNode('span', 'agent-run__time', `${formatMinutes(run.time.before)} → ${formatMinutes(run.time.after)}`),
  );

  const actions = agentNode('div', 'agent-run__actions');
  if (state === 'proposed') {
    actions.append(
      agentButton('agent-run__action agent-run__action--main', { text: 'Apply', onClick: () => applyRun(run, 'accepted') }),
      agentButton('agent-run__action', { text: 'Discard', onClick: () => discardRun(run) }),
    );
  }
  if (state === 'review') {
    actions.append(agentButton('agent-run__action agent-run__action--main', { text: 'Accept all', onClick: () => acceptChanges(run.changes) }));
  }
  if (run.changes.some(canUndo)) {
    actions.append(agentButton('agent-run__action', { text: 'Undo all', onClick: () => revertChanges(run, run.changes) }));
  }

  card.replaceChildren(head, ops, metric);
  if (actions.childElementCount) card.append(actions);
}

/* ---------- Inspector: полоса непросмотренных правок, строки с прежним значением, точки на вкладках ---------- */

function reviewStrip(item, pending) {
  const strip = agentNode('div', 'insp-review');
  strip.innerHTML = AGENT_MARK_SVG;
  strip.append(agentNode('span', 'insp-review__text', `CamAgent · ${pending.length} change${pending.length === 1 ? '' : 's'}`));
  const runs = [...new Set(pending.map(runOf))];
  strip.append(
    agentButton('bar-btn insp-review__btn', {
      text: 'Accept',
      onClick: () => acceptChanges(pending),
    }),
    agentButton('bar-btn insp-review__btn', {
      text: 'Undo',
      onClick: () => runs.forEach((run) => revertChanges(run, pending.filter((change) => runOf(change) === run))),
    }),
    agentButton('bar-btn insp-review__btn insp-review__chat', {
      html: AGENT_CHAT_SVG,
      title: 'Show in CamAgent',
      onClick: () => showRunInChat(runs[runs.length - 1]),
    }),
  );
  strip.title = `${nameOf(item)}: changed by CamAgent, not reviewed yet`;
  return strip;
}

inspectorDecorators.push(({ inspector, main, rail, item, tab }) => {
  const pending = reviewChanges(item);
  rail.querySelectorAll('.insp__tab').forEach((button) => {
    button.classList.toggle('has-agent', pending.some((change) => change.tab === button.dataset.tab));
  });
  if (!pending.length) return;

  inspector.classList.add('has-review');
  main.prepend(reviewStrip(item, pending));
  const rows = [...main.querySelectorAll('.irow[data-key]')];
  pending.filter((change) => change.tab === tab).forEach((change) => {
    const row = rows.find((other) => other.dataset.key === paramKey(change.tab, change.label));
    if (!row) return;
    row.classList.add('irow--agent');
    row.title = `CamAgent: ${change.why}`;
    const was = agentNode('span', 'irow__was', valueText(change.from));
    was.title = `Was: ${valueText(change.from)}`;
    row.querySelector('.irow__label').append(was, agentButton('agent-icon-btn irow__undo', {
      html: AGENT_UNDO_SVG,
      title: `Undo: ${change.label} (back to ${valueText(change.from)})`,
      onClick: () => revertChanges(runOf(change), [change]),
    }));
  });
});
