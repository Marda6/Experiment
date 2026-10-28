// Траектории операций проекта Housing — расчёт имитируется, но по геометрии детали и параметрам операции:
// стратегия, шаг, глубина, припуск, глубина отверстия, держатель (Inspector). Поменяли параметр — траектория
// устарела: статус «не рассчитано», после Calculate — новая.
// Деталь — в мм: ноль в центре низа, Z вверх. Во втором установе деталь перевёрнута: низ обрабатывается как верх,
// кармана, паза и отверстий там нет.
// Сегмент: rapid — холостой ход; approach — подвод и врезание (вертикально, рампой, по спирали); feed — вход
// и выход по дуге, отвод; work — рабочая подача; collision — где держатель задевает деталь.
// toolpathFor(item) → { segs: [{ type, pts }], collision: { at, z, share, title, text } | null } — с кэшем по параметрам.
// calcResultOf(item) — статус после расчёта (Calculate — tree-tools.js, агент — agent.js): столкновение — ошибка.
// Рисует траектории scene.js, столкновение видно и в симуляции (simulation.js).
// paramValue, storedParam, toolStickOut, HOLDER_DEFAULT, inspectorDecorators, showInspectorTab, renderInspector,
// inspectorBody — inspector.js; tree, selectedItem, setStatus, refreshBranchStatuses — tree.js; statusIcon — status-icons.js

const PART = {
  size: [120, 80, 45], // X × Y × Z
  pocket: { c: [-12, 0], h: [28, 18], r: 4, floor: 20 }, // карман 56 × 36, углы R4, глубина 25
  slot: { c: [38, 0], h: [6, 25], floor: 37 }, // паз 12 × 50 со скруглёнными концами, глубина 8
  holes: [[-50, -30], [50, -30], [50, 30], [-50, 30]], // резьба M8: отверстия Ø6.8 глубиной 20
  holeD: 6.8,
  holeDepth: 20,
};
const PART_TOP = PART.size[2];
const SAFE_Z = PART_TOP + 25; // Safe Z установа (Inspector › Setup)
const CLEAR_Z = PART_TOP + 5; // Rapid Z — здесь холостые ходы между проходами

// Статусы, при которых у операции есть траектория
const TOOLPATH_STATUSES = ['done', 'complete', 'calculated', 'error', 'warning', 'warning-outline'];

/* ---------- Геометрия путей ---------- */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function arcPts(cx, cy, r, a0, a1, z0, z1 = z0, perQuarter = 6) {
  const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) / (Math.PI / 2)) * perQuarter));
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a), z0 + (z1 - z0) * t];
  });
}

// Замкнутый прямоугольник со скруглёнными углами, против часовой, от середины нижней стороны
function loopPts(cx, cy, hx, hy, r, z) {
  const rr = clamp(r, 0, Math.min(hx, hy));
  const pts = [[cx, cy - hy, z]];
  [
    [cx + hx - rr, cy - hy + rr, -Math.PI / 2],
    [cx + hx - rr, cy + hy - rr, 0],
    [cx - hx + rr, cy + hy - rr, Math.PI / 2],
    [cx - hx + rr, cy - hy + rr, Math.PI],
  ].forEach(([x, y, a]) => pts.push(...(rr > 0.01 ? arcPts(x, y, rr, a, a + Math.PI / 2, z, z, 4) : [[x, y, z]])));
  pts.push([cx, cy - hy, z]);
  return pts;
}

// Уровни по глубине: шагами от верха, последний — ровно на дне
function zLevels(from, to, step) {
  const levels = [];
  for (let z = from - Math.max(step, 0.5); z > to + 0.01 && levels.length < 60; z -= Math.max(step, 0.5)) levels.push(z);
  levels.push(to);
  return levels;
}

