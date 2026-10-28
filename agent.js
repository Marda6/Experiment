// История работы CamAgent. Каждый заход агента — запрос и правки «было → стало» с причиной у каждой,
// плюс последствия: траектории пересчитаны, оценка времени (по траекториям — toolpathMinutes, toolpaths.js).
// Режим чата: Auto — правит сразу, правки ждут просмотра; Plan — сначала предлагает (Apply / Discard);
// Ask — только советует (chat.js).
// Где видно: карточка под ответом в чате; метка ✦ у операции в дереве (и у веток над ней), пока правки
// не просмотрены; в Inspector — полоса «CamAgent · N changes · Accept · Undo», изменённые строки с прежним
// значением и точки на вкладках рейки.
// Правка: proposed → review → accepted | reverted (в Plan: proposed → accepted | discarded). Откатить можно
// одну правку, операцию или весь заход; параметр, который после агента поменяли руками, откат не трогает (edited).
// Виды правок: param — параметр операции; add — новая операция (откат — удалить её).
// Заготовленные запросы (в пустом чате и после каждого ответа агента — те, что ещё можно сделать):
//   Fix the errors in the project — столкновение держателя: длинный держатель, пересчёт;
//   Speed up roughing — черновая выборка на адаптивную стратегию;
//   Deburr the threaded holes — новая операция после резьбы;
//   Improve the pocket floor finish — чистовая дна: шаг меньше, обороты выше; дольше — цена качества.
// selectItem, setStatus, refreshBranchStatuses, refreshOperationIndex, renderNode, projectOp, opSpeeds, nameOf,
// pathOf, tree, operationItems, operationsPanel — tree.js; paramValue, setParam, paramKey, toolStickOut, HOLDER_LONG,
// renderInspector, showInspectorTab, inspectorDecorators — inspector.js; toolpathFor, toolpathMinutes, calcResultOf,
// PART, PART_TOP — toolpaths.js; chatActions, messages, send, isRussian, pluralRu, operationsWord — chat.js;
// scrollRowIntoView, markProjectChanged — tree-tools.js; setTreeView — model.js; openCamAgent — pick.js

const AGENT_MARK_SVG = '<svg class="agent-mark" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z"/></svg>';
const AGENT_UNDO_SVG = '<svg class="agent-undo" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 6.5h5a3 3 0 0 1 0 6H7"/><path d="M7 4 4.5 6.5 7 9"/></svg>';
const AGENT_CHEV_SVG = '<svg class="agent-chev" viewBox="0 0 8 5" aria-hidden="true"><path d="M1 1l3 3 3-3"/></svg>';
const AGENT_CHAT_SVG = '<svg class="agent-chat" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10v7H7.5L4.5 13v-2.5H3z"/></svg>';

const agentRuns = [];
let agentRunCount = 0;

/* ---------- Общее для сценариев ---------- */

const inLang = (ru, text) => text[ru ? 'ru' : 'en'];

