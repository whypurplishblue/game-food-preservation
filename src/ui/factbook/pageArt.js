/**
 * PAGE ART — every printed surface in the 3D book is drawn here, into a 2D
 * canvas that becomes a texture on the page geometry.
 *
 * WHY CANVAS AND NOT DOM
 * The pages physically bend. A DOM layer cannot be curled around a spine, and
 * pre-baked images would freeze the language. Drawing to canvas keeps full
 * typographic control, re-renders instantly when the language changes, and maps
 * one-to-one onto the sheet mesh.
 *
 * WHAT THIS FILE MAY AND MAY NOT CONTAIN
 * Layout, rules, icons, diagrams — yes. Educational sentences — never. Every
 * string painted here arrives on the `spread` object, which the view model
 * resolved from t() / tList(). The only literals below are structural labels
 * that the caller passes in already localised.
 */

/** Canvas size of one page face, in texels. */
export const PAGE_W = 960;
export const PAGE_H = 1250;

/**
 * The page is LAID OUT in design units and then scaled up to fill the texture.
 * Type on a page that is 370 screen pixels tall has to be set generously, and
 * a smaller design page is the one knob that enlarges every heading, rule,
 * icon and margin together instead of one at a time.
 */
const PW = 780;
const PH = Math.round(PAGE_H * PW / PAGE_W);
const SCALE = PAGE_W / PW;

const M = 82;                       // outer margin
const COL = PW - M * 2;             // text column width

const INK = '#16294d';
const INK_SOFT = '#5f6f88';
const INK_FAINT = 'rgba(22,41,77,0.42)';
const RULE = 'rgba(22,41,77,0.20)';
const RULE_SOFT = 'rgba(22,41,77,0.11)';
const PAPER = '#f7efdd';
const PAPER_DEEP = '#efe4cc';
const ORANGE = '#d9722a';

/** CJK block: no spaces to break on, so those locales break per character. */
const CJK_RE = new RegExp('[\\u3000-\\u9fff\\uff00-\\uffef]');

const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const hexOf = (n) => `#${(n >>> 0).toString(16).padStart(6, '0')}`;

/** Mix a hex string toward white (a<0) or black (a>0) — for tints and shades. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const to = amount < 0 ? 255 : 0;
  const k = Math.abs(amount);
  r = Math.round(r + (to - r) * k);
  g = Math.round(g + (to - g) * k);
  b = Math.round(b + (to - b) * k);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------------------------------------------------------------- paper stock
let _grain = null;
function grain() {
  if (_grain) return _grain;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() - 0.5) * 34;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 16;
  }
  ctx.putImageData(img, 0, 0);
  _grain = c;
  return c;
}

/**
 * Paper ground. `spine` is the edge the binding is on, so the gutter shading
 * falls on the correct side of every sheet.
 */
function drawPaper(ctx, spine /* 'left' | 'right' */) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PW, PH);

  // Warm falloff toward the outer edge — printed paper is never a flat fill.
  const g = ctx.createLinearGradient(spine === 'left' ? 0 : PW, 0, spine === 'left' ? PW : 0, 0);
  g.addColorStop(0, 'rgba(120,90,50,0.16)');
  g.addColorStop(0.13, 'rgba(120,90,50,0.03)');
  g.addColorStop(0.82, 'rgba(120,90,50,0.00)');
  g.addColorStop(1, 'rgba(120,90,50,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PW, PH);

  const v = ctx.createRadialGradient(PW / 2, PH / 2, PH * 0.34, PW / 2, PH / 2, PH * 0.78);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(70,50,20,0.07)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, PW, PH);

  const p = ctx.createPattern(grain(), 'repeat');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, PW, PH);
  ctx.globalAlpha = 1;
}

// ------------------------------------------------------------------ type bits
function setFont(ctx, weight, size, family = SANS) {
  ctx.font = `${weight} ${size}px ${family}`;
}

/** Uppercase running head / section label. */
function label(ctx, text, x, y, { colour = INK_FAINT, size = 19, align = 'left' } = {}) {
  setFont(ctx, 700, size);
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const spaced = String(text).toUpperCase().split('').join(' ');
  ctx.fillText(spaced, x, y);
  ctx.textAlign = 'left';
  return y;
}

function rule(ctx, x, y, w, colour = RULE, h = 2) {
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, w, h);
}

/**
 * Flow a paragraph. Returns the baseline y after the last line, so callers can
 * stack blocks without hard-coding coordinates for every locale — Chinese and
 * Malay run to different lengths from English.
 */
function paragraph(ctx, text, x, y, w, {
  size = 25, lh = 1.55, weight = 400, family = SERIF, colour = INK, maxLines = 99, align = 'left',
} = {}) {
  if (!text) return y;
  setFont(ctx, weight, size, family);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';
  const lineH = size * lh;
  // CJK has no spaces to break on, so fall back to per-character breaking.
  const cjk = CJK_RE.test(text);
  const parts = cjk ? Array.from(text) : String(text).split(/\s+/);
  const joiner = cjk ? '' : ' ';
  const lines = [];
  let line = '';
  for (const part of parts) {
    const next = line ? line + joiner + part : part;
    if (ctx.measureText(next).width > w && line) { lines.push(line); line = part; }
    else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines && shown.length) shown[shown.length - 1] += '…';
  let cy = y;
  for (const l of shown) {
    if (align === 'center') { ctx.textAlign = 'center'; ctx.fillText(l, x + w / 2, cy); ctx.textAlign = 'left'; }
    else ctx.fillText(l, x, cy);
    cy += lineH;
  }
  return cy - lineH * (1 - 0.34);
}

