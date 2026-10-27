// Проекты в header (как в ENCY): новый, открыть, сохранить и вкладки открытых проектов.
// Прототип держит одно содержимое: вкладки переключаются, но дерево и сцена у всех пока общие.
// Изменения в проекте (добавили операцию, посчитали, сбросили) — событие projectchange от tree-tools.js:
// на вкладке появляется точка «не сохранено», Save (или Ctrl+S) её убирает.
// Места мало — вкладки сжимаются до минимальной ширины (--ptab-min), дальше лишние уходят во вкладку «N more»:
// по клику — их список (openTreeMenu, treeMenuItem из tree-tools.js), оттуда выбрать или закрыть.
// Активная вкладка всегда на виду: если она среди лишних, встаёт последней видимой

const projectTabs = document.querySelector('.ptabs');
const projectFileInput = document.querySelector('.project-file');
const projectAddButton = document.querySelector('.ptabs__add');
const projectArea = document.querySelector('.ptabs-area');
const projectMore = document.querySelector('.ptabs__more');
const projectMoreCount = projectMore.querySelector('.ptabs__more-count');

// Иконка ENCY (shared-ui/assets: hdr-tabclose), цвет — текста
const TAB_CLOSE_SVG = '<svg class="ptab__x-icon" viewBox="0 0 8.70711 8.70711" fill="none" aria-hidden="true"><path d="M0.353553 0.353553L8.35355 8.35355M8.35355 0.353553L0.353553 8.35355" stroke="currentColor"/></svg>';

let projects = [
  { id: 1, name: 'Housing', dirty: false },
  { id: 2, name: 'Cover', dirty: false },
  { id: 3, name: 'New project 2', dirty: false },
];
let activeProjectId = 1;
let nextProjectId = 4;

const activeProject = () => projects.find((project) => project.id === activeProjectId);

let projectTabEls = []; // вкладки всех проектов по порядку; в ленте — те, что вмещаются
let overflowProjects = []; // не вместились — в списке «N more»

function renderProjectTabs() {
  projectTabEls = projects.map((project) => {
    const active = project.id === activeProjectId;
    const tab = document.createElement('div');
    tab.className = active ? 'ptab is-active' : 'ptab';

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'ptab__name';
    name.setAttribute('role', 'tab');
    name.setAttribute('aria-selected', String(active));
    name.textContent = project.name;
    name.title = project.name;
    name.addEventListener('click', () => {
      activeProjectId = project.id;
      renderProjectTabs();
    });
    tab.append(name);

    if (project.dirty) {
      const dot = document.createElement('span');
      dot.className = 'ptab__dot';
      dot.title = 'Unsaved changes';
      tab.append(dot);
    }

    // последнюю вкладку не закрываем — какой-то проект открыт всегда
    if (projects.length > 1) {
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'ptab__x';
      close.title = 'Close';
      close.setAttribute('aria-label', `Close ${project.name}`);
      close.innerHTML = TAB_CLOSE_SVG;
      close.addEventListener('click', () => closeProject(project.id));
      tab.append(close);
    }
    return tab;
  });

  layoutProjectTabs();
}

// Сколько вкладок минимальной ширины вмещается в ленту: за ней + и, если не вместились все, «N more»
function layoutProjectTabs() {
  const min = parseFloat(getComputedStyle(projectArea).getPropertyValue('--ptab-min'));
  const gap = parseFloat(getComputedStyle(projectTabs).columnGap);
  const fit = (space) => Math.max(1, Math.floor((space + gap) / (min + gap)));
  let space = projectArea.clientWidth - projectAddButton.offsetWidth - gap;
  let count = projectTabEls.length;

  projectMore.hidden = fit(space) >= count;
  if (!projectMore.hidden) {
    projectMoreCount.textContent = String(count - fit(space)); // ширина «N more» с похожим числом
    space -= projectMore.offsetWidth + gap;
    count = fit(space);
  }

  const activeIndex = projects.findIndex((project) => project.id === activeProjectId);
  const shown = projectTabEls.map((_, index) => index < count);
  if (activeIndex >= count) {
    shown[count - 1] = false;
    shown[activeIndex] = true;
  }
  projectTabs.replaceChildren(...projectTabEls.filter((_, index) => shown[index]));
  overflowProjects = projects.filter((_, index) => !shown[index]);

  const hiddenCount = overflowProjects.length;
  projectMoreCount.textContent = String(hiddenCount);
  projectMore.title = overflowProjects.map((project) => project.name).join('\n');
  projectMore.setAttribute('aria-label', `${hiddenCount} more tabs`);
  if (treeMenuOwner === projectMore) fillMoreMenu();
}

