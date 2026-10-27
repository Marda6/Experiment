// 3D-сцена во view: простой объект из матового пластика на полу с лёгкой сеткой.
// Мышь: левая — вращение, правая — сдвиг, колесо — зум.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

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

// Мягкий студийный свет от окружения — даёт матовую пластиковую поверхность
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
camera.position.set(5, 3.6, 6.5);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 0.5, 0);
controls.enableDamping = true;
controls.minDistance = 3;
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

// Объект — корпус (деталь Housing) из матового пластика
const PART_NAME = 'Housing';
const SIZE = { x: 1.8, y: 1, z: 1.3 };
const RADIUS = 0.14;

const plastic = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
const body = new THREE.Mesh(new RoundedBoxGeometry(SIZE.x, SIZE.y, SIZE.z, 6, RADIUS), plastic);
body.position.y = SIZE.y / 2;
body.castShadow = true;
body.receiveShadow = true;
scene.add(body);

// Выбор грани: клик по детали подсвечивает грань, клик мимо — снимает.
// Остальные (чат) узнают по событию faceselect: { part, face } или null
const FACES = {
  top: { normal: [0, 1, 0], size: [SIZE.x, SIZE.z] },
  bottom: { normal: [0, -1, 0], size: [SIZE.x, SIZE.z] },
  front: { normal: [0, 0, 1], size: [SIZE.x, SIZE.y] },
  back: { normal: [0, 0, -1], size: [SIZE.x, SIZE.y] },
  right: { normal: [1, 0, 0], size: [SIZE.z, SIZE.y] },
  left: { normal: [-1, 0, 0], size: [SIZE.z, SIZE.y] },
};

const faceMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false });
const faceHighlight = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), faceMaterial);
faceHighlight.visible = false;
scene.add(faceHighlight);

// Грань по нормали попадания: берём ось с наибольшей составляющей (скругления — к ближайшей грани)
function faceOf(normal) {
  const axis = ['x', 'y', 'z'].reduce((a, b) => (Math.abs(normal[b]) > Math.abs(normal[a]) ? b : a));
  const sign = Math.sign(normal[axis]);
  return { x: sign > 0 ? 'right' : 'left', y: sign > 0 ? 'top' : 'bottom', z: sign > 0 ? 'front' : 'back' }[axis];
}

function selectFace(face) {
  faceHighlight.visible = Boolean(face);
  if (face) {
    const { normal, size } = FACES[face];
    const n = new THREE.Vector3(...normal);
    const half = new THREE.Vector3(SIZE.x / 2, SIZE.y / 2, SIZE.z / 2);
    // плоская часть грани — без скруглений, чуть над поверхностью
    faceHighlight.scale.set(size[0] - RADIUS * 2, size[1] - RADIUS * 2, 1);
    faceHighlight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    faceHighlight.position.copy(body.position).add(n.clone().multiply(half)).addScaledVector(n, 0.002);
  }
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
  bodySelected = event.detail?.object === 'body' && body.visible;
  if (bodySelected) selectFace(null);
  paintBody();
});

// Фильтры на сцене (view-panels.js): Part — показывать деталь, Face — можно ли выбирать грани.
// Деталь видна, когда включён фильтр Part и отмечено её тело в дереве модели (model.js)
let pickFaces = true;
const bodyShownBy = { filter: true, tree: true };

function showBody() {
  body.visible = bodyShownBy.filter && bodyShownBy.tree;
  if (!body.visible) selectFace(null); // спрятанную деталь нельзя держать выбранной
}

document.addEventListener('modelvisibility', (event) => {
  bodyShownBy.tree = event.detail.visible;
  showBody();
});

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
  if (!pickFaces || !body.visible) return;

  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(body)[0];
  selectFace(hit ? faceOf(hit.face.normal) : null);
});

// Цвета сцены берём из темы (CSS-переменные) и обновляем при её смене
function applyTheme() {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => new THREE.Color(css.getPropertyValue(name).trim());

  scene.background.copy(color('--view-bg'));
  scene.fog.color.copy(color('--view-bg'));
  bodyColor.copy(color('--scene-object'));
  selectionColor.copy(color('--selection-bg'));
  paintBody();
  faceMaterial.color.copy(color('--selection-bg')); // подсветка грани — цветом выделения, как в дереве

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
}

new ResizeObserver(resize).observe(view);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