// Путь из сегментов: следующий сегмент начинается там, где закончился предыдущий
function pathBuilder() {
  const segs = [];
  let at = null;
  const move = (type, pts) => {
    if (!pts.length) return;
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.pts.push(...pts);
    else segs.push({ type, pts: at ? [at, ...pts] : [...pts] });
    at = pts[pts.length - 1];
  };
  return {
    segs,
    move,
    at: () => at,
    // к точке: с безопасной высоты (первый вход) или отводом на Rapid Z — холостым ходом над точкой, подводом вниз
    enter([x, y, z]) {
      if (at) {
        move('feed', [[at[0], at[1], CLEAR_Z]]);
        move('rapid', [[x, y, CLEAR_Z]]);
      } else {
        move('rapid', [[x, y, SAFE_Z], [x, y, CLEAR_Z]]);
      }
      move('approach', [[x, y, z]]);
    },
    // в конце: отвод до Rapid Z и холостой ход на безопасную высоту
    leave() {
      if (!at) return;
      move('feed', [[at[0], at[1], CLEAR_Z]]);
      move('rapid', [[at[0], at[1], SAFE_Z]]);
    },
  };
}

/* ---------- Генераторы по типу операции. ctx: { item, p, d, r, flipped, pattern, num(tab, label, fallback) } ---------- */

// Торцевание: проходы вдоль X с разворотами дугой за пределами детали
function genFacing(ctx) {
  const { p, d } = ctx;
  const [sx, sy] = PART.size;
  const so = clamp(ctx.num('Strategy', 'Stepover', d * 0.7), d * 0.1, d * 0.9);
  const edge = sy / 2 - d * 0.35;
  const ys = [];
  for (let y = -edge; y < edge - 0.01 && ys.length < 40; y += so) ys.push(y);
  ys.push(edge);
  const xOut = sx / 2 + d / 2 + 5;
  ys.forEach((y, i) => {
    const [x0, x1] = i % 2 ? [xOut, -xOut] : [-xOut, xOut];
    if (i === 0) {
      p.enter([x0, y, PART_TOP]);
    } else {
      const prev = ys[i - 1];
      const r = (y - prev) / 2;
      p.move('work', x0 > 0
        ? arcPts(x0, prev + r, r, -Math.PI / 2, Math.PI / 2, PART_TOP)
        : arcPts(x0, prev + r, r, -Math.PI / 2, -Math.PI * 1.5, PART_TOP));
    }
    p.move('work', [[x1, y, PART_TOP]]);
  });
  p.leave();
}

// Выборка кармана. Parallel — зигзаг вдоль X (врезание рампой) и проход по контуру;
// Adaptive / Offset / Spiral — врезание спиралью в центре и петли изнутри наружу
function genPocket(ctx) {
  if (ctx.flipped) return null;
  const { p, r, d } = ctx;
  const { c: [cx, cy], h: [phx, phy], r: pr, floor } = PART.pocket;
  const leave = Math.max(0, ctx.num('Strategy', 'Stock to leave', 0.2));
  const hx = phx - r - leave;
  const hy = phy - r - leave;
  if (hx <= 0 || hy <= 0) return null; // инструмент в карман не входит
  const so = clamp(ctx.num('Strategy', 'Stepover', r), d * 0.05, d * 0.95);
  const rr = Math.max(pr - r - leave, 0);
  const levels = zLevels(PART_TOP, floor + leave, ctx.num('Parameters', 'Step down', 5));
  const loops = /adaptive|offset|spiral/i.test(ctx.pattern);
  const smooth = /adaptive/i.test(ctx.pattern) ? 3 : 0; // адаптивная — плавные повороты

  levels.forEach((z, li) => {
    const above = li === 0 ? PART_TOP + 1 : levels[li - 1] + 1;
    if (loops) {
      const rings = [];
      for (let k = 0; k < 40; k += 1) {
        const ly = hy - k * so;
        if (ly < 0.5) break;
        rings.push([hx - k * so, ly]);
      }
      rings.reverse();
      const helixR = Math.min(r * 0.8, rings[0][1]);
      if (li === 0) {
        p.enter([cx + helixR, cy, above]);
      } else {
        p.move('feed', [[...p.at().slice(0, 2), above + 1]]);
        p.move('rapid', [[cx + helixR, cy, above]]);
      }
      p.move('approach', arcPts(cx, cy, helixR, 0, Math.PI * 4, above, z, 6));
      rings.forEach(([lx, ly]) => {
        p.move('work', [[cx, cy - ly, z]]);
        p.move('work', loopPts(cx, cy, lx, ly, Math.min(ly, lx, rr + smooth), z));
      });
    } else {
      const ramp = Math.min(10, hx);
      if (li === 0) {
        p.enter([cx - hx, cy - hy, above]);
      } else {
        p.move('feed', [[...p.at().slice(0, 2), above]]);
        p.move('rapid', [[cx - hx, cy - hy, above]]);
      }
      p.move('approach', [[cx - hx + ramp, cy - hy, z]]);
      const ys = [];
      for (let y = -hy; y < hy - 0.01 && ys.length < 80; y += so) ys.push(y);
      ys.push(hy);
      ys.forEach((y, i) => {
        const [xa, xb] = i % 2 ? [cx + hx, cx - hx] : [cx - hx, cx + hx];
        if (i > 0) p.move('work', [[xa, cy + y, z]]);
        p.move('work', [[xb, cy + y, z]]);
      });
      p.move('work', [[cx, cy - hy, z]]);
      p.move('work', loopPts(cx, cy, hx, hy, rr, z));
    }
  });
  p.leave();
  return null;
}