/** Display heading in the book's serif, auto-shrunk to fit the column. */
function display(ctx, text, x, y, w, { size = 92, colour = INK, weight = 700 } = {}) {
  let s = size;
  setFont(ctx, weight, s, SERIF);
  while (ctx.measureText(text).width > w && s > 30) {
    s -= 3;
    setFont(ctx, weight, s, SERIF);
  }
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x, y);
  return { size: s, width: ctx.measureText(text).width };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Pill badge — the mechanism label on a method page. */
function badge(ctx, text, x, y, colour, { size = 21 } = {}) {
  setFont(ctx, 800, size);
  const spaced = String(text).toUpperCase();
  const w = ctx.measureText(spaced).width + 42;
  const h = size + 22;
  ctx.fillStyle = rgba(colour, 0.16);
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = rgba(colour, 0.5);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = shade(colour, 0.28);
  ctx.textBaseline = 'middle';
  ctx.fillText(spaced, x + 21, y + h / 2 + 1);
  ctx.textBaseline = 'alphabetic';
  return { w, h };
}

/** Small printer's ornament used as a section terminator. */
function ornament(ctx, cx, cy, colour = INK_FAINT) {
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx - 150, cy); ctx.lineTo(cx - 26, cy);
  ctx.moveTo(cx + 26, cy); ctx.lineTo(cx + 150, cy);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --------------------------------------------------------------------- icons
/**
 * One vector icon set, shared by the pages, the chapter lists and the sense
 * table. `name` comes from METHODS[].icon where a method defines one, and is
 * otherwise chosen from the mechanism — both of which are curriculum data.
 */
