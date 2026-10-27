// Тянущийся разделитель столбиков (дерево, инспектор): мышь, стрелки ←/→ в фокусе, двойной клик — сброс.
// get/set — ширина столбика, которую он меняет. sign: +1 — тянем вправо, столбик шире; -1 — наоборот
function attachColumnDivider(handle, { get, set, reset, sign = 1, step = 8 }) {
  let drag = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { startX: event.clientX, start: get() };
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    document.documentElement.classList.add('is-col-resizing');
  });

  handle.addEventListener('pointermove', (event) => {
    if (drag) set(drag.start + sign * (event.clientX - drag.startX));
  });

  const end = () => {
    drag = null;
    handle.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-col-resizing');
  };

  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', reset);

  handle.addEventListener('keydown', (event) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    set(get() + sign * direction * step);
  });
}
