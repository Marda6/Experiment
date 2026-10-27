// Режим одной операции: текущая операция, листалка ↑/↓ и список операций (≡) между ними.
// operationItems, selectedItem, selectItem, nameOf, pathOf — из tree.js
const currentBlock = document.querySelector('.current');
const currentIndex = currentBlock.querySelector('.current__index');
const currentInfo = currentBlock.querySelector('.current__info');
const currentName = currentBlock.querySelector('.current__name');
const currentStatus = currentBlock.querySelector('.current__status');
const currentToolNumber = currentBlock.querySelector('.current__tool-number');
const currentToolName = currentBlock.querySelector('.current__tool-name');
const prevButton = currentBlock.querySelector('[data-step="-1"]');
const nextButton = currentBlock.querySelector('[data-step="1"]');
const listButton = currentBlock.querySelector('.current__btn--list');
const opList = document.getElementById('oplist');

let allTreeItems = [...tree.querySelectorAll('.tree__item')]; // ветки тоже, в порядке дерева

// Соседняя операция по порядку дерева; если выделена ветка — первая/последняя операция рядом с ней
function stepTarget(step) {
  if (!selectedItem) return step > 0 ? operationItems[0] : null;
  const from = allTreeItems.indexOf(selectedItem);
  const pool = step > 0 ? allTreeItems.slice(from + 1) : allTreeItems.slice(0, from).reverse();
  return pool.find((item) => !item.classList.contains('tree__item--branch')) ?? null;
}

/* ---------- Список операций ---------- */

// Группы с операциями: заголовок — путь, ниже операции с номером.
// Пересобирается, когда дерево меняется (treechange)
let listOptions = [];

function buildOpList() {
  listOptions = [];
  opList.replaceChildren();

  tree.querySelectorAll('.tree__item--branch').forEach((branch) => {
    const operations = [...branch.querySelectorAll(':scope > .tree__group > .tree__item:not(.tree__item--branch)')];
    if (!operations.length) return;

    const title = [pathOf(branch), nameOf(branch)].filter(Boolean).join(' › ');
    const group = document.createElement('div');
    group.className = 'oplist__group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', title);

    const heading = document.createElement('div');
    heading.className = 'oplist__heading';
    heading.setAttribute('aria-hidden', 'true');
    heading.textContent = title;
    group.append(heading);

    operations.forEach((item) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'oplist__option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.innerHTML = '<span class="oplist__index"></span><span class="oplist__name"></span>';
      option.querySelector('.oplist__index').textContent = operationItems.indexOf(item) + 1;
      option.querySelector('.oplist__name').textContent = nameOf(item);
      option.addEventListener('click', () => {
        selectItem(item, { reveal: true });
        setListOpen(false);
        listButton.focus();
      });
      option.treeItem = item;
      listOptions.push(option);
      group.append(option);
    });

    opList.append(group);
  });
}

buildOpList();

function setListOpen(open) {
  opList.hidden = !open;
  listButton.setAttribute('aria-expanded', String(open));
  if (!open) return;

  // Открыли — текущая операция по центру и в фокусе
  const active = listOptions.find((option) => option.treeItem === selectedItem) ?? listOptions[0];
  opList.scrollTop = active.offsetTop - (opList.clientHeight - active.offsetHeight) / 2;
  active.focus({ preventScroll: true });
}

listButton.addEventListener('click', () => setListOpen(opList.hidden));

opList.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setListOpen(false);
    listButton.focus();
    return;
  }
  const index = listOptions.indexOf(document.activeElement);
  const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: listOptions.length - 1 }[event.key];
  if (next === undefined) return;
  event.preventDefault();
  listOptions[Math.min(Math.max(next, 0), listOptions.length - 1)].focus();
});

// Клик мимо списка или раскрытие дерева — список закрываем
document.addEventListener('pointerdown', (event) => {
  if (!opList.hidden && !opList.contains(event.target) && !listButton.contains(event.target)) setListOpen(false);
});


/* ---------- Текущая операция и листалка ---------- */

// Статус — та же иконка, что в строке дерева
function updateCurrentStatus() {
  currentStatus.replaceChildren(...(selectedItem ? [statusIcon(selectedItem.dataset.status)] : []));
}

// Вторая строка — инструмент операции; у веток (станок, setup) её нет — одна строка по центру.
// Путь (Setup 2) — во всплывающей подсказке
function updateCurrent() {
  const item = selectedItem;
  const number = operationItems.indexOf(item) + 1;
  const tool = item?.dataset.tool;

  currentBlock.classList.toggle('is-empty', !item);
  currentBlock.classList.toggle('has-tool', Boolean(tool));
  currentIndex.textContent = number > 0 ? number : '';
  currentName.textContent = item ? nameOf(item) : 'No operation selected';
  currentToolNumber.textContent = tool ?? '';
  currentToolName.textContent = item?.dataset.toolName ?? '';
  currentInfo.title = item ? [pathOf(item), nameOf(item)].filter(Boolean).join(' › ') : '';
  updateCurrentStatus();

  prevButton.disabled = !stepTarget(-1);
  nextButton.disabled = !stepTarget(1);

  listOptions.forEach((option) => option.setAttribute('aria-selected', String(option.treeItem === item)));
}

[prevButton, nextButton].forEach((button) => {
  button.addEventListener('click', () => {
    const target = stepTarget(Number(button.dataset.step));
    if (target) selectItem(target, { reveal: true });
  });
});

document.addEventListener('treeselect', updateCurrent);

// Статус меняется на ходу (расчёт, сброс) — иконка следует за выделенной строкой
new MutationObserver((records) => {
  if (records.some((record) => record.target === selectedItem)) updateCurrentStatus();
}).observe(tree, { subtree: true, attributes: true, attributeFilter: ['data-status'] });

// Дерево изменилось — новый порядок, номера и список
document.addEventListener('treechange', () => {
  allTreeItems = [...tree.querySelectorAll('.tree__item')];
  buildOpList();
  updateCurrent();
});

updateCurrent();
