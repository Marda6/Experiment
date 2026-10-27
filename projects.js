// Проекты в header (как в ENCY): новый, открыть, сохранить и вкладки открытых проектов.
// Прототип держит одно содержимое: вкладки переключаются, но дерево и сцена у всех пока общие.
// Изменения в проекте (добавили операцию, посчитали, сбросили) — событие projectchange от tree-tools.js:
// на вкладке появляется точка «не сохранено», Save (или Ctrl+S) её убирает

const projectTabs = document.querySelector('.ptabs');
const projectFileInput = document.querySelector('.project-file');

// Иконки ENCY (shared-ui/assets: hdr-tabclose, hdr-plus), цвет — текста
const TAB_CLOSE_SVG = '<svg class="ptab__x-icon" viewBox="0 0 8.70711 8.70711" fill="none" aria-hidden="true"><path d="M0.353553 0.353553L8.35355 8.35355M8.35355 0.353553L0.353553 8.35355" stroke="currentColor"/></svg>';
const TAB_PLUS_SVG = '<svg class="hbtn__icon hbtn__icon--plus" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M0 6H6M6 6H12M6 6V0M6 6V12" stroke="currentColor"/></svg>';

let projects = [
  { id: 1, name: 'Housing', dirty: false },
  { id: 2, name: 'Cover', dirty: false },
  { id: 3, name: 'New project 2', dirty: false },
];
let activeProjectId = 1;
let nextProjectId = 4;

const activeProject = () => projects.find((project) => project.id === activeProjectId);

function renderProjectTabs() {
  const tabs = projects.map((project) => {
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

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'hbtn';
  add.title = 'New tab';
  add.setAttribute('aria-label', 'New tab');
  add.innerHTML = TAB_PLUS_SVG;
  add.addEventListener('click', () => newProject());

  projectTabs.replaceChildren(...tabs, add);
}

function openProject(name) {
  const project = { id: nextProjectId++, name, dirty: false };
  projects = [...projects, project];
  activeProjectId = project.id;
  renderProjectTabs();
  projectTabs.querySelector('.ptab.is-active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
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