// Доработка углов кармана после большой фрезы: в каждом углу — проход по двум стенкам.
// Вылет инструмента меньше глубины — держатель задевает стенку: эти проходы — столкновение
function genRest(ctx) {
  if (ctx.flipped) return null;
  const { p, r } = ctx;
  const { c: [cx, cy], h: [phx, phy], floor } = PART.pocket;
  const leave = Math.max(0, ctx.num('Strategy', 'Stock to leave', 0.2));
  const ex = phx - r - leave;
  const ey = phy - r - leave;
  if (ex <= 0 || ey <= 0) return null;
  const reach = toolStickOut(ctx.item);
  const levels = zLevels(PART_TOP, floor + leave, ctx.num('Parameters', 'Step down', 5));
  const leg = Math.min(10, ex, ey);
  let collision = null;

  levels.forEach((z, li) => {
    const hit = PART_TOP - z > reach;
    [[1, -1], [1, 1], [-1, 1], [-1, -1]].forEach(([sx, sy], k) => {
      const kx = cx + sx * ex;
      const ky = cy + sy * ey;
      const start = [kx - sx * leg, ky, z];
      if (li === 0 && k === 0) {
        p.enter(start);
      } else {
        const lift = p.at()[2] + 2;
        p.move('feed', [[p.at()[0], p.at()[1], lift]]);
        p.move('rapid', [[start[0], start[1], lift]]);
        p.move('approach', [start]);
      }
      if (hit && !collision) collision = { at: [kx, ky, z], z };
      p.move(hit ? 'collision' : 'work', [[kx, ky, z], [kx, ky - sy * leg, z]]);
    });
  });
  p.leave();
  return collision;
}

// Чистовой проход по стенкам кармана: на каждом уровне вход по дуге, контур, выход по дуге
function genWalls(ctx) {
  if (ctx.flipped) return null;
  const { p, r } = ctx;
  const { c: [cx, cy], h: [phx, phy], r: pr, floor } = PART.pocket;
  const leave = Math.max(0, ctx.num('Strategy', 'Stock to leave', 0));
  const hx = phx - r - leave;
  const hy = phy - r - leave;
  if (hx <= 0 || hy <= 0) return null;
  const rr = Math.max(pr - r - leave, 0);
  const lead = Math.min(3, hy);
  const sx = cx;
  const sy = cy - hy;
  zLevels(PART_TOP, floor + leave, ctx.num('Parameters', 'Step down', 5)).forEach((z, li) => {
    const inner = [sx - lead, sy + lead, z];
    if (li === 0) p.enter(inner);
    else p.move('approach', [inner]);
    p.move('feed', arcPts(sx, sy + lead, lead, Math.PI, Math.PI * 1.5, z));
    p.move('work', loopPts(cx, cy, hx, hy, rr, z));
    p.move('feed', arcPts(sx, sy + lead, lead, Math.PI * 1.5, Math.PI * 2, z));
    p.move('feed', [inner]);
  });
  p.leave();
  return null;
}

