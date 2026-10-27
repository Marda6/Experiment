// Своя тема из акцента: выбираешь акцент — остальное подбирается (темы Custom и Custom Dark в меню логотипа).
// Генератор держит ту же лестницу яркостей OKLCH, что и готовые темы: нейтральные — едва подкрашены тоном
// акцента (у серого акцента — серые), чат и выделение — тёмный тон того же семейства. Статусы — свои тона,
// но отходят от акцента, если совпали с ним. Акцент подгоняется по яркости, чтобы читался на панелях
// (контраст 4.5:1): в светлой теме темнее, в тёмной светлее.
// Цвета ставятся инлайном на <html> (их читает и 3D-сцена) и в образцы меню. Палитра хранится —
// index.html ставит её до первой отрисовки. applyTheme (script.js) зовёт applyCustomPalette

const ACCENT_KEY = 'prototype-accent';
const PALETTE_KEY = 'prototype-custom-palette';
const ACCENT_DEFAULT = '#14a39a';
const ACCENT_PRESETS = [
  ['Orange', '#e8692a'],
  ['Amber', '#d4a017'],
  ['Green', '#3f9a4f'],
  ['Turquoise', '#14a39a'],
  ['Cyan', '#1a9fd0'],
  ['Cobalt', '#3b6fd6'],
  ['Violet', '#7b5cd6'],
  ['Magenta', '#c2448f'],
];

/* ---------- OKLCH ↔ sRGB ---------- */

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => srgbToLinear(v / 255));
}

function hexToOklch(hex) {
  const [r, g, b] = hexToLinear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    c: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
}

function oklchToLinear(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -0.0001 && v <= 1.0001);

