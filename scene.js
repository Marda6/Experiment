// 3D-сцена во view: деталь проекта Housing на столе, лёгкая сетка, траектории рассчитанных операций.
// Мышь: левая — вращение, правая — сдвиг, колесо — зум.
// Деталь строится по PART (toolpaths.js): слои-выдавливания с карманом, пазом и отверстиями, кромки — линиями.
// Установ выбранного узла задаёт положение детали: во втором установе она перевёрнута (низ — сверху).
// Траектории — выбранной операции, а у установа — всех его операций (у станка — первого установа); только
// рассчитанных. Холостой ход — пунктиром; подвод, вход/выход и рабочая подача — цветами движений темы, как строки
// кода в симуляции; столкновение — толстой линией и меткой цвета ошибки. Фильтр Toolpath их прячет.
// Масштаб: 1 мм = 0.015 единицы сцены; X детали → X сцены, Y → −Z, Z → Y.
// PART, toolpathFor, setupIndexOf, TOOLPATH_STATUSES — toolpaths.js; selectedItem, tree — tree.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const view = document.querySelector('.view');
const canvas = document.querySelector('.view__canvas');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 10, 26); // сетка растворяется в фоне к горизонту

// Мягкий студийный свет от окружения — даёт матовую поверхность
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(4.2, 3.4, 5.4);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.35, 0);
controls.enableDamping = true;
controls.minDistance = 1.5;
controls.maxDistance = 18;
controls.maxPolarAngle = Math.PI / 2 - 0.05; // не уходим под пол

// Ключевой свет сверху-сбоку, отбрасывает мягкую тень
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(3, 7, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4;
key.shadow.camera.right = 4;
key.shadow.camera.top = 4;
key.shadow.camera.bottom = -4;
key.shadow.bias = -0.0005;
scene.add(key);

// Пол: невидимая плоскость ловит тень + лёгкая сетка
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.16 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

let grid = null; // пересоздаётся при смене темы — цвета линий задаются при создании

/* ---------- Деталь ---------- */

const PART_NAME = 'Housing';
const MM = 0.015;
const [PX, PY, PZ] = PART.size;

// мм детали (центр низа — ноль) → сцена; для детали — относительно её центра (она вращается вокруг него)
const toScene = ([x, y, z]) => [x * MM, z * MM, -y * MM];
const toPart = ([x, y, z]) => [x * MM, (z - PZ / 2) * MM, -y * MM];

// Контур со скруглёнными углами в Shape / Path (мм), без отрезков нулевой длины
function roundedPath(path, cx, cy, hx, hy, r) {
  const line = (x, y) => {
    const { x: px, y: py } = path.currentPoint;
    if (Math.hypot(x - px, y - py) > 1e-6) path.lineTo(x, y);
  };
  path.moveTo(cx - hx + r, cy - hy);
  line(cx + hx - r, cy - hy);
  if (r > 0) path.absarc(cx + hx - r, cy - hy + r, r, -Math.PI / 2, 0, false);
  line(cx + hx, cy + hy - r);
  if (r > 0) path.absarc(cx + hx - r, cy + hy - r, r, 0, Math.PI / 2, false);
  line(cx - hx + r, cy + hy);
  if (r > 0) path.absarc(cx - hx + r, cy + hy - r, r, Math.PI / 2, Math.PI, false);
  line(cx - hx, cy - hy + r);
  if (r > 0) path.absarc(cx - hx + r, cy - hy + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

const outlineShape = () => roundedPath(new THREE.Shape(), 0, 0, PX / 2, PY / 2, 0);
const pocketPath = () => roundedPath(new THREE.Path(), ...PART.pocket.c, ...PART.pocket.h, PART.pocket.r);
const slotPath = () => roundedPath(new THREE.Path(), ...PART.slot.c, ...PART.slot.h, PART.slot.h[0]);
const holePaths = () => PART.holes.map(([x, y]) => new THREE.Path().absarc(x, y, PART.holeD / 2, 0, Math.PI * 2, false));

const plastic = new THREE.MeshStandardMaterial({
  roughness: 0.85,
  metalness: 0,
  polygonOffset: true, // траектории и кромки на поверхности рисуются поверх неё, без мерцания
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1,
});

// Деталь — слои по высоте: сплошное дно, слой с карманом, слой с карманом и отверстиями, верх с карманом,
// пазом и отверстиями. Внутренние крышки слоёв лежат внутри материала — их не видно
const holeBottom = PZ - PART.holeDepth;
const SLABS = [
  [0, PART.pocket.floor, []],
  [PART.pocket.floor, holeBottom, [pocketPath]],
  [holeBottom, PART.slot.floor, [pocketPath, holePaths]],
  [PART.slot.floor, PZ, [pocketPath, slotPath, holePaths]],
];

const part = new THREE.Group(); // вращается вокруг центра детали — при перевороте не уходит под стол
part.position.y = (PZ / 2) * MM;
scene.add(part);

// Слой заходит на 0.05 мм в нижний: стыки стенок без щелей (на тёмном фоне щель видна линией)
const SLAB_OVERLAP = 0.05;

const slabMeshes = SLABS.map(([bottom, z1, cuts], index) => {
  const z0 = index ? bottom - SLAB_OVERLAP : bottom;
  const shape = outlineShape();
  cuts.forEach((cut) => shape.holes.push(...[cut()].flat()));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 24 });
  geometry.rotateX(-Math.PI / 2);
  geometry.scale(MM, MM, MM);
  geometry.translate(0, (z0 - PZ / 2) * MM, 0);
  const mesh = new THREE.Mesh(geometry, plastic);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  part.add(mesh);
  return mesh;
});

// Кромки: наружный параллелепипед, карман и паз по верху и по дну, отверстия по верху
function featureEdges() {
  const pairs = [];
  const loop = (points, z) => points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    pairs.push(...toPart([point.x, point.y, z]), ...toPart([next.x, next.y, z]));
  });
  const box = outlineShape().getPoints();
  loop(box, 0);
  loop(box, PZ);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => {
    pairs.push(...toPart([sx * PX / 2, sy * PY / 2, 0]), ...toPart([sx * PX / 2, sy * PY / 2, PZ]));
  });
  const pocket = pocketPath().getPoints(12);
  loop(pocket, PZ);
  loop(pocket, PART.pocket.floor);
  const slot = slotPath().getPoints(12);
  loop(slot, PZ);
  loop(slot, PART.slot.floor);
  holePaths().forEach((hole) => loop(hole.getPoints(24), PZ));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pairs, 3));
  return geometry;
}

const edgeMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 });
part.add(new THREE.LineSegments(featureEdges(), edgeMaterial));

/* ---------- Выбор грани: клик по наружной грани подсвечивает её, клик мимо (и по карману) — снимает ---------- */

// Остальные (чат) узнают по событию faceselect: { part, face } или null
const FACE_GEOMETRY = {
  top: () => {
    const shape = outlineShape();
    shape.holes.push(pocketPath(), slotPath(), ...holePaths());
    return new THREE.ShapeGeometry(shape, 24).rotateX(-Math.PI / 2).scale(MM, MM, MM).translate(0, (PZ / 2) * MM, 0);
  },
  bottom: () => new THREE.PlaneGeometry(PX * MM, PY * MM).rotateX(Math.PI / 2).translate(0, (-PZ / 2) * MM, 0),
  front: () => new THREE.PlaneGeometry(PX * MM, PZ * MM).translate(0, 0, (PY / 2) * MM),
  back: () => new THREE.PlaneGeometry(PX * MM, PZ * MM).rotateY(Math.PI).translate(0, 0, (-PY / 2) * MM),
  right: () => new THREE.PlaneGeometry(PY * MM, PZ * MM).rotateY(Math.PI / 2).translate((PX / 2) * MM, 0, 0),
  left: () => new THREE.PlaneGeometry(PY * MM, PZ * MM).rotateY(-Math.PI / 2).translate((-PX / 2) * MM, 0, 0),
};
const faceGeometries = Object.fromEntries(Object.entries(FACE_GEOMETRY).map(([face, build]) => [face, build()]));

const faceMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
const faceHighlight = new THREE.Mesh(faceGeometries.top, faceMaterial);
faceHighlight.visible = false;
part.add(faceHighlight);

// Грань по точке попадания (мм детали) и нормали (в осях детали): только наружные грани
function faceAt(normal, [x, y, z]) {
  const near = (a, b) => Math.abs(a - b) < 0.5;
  if (normal.y > 0.9 && near(z, PZ)) return 'top';
  if (normal.y < -0.9 && near(z, 0)) return 'bottom';
  if (normal.x > 0.9 && near(x, PX / 2)) return 'right';
  if (normal.x < -0.9 && near(x, -PX / 2)) return 'left';
  if (normal.z > 0.9 && near(y, -PY / 2)) return 'front';
  if (normal.z < -0.9 && near(y, PY / 2)) return 'back';
  return null;
}