// Чистовая дна кармана: петли снаружи внутрь, в середине — проход вдоль
function genFloor(ctx) {
  if (ctx.flipped) return null;
  const { p, r, d } = ctx;
  const { c: [cx, cy], h: [phx, phy], r: pr, floor } = PART.pocket;
  const leave = Math.max(0, ctx.num('Strategy', 'Stock to leave', 0));
  const z = floor + leave;
  const hx = phx - r - leave;
  const hy = phy - r - leave;
  if (hx <= 0 || hy <= 0) return null;
  const so = clamp(ctx.num('Strategy', 'Stepover', r * 1.2), d * 0.05, d * 0.95);
  const rr = Math.max(pr - r - leave, 0);
  const lead = Math.min(3, hy);
  p.enter([cx - lead, cy - hy + lead, z]);
  p.move('feed', arcPts(cx, cy - hy + lead, lead, Math.PI, Math.PI * 1.5, z));
  let last = [hx, hy];
  for (let k = 0; k < 40; k += 1) {
    const lx = hx - k * so;
    const ly = hy - k * so;
    if (ly < 0.3) break;
    p.move('work', [[cx, cy - ly, z]]);
    p.move('work', loopPts(cx, cy, lx, ly, Math.min(rr, ly), z));
    last = [lx, ly];
  }
  const run = last[0] - last[1];
  if (run > 0.5) p.move('work', [[cx - run, cy, z], [cx + run, cy, z]]);
  p.leave();
  return null;
}

// Паз: рампа вдоль паза на каждый уровень, обратный проход по центру и петля по стенкам
function genSlot(ctx) {
  if (ctx.flipped) return null;
  const { p, r } = ctx;
  const { c: [cx, cy], h: [shx, shy], floor } = PART.slot;
  const leave = Math.max(0, ctx.num('Strategy', 'Stock to leave', 0.2));
  const w = shx - r - leave;
  const len = shy - r - leave;
  if (len <= 0 || w < 0) return null;
  const levels = zLevels(PART_TOP, floor + leave, ctx.num('Parameters', 'Step down', 4));
  levels.forEach((z, li) => {
    const above = li === 0 ? PART_TOP + 1 : levels[li - 1];
    if (li === 0) {
      p.enter([cx, cy - len, above]);
    } else {
      p.move('feed', [[...p.at().slice(0, 2), above + 1]]);
      p.move('rapid', [[cx, cy - len, above + 1]]);
      p.move('approach', [[cx, cy - len, above]]);
    }
    p.move('approach', [[cx, cy + len, z]]);
    p.move('work', [[cx, cy - len, z]]);
    if (w > 0.2) p.move('work', loopPts(cx, cy, w, len, w, z));
  });
  p.leave();
  return null;
}

// Наружный контур: снаружи вход по дуге, контур с радиусом фрезы на углах, выход по дуге
function genContour(ctx) {
  const { p, r } = ctx;
  const [sx, sy] = PART.size;
  const leave = Math.max(0, ctx.num('Strategy', 'Stock to leave', 0));
  const hx = sx / 2 + r + leave;
  const hy = sy / 2 + r + leave;
  const lead = 5;
  const outer = [-lead, -hy - lead];
  zLevels(PART_TOP, 1, ctx.num('Parameters', 'Step down', 11)).forEach((z, li) => {
    if (li === 0) p.enter([...outer, z]);
    else p.move('approach', [[...outer, z]]);
    p.move('feed', arcPts(0, -hy - lead, lead, Math.PI, Math.PI / 2, z));
    p.move('work', loopPts(0, 0, hx, hy, r, z));
    p.move('feed', arcPts(0, -hy - lead, lead, Math.PI / 2, 0, z));
    p.move('feed', [[...outer, z]]);
  });
  p.leave();
  return null;
}

// Сверление, центровка, резьба: цикл на каждом отверстии — подвод к плоскости R, рабочий ход на глубину,
// отвод (у резьбы — на подаче, обратным ходом); между отверстиями — холостой ход над плоскостью R
function genHoles(ctx, kind) {
  if (ctx.flipped) return null;
  const { p } = ctx;
  const fallback = { spot: 3.5, drill: PART.holeDepth + 2, tap: PART.holeDepth - 2 }[kind];
  const depth = Math.max(0.5, ctx.num('Hole', 'Depth', fallback));
  const rPlane = PART_TOP + 2;
  PART.holes.forEach(([x, y], i) => {
    if (i === 0) p.move('rapid', [[x, y, SAFE_Z], [x, y, CLEAR_Z], [x, y, rPlane]]);
    else p.move('rapid', [[x, y, rPlane]]);
    p.move('work', [[x, y, PART_TOP - depth]]);
    p.move(kind === 'tap' ? 'feed' : 'rapid', [[x, y, rPlane]]);
  });
  const [x, y] = PART.holes[PART.holes.length - 1];
  p.move('rapid', [[x, y, SAFE_Z]]);
  return null;
}

