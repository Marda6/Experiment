// Иконки статуса операций — формы из ENCY Core (icn_status_operation, 16px),
// цвета перенесены на темы прототипа через CSS-классы (см. «Статусы» в styles.css):
// нейтральное — цвет текста панели, прогрессия к готово, предупреждение и ошибка — свои цвета каждой темы.

const STATUS_RING = '<circle class="st-line" cx="8" cy="8" r="5.5"/>';
const STATUS_DOT = '<rect class="st-fill" x="5" y="5" width="6" height="6" rx="3"/>';
const STATUS_DIAMOND = 'M7.72461 1.58203C7.91869 1.45387 8.18265 1.47562 8.35352 1.64648L14.3535 7.64648C14.5488 7.84175 14.5488 8.15825 14.3535 8.35352L8.35352 14.3535C8.15825 14.5488 7.84175 14.5488 7.64648 14.3535L1.64648 8.35352C1.45122 8.15825 1.45122 7.84175 1.64648 7.64648L7.64648 1.64648L7.72461 1.58203Z';

const STATUS_SHAPES = {
  // icn_16_not_calculate — пустой круг
  'not-calculated': STATUS_RING,
  // icn_16_calculated — круг с линиями
  calculated: `${STATUS_RING}
    <path class="st-fill" d="M6 6.5C6 6.22386 6.22386 6 6.5 6L9.5 6C9.77614 6 10 6.22386 10 6.5C10 6.77614 9.77614 7 9.5 7L6.5 7C6.22386 7 6 6.77614 6 6.5Z"/>
    <path class="st-fill" d="M6 9.5C6 9.22386 6.22386 9 6.5 9H9.5C9.77614 9 10 9.22386 10 9.5C10 9.77614 9.77614 10 9.5 10H6.5C6.22386 10 6 9.77614 6 9.5Z"/>`,
  // icn_16_calculated complite — круг с залитой точкой
  complete: STATUS_RING + STATUS_DOT,
  // Variant7 → Variant8 → Variant9 — прогрессия к готово
  'progress-1': `${STATUS_RING}
    <path class="st-done-line" d="M8 2.5C9.45869 2.5 10.8576 3.07946 11.8891 4.11091C12.9205 5.14236 13.5 6.54131 13.5 8C13.5 9.45869 12.9205 10.8576 11.8891 11.8891C10.8576 12.9205 9.45869 13.5 8 13.5"/>
    ${STATUS_DOT}
    <path class="st-done-fill" d="M8 5C9.65685 5 11 6.34315 11 8C11 9.65685 9.65685 11 8 11V5Z"/>`,
  'progress-2': `<circle class="st-done-line" cx="8" cy="8" r="5.5"/>
    <rect class="st-done-fill" x="5" y="5" width="6" height="6" rx="3"/>`,
  done: `<circle class="st-done-line" cx="8" cy="8" r="5.5"/>
    <path class="st-done-fill" d="M8 4C10.2091 4 12 5.79086 12 8C12 10.2091 10.2091 12 8 12C5.79086 12 4 10.2091 4 8C4 5.79086 5.79086 4 8 4ZM8 7C7.44772 7 7 7.44772 7 8C7 8.55228 7.44772 9 8 9C8.55228 9 9 8.55228 9 8C9 7.44772 8.55228 7 8 7Z"/>`,
  // Warning — залитый ромб, Variant6 — контурный, icn_16_error — красный контурный
  warning: `<path class="st-warn-solid" d="${STATUS_DIAMOND}"/>
    <path class="st-warn-inner" d="M8 6L10 8L8 10L6 8L8 6Z"/>`,
  'warning-outline': `<path class="st-warn-line" d="${STATUS_DIAMOND}"/>
    <path class="st-warn-fill" d="M8 6L10 8L8 10L6 8L8 6Z"/>`,
  error: `<path class="st-error-line" d="${STATUS_DIAMOND}"/>
    <path class="st-error-fill" d="M6 8L8 6L10 8L8 10L6 8Z"/>`,
};

const STATUS_LABELS = {
  'not-calculated': 'Not calculated',
  calculated: 'Calculated',
  complete: 'Calculated, complete',
  'progress-1': 'In progress',
  'progress-2': 'Almost done',
  done: 'Done',
  warning: 'Warning',
  'warning-outline': 'Warning',
  error: 'Error',
};

// От худшего к лучшему — у веток показываем худший статус среди операций внутри
const STATUS_ORDER = ['error', 'warning', 'warning-outline', 'not-calculated', 'progress-1', 'progress-2', 'calculated', 'complete', 'done'];

function statusIcon(status) {
  const icon = document.createElement('span');
  icon.className = 'status';
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-label', STATUS_LABELS[status]);
  icon.title = STATUS_LABELS[status];
  icon.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true">${STATUS_SHAPES[status]}</svg>`;
  return icon;
}
