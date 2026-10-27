// Иконки узлов дерева операций. Станок и установ — как вкладки Machine и Setup в Inspector (INSPECTOR_ICONS),
// операции — своя у каждого типа: 16px, два тона, скругление 1px. Заготовка — светлым тоном, обработка
// и инструмент — плотным. Внутри группы (Roughing, Semi-finishing, Finishing, Holes, Chamfers) — одна семья:
// черновая — блок и снимаемое, получистовая и чистовая — поверхность и проходы (чистовые — тоньше и чаще),
// отверстия — заготовка и инструмент, фаски — кромка

const OI_A = 'fill="currentColor" fill-opacity="0.96"';
const OI_B = 'fill="currentColor" fill-opacity="0.48"';
const OI_DOME = 'M2 13.5V12C2 7.6 4.7 4 8 4s6 3.6 6 8v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5z';
const OI_POCKET = 'M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm2 3v6h6V5z';
const OI_STOCK_LOW = `<rect ${OI_B} x="2" y="9" width="12" height="5" rx="1"/>`;

const OPERATION_ICONS = {
  // Roughing — блок и то, что с него снимают
  'Face milling': `<rect ${OI_B} x="2" y="8" width="12" height="6" rx="1"/><rect ${OI_A} x="3" y="3" width="10" height="3" rx="1"/>`,
  'Adaptive roughing': `<rect ${OI_B} x="2" y="2" width="12" height="12" rx="1"/><path ${OI_A} fill-rule="evenodd" d="M8 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zm0 1.75a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5z"/>`,
  'Pocket roughing': `<path ${OI_B} fill-rule="evenodd" d="${OI_POCKET}"/><rect ${OI_A} x="6.25" y="6.25" width="3.5" height="3.5" rx="0.75"/>`,
  'Rest roughing': `<path ${OI_B} fill-rule="evenodd" d="${OI_POCKET}"/><path ${OI_A} d="M5 5h2.5L5 7.5z"/><path ${OI_A} d="M11 11H8.5L11 8.5z"/>`,
  'Slot roughing': `<rect ${OI_B} x="2" y="2" width="12" height="4" rx="1"/><rect ${OI_B} x="2" y="10" width="12" height="4" rx="1"/><rect ${OI_A} x="3.5" y="7" width="9" height="2" rx="1"/>`,

  // Semi-finishing — поверхность и проходы
  'Z-level semi-finish': `<path ${OI_B} d="${OI_DOME}"/><rect ${OI_A} x="4.5" y="7.25" width="7" height="1.5" rx="0.75"/><rect ${OI_A} x="3" y="10.5" width="10" height="1.5" rx="0.75"/>`,
  'Parallel semi-finish': `<path ${OI_B} d="${OI_DOME}"/><rect ${OI_A} x="4.75" y="7" width="1.5" height="6.5" rx="0.75"/><rect ${OI_A} x="7.25" y="4.5" width="1.5" height="9" rx="0.75"/><rect ${OI_A} x="9.75" y="7" width="1.5" height="6.5" rx="0.75"/>`,
  'Rest machining': `<path ${OI_B} d="M2 3a1 1 0 0 1 1-1h2v9h9v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/><path ${OI_A} d="M5 11V7.5a3.5 3.5 0 0 0 3.5 3.5z"/>`,
  'Contour 2D': `<rect ${OI_B} x="5" y="5" width="6" height="6" rx="1"/><path ${OI_A} fill-rule="evenodd" d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm.5 1.5v9h9v-9z"/>`,

  // Finishing — та же поверхность, проходы тоньше и чаще
  'Z-level finishing': `<path ${OI_B} d="${OI_DOME}"/><rect ${OI_A} x="5" y="6.25" width="6" height="1" rx="0.5"/><rect ${OI_A} x="3.5" y="8.75" width="9" height="1" rx="0.5"/><rect ${OI_A} x="2.5" y="11.25" width="11" height="1" rx="0.5"/>`,
  'Parallel finishing': `<path ${OI_B} d="${OI_DOME}"/><rect ${OI_A} x="4.25" y="8" width="1" height="5.5" rx="0.5"/><rect ${OI_A} x="6.5" y="5" width="1" height="8.5" rx="0.5"/><rect ${OI_A} x="8.75" y="5" width="1" height="8.5" rx="0.5"/><rect ${OI_A} x="11" y="8" width="1" height="5.5" rx="0.5"/>`,
  'Scallop finishing': `<path ${OI_B} fill-rule="evenodd" d="M3 2h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm.5 1.5v9h9v-9z"/><path ${OI_A} fill-rule="evenodd" d="M6 5h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm.5 1.5v3h3v-3z"/>`,
  Pencil: `<path ${OI_B} d="M2 3h3l3 6v4.5z"/><path ${OI_B} d="M14 3h-3L8 9v4.5z"/><circle ${OI_A} cx="8" cy="9.5" r="1.75"/>`,
  'Floor finishing': `<rect ${OI_B} x="2" y="2" width="3" height="12" rx="1"/><rect ${OI_B} x="11" y="2" width="3" height="12" rx="1"/><rect ${OI_A} x="6" y="11" width="4" height="3" rx="0.75"/>`,
  'Wall finishing': `<rect ${OI_B} x="2" y="11" width="12" height="3" rx="1"/><rect ${OI_A} x="2" y="2" width="3" height="8" rx="1"/><rect ${OI_A} x="11" y="2" width="3" height="8" rx="1"/>`,

  // Holes — заготовка и инструмент
  'Spot drilling': `<rect ${OI_B} x="2" y="8" width="12" height="6" rx="1"/><path ${OI_A} d="M6 2h4v4l-2 3-2-3z"/>`,
  'Drilling Ø6.8': `${OI_STOCK_LOW}<path ${OI_A} d="M6.5 1h3v9.5L8 13l-1.5-2.5z"/>`,
  'Tapping M8': `${OI_STOCK_LOW}<rect ${OI_A} x="6.5" y="1" width="3" height="11" rx="0.75"/><rect ${OI_B} x="5" y="3" width="6" height="1" rx="0.5"/><rect ${OI_B} x="5" y="5" width="6" height="1" rx="0.5"/><rect ${OI_B} x="5" y="7" width="6" height="1" rx="0.5"/>`,
  'Drilling Ø10': `${OI_STOCK_LOW}<path ${OI_A} d="M5.5 1h5v9.5L8 13.5l-2.5-3z"/>`,
  'Reaming Ø10H7': `${OI_STOCK_LOW}<path ${OI_A} fill-rule="evenodd" d="M6 1h4a.5.5 0 0 1 .5.5V12H5.5V1.5A.5.5 0 0 1 6 1zm1.25 1.5v8h1.5v-8z"/>`,
  'Counterbore Ø14': `<path ${OI_B} fill-rule="evenodd" d="M2 7h12v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zm2.5 0v2.5h2.25V14h2.5V9.5h2.25V7z"/><rect ${OI_A} x="4.5" y="2" width="7" height="2.5" rx="0.75"/><rect ${OI_A} x="6.75" y="4.5" width="2.5" height="3" rx="0.5"/>`,

  // Chamfers — кромка детали
  'Chamfer 0.5×45°': `<path ${OI_B} d="M6.5 4H13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8.5z"/><path ${OI_A} d="M1.3 7.8 5.8 3.3l-.85-.85-4.5 4.5z"/>`,
  Deburring: `<path ${OI_B} d="M3 6h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/><circle ${OI_A} cx="8" cy="3.5" r="2"/>`,
  'Edge break': `<path ${OI_B} d="M6 6h7a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a3 3 0 0 1 3-3z"/><path ${OI_A} d="M1 9a5 5 0 0 1 5-5v1.25A3.75 3.75 0 0 0 2.25 9z"/>`,
};

// неизвестный тип — заготовка и точка обработки
const OPERATION_ICON_DEFAULT = `<rect ${OI_B} x="2" y="2" width="12" height="12" rx="1"/><circle ${OI_A} cx="8" cy="8" r="2.5"/>`;

// Иконка узла: kind — machine / setup / operation, type — тип операции (без номера: Face milling, Pencil…)
function treeNodeIcon(kind, type) {
  const icon = document.createElement('span');
  icon.className = 'tree__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = kind === 'operation'
    ? `<svg viewBox="0 0 16 16">${OPERATION_ICONS[type] ?? OPERATION_ICON_DEFAULT}</svg>`
    : INSPECTOR_ICONS[kind];
  return icon;
}

const treeNodeIconHtml = (kind, type) => treeNodeIcon(kind, type).outerHTML;