export function drawIcon(ctx, name, cx, cy, r, colour) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const c = colour || INK;
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(2, r * 0.16);
  switch (name) {
    case 'sun':
      ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72);
        ctx.lineTo(Math.cos(a) * r * 1.0, Math.sin(a) * r * 1.0);
        ctx.stroke();
      }
      break;
    case 'snowflake':
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
          ctx.lineTo(Math.cos(a + s * 0.7) * r * 0.86, Math.sin(a + s * 0.7) * r * 0.86);
          ctx.stroke();
        }
      }
      break;
    case 'droplet':
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.85, -r * 0.1, r * 0.7, r * 0.85, 0, r * 0.85);
      ctx.bezierCurveTo(-r * 0.7, r * 0.85, -r * 0.85, -r * 0.1, 0, -r);
      ctx.fill();
      break;
    case 'jar':
      ctx.lineWidth = Math.max(2, r * 0.15);
      roundRect(ctx, -r * 0.62, -r * 0.45, r * 1.24, r * 1.36, r * 0.22); ctx.stroke();
      roundRect(ctx, -r * 0.5, -r * 0.82, r * 1.0, r * 0.34, r * 0.1); ctx.fill();
      ctx.globalAlpha = 0.42;
      roundRect(ctx, -r * 0.48, r * 0.05, r * 0.96, r * 0.76, r * 0.16); ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'salt':
      ctx.beginPath();
      ctx.moveTo(-r * 0.5, -r * 0.75); ctx.lineTo(r * 0.5, -r * 0.75);
      ctx.lineTo(r * 0.66, r * 0.8); ctx.lineTo(-r * 0.66, r * 0.8);
      ctx.closePath(); ctx.stroke();
      for (const [dx, dy] of [[-0.22, -0.2], [0.18, -0.05], [-0.05, 0.3], [0.3, 0.4], [-0.36, 0.5]]) {
        ctx.fillRect(dx * r - r * 0.07, dy * r - r * 0.07, r * 0.14, r * 0.14);
      }
      break;
    case 'vacuum':
      roundRect(ctx, -r * 0.8, -r * 0.6, r * 1.6, r * 1.2, r * 0.2); ctx.stroke();
      ctx.globalAlpha = 0.4;
      roundRect(ctx, -r * 0.42, -r * 0.3, r * 0.84, r * 0.6, r * 0.16); ctx.fill();
      ctx.globalAlpha = 1;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * r * 0.98, 0); ctx.lineTo(s * r * 0.6, 0);
        ctx.moveTo(s * r * 0.72, -r * 0.16); ctx.lineTo(s * r * 0.6, 0); ctx.lineTo(s * r * 0.72, r * 0.16);
        ctx.stroke();
      }
      break;
    case 'thermometer':
      ctx.beginPath(); ctx.arc(0, r * 0.6, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.2);
      ctx.beginPath(); ctx.moveTo(0, r * 0.4); ctx.lineTo(0, -r * 0.8); ctx.stroke();
      ctx.lineWidth = Math.max(1.5, r * 0.1);
      for (let i = 0; i < 3; i++) {
        const y = -r * 0.6 + i * r * 0.32;
        ctx.beginPath(); ctx.moveTo(r * 0.16, y); ctx.lineTo(r * 0.44, y); ctx.stroke();
      }
      break;
    case 'smoke':
      ctx.lineWidth = Math.max(2, r * 0.18);
      for (let i = 0; i < 3; i++) {
        const x = -r * 0.5 + i * r * 0.5;
        ctx.beginPath();
        ctx.moveTo(x, r * 0.9);
        ctx.bezierCurveTo(x + r * 0.42, r * 0.34, x - r * 0.42, -r * 0.28, x + r * 0.16, -r * 0.92);
        ctx.stroke();
      }
      break;
    case 'can':
      ctx.beginPath(); ctx.ellipse(0, -r * 0.62, r * 0.62, r * 0.22, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.62, -r * 0.62); ctx.lineTo(-r * 0.62, r * 0.62);
      ctx.moveTo(r * 0.62, -r * 0.62); ctx.lineTo(r * 0.62, r * 0.62);
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, r * 0.62, r * 0.62, r * 0.22, 0, 0, Math.PI); ctx.stroke();
      ctx.globalAlpha = 0.32;
      ctx.fillRect(-r * 0.62, -r * 0.16, r * 1.24, r * 0.44);
      ctx.globalAlpha = 1;
      break;
    case 'flame':
      // A teardrop reads as a water droplet — exactly the wrong idea on a
      // high-temperature method — so the flame gets a kinked, licking edge.
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.15, -r * 0.55, r * 0.62, -r * 0.42, r * 0.55, r * 0.1);
      ctx.bezierCurveTo(r * 0.5, r * 0.68, r * 0.05, r * 0.95, 0, r * 0.95);
      ctx.bezierCurveTo(-r * 0.05, r * 0.95, -r * 0.5, r * 0.68, -r * 0.55, r * 0.1);
      ctx.bezierCurveTo(-r * 0.66, -r * 0.3, -r * 0.28, -r * 0.34, 0, -r);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.28);
      ctx.bezierCurveTo(r * 0.3, r * 0.1, r * 0.22, r * 0.66, 0, r * 0.78);
      ctx.bezierCurveTo(-r * 0.22, r * 0.66, -r * 0.3, r * 0.1, 0, -r * 0.28);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.72);
      ctx.bezierCurveTo(-r * 0.6, -r * 0.8, r * 0.55, -r * 0.85, r * 0.8, -r * 0.5);
      ctx.bezierCurveTo(r * 0.6, r * 0.6, -r * 0.2, r * 0.9, -r * 0.75, r * 0.72);
      ctx.fill();
      break;
    case 'wave':
      ctx.lineWidth = Math.max(2, r * 0.19);
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.9, i * r * 0.42);
        ctx.bezierCurveTo(-r * 0.3, i * r * 0.42 - r * 0.34, r * 0.3, i * r * 0.42 + r * 0.34, r * 0.9, i * r * 0.42);
        ctx.stroke();
      }
      break;
    case 'clock':
      ctx.lineWidth = Math.max(2, r * 0.15);
      ctx.beginPath(); ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.5);
      ctx.moveTo(0, 0); ctx.lineTo(r * 0.38, r * 0.12);
      ctx.stroke();
      break;
    case 'eye':
      ctx.lineWidth = Math.max(2, r * 0.15);
      ctx.beginPath();
      ctx.moveTo(-r * 0.92, 0);
      ctx.quadraticCurveTo(0, -r * 0.78, r * 0.92, 0);
      ctx.quadraticCurveTo(0, r * 0.78, -r * 0.92, 0);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.fill();
      break;
    case 'nose':
      ctx.lineWidth = Math.max(2, r * 0.15);
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.quadraticCurveTo(-r * 0.12, -r * 0.1, -r * 0.5, r * 0.36);
      ctx.quadraticCurveTo(-r * 0.24, r * 0.6, 0, r * 0.44);
      ctx.quadraticCurveTo(r * 0.24, r * 0.6, r * 0.5, r * 0.36);
      ctx.stroke();
      break;
    case 'tongue':
      ctx.lineWidth = Math.max(2, r * 0.15);
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.3);
      ctx.quadraticCurveTo(0, -r * 0.75, r * 0.8, -r * 0.3);
      ctx.quadraticCurveTo(0, r * 0.2, -r * 0.8, -r * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.34, -r * 0.14);
      ctx.quadraticCurveTo(0, r * 0.95, r * 0.34, -r * 0.14);
      ctx.fill();
      break;
    case 'hand':
      ctx.lineWidth = Math.max(2, r * 0.15);
      roundRect(ctx, -r * 0.42, -r * 0.2, r * 0.84, r * 1.0, r * 0.24); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.28 + i * r * 0.28, -r * 0.2);
        ctx.lineTo(-r * 0.28 + i * r * 0.28, -r * 0.86);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-r * 0.42, r * 0.16); ctx.lineTo(-r * 0.86, -r * 0.16);
      ctx.stroke();
      break;
    case 'warning':
      ctx.beginPath();
      ctx.moveTo(0, -r); ctx.lineTo(r * 0.95, r * 0.72); ctx.lineTo(-r * 0.95, r * 0.72);
      ctx.closePath();
      ctx.lineWidth = Math.max(2, r * 0.16);
      ctx.stroke();
      ctx.fillRect(-r * 0.09, -r * 0.42, r * 0.18, r * 0.72);
      ctx.beginPath(); ctx.arc(0, r * 0.5, r * 0.11, 0, Math.PI * 2); ctx.fill();
      break;
    case 'microbe':
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2, r * 0.13);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.58, Math.sin(a) * r * 0.58);
        ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
        ctx.stroke();
      }
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Icon to use for a method: its own where the curriculum names one. */
export function iconForMethod(mv) {
  if (mv.icon) return mv.icon;
  switch (mv.mechanism) {
    case 'high_temperature': return 'flame';
    case 'seals_surface': return 'leaf';
    case 'low_temperature': return 'snowflake';
    case 'removes_water': return 'droplet';
    case 'removes_air': return 'vacuum';
    case 'changes_environment': return 'jar';
    case 'heat_then_cool': return 'thermometer';
    default: return 'droplet';
  }
}

/**
 * Stand-in illustration for a food the notes name but the game has no model
 * for (§26 — rendang, jam, bananas, apples, oranges, tomatoes). Drawn rather
 * than omitted, because a missing asset is not a reason to drop curriculum.
 * Anything unrecognised still gets a plate, so a new reference food is never a
 * blank square.
 */