function selectFace(face) {
  faceHighlight.visible = Boolean(face);
  if (face) faceHighlight.geometry = faceGeometries[face];
  document.dispatchEvent(new CustomEvent('faceselect', { detail: face ? { part: PART_NAME, face } : null }));
}

// Тело выбрано в дереве модели (model.js) — подкрашиваем цветом выделения, как строку дерева.
// Тело и грань вместе не выбраны: выбрали тело — грань снимается (а грань снимает тело в model.js)
let bodySelected = false;
const bodyColor = new THREE.Color();
const selectionColor = new THREE.Color();

function paintBody() {
  plastic.color.copy(bodyColor);
  if (bodySelected) plastic.color.lerp(selectionColor, 0.45);
}

document.addEventListener('modelselect', (event) => {
  bodySelected = event.detail?.object === 'body' && part.visible;
  if (bodySelected) selectFace(null);
  paintBody();
});

// Фильтры на сцене (view-panels.js): Part — показывать деталь, Face — можно ли выбирать грани,
// Toolpath — траектории. Деталь видна, когда включён фильтр Part и отмечено её тело в дереве модели (model.js)
let pickFaces = true;
const bodyShownBy = { filter: true, tree: true };

function showBody() {
  part.visible = bodyShownBy.filter && bodyShownBy.tree;
  if (!part.visible) selectFace(null); // спрятанную деталь нельзя держать выбранной
}

document.addEventListener('modelvisibility', (event) => {
  bodyShownBy.tree = event.detail.visible;
  showBody();
});

// Клик, а не перетаскивание камеры: сдвиг между нажатием и отпусканием меньше 4px
const raycaster = new THREE.Raycaster();
let pressAt = null;

canvas.addEventListener('pointerdown', (event) => {
  pressAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
});

canvas.addEventListener('pointerup', (event) => {
  if (!pressAt || Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) > 4) return;
  pressAt = null;
  if (!pickFaces || !part.visible) return;

  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(slabMeshes)[0];
  if (!hit) {
    selectFace(null);
    return;
  }
  // нормаль и точка — в осях детали (она может быть перевёрнута), точка — в мм от центра низа
  const toLocal = part.getWorldQuaternion(new THREE.Quaternion()).invert();
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyQuaternion(toLocal);
  const local = part.worldToLocal(hit.point.clone());
  selectFace(faceAt(normal, [local.x / MM, -local.z / MM, local.y / MM + PZ / 2]));
});

/* ---------- Установ: во втором деталь перевёрнута ---------- */

let flipTarget = 0;

function syncSetup() {
  flipTarget = setupIndexOf(selectedItem) % 2 === 1 ? Math.PI : 0;
}

/* ---------- Траектории ---------- */

// Иерархия: рабочая подача — главное, толще всех; подвод и вход/выход — тоньше; холостой ход — тонкий пунктир
const MOTIONS = {
  rapid: { css: '--motion-rapid', width: 1, dashed: true },
  approach: { css: '--motion-approach', width: 1.5 },
  feed: { css: '--motion-feed', width: 1.5 },
  work: { css: '--motion-work', width: 2 },
  collision: { css: '--status-error', width: 4 },
};

const motionMaterials = Object.fromEntries(Object.entries(MOTIONS).map(([type, spec]) => {
  const material = new LineMaterial({ linewidth: spec.width, worldUnits: false });
  if (spec.dashed) {
    material.dashed = true;
    material.dashSize = 0.025;
    material.gapSize = 0.02;
  }
  return [type, material];
}));

// Метка столкновения: видимая часть — яркая, за стенкой — бледная (видно, что она внутри, а не на грани)
const markerMaterial = new THREE.MeshBasicMaterial();
const markerHiddenMaterial = new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true, opacity: 0.3 });
const markerGeometry = new THREE.OctahedronGeometry(0.035);

const toolpaths = new THREE.Group();
scene.add(toolpaths);

// Операции, чьи траектории видны: выбранная; у установа — все его; у станка — первого установа
function shownOperations() {
  const item = selectedItem;
  if (!item) return [];
  if (!item.classList.contains('tree__item--branch')) return [item];
  const setup = item.getAttribute('aria-level') === '1' ? tree.querySelector('.tree__item[aria-level="2"]') : item;
  return setup ? [...setup.querySelectorAll('.tree__item:not(.tree__item--branch)')] : [];
}