// Вне охвата sRGB — убавляем насыщенность, тон и яркость сохраняются
function oklchToHex(L, C, H) {
  let rgb = oklchToLinear(L, C, H);
  if (!inGamut(rgb)) {
    let low = 0;
    let high = C;
    for (let i = 0; i < 24; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinear(L, mid, H))) low = mid;
      else high = mid;
    }
    rgb = oklchToLinear(L, low, H);
  }
  return `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const luminance = (hex) => {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const hueDistance = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/* ---------- Генератор ---------- */

// Лестница [яркость, насыщенность] — средние по готовым темам (Stone, Sage, Mist и их тёмные пары).
// Насыщенность — при ярком акценте; у приглушённого — меньше, у серого — ноль
const THEME_LADDER = {
  custom: {
    '--view-bg': [0.905, 0.009],
    '--panel-bg': [0.955, 0.006],
    '--panel-fg': [0.25, 0.012],
    '--chat-bg': [0.35, 0.03],
    '--chat-fg': [0.95, 0.009],
    '--scene-object': [0.875, 0.011],
    '--scene-grid': [0.838, 0.012],
    '--scene-grid-center': [0.77, 0.016],
  },
  'custom-dark': {
    '--view-bg': [0.232, 0.008],
    '--panel-bg': [0.278, 0.009],
    '--panel-fg': [0.925, 0.009],
    '--chat-bg': [0.375, 0.038],
    '--chat-fg': [0.945, 0.012],
    '--scene-object': [0.656, 0.016],
    '--scene-grid': [0.296, 0.013],
    '--scene-grid-center': [0.355, 0.015],
    '--selection-bg': [0.45, 0.045],
    '--selection-fg': [0.968, 0.009],
    '--status-ink': [0.232, 0.008],
  },
};

// Статусы: [яркость, насыщенность, тона]. Первый тон — свой; ближе 35° к акценту — берём самый далёкий.
// Предупреждение уходит только в жёлтое — к оранжевому оно спутается с ошибкой
const THEME_STATUS = {
  custom: {
    '--status-done': [0.55, 0.1, [150, 177, 128]],
    '--status-warn': [0.615, 0.121, [82, 96]],
    '--status-error': [0.535, 0.16, [28, 20, 36]],
  },
  'custom-dark': {
    '--status-done': [0.7, 0.1, [152, 176, 130]],
    '--status-warn': [0.755, 0.13, [80, 96]],
    '--status-error': [0.66, 0.155, [28, 20, 36]],
  },
};

// все цвета, которые ставит генератор (снимаются при переходе на готовую тему)
const CUSTOM_VARS = [...new Set([THEME_LADDER, THEME_STATUS]
  .flatMap((table) => Object.values(table).flatMap((vars) => Object.keys(vars)))), '--accent'];

const STATUS_NEAR_HUE = 35;
const STATUS_GAP_L = 0.08;

function statusHue(hues, accentHue) {
  if (hueDistance(hues[0], accentHue) >= STATUS_NEAR_HUE) return hues[0];
  return hues.reduce((best, hue) => (hueDistance(hue, accentHue) > hueDistance(best, accentHue) ? hue : best));
}

// Тон всё ещё рядом с акцентом — расходимся по яркости (как в Sage Dark: предупреждение светлее и желтее охры)
function statusLightness(l, hue, accent) {
  if (hueDistance(hue, accent.h) >= STATUS_NEAR_HUE || Math.abs(l - accent.l) >= STATUS_GAP_L) return l;
  const lighter = l >= accent.l ? accent.l + STATUS_GAP_L : accent.l - STATUS_GAP_L;
  return Math.min(0.86, Math.max(0.42, lighter));
}

// Акцент: тон и насыщенность — выбранные, яркость — в пределах готовых тем и до контраста 4.5:1 с панелью
function fitAccent(seed, panelHex, dark) {
  let lightness = dark ? Math.max(seed.l, 0.66) : Math.min(seed.l, 0.56);
  let hex = oklchToHex(lightness, seed.c, seed.h);
  for (let i = 0; i < 40 && contrast(hex, panelHex) < 4.5; i += 1) {
    lightness += dark ? 0.01 : -0.01;
    hex = oklchToHex(lightness, seed.c, seed.h);
  }
  return hex;
}

function buildPalette(accentHex) {
  const seed = hexToOklch(accentHex);
  const tint = Math.min(1, seed.c / 0.1);
  return Object.fromEntries(Object.keys(THEME_LADDER).map((theme) => {
    const vars = {};
    Object.entries(THEME_LADDER[theme]).forEach(([name, [l, c]]) => { vars[name] = oklchToHex(l, c * tint, seed.h); });
    vars['--accent'] = fitAccent(seed, vars['--panel-bg'], theme === 'custom-dark');
    const accent = hexToOklch(vars['--accent']);
    const hueless = accent.c < 0.03; // серый акцент: тона нет — статусы свои
    Object.entries(THEME_STATUS[theme]).forEach(([name, [l, c, hues]]) => {
      const hue = hueless ? hues[0] : statusHue(hues, accent.h);
      vars[name] = oklchToHex(hueless ? l : statusLightness(l, hue, accent), c, hue);
    });
    return [theme, vars];
  }));
}

/* ---------- Применение и меню ---------- */

let accentSeed = localStorage.getItem(ACCENT_KEY) || ACCENT_DEFAULT;
let customPalette = buildPalette(accentSeed);
localStorage.setItem(PALETTE_KEY, JSON.stringify(customPalette));

// Тема Custom — цвета палитры на <html>; любая другая — снять их, работают правила тем из styles.css
function applyCustomPalette(theme) {
  const html = document.documentElement;
  CUSTOM_VARS.forEach((name) => html.style.removeProperty(name));
  Object.entries(customPalette[theme] ?? {}).forEach(([name, value]) => html.style.setProperty(name, value));
}

const accentMenu = document.getElementById('app-menu');
const accentRow = accentMenu.querySelector('.accent-row');
const accentValue = accentMenu.querySelector('.accent-value');
const accentInput = accentMenu.querySelector('.accent-input');
const accentCustom = accentInput.closest('.accent-swatch');

const accentButtons = ACCENT_PRESETS.map(([name, hex]) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'accent-swatch';
  button.style.background = hex;
  button.title = name;
  button.setAttribute('aria-label', `Accent: ${name}`);
  button.dataset.accent = hex;
  button.addEventListener('click', () => setAccent(hex));
  return button;
});
accentRow.prepend(...accentButtons);

// Образцы тем Custom в списке, текущий акцент, значение
function paintAccentUi() {
  Object.entries(customPalette).forEach(([theme, vars]) => {
    const swatches = accentMenu.querySelector(`.menu__swatches[data-theme="${theme}"]`);
    ['--view-bg', '--panel-bg', '--chat-bg', '--accent'].forEach((name) => swatches?.style.setProperty(name, vars[name]));
  });
  const preset = accentButtons.find((button) => button.dataset.accent === accentSeed);
  accentButtons.forEach((button) => button.setAttribute('aria-pressed', String(button === preset)));
  accentCustom.classList.toggle('is-current', !preset);
  accentInput.value = accentSeed;
  accentValue.textContent = accentSeed.toUpperCase();
}

// Выбрали акцент — тема Custom той же светлоты, что и текущая
function setAccent(hex) {
  accentSeed = hex.toLowerCase();
  localStorage.setItem(ACCENT_KEY, accentSeed);
  customPalette = buildPalette(accentSeed);
  localStorage.setItem(PALETTE_KEY, JSON.stringify(customPalette));
  paintAccentUi();
  applyTheme(document.documentElement.dataset.theme.endsWith('-dark') ? 'custom-dark' : 'custom');
}

accentInput.addEventListener('input', () => setAccent(accentInput.value));
paintAccentUi();