// Фаска 0.5×45°: по наружной кромке, по кромке кармана и паза (во втором установе — только наружная)
function genChamfer(ctx) {
  const { p } = ctx;
  const [sx, sy] = PART.size;
  const z = PART_TOP - 1.2;
  const o = 0.7; // центр фаски чуть за кромкой
  const loops = [loopPts(0, 0, sx / 2 + o, sy / 2 + o, o, z)];
  if (!ctx.flipped) {
    const { c: [pcx, pcy], h: [phx, phy], r: pr } = PART.pocket;
    const { c: [scx, scy], h: [shx, shy] } = PART.slot;
    loops.push(loopPts(pcx, pcy, phx - o, phy - o, Math.max(pr - o, 0), z));
    loops.push(loopPts(scx, scy, shx - o, shy - o, shx - o, z));
  }
  loops.forEach((loop) => {
    p.enter(loop[0]);
    p.move('work', loop);
  });
  p.leave();
  return null;
}

// Заусенцы на кромках отверстий: в каждом — вход от центра, окружность по кромке фасочной фрезой, выход к центру
function genDeburrHoles(ctx) {
  if (ctx.flipped) return null;
  const { p } = ctx;
  const z = PART_TOP - 1.6;
  const ring = 1.2; // центр фрезы — чуть от оси: кромку снимает конус
  PART.holes.forEach(([x, y]) => {
    p.enter([x, y, z]);
    p.move('feed', [[x + ring, y, z]]);
    p.move('work', arcPts(x, y, ring, 0, Math.PI * 2, z));
    p.move('feed', [[x, y, z]]);
  });
  p.leave();
  return null;
}

const TOOLPATH_GENERATORS = {
  'Face milling': genFacing,
  'Pocket roughing': genPocket,
  'Adaptive roughing': (ctx) => genPocket({ ...ctx, pattern: 'Adaptive' }),
  'Rest roughing': genRest,
  'Rest machining': genRest,
  'Slot roughing': genSlot,
  'Wall finishing': genWalls,
  'Z-level finishing': genWalls,
  'Z-level semi-finish': genWalls,
  Pencil: genWalls,
  'Floor finishing': genFloor,
  'Parallel finishing': genFloor,
  'Parallel semi-finish': genFloor,
  'Scallop finishing': genFloor,
  'Contour 2D': genContour,
  'Spot drilling': (ctx) => genHoles(ctx, 'spot'),
  'Drilling Ø6.8': (ctx) => genHoles(ctx, 'drill'),
  'Drilling Ø10': (ctx) => genHoles(ctx, 'drill'),
  'Reaming Ø10H7': (ctx) => genHoles(ctx, 'drill'),
  'Counterbore Ø14': (ctx) => genHoles(ctx, 'drill'),
  'Tapping M8': (ctx) => genHoles(ctx, 'tap'),
  'Chamfer 0.5×45°': genChamfer,
  Deburring: genDeburrHoles,
  'Edge break': genChamfer,
};

/* ---------- Траектория операции ---------- */

// Установ узла: 0 — первый; станок — первый. Во втором (нечётном) деталь перевёрнута
function setupIndexOf(item) {
  const setup = item?.closest('.tree__item[aria-level="2"]');
  return setup ? [...tree.querySelectorAll('.tree__item[aria-level="2"]')].indexOf(setup) : 0;
}

const toolDiameter = (item) => parseFloat(item.dataset.toolName?.match(/Ø([\d.]+)/)?.[1]) || 8;

function numParam(item, tab, label, fallback) {
  const value = parseFloat(paramValue(item, tab, label)?.val);
  return Number.isFinite(value) ? value : fallback;
}

// Параметры, от которых зависит траектория, — ключ кэша
const TOOLPATH_PARAMS = [['Strategy', 'Pattern'], ['Strategy', 'Stepover'], ['Strategy', 'Stock to leave'], ['Parameters', 'Step down'], ['Hole', 'Depth']];
const toolpathCache = new WeakMap();
const NO_TOOLPATH = { segs: [], collision: null };