// Список «N more»: имя (с точкой «не сохранено») — сделать активной, × — закрыть, список остаётся открытым
function moreMenuRows() {
  return overflowProjects.map((project) => {
    const row = document.createElement('div');
    row.className = 'ptabs-menu__row';
    const pick = treeMenuItem(project.name, {
      onPick: () => {
        activeProjectId = project.id;
        renderProjectTabs();
      },
    });
    pick.title = project.name;
    if (project.dirty) {
      const dot = document.createElement('span');
      dot.className = 'ptab__dot';
      dot.title = 'Unsaved changes';
      pick.append(dot);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ptabs-menu__x';
    close.title = 'Close';
    close.setAttribute('aria-label', `Close ${project.name}`);
    close.innerHTML = TAB_CLOSE_SVG;
    close.addEventListener('click', () => closeProject(project.id));
    row.append(pick, close);
    return row;
  });
}

// Список открыт — обновить после закрытия; лишних не осталось — закрыть, фокус — на +
function fillMoreMenu() {
  if (projectMore.hidden) {
    closeTreeMenu();
    projectAddButton.focus();
    return;
  }
  const focusedIndex = [...treeMenu.querySelectorAll('button')].indexOf(document.activeElement);
  closeTreeMenu();
  openTreeMenu(projectMore, moreMenuRows());
  const buttons = [...treeMenu.querySelectorAll('button')];
  buttons[Math.min(Math.max(focusedIndex, 0), buttons.length - 1)]?.focus();
}

projectMore.addEventListener('click', () => openTreeMenu(projectMore, moreMenuRows()));
projectAddButton.addEventListener('click', () => newProject());
new ResizeObserver(() => layoutProjectTabs()).observe(projectArea);

function openProject(name) {
  const project = { id: nextProjectId++, name, dirty: false };
  projects = [...projects, project];
  activeProjectId = project.id;
  renderProjectTabs();
}

// Новый проект — «New project N» со следующим свободным номером
function newProject() {
  const numbers = projects.map((project) => Number(project.name.match(/^New project (\d+)$/)?.[1] ?? 1));
  openProject(`New project ${Math.max(1, ...numbers) + 1}`);
}

function closeProject(id) {
  const index = projects.findIndex((project) => project.id === id);
  projects = projects.filter((project) => project.id !== id);
  // закрыли активную — активной становится соседняя
  if (id === activeProjectId) activeProjectId = (projects[index] ?? projects[index - 1]).id;
  renderProjectTabs();
}

function saveProject() {
  activeProject().dirty = false;
  renderProjectTabs();
}

const PROJECT_ACTIONS = {
  new: newProject,
  open: () => projectFileInput.click(),
  save: saveProject,
};

document.querySelectorAll('[data-project-action]').forEach((button) => {
  button.addEventListener('click', () => PROJECT_ACTIONS[button.dataset.projectAction]());
});

// Открыть: имя вкладки — имя файла без расширения
projectFileInput.addEventListener('change', () => {
  const file = projectFileInput.files[0];
  projectFileInput.value = '';
  if (file) openProject(file.name.replace(/\.[^.]+$/, ''));
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveProject();
  }
});

document.addEventListener('projectchange', () => {
  if (activeProject().dirty) return;
  activeProject().dirty = true;
  renderProjectTabs();
});

renderProjectTabs();