export function drawFoodGlyph(ctx, id, size) {
  const s = size;
  ctx.clearRect(0, 0, s, s);
  ctx.save();
  ctx.translate(s / 2, s / 2);
  const u = s / 100;
  const disc = (r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, r * u, 0, Math.PI * 2); ctx.fill(); };
  const stalk = (col = '#6d8a3c') => {
    ctx.fillStyle = col;
    ctx.fillRect(-2.5 * u, -40 * u, 5 * u, 14 * u);
  };
  const leaf = (col = '#6fae4a') => {
    ctx.save();
    ctx.fillStyle = col;
    ctx.translate(12 * u, -34 * u);
    ctx.rotate(-0.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 15 * u, 6.5 * u, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  switch (id) {
    case 'apples':
      disc(33, '#d6483c');
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.beginPath(); ctx.ellipse(-12 * u, -12 * u, 8 * u, 12 * u, -0.5, 0, Math.PI * 2); ctx.fill();
      stalk('#7a5230'); leaf();
      break;
    case 'oranges':
      disc(33, '#ef8a1f');
      ctx.strokeStyle = 'rgba(140,70,0,0.35)';
      ctx.lineWidth = 2 * u;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 31 * u, Math.sin(a) * 31 * u);
        ctx.stroke();
      }
      stalk('#5f7a2a'); leaf('#4f8a35');
      break;
    case 'tomatoes':
      disc(33, '#e04434');
      ctx.fillStyle = '#4f8a35';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.translate(Math.cos(a) * 12 * u, -26 * u + Math.sin(a) * 4 * u);
        ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, 0, 11 * u, 4.5 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      break;
    case 'bananas':
      for (const [dx, dy, rot, col] of [[-6, 4, 0.1, '#f0c22b'], [4, -2, -0.05, '#ffd84d']]) {
        ctx.save();
        ctx.translate(dx * u, dy * u);
        ctx.rotate(rot);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(-30 * u, -12 * u);
        ctx.quadraticCurveTo(0, 30 * u, 30 * u, -12 * u);
        ctx.quadraticCurveTo(2 * u, 16 * u, -30 * u, -12 * u);
        ctx.fill();
        ctx.restore();
      }
      break;
    case 'jam': {
      ctx.fillStyle = '#b8342f';
      roundRect(ctx, -24 * u, -14 * u, 48 * u, 44 * u, 8 * u); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(-18 * u, -8 * u, 8 * u, 32 * u);
      ctx.fillStyle = '#d9a441';
      roundRect(ctx, -27 * u, -28 * u, 54 * u, 16 * u, 5 * u); ctx.fill();
      ctx.fillStyle = '#f7efdd';
      roundRect(ctx, -18 * u, 2 * u, 36 * u, 16 * u, 3 * u); ctx.fill();
      break;
    }
    case 'rendang': {
      ctx.fillStyle = '#8a4a22';
      ctx.beginPath(); ctx.ellipse(0, -2 * u, 30 * u, 12 * u, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b3416';
      for (const [dx, dy] of [[-12, -6], [4, -9], [14, -2], [-3, 1]]) {
        ctx.beginPath(); ctx.arc(dx * u, dy * u, 7 * u, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#cfd8de';
      ctx.beginPath();
      ctx.moveTo(-34 * u, -4 * u);
      ctx.quadraticCurveTo(0, 34 * u, 34 * u, -4 * u);
      ctx.quadraticCurveTo(0, 10 * u, -34 * u, -4 * u);
      ctx.fill();
      break;
    }
    default:
      disc(31, '#c9d4dc');
      drawIcon(ctx, 'leaf', 0, 0, 18 * u, '#7d8b96');
  }
  ctx.restore();
}

// ------------------------------------------------------------------ furniture
function runningHead(ctx, spread, side, folio) {
  label(ctx, spread.label || '', M, M - 8, { size: 18 });
  setFont(ctx, 700, 20);
  ctx.fillStyle = INK_FAINT;
  ctx.textAlign = 'right';
  ctx.fillText(String(folio).padStart(2, '0'), PW - M, M - 8);
  ctx.textAlign = 'left';
  rule(ctx, M, M + 12, COL, RULE_SOFT, 2);
}

function footer(ctx, spread) {
  ornament(ctx, PW / 2, PH - M + 12);
  if (spread.kind === 'method' && spread.method.sourceRef) {
    setFont(ctx, 700, 17);
    ctx.fillStyle = INK_FAINT;
    ctx.textAlign = 'left';
    ctx.fillText(spread.method.sourceRef, M, PH - M + 18);
  }
}

// ------------------------------------------------------------------- diagrams
/**
 * Method diagrams. Each one is drawn from that method's own curriculum data —
 * §30 asks explicitly that Cooling not be a recoloured Freezing and that
 * Pasteurising show both of its phases, so the switch is by method id.
 */
function drawDiagram(ctx, mv, box) {
  const { x, y, w, h } = box;
  const c = hexOf(mv.colour);
  const acc = hexOf(mv.accent);
  ctx.save();
  ctx.translate(x, y);

  // paper-tinted plate the diagram sits on
  ctx.fillStyle = rgba(c, 0.07);
  roundRect(ctx, 0, 0, w, h, 26);
  ctx.fill();
  ctx.strokeStyle = rgba(c, 0.24);
  ctx.lineWidth = 2;
  ctx.stroke();

  // The drawings below are authored around a 430 x 330 stage; scale them so a
  // diagram always fills its plate rather than floating in the middle of it.
  const cx = w / 2, cy = h / 2;
  const k = Math.min(w / 430, h / 330);
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.translate(-cx, -cy);
  const wood = '#b07a3c', woodD = '#8a5c2a';
  const arrow = (x1, y1, x2, y2, col, dash = true) => {
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    if (dash) ctx.setLineDash([10, 9]);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.setLineDash([]);
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - Math.cos(a - 0.42) * 17, y2 - Math.sin(a - 0.42) * 17);
    ctx.lineTo(x2 - Math.cos(a + 0.42) * 17, y2 - Math.sin(a + 0.42) * 17);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  const fishAt = (fx, fy, s, col) => {
    ctx.save(); ctx.translate(fx, fy); ctx.scale(s, s); ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, 0, 46, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-42, 0); ctx.lineTo(-70, -20); ctx.lineTo(-70, 20); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  const bubbles = (bx, by, bw, bh, col, n = 9) => {
    ctx.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const r = 5 + (i % 3) * 4;
      ctx.beginPath();
      ctx.arc(bx + ((i * 97) % bw), by + ((i * 53) % bh), r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const tempPlate = (tx, ty, text, col) => {
    setFont(ctx, 800, 30, SANS);
    const tw = ctx.measureText(text).width + 34;
    ctx.fillStyle = col;
    roundRect(ctx, tx - tw / 2, ty - 24, tw, 48, 24); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, tx, ty + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  };

  switch (mv.id) {
    case 'drying': {
      drawIcon(ctx, 'sun', w * 0.19, h * 0.24, 54, '#f0b429');
      // rack
      ctx.fillStyle = wood;
      ctx.fillRect(cx - 130, cy - 40, 16, 170);
      ctx.fillRect(cx + 118, cy - 40, 16, 170);
      ctx.fillRect(cx - 140, cy - 48, 284, 16);
      ctx.fillStyle = woodD;
      ctx.fillRect(cx - 130, cy + 108, 264, 12);
      for (const [i, dx] of [-70, 0, 70].entries()) {
        ctx.fillStyle = '#9aa5b1';
        ctx.fillRect(cx + dx - 2, cy - 32, 4, 28);
        fishAt(cx + dx + 14, cy + 14, 0.62 - i * 0.02, '#c08a44');
      }
      arrow(w * 0.28, h * 0.32, cx - 60, cy - 26, rgba('#e0a300', 0.85));
      arrow(w * 0.28, h * 0.4, cx - 20, cy + 8, rgba('#e0a300', 0.6));
      // airflow + moisture leaving
      ctx.save();
      ctx.strokeStyle = rgba('#4aa3c8', 0.75); ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const yy = cy + 34 + i * 26;
        ctx.beginPath();
        ctx.moveTo(w * 0.11, yy);
        ctx.bezierCurveTo(w * 0.17, yy - 14, w * 0.22, yy + 14, w * 0.28, yy);
        ctx.stroke();
      }
      ctx.restore();
      for (let i = 0; i < 5; i++) {
        drawIcon(ctx, 'droplet', cx + 40 + i * 22, cy + 60 - i * 24, 9 - i * 0.6, rgba('#3d8fb8', 0.8 - i * 0.12));
      }
      break;
    }
    case 'freezing':
    case 'cooling': {
      // cabinet
      ctx.fillStyle = rgba(c, 0.18);
      roundRect(ctx, cx - 150, cy - 130, 190, 268, 18); ctx.fill();
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = rgba(shade(c, 0.3), 0.55); ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx - 150, cy - 6); ctx.lineTo(cx + 40, cy - 6); ctx.stroke();
      ctx.fillStyle = rgba(c, 0.55);
      roundRect(ctx, cx + 18, cy - 96, 12, 60, 6); ctx.fill();
      drawIcon(ctx, 'snowflake', cx - 56, cy - 68, 40, rgba(c, 0.85));
      drawIcon(ctx, 'snowflake', cx - 100, cy + 66, 26, rgba(c, 0.55));
      drawIcon(ctx, 'snowflake', cx - 16, cy + 80, 20, rgba(c, 0.4));
      // thermometer + the method's own target, from curriculum data
      drawIcon(ctx, 'thermometer', cx + 108, cy - 30, 46, shade(c, 0.15));
      if (mv.targetC != null) tempPlate(cx + 108, cy + 74, `${mv.targetC}°C`, shade(c, 0.12));
      if (mv.range) {
        setFont(ctx, 700, 22, SANS);
        ctx.fillStyle = INK_SOFT; ctx.textAlign = 'center';
        ctx.fillText(mv.range, cx + 108, cy + 126);
        ctx.textAlign = 'left';
      }
      break;
    }
    case 'vacuum': {
      ctx.fillStyle = rgba(c, 0.16);
      roundRect(ctx, cx - 160, cy - 80, 320, 170, 22); ctx.fill();
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 4; ctx.stroke();
      // food inside, bag shrink-wrapped tight around it
      ctx.fillStyle = '#c0693f';
      roundRect(ctx, cx - 72, cy - 36, 148, 84, 20); ctx.fill();
      ctx.strokeStyle = rgba(c, 0.75); ctx.lineWidth = 3;
      roundRect(ctx, cx - 82, cy - 46, 168, 104, 24); ctx.stroke();
      arrow(cx - 130, cy + 4, cx - 210, cy + 4, rgba(c, 0.9));
      arrow(cx + 130, cy + 4, cx + 210, cy + 4, rgba(c, 0.9));
      setFont(ctx, 800, 22, SANS);
      ctx.fillStyle = shade(c, 0.2); ctx.textAlign = 'center';
      ctx.fillText('✓', cx, cy + 126);
      ctx.textAlign = 'left';
      ctx.strokeStyle = rgba(c, 0.5); ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
      ctx.beginPath(); ctx.moveTo(cx - 120, cy + 96); ctx.lineTo(cx + 120, cy + 96); ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case 'pickling': {
      // jar
      ctx.fillStyle = rgba('#8fd0e8', 0.35);
      roundRect(ctx, cx - 92, cy - 66, 184, 190, 26); ctx.fill();
      ctx.strokeStyle = shade(c, 0.35); ctx.lineWidth = 4;
      roundRect(ctx, cx - 92, cy - 66, 184, 190, 26); ctx.stroke();
      ctx.fillStyle = shade(c, 0.15);
      roundRect(ctx, cx - 100, cy - 100, 200, 38, 12); ctx.fill();
      // solution
      ctx.fillStyle = rgba(acc, 0.55);
      roundRect(ctx, cx - 80, cy - 16, 160, 128, 20); ctx.fill();
      // food floating in it
      ctx.fillStyle = '#e0762a';
      for (const [dx, dy] of [[-40, 30], [10, 12], [44, 52], [-14, 68]]) {
        ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 18, 0, Math.PI * 2); ctx.fill();
      }
      bubbles(cx - 70, cy + 6, 140, 96, rgba('#ffffff', 0.5), 7);
      arrow(cx, cy - 168, cx, cy - 112, rgba(c, 0.85), false);
      break;
    }
    case 'salting': {
      ctx.fillStyle = '#c0693f';
      ctx.beginPath(); ctx.ellipse(cx, cy + 40, 118, 52, 0, 0, Math.PI * 2); ctx.fill();
      // salt heap
      ctx.fillStyle = '#f2f5f8';
      ctx.beginPath();
      ctx.moveTo(cx - 130, cy + 6);
      ctx.quadraticCurveTo(cx, cy - 96, cx + 130, cy + 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dbe3ea';
      for (let i = 0; i < 16; i++) {
        const px = cx - 110 + (i * 71) % 220, py = cy - 40 + (i * 37) % 44;
        ctx.fillRect(px, py, 7, 7);
      }
      for (let i = 0; i < 6; i++) {
        drawIcon(ctx, 'droplet', cx + 96 + (i % 3) * 26, cy + 62 - Math.floor(i / 3) * 34, 10, rgba('#3d8fb8', 0.75));
      }
      arrow(cx + 108, cy + 44, cx + 188, cy - 10, rgba('#3d8fb8', 0.85));
      break;
    }
    case 'pasteurising': {
      // Each temperature belongs to a specific hold time; they are two valid
      // programmes, not the endpoints of a temperature range. Both routes then
      // converge on the same immediate 4°C cooling step.
      const lx = cx - 126, rx = cx + 132;
      ctx.fillStyle = rgba('#e2622b', 0.14);
      roundRect(ctx, lx - 106, cy - 122, 212, 244, 22); ctx.fill();
      ctx.strokeStyle = rgba('#e2622b', 0.5); ctx.lineWidth = 3; ctx.stroke();
      drawIcon(ctx, 'flame', lx, cy - 82, 32, '#e2622b');
      for (const [i, programme] of mv.programmes.slice(0, 2).entries()) {
        const py = cy - 27 + i * 66;
        ctx.fillStyle = i === 0 ? rgba('#f39a31', 0.2) : rgba('#e2622b', 0.2);
        roundRect(ctx, lx - 91, py - 25, 182, 50, 18); ctx.fill();
        const text = programme.label || `${programme.holdC}°C`;
        let size = 19;
        setFont(ctx, 800, size, SANS);
        while (ctx.measureText(text).width > 160 && size > 13) {
          size--;
          setFont(ctx, 800, size, SANS);
        }
        ctx.fillStyle = i === 0 ? '#b45b16' : '#a74320';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, lx, py + 1);
      }

      ctx.fillStyle = rgba('#3d8fb8', 0.14);
      roundRect(ctx, rx - 82, cy - 104, 164, 208, 20); ctx.fill();
      ctx.strokeStyle = rgba('#3d8fb8', 0.5); ctx.lineWidth = 3; ctx.stroke();
      drawIcon(ctx, 'snowflake', rx, cy - 48, 44, '#3d8fb8');
      if (mv.chill) tempPlate(rx, cy + 54, `${mv.chill.targetC}°C`, '#2f86ad');

      arrow(lx + 112, cy, rx - 88, cy, INK_SOFT, false);
      drawIcon(ctx, 'clock', cx + 3, cy + 50, 20, INK_FAINT);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      break;
    }
    case 'smoking': {
      ctx.fillStyle = rgba(c, 0.2);
      roundRect(ctx, cx - 140, cy - 60, 280, 190, 16); ctx.fill();
      ctx.strokeStyle = shade(c, 0.3); ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = woodD;
      ctx.beginPath();
      ctx.moveTo(cx - 158, cy - 60); ctx.lineTo(cx, cy - 124); ctx.lineTo(cx + 158, cy - 60);
      ctx.closePath(); ctx.fill();
      for (const dx of [-62, 0, 62]) fishAt(cx + dx + 16, cy + 12, 0.5, '#8d6144');
      drawIcon(ctx, 'flame', cx, cy + 96, 30, '#e2622b');
      ctx.save();
      ctx.globalAlpha = 0.55;
      drawIcon(ctx, 'smoke', cx, cy - 190, 56, '#7d7d86');
      ctx.restore();
      drawIcon(ctx, 'clock', w - 66, h - 62, 26, INK_FAINT);
      break;
    }
    case 'canning': {
      const lx = cx - 112, rx = cx + 112;
      drawIcon(ctx, 'flame', lx, cy - 24, 52, '#e2622b');
      setFont(ctx, 800, 22, SANS);
      ctx.fillStyle = rgba('#e2622b', 0.14);
      roundRect(ctx, lx - 84, cy - 100, 168, 168, 20); ctx.fill();
      ctx.strokeStyle = rgba('#e2622b', 0.5); ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = rgba(c, 0.16);
      roundRect(ctx, rx - 84, cy - 100, 168, 168, 20); ctx.fill();
      ctx.strokeStyle = shade(c, 0.35); ctx.lineWidth = 3; ctx.stroke();
      drawIcon(ctx, 'can', rx, cy - 24, 56, shade(c, 0.42));
      arrow(lx + 90, cy - 16, rx - 90, cy - 16, INK_SOFT, false);
      ctx.fillStyle = INK_SOFT;
      break;
    }
    case 'boiling': {
      ctx.fillStyle = rgba(c, 0.22);
      roundRect(ctx, cx - 130, cy - 46, 260, 140, 18); ctx.fill();
      ctx.strokeStyle = shade(c, 0.35); ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = rgba('#c8791f', 0.55);
      roundRect(ctx, cx - 112, cy - 12, 224, 92, 14); ctx.fill();
      bubbles(cx - 96, cy - 4, 192, 70, rgba('#ffffff', 0.65), 11);
      for (const dx of [-52, 0, 52]) drawIcon(ctx, 'flame', cx + dx, cy + 132, 30, '#e2622b');
      drawIcon(ctx, 'smoke', cx, cy - 152, 44, rgba('#9aa5b1', 0.7));
      break;
    }
    case 'waxing': {
      ctx.fillStyle = '#d6483c';
      ctx.beginPath(); ctx.arc(cx, cy + 16, 96, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6fae4a';
      ctx.beginPath(); ctx.ellipse(cx + 34, cy - 78, 40, 17, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a5230';
      ctx.fillRect(cx - 5, cy - 108, 10, 34);
      // wax coat
      ctx.strokeStyle = rgba(c, 0.95); ctx.lineWidth = 9;
      ctx.beginPath(); ctx.arc(cx, cy + 16, 106, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(cx, cy + 16, 106, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        drawIcon(ctx, 'droplet', cx - 150 + i * 14, cy - 96 + i * 20, 12, rgba(c, 0.85));
      }
      // microbes bouncing off the sealed surface
      drawIcon(ctx, 'microbe', cx + 168, cy - 44, 22, rgba('#c94a3f', 0.7));
      arrow(cx + 132, cy - 24, cx + 176, cy - 62, rgba('#c94a3f', 0.7));
      break;
    }
    default:
      drawIcon(ctx, iconForMethod(mv), cx, cy, Math.min(w, h) * 0.3, rgba(c, 0.7));
  }
  ctx.restore();
}

// ---------------------------------------------------------------- page bodies
function pageDividerLeft(ctx, s) {
  const cy = PH * 0.38;
  ctx.textAlign = 'center';
  // The running head already carries the label; only print it here when it
  // says something the title does not.
  if (s.label !== s.title) label(ctx, s.label, PW / 2, cy - 150, { size: 20, align: 'center' });
  ctx.textAlign = 'left';
  display(ctx, s.title, M, cy, COL, { size: 72 });
  rule(ctx, PW / 2 - 70, cy + 40, 140, rgba(ORANGE, 0.9), 4);
  // The note carries the chapter's idea, not a caption, so it is allowed to run
  // to several lines and the ornament follows wherever it ends.
  let y = cy + 116;
  if (s.note) {
    y = paragraph(ctx, s.note, M + 24, y, COL - 48,
      { size: 27, colour: INK_SOFT, align: 'center', lh: 1.55 });
  }
  ornament(ctx, PW / 2, y + 96);
}

function pageDividerRight(ctx, s, headings) {
  let y = M + 92;
  label(ctx, headings.inThisChapter, M, y, { size: 20, colour: ORANGE });
  y += 22;
  rule(ctx, M, y, COL, RULE_SOFT, 2);
  y += 30;
  // Nine methods have to fit as comfortably as two, so the row pitch comes from
  // the space available rather than a fixed number.
  const room = PH - M - 60 - y;
  const step = Math.min(112, room / Math.max(1, s.methods.length));
  const r = Math.min(34, step * 0.32);
  y += step * 0.55;
  for (const mv of s.methods) {
    const col = hexOf(mv.colour);
    ctx.fillStyle = rgba(col, 0.14);
    ctx.beginPath(); ctx.arc(M + r, y - 8, r, 0, Math.PI * 2); ctx.fill();
    drawIcon(ctx, iconForMethod(mv), M + r, y - 8, r * 0.58, shade(col, 0.2));
    const tx = M + r * 2 + 22;
    setFont(ctx, 700, Math.min(34, step * 0.32), SERIF);
    ctx.fillStyle = INK;
    ctx.fillText(mv.name, tx, y - 4);
    setFont(ctx, 700, Math.min(21, step * 0.2), SANS);
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(String(mv.mechLabel).toUpperCase(), tx, y + Math.min(28, step * 0.26));
    rule(ctx, tx, y + step * 0.42, PW - M - tx, RULE_SOFT, 1.5);
    y += step;
  }
}

function pageMethodLeft(ctx, s, headings) {
  const mv = s.method;
  const col = hexOf(mv.colour);
  let y = M + 92;
  setFont(ctx, 800, 22, SANS);
  ctx.fillStyle = ORANGE;
  ctx.fillText(`${headings.chapter} ${String(s.methodOrdinal).padStart(2, '0')}`, M, y);
  y += 104;
  const d = display(ctx, mv.name, M, y, COL, { size: 104 });
  y += 40;
  rule(ctx, M, y, Math.min(COL, d.width), rgba(col, 0.85), 5);
  y += 60;
  badge(ctx, mv.mechLabel, M, y, col, { size: 23 });
  y += 128;
  // The core concept, and only that. `detail` and `exam` live in the panel, so
  // the same sentence is never printed on both halves of the screen (§11).
  y = paragraph(ctx, mv.explain, M, y, COL, { size: 33, lh: 1.52 });

  // A large mechanism mark closes the page — decoration built from curriculum
  // data (the method's own icon and colour), never from invented wording.
  const cy = Math.max(y + 150, PH - M - 190);
  ctx.save();
  ctx.globalAlpha = 0.16;
  drawIcon(ctx, iconForMethod(mv), PW / 2, cy, 78, col);
  ctx.restore();
}

function pageMethodRight(ctx, s, headings) {
  const mv = s.method;
  const col = hexOf(mv.colour);
  let y = M + 92;
  label(ctx, headings.howItWorks, M, y, { size: 21, colour: ORANGE });
  y += 22;
  rule(ctx, M, y, COL, RULE_SOFT, 2);
  y += 44;

  const diagH = 480;
  drawDiagram(ctx, mv, { x: M, y, w: COL, h: diagH });
  y += diagH + 76;

  // The mechanism in the curriculum's own long wording — the caption the
  // diagram is illustrating.
  y = paragraph(ctx, mv.mechLong, M, y, COL, { size: 29, lh: 1.5, maxLines: 4 });

  // Method-specific curriculum data, printed only where the method defines it:
  // freezing's range, pasteurising's two programmes, pickling's solutions.
  const facts = [];
  if (mv.range) facts.push(mv.range);
  // Pasteurising pairs are already printed inside its diagram, where their
  // relationship is clearer than repeating them as disconnected chips.
  if (mv.id !== 'pasteurising') {
    for (const p of mv.programmes) if (p.label) facts.push(p.label);
  }
  for (const sol of mv.solutions) if (sol.label) facts.push(sol.label);
  if (facts.length) {
    y += 74;
    let cx = M;
    setFont(ctx, 700, 24, SANS);
    for (const f of facts) {
      const w = ctx.measureText(f).width + 38;
      if (cx + w > PW - M) { cx = M; y += 62; }
      ctx.fillStyle = rgba(col, 0.13);
      roundRect(ctx, cx, y - 30, w, 52, 26); ctx.fill();
      ctx.strokeStyle = rgba(col, 0.42); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = shade(col, 0.3);
      ctx.fillText(f, cx + 19, y + 3);
      cx += w + 14;
    }
  }

  if (!mv.playable) {
    setFont(ctx, 700, 21, SANS);
    ctx.fillStyle = INK_FAINT;
    ctx.textAlign = 'right';
    ctx.fillText(String(headings.referenceOnly).toUpperCase(), PW - M, PH - M - 20);
    ctx.textAlign = 'left';
  }
}

function pageImportanceLeft(ctx, s) {
  let y = M + 118;
  display(ctx, s.title, M, y, COL, { size: 72 });
  y += 34;
  rule(ctx, M, y, 130, rgba(ORANGE, 0.9), 4);
  y += 82;
  s.items.forEach((item, i) => {
    ctx.fillStyle = rgba(ORANGE, 0.14);
    ctx.beginPath(); ctx.arc(M + 26, y - 10, 27, 0, Math.PI * 2); ctx.fill();
    setFont(ctx, 800, 26, SANS);
    ctx.fillStyle = ORANGE;
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), M + 26, y - 1);
    ctx.textAlign = 'left';
    paragraph(ctx, item, M + 84, y, COL - 84, { size: 27, lh: 1.42, maxLines: 2 });
    y += 100;
  });
}

function pageImportanceRight(ctx, s, headings) {
  let y = M + 96;
  label(ctx, headings.theEnd, M, y, { size: 21, colour: ORANGE });
  y += 22;
  rule(ctx, M, y, COL, RULE_SOFT, 2);
  y += 130;
  const icons = ['sun', 'snowflake', 'jar', 'vacuum', 'salt', 'thermometer', 'can', 'smoke', 'flame'];
  const cols = 3, gap = COL / cols;
  icons.forEach((ic, i) => {
    const x = M + gap * (i % cols) + gap / 2;
    const yy = y + Math.floor(i / cols) * 150;
    ctx.fillStyle = rgba('#16294d', 0.05);
    ctx.beginPath(); ctx.arc(x, yy, 54, 0, Math.PI * 2); ctx.fill();
    drawIcon(ctx, ic, x, yy, 30, rgba('#16294d', 0.45));
  });
}

// ------------------------------------------------------------------ endpapers
function drawEndpaper(ctx, side) {
  ctx.fillStyle = '#e8d9b8';
  ctx.fillRect(0, 0, PW, PH);
  ctx.strokeStyle = 'rgba(140,110,60,0.16)';
  ctx.lineWidth = 2;
  for (let i = -PH; i < PW; i += 46) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + PH, PH);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(side === 'left' ? PW : 0, 0, side === 'left' ? 0 : PW, 0);
  g.addColorStop(0, 'rgba(90,60,20,0.26)');
  g.addColorStop(0.2, 'rgba(90,60,20,0.02)');
  g.addColorStop(1, 'rgba(90,60,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PW, PH);
}

/**
 * Paint one page face.
 *
 * @param {CanvasRenderingContext2D} ctx  a PW x PH context
 * @param {object} spread   from viewModel.buildFactBook()
 * @param {'left'|'right'} side
 * @param {number} folio    printed page number
 * @param {object} headings already-localised structural labels
 */
export function renderPage(ctx, spread, side, folio, headings) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, PAGE_W, PAGE_H);
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  if (!spread) { drawEndpaper(ctx, side); return; }
  if (spread.kind === 'endpaper') { drawEndpaper(ctx, side); return; }

  drawPaper(ctx, side === 'left' ? 'right' : 'left');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  runningHead(ctx, spread, side, folio);

  const L = side === 'left';
  switch (spread.kind) {
    case 'divider': L ? pageDividerLeft(ctx, spread) : pageDividerRight(ctx, spread, headings); break;
    case 'method': L ? pageMethodLeft(ctx, spread, headings) : pageMethodRight(ctx, spread, headings); break;
    case 'importance': L ? pageImportanceLeft(ctx, spread) : pageImportanceRight(ctx, spread, headings); break;
    default: break;
  }
  footer(ctx, spread);
}