function formatMinutes(minutes) {
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const changesWord = (n, ru) =>
  (ru ? `${n} ${pluralRu(n, ['правка', 'правки', 'правок'])}` : `${n} change${n === 1 ? '' : 's'}`);

// Правки параметров по рецепту: { tab, label, field, to, why: { en, ru } | (item, ru) → текст }.
// Значение уже такое — правки нет
function recipeChanges(targets, recipe, ru) {
  return targets.flatMap((item) => recipe.map((step) => {
    const from = paramValue(item, step.tab, step.label)?.[step.field];
    if (from === step.to) return null;
    const why = typeof step.why === 'function' ? step.why(item, ru) : inLang(ru, step.why);
    return { kind: 'param', item, tab: step.tab, label: step.label, field: step.field, from, to: step.to, why, state: 'proposed' };
  }).filter(Boolean));
}

const minutesOf = (items) => items.reduce((sum, item) => sum + toolpathMinutes(item), 0);

// Время операций, как если бы правки параметров уже применили (оценка до применения)
function minutesWith(changes, items) {
  const params = changes.filter((change) => change.kind === 'param');
  params.forEach((change) => setParam(change.item, change.tab, change.label, { [change.field]: change.to }));
  const minutes = minutesOf(items);
  params.forEach((change) => setParam(change.item, change.tab, change.label, { [change.field]: change.from }));
  return minutes;
}

const percent = (before, after) => Math.round(Math.abs(after / before - 1) * 100);

function makeRun({ scenario, ru, mode, changes, metric }) {
  const ops = [...new Set(changes.map((change) => change.item))];
  return {
    id: ++agentRunCount,
    scenario,
    ru,
    mode,
    ops,
    changes,
    metric, // { label, from, to } — строка под операциями в карточке
    prevStatus: new Map(), // статус операций до захода — вернуть при полном откате
    open: new Set(ops.length === 1 ? ops : []), // раскрытые в карточке операции
    card: null,
  };
}

// Ответ с правками: когда допечатан — карточка, правки (в Auto — сразу), следующие запросы
function runAction(run, text) {
  return {
    text,
    empty: false,
    done: (message) => {
      agentRuns.push(run);
      run.card = document.createElement('div');
      message.append(run.card);
      if (run.mode === 'Auto') applyRun(run, 'review');
      else renderRunCard(run);
      appendFollowUps(message);
    },
  };
}

// Ответ без правок (делать нечего или нельзя) — только текст и следующие запросы
const textAction = (text) => ({ text, empty: true, done: (message) => appendFollowUps(message) });

/* ---------- Сценарий: исправить ошибки — длинный держатель там, где держатель задевает деталь ---------- */

const FIX_REQUEST = /\bfix|error|collision|исправ|ошибк|столкнов/i;

function planFix(question, context, mode) {
  const ru = isRussian(question);
  const targets = operationItems.filter((item) => toolpathFor(item).collision);
  if (!targets.length) {
    return textAction(ru
      ? 'Проверил траектории — ошибок нет, держатель нигде не задевает деталь.'
      : 'I checked the toolpaths: no errors, the holder clears the part everywhere.');
  }
  const depth = PART_TOP - PART.pocket.floor;
  const changes = recipeChanges(targets, [{
    tab: 'Tool',
    label: 'Holder',
    field: 'val',
    to: HOLDER_LONG,
    why: (item, isRu) => {
      const reach = toolStickOut(item);
      return isRu
        ? `Фреза выступает на ${reach} мм, а карман глубиной ${depth} мм — держатель задевает стенку. С длинным держателем вылет ${reach + 20} мм.`
        : `The tool sticks out ${reach} mm, the pocket is ${depth} mm deep, so the holder hits the wall. The long holder gives ${reach + 20} mm.`;
    },
  }], ru);
  if (!changes.length) {
    return textAction(ru
      ? 'Держатель уже длинный, а столкновение осталось — тут нужен другой инструмент, сам не поменяю.'
      : 'The holder is already long and the collision is still there: this needs another tool, I will not change it myself.');
  }

  const run = makeRun({ scenario: 'fix', ru, mode, changes, metric: { label: 'Errors', from: String(targets.length), to: '0' } });
  const first = targets[0];
  const z = toolpathFor(first).collision.z.toFixed(1);
  const reach = toolStickOut(first);
  const where = targets.length === 1
    ? (ru ? `в «${nameOf(first)}»` : `in ${nameOf(first)}`)
    : `${ru ? 'в' : 'in'} ${operationsWord(targets.length, ru)}`;
  const found = ru
    ? `Нашёл ошибку ${where}: на Z ${z} держатель задевает стенку кармана — фреза выступает на ${reach} мм, а карман глубиной ${depth} мм.`
    : `Found an error ${where}: at Z ${z} the holder hits the pocket wall — the tool sticks out ${reach} mm, the pocket is ${depth} mm deep.`;
  const fix = mode === 'Plan'
    ? (ru
      ? `Предлагаю длинный держатель ${HOLDER_LONG} — вылет ${reach + 20} мм. Пока ничего не менял.`
      : `I suggest the long holder ${HOLDER_LONG}: ${reach + 20} mm stick-out. Nothing is changed yet.`)
    : (ru
      ? `Поставил длинный держатель ${HOLDER_LONG} — вылет ${reach + 20} мм — и пересчитал траекторию: столкновения нет.`
      : `Switched to the long holder ${HOLDER_LONG} (${reach + 20} mm stick-out) and recalculated the toolpath: no collision.`);
  return runAction(run, `${found}\n\n${fix}`);
}

/* ---------- Сценарий: ускорить черновую — выборку на адаптивную стратегию ---------- */

const SPEEDUP_REQUEST = /ускор|быстрее|сократ|оптимиз|speed up|faster|optimi[sz]e|reduce cycle|cut cycle/i;
const ROUGHING_WORD = /rough|черн/i;
const ADAPTIVE_FROM = ['Pocket roughing', 'Slot roughing', 'Rest roughing']; // выбранную операцию этих типов — можно
const ADAPTIVE_SCOPE_TYPE = 'Pocket roughing'; // в ветке — только выборка карманов, чтобы правок было обозримо

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

// Что менять: выбранную черновую операцию; выбрана ветка (или ничего) — выборку карманов внутри.
// Выбрана другая операция, но просили именно черновую — весь проект
function speedupTargets(scope, question) {
  if (scope && !scope.classList.contains('tree__item--branch')) {
    if (ADAPTIVE_FROM.includes(scope.dataset.type)) return { targets: [scope], scope };
    if (!ROUGHING_WORD.test(question)) return { targets: [], scope };
    scope = null;
  }
  return { targets: [...(scope ?? tree).querySelectorAll(`.tree__item[data-type="${ADAPTIVE_SCOPE_TYPE}"]`)], scope };
}

function planSpeedup(question, context, mode) {
  const ru = isRussian(question);
  const selected = context.find((item) => item.key === 'operation')?.operation ?? null;
  const { targets, scope } = speedupTargets(selected, question);

  if (!targets.length) {
    return textAction(ru
      ? `«${nameOf(scope)}» ускорить пока не могу: умею переводить на адаптивную только черновую выборку. Выберите черновую операцию или установ.`
      : `I can't speed up ${nameOf(scope)} yet: so far I only switch roughing to adaptive clearing. Select a roughing operation or a setup.`);
  }
  const changes = recipeChanges(targets, ADAPTIVE_RECIPE, ru);
  if (!changes.length) {
    return textAction(ru
      ? 'Черновая уже адаптивная с этими режимами — ускорять тут нечего.'
      : 'Roughing is already adaptive with these settings — nothing to speed up.');
  }

  const ops = [...new Set(changes.map((change) => change.item))];
  const before = minutesOf(ops);
  const after = minutesWith(changes, ops);
  const run = makeRun({ scenario: 'speedup', ru, mode, changes, metric: { label: 'Roughing time', from: formatMinutes(before), to: formatMinutes(after) } });

  const leaf = ops.length === 1 && scope === ops[0];
  const scopeName = nameOf(scope ?? tree.querySelector('.tree__item'));
  const what = leaf || ops.length === 1
    ? (ru ? `«${nameOf(ops[0])}»` : nameOf(ops[0]))
    : `${operationsWord(ops.length, ru)} ${ru ? 'в' : 'in'} ${scopeName}`;
  const params = changesWord(changes.length, ru);
  const time = `${formatMinutes(before)} → ${formatMinutes(after)} (−${percent(before, after)}%)`;
  const text = mode === 'Plan'
    ? (ru
      ? `Предлагаю перевести черновую выборку на адаптивную стратегию: ${what}, ${params}.\n\nВремя черновой: ${time}.\n\nПока ничего не менял — примените, если согласны.`
      : `I suggest switching roughing to adaptive clearing: ${what}, ${params}.\n\nRoughing time: ${time}.\n\nNothing is changed yet — apply it if you agree.`)
    : (ru
      ? `Перевёл черновую выборку на адаптивную стратегию: ${what}, ${params}. Траекторию пересчитал — вместо зигзага петли со спиральным врезанием.\n\nВремя черновой: ${time}.`
      : `Switched roughing to adaptive clearing: ${what}, ${params}. The toolpath is recalculated — loops with a helical entry instead of the zigzag.\n\nRoughing time: ${time}.`);
  return runAction(run, text);
}

/* ---------- Сценарий: снять заусенцы с резьбовых отверстий — новая операция после резьбы ---------- */

const DEBURR_REQUEST = /deburr|burr|заусен|притуп/i;

function planDeburr(question, context, mode) {
  const ru = isRussian(question);
  const anchor = operationItems.find((item) => item.dataset.type === 'Tapping M8');
  if (!anchor) {
    return textAction(ru
      ? 'Резьбовых отверстий в проекте нет — снимать заусенцы не с чего.'
      : 'There are no threaded holes in the project to deburr.');
  }
  const setup = anchor.closest('.tree__item[aria-level="2"]');
  if (setup.querySelector('.tree__item[data-type="Deburring"]')) {
    return textAction(ru
      ? 'Заусенцы с отверстий уже снимаются — операция Deburring в проекте есть.'
      : 'The holes are already deburred: the project has a Deburring operation.');
  }

  // Новая операция — пока вне дерева: встанет после резьбы, когда правку применят
  const item = renderNode(projectOp('Deburring', opSpeeds(9000, 600)), Number(setup.getAttribute('aria-level')));
  const change = {
    kind: 'add',
    item,
    after: anchor,
    label: 'New operation',
    from: '—',
    to: `Deburring · ${item.dataset.tool} ${item.dataset.toolName}`,
    why: inLang(ru, {
      ru: 'После нарезания резьбы на кромке остаётся заусенец — проход фасочной фрезой по кромке снимает его и облегчает заход болта.',
      en: 'Tapping leaves a burr on the hole edge — a pass with the chamfer mill along the edge removes it and helps the bolt start.',
    }),
    state: 'proposed',
  };
  const setupOps = [...setup.querySelectorAll('.tree__item:not(.tree__item--branch)')];
  const before = minutesOf(setupOps);
  const added = toolpathMinutes(item);
  const run = makeRun({ scenario: 'deburr', ru, mode, changes: [change], metric: { label: `${nameOf(setup)} time`, from: formatMinutes(before), to: formatMinutes(before + added) } });

  const text = mode === 'Plan'
    ? (ru
      ? `Предлагаю добавить операцию «Deburring» после «${nameOf(anchor)}»: фасочная фреза ${item.dataset.tool} пройдёт по кромке каждого из четырёх отверстий M8. Это +${formatMinutes(added)} к ${nameOf(setup)}.\n\nПока ничего не добавлял.`
      : `I suggest adding a Deburring operation after ${nameOf(anchor)}: the ${item.dataset.tool} chamfer mill runs along the edge of each of the four M8 holes. That adds ${formatMinutes(added)} to ${nameOf(setup)}.\n\nNothing is added yet.`)
    : (ru
      ? `Добавил операцию «Deburring» после «${nameOf(anchor)}»: фасочная фреза ${item.dataset.tool} проходит по кромке каждого из четырёх отверстий M8 и снимает заусенец после резьбы. Траекторию рассчитал — это +${formatMinutes(added)} к ${nameOf(setup)}.`
      : `Added a Deburring operation after ${nameOf(anchor)}: the ${item.dataset.tool} chamfer mill runs along the edge of each of the four M8 holes and removes the burr left by tapping. The toolpath is calculated: ${formatMinutes(added)} more for ${nameOf(setup)}.`);
  return runAction(run, text);
}

/* ---------- Сценарий: чище дно кармана — шаг меньше, обороты выше; дольше — цена качества ---------- */

const FINISH_REQUEST = /finish|surface|quality|roughness|чистов|чистот|поверхн|качеств|шероховат/i;

const FINISH_RECIPE = [
  {
    tab: 'Strategy', label: 'Stepover', field: 'val', to: '3.000',
    why: {
      en: 'Smaller scallops between passes of the R1 bull nose: floor roughness Ra 3.2 → 1.6 µm.',
      ru: 'Гребешок между проходами бычьего носа R1 ниже: шероховатость дна Ra 3.2 → 1.6 мкм.',
    },
  },
  {
    tab: 'Speeds', label: 'Spindle speed', field: 'val', to: '11000 rpm',
    why: {
      en: 'Higher cutting speed at the same feed per tooth gives a cleaner surface.',
      ru: 'Выше скорость резания при той же подаче на зуб — поверхность чище.',
    },
  },
  {
    tab: 'Speeds', label: 'Feed rate', field: 'val', to: '900 mm/min',
    why: {
      en: 'A slightly lower feed on the finishing pass leaves fewer tooth marks.',
      ru: 'Чуть меньше подача на чистовом проходе — меньше следов от зубьев.',
    },
  },
];

function planFinish(question, context, mode) {
  const ru = isRussian(question);
  const targets = operationItems.filter((item) => item.dataset.type === 'Floor finishing');
  if (!targets.length) {
    return textAction(ru
      ? 'Чистовой обработки дна в проекте нет — улучшать нечего.'
      : 'There is no floor finishing in the project to improve.');
  }
  const changes = recipeChanges(targets, FINISH_RECIPE, ru);
  if (!changes.length) {
    return textAction(ru
      ? 'Дно уже обрабатывается с мелким шагом и высокими оборотами — дальше только другой инструмент.'
      : 'The floor already has a fine stepover and high spindle speed — the next step would be another tool.');
  }

  const before = minutesOf(targets);
  const after = minutesWith(changes, targets);
  const run = makeRun({ scenario: 'finish', ru, mode, changes, metric: { label: 'Floor finish time', from: formatMinutes(before), to: formatMinutes(after) } });
  const from = (label) => changes.find((change) => change.label === label)?.from ?? '—';
  const what = targets.length === 1 ? (ru ? `«${nameOf(targets[0])}»` : nameOf(targets[0])) : operationsWord(targets.length, ru);
  const time = `${formatMinutes(before)} → ${formatMinutes(after)} (+${percent(before, after)}%)`;
  const how = ru
    ? `шаг ${parseFloat(from('Stepover'))} → 3 мм, обороты ${parseFloat(from('Spindle speed'))} → 11000, подача ${parseFloat(from('Feed rate'))} → 900 мм/мин`
    : `stepover ${parseFloat(from('Stepover'))} → 3 mm, spindle ${parseFloat(from('Spindle speed'))} → 11000 rpm, feed ${parseFloat(from('Feed rate'))} → 900 mm/min`;
  const text = mode === 'Plan'
    ? (ru
      ? `Предлагаю для ${what}: ${how}. Шероховатость дна Ra 3.2 → 1.6 мкм.\n\nЦена — время: ${time}. Пока ничего не менял.`
      : `For ${what} I suggest: ${how}. Floor roughness Ra 3.2 → 1.6 µm.\n\nThe price is time: ${time}. Nothing is changed yet.`)
    : (ru
      ? `Сделал дно кармана чище в ${what}: ${how}. Шероховатость Ra 3.2 → 1.6 мкм. Траекторию пересчитал — проходов по дну стало больше.\n\nЦена — время: ${time}.`
      : `Made the pocket floor cleaner in ${what}: ${how}. Roughness Ra 3.2 → 1.6 µm. The toolpath is recalculated — more passes over the floor.\n\nThe price is time: ${time}.`);
  return runAction(run, text);
}

/* ---------- Сценарии в чате: распознать запрос, предложить следующие ---------- */

// Порядок — как в демонстрации: ошибка, скорость, новая операция, качество
const AGENT_SCENARIOS = [
  { id: 'fix', prompt: 'Fix the errors in the project', match: FIX_REQUEST, plan: planFix },
  { id: 'speedup', prompt: 'Speed up roughing', match: SPEEDUP_REQUEST, plan: planSpeedup },
  { id: 'deburr', prompt: 'Deburr the threaded holes', match: DEBURR_REQUEST, plan: planDeburr },
  { id: 'finish', prompt: 'Improve the pocket floor finish', match: FINISH_REQUEST, plan: planFinish },
];
// Распознаём в другом порядке: «ускорь чистовую» — про скорость, а не про качество
const AGENT_MATCH_ORDER = ['fix', 'deburr', 'speedup', 'finish'].map((id) => AGENT_SCENARIOS.find((scenario) => scenario.id === id));

chatActions.push((question, context, mode) => {
  messages.querySelectorAll('.chat__followups').forEach((box) => box.remove());
  if (mode === 'Ask') return null;
  return AGENT_MATCH_ORDER.find((scenario) => scenario.match.test(question))?.plan(question, context, mode) ?? null;
});

// Под ответом — запросы, которые ещё есть смысл сделать (и не ждут Apply в режиме Plan)
function appendFollowUps(message) {
  const proposed = new Set(agentRuns.filter((run) => runState(run) === 'proposed').map((run) => run.scenario));
  const next = AGENT_SCENARIOS.filter((scenario) => !proposed.has(scenario.id) && !scenario.plan(scenario.prompt, [], 'Auto').empty);
  if (!next.length) return;
  const box = agentNode('div', 'chat__followups');
  box.append(...next.map((scenario) => {
    const button = agentNode('button', 'chat__suggestion', scenario.prompt);
    button.type = 'button';
    button.addEventListener('click', () => send(scenario.prompt));
    return button;
  }));
  message.append(box);
}

/* ---------- Правки: применить, принять, откатить ---------- */

const runOf = (change) => agentRuns.find((run) => run.changes.includes(change));
const valueText = (value) => (typeof value === 'boolean' ? (value ? 'On' : 'Off') : value);
const currentValue = (change) => paramValue(change.item, change.tab, change.label)?.[change.field];

// Правки, которые ждут просмотра: все или у одной операции
const reviewChanges = (item) => agentRuns.flatMap((run) => run.changes.filter((change) => change.state === 'review' && (!item || change.item === item)));

// Применить: новые операции — в дерево, параметры — новые, траектории пересчитаны агентом (итог — как у Calculate)
function applyRun(run, state) {
  const added = run.changes.filter((change) => change.kind === 'add');
  added.forEach((change) => change.after.after(change.item));
  if (added.length) refreshOperationIndex();
  run.ops.forEach((item) => run.prevStatus.set(item, item.dataset.status));
  run.changes.forEach((change) => {
    if (change.kind === 'param') setParam(change.item, change.tab, change.label, { [change.field]: change.to });
    change.state = state;
  });
  run.ops.forEach((item) => setStatus(item, calcResultOf(item)));
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

// Убрать операцию, которую добавил агент; была выбрана — выбор переходит на её установ
function removeOperation(item) {
  const setup = item.parentElement.closest('.tree__item');
  const wasSelected = selectedItem === item;
  item.remove();
  refreshOperationIndex();
  if (wasSelected) selectItem(setup);
}

// Откат: вернуть прежнее значение, добавленную операцию — убрать. Поменяли руками после агента — не трогаем.
// Статус: у операции откатили всё — прежний, часть — траектория устарела
function revertChanges(run, changes) {
  const touched = new Set();
  changes.filter((change) => change.state === 'review' || change.state === 'accepted').forEach((change) => {
    if (change.kind === 'add') {
      removeOperation(change.item);
      change.state = 'reverted';
      return;
    }
    touched.add(change.item);
    if (currentValue(change) !== change.to) {
      change.state = 'edited';
      return;
    }
    setParam(change.item, change.tab, change.label, { [change.field]: change.from });
    change.state = 'reverted';
  });
  touched.forEach((item) => {
    if (!item.isConnected) return;
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
  if (!item.isConnected) return; // предложенная, ещё не добавленная операция
  if (operationsPanel.dataset.view !== 'operations') setTreeView('operations');
  selectItem(item, { reveal: true });
  scrollRowIntoView(item);
  const first = changes.find((change) => change.state === 'review' && change.tab) ?? changes.find((change) => change.tab);
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
  const diff = agentNode('span', 'agent-change__diff');
  if (change.kind === 'add') {
    // новая операция: «New operation  Deburring · T16 Chamfer mill 90°»
    param.append(change.label);
    diff.append(agentNode('span', 'agent-change__to', change.to));
  } else {
    param.append(agentNode('span', 'agent-change__tab', `${change.tab} › `), change.label);
    diff.append(agentNode('span', 'agent-change__from', valueText(change.from)), ' → ', agentNode('span', 'agent-change__to', valueText(change.to)));
  }
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
  name.title = item.isConnected ? `${pathOf(item)} › ${nameOf(item)} — show in the tree and Inspector` : nameOf(item);
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
    agentNode('span', 'agent-run__title', `${run.ops.length} operation${run.ops.length === 1 ? '' : 's'} · ${changesWord(run.changes.length, false)}`),
    agentNode('span', 'agent-run__state', RUN_STATES[state]),
  );

  // операции из разных установов называются одинаково — подписываем установ над его операциями
  const ops = agentNode('ul', 'agent-run__ops');
  const grouped = new Set(run.ops.filter((item) => item.isConnected).map(pathOf)).size > 1;
  let lastPath = null;
  run.ops.forEach((item) => {
    const path = item.isConnected ? pathOf(item) : ''; // убранной или ещё не добавленной операции нет в дереве
    if (grouped && path !== lastPath) ops.append(agentNode('li', 'agent-run__group', path));
    lastPath = path;
    ops.append(renderRunOp(run, item));
  });

  const metric = agentNode('div', 'agent-run__metric');
  metric.append(
    agentNode('span', 'agent-run__label', `${run.metric.label} `),
    agentNode('span', 'agent-run__time', `${run.metric.from} → ${run.metric.to}`),
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