function rebuildToolpaths() {
  toolpaths.children.forEach((child) => {
    if (child.isLineSegments2) child.geometry.dispose();
  });
  toolpaths.clear();

  const byType = {};
  const markers = [];
  shownOperations().filter((item) => TOOLPATH_STATUSES.includes(item.dataset.status)).forEach((item) => {
    const path = toolpathFor(item);
    path.segs.forEach(({ type, pts }) => {
      const positions = (byType[type] ??= []);
      for (let i = 0; i + 1 < pts.length; i += 1) positions.push(...toScene(pts[i]), ...toScene(pts[i + 1]));
    });
    if (item.dataset.status === 'error' && path.collision) markers.push(path.collision.at);
  });

  Object.entries(byType).forEach(([type, positions]) => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    const line = new LineSegments2(geometry, motionMaterials[type]);
    if (MOTIONS[type].dashed) line.computeLineDistances();
    line.renderOrder = type === 'collision' ? 2 : 1;
    toolpaths.add(line);
  });
  markers.forEach((at) => {
    const hidden = new THREE.Mesh(markerGeometry, markerHiddenMaterial);
    const shown = new THREE.Mesh(markerGeometry, markerMaterial);
    hidden.renderOrder = 3;
    shown.renderOrder = 4;
    [hidden, shown].forEach((marker) => {
      marker.position.set(...toScene(at));
      toolpaths.add(marker);
    });
  });
}

// Перестраиваем раз за кадр: при расчёте статусы меняются пачками
let toolpathsDirty = true;
const queueToolpaths = () => {
  toolpathsDirty = true;
};

document.addEventListener('treeselect', () => {
  syncSetup();
  queueToolpaths();
});
document.addEventListener('statuschange', queueToolpaths);
document.addEventListener('treechange', queueToolpaths);

document.addEventListener('filterchange', (event) => {
  const { id, on } = event.detail;
  if (id === 'part') {
    bodyShownBy.filter = on;
    showBody();
  }
  if (id === 'face') {
    pickFaces = on;
    if (!on) selectFace(null);
  }
  if (id === 'machine2') toolpaths.visible = on; // фильтр Toolpath
});

/* ---------- Тема ---------- */

// Цвет из CSS-переменной; color-mix() и oklab тоже — через пиксель холста
const colorProbe = document.createElement('span');
colorProbe.hidden = true;
document.body.append(colorProbe);
const colorCanvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

function cssColor(name) {
  colorProbe.style.color = `var(${name})`;
  colorCanvas.clearRect(0, 0, 1, 1);
  colorCanvas.fillStyle = '#000';
  colorCanvas.fillStyle = getComputedStyle(colorProbe).color;
  colorCanvas.fillRect(0, 0, 1, 1);
  const [r, g, b] = colorCanvas.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

// Цвета сцены берём из темы (CSS-переменные) и обновляем при её смене
function applyTheme() {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => new THREE.Color(css.getPropertyValue(name).trim());

  scene.background.copy(color('--view-bg'));
  scene.fog.color.copy(color('--view-bg'));
  bodyColor.copy(color('--scene-object'));
  selectionColor.copy(color('--selection-bg'));
  paintBody();
  edgeMaterial.color.copy(bodyColor).multiplyScalar(0.5); // кромки — темнее детали, читаются в любой теме
  faceMaterial.color.copy(color('--selection-bg')); // подсветка грани — цветом выделения, как в дереве
  Object.entries(MOTIONS).forEach(([type, spec]) => motionMaterials[type].color.copy(cssColor(spec.css)));
  markerMaterial.color.copy(cssColor('--status-error'));
  markerHiddenMaterial.color.copy(markerMaterial.color);

  if (grid) {
    scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
  }
  grid = new THREE.GridHelper(40, 80, color('--scene-grid-center'), color('--scene-grid'));
  grid.material.transparent = true;
  grid.material.opacity = 0.7;
  grid.position.y = 0.001;
  scene.add(grid);
}

applyTheme();
document.addEventListener('themechange', applyTheme);

function resize() {
  const { clientWidth: width, clientHeight: height } = view;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  Object.values(motionMaterials).forEach((material) => material.resolution.set(width, height));
}

new ResizeObserver(resize).observe(view);
resize();
syncSetup();

renderer.setAnimationLoop(() => {
  // переворот детали между установами — плавно
  const turn = flipTarget - part.rotation.x;
  part.rotation.x = Math.abs(turn) < 0.002 ? flipTarget : part.rotation.x + turn * 0.18;
  if (toolpathsDirty) {
    toolpathsDirty = false;
    rebuildToolpaths();
  }
  controls.update();
  renderer.render(scene, camera);
});