function describeCollision(item, hit, segs) {
  const total = segs.reduce((sum, seg) => sum + seg.pts.length, 0);
  let before = 0;
  for (const seg of segs) {
    if (seg.type === 'collision') break;
    before += seg.pts.length;
  }
  const holder = storedParam(item, 'Tool', 'Holder')?.val ?? HOLDER_DEFAULT;
  return {
    ...hit,
    share: total ? before / total : 0,
    title: `Holder collision at Z ${hit.z.toFixed(1)}`,
    text: `The ${holder} holder hits the pocket wall: the tool sticks out ${toolStickOut(item)} mm, the pocket is ${PART_TOP - PART.pocket.floor} mm deep. Choose a longer holder in Tool Assembly and calculate again.`,
  };
}

function toolpathFor(item) {
  const generate = TOOLPATH_GENERATORS[item?.dataset.type];
  if (!generate) return NO_TOOLPATH;
  const setup = setupIndexOf(item);
  const key = JSON.stringify([
    item.dataset.type,
    setup,
    toolStickOut(item),
    ...TOOLPATH_PARAMS.map(([tab, label]) => paramValue(item, tab, label)?.val ?? null),
  ]);
  const cached = toolpathCache.get(item);
  if (cached?.key === key) return cached.path;

  const p = pathBuilder();
  const d = toolDiameter(item);
  const hit = generate({
    item,
    p,
    d,
    r: d / 2,
    flipped: setup % 2 === 1,
    pattern: paramValue(item, 'Strategy', 'Pattern')?.val ?? 'Parallel',
    num: (tab, label, fallback) => numParam(item, tab, label, fallback),
  });
  const path = { segs: p.segs, collision: hit ? describeCollision(item, hit, p.segs) : null };
  toolpathCache.set(item, { key, path });
  return path;
}

// Статус после расчёта: столкновение — ошибка
const calcResultOf = (item) => (toolpathFor(item).collision ? 'error' : 'done');

// Время операции по траектории, мин: рабочие ходы — на подаче операции (Speeds › Feed rate), подвод и вход/выход —
// на половине, холостые — на ускоренной
const RAPID_FEED = 15000; // мм/мин

function toolpathMinutes(item) {
  const feed = Math.max(numParam(item, 'Speeds', 'Feed rate', 1000), 1);
  const rate = { rapid: RAPID_FEED, work: feed, collision: feed };
  return toolpathFor(item).segs.reduce((sum, { type, pts }) => {
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) length += Math.hypot(...pts[i].map((value, k) => value - pts[i - 1][k]));
    return sum + length / (rate[type] ?? feed * 0.5);
  }, 0);
}

/* ---------- Ошибка: в дереве — подсказка на статусе, в Inspector — полоса с объяснением ---------- */

document.addEventListener('statuschange', ({ detail: { item, status } }) => {
  if (item.classList.contains('tree__item--branch')) return;
  const collision = status === 'error' && toolpathFor(item).collision;
  const icon = item.querySelector(':scope > .tree__row > .status');
  if (collision && icon) icon.title = collision.title;
  // у выбранной операции ошибка появилась или ушла — полоса в Inspector тоже
  if (item === selectedItem && (collision || inspectorBody.querySelector('.insp-alert'))) renderInspector();
});

// Поменяли параметр рассчитанной операции — траектория устарела (как в ENCY).
// Инструмент — ещё и вылет на вкладке Tool Assembly пересчитать
document.addEventListener('paramchange', ({ detail: { item, tab } }) => {
  if (!item.classList.contains('tree__item--branch') && TOOLPATH_STATUSES.includes(item.dataset.status)) {
    setStatus(item, 'not-calculated');
    refreshBranchStatuses();
  }
  if (tab === 'Tool' && item === selectedItem) renderInspector();
});

inspectorDecorators.push(({ main, item, tab }) => {
  if (item.dataset.status !== 'error') return;
  const collision = toolpathFor(item).collision;
  if (!collision) return;
  const alert = document.createElement('div');
  alert.className = 'insp-alert';
  const text = document.createElement('div');
  text.className = 'insp-alert__text';
  const title = document.createElement('strong');
  title.textContent = collision.title;
  text.append(title, document.createElement('br'), collision.text);
  alert.append(statusIcon('error'), text);
  if (tab !== 'Tool') {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'insp-alert__btn';
    open.textContent = 'Tool Assembly';
    open.addEventListener('click', () => showInspectorTab('Tool'));
    alert.append(open);
  }
  main.prepend(alert);
});
