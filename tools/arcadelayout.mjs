/**
 * Touch-layout regression harness.
 *
 * Requires `npm run preview` on port 4173. It checks the crowded Stage 8 layout
 * at desktop, tablet and mobile-landscape sizes, then exercises real pointer
 * drags through Input rather than calling Game._handleDrop directly.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';

const URL = process.env.PP_URL || 'http://localhost:4173/';
const VIEWPORTS = [
  { name: 'desktop', width: 1600, height: 900 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'mobile-landscape', width: 844, height: 390 },
];
const SELECTED_VIEWPORTS = process.env.PP_LAYOUT_VIEWPORT
  ? VIEWPORTS.filter((viewport) => viewport.name === process.env.PP_LAYOUT_VIEWPORT)
  : VIEWPORTS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function encodePng(width, height, pixels) {
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const source = (height - y - 1) * width * 4;
    const target = y * (width * 4 + 1);
    rows[target] = 0;
    pixels.subarray(source, source + width * 4).copy(rows, target + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

async function bootStage(page) {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!window.__pp, null, { timeout: 45000 });
  await page.click('[data-act="play"]');
  await page.click('[data-mode="arcade"]');
  await page.evaluate(() => {
    window.__pp.game.screens.close();
    window.__pp.game.startStage(8);
  });
  await page.click('.pp-brief [data-act="go"]');
  await page.waitForFunction(() => window.__pp.game.mode === 'playing', null, { timeout: 15000 });
  await page.evaluate(() => {
    const game = window.__pp.game;
    game.stage = { ...game.stage, spoilRateMul: 0, quizChance: 0 };
    game.foods.forEach((food) => { food.spoilRate = 0; });
    window.__pp.pump(1.5);
  });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const { game, input } = window.__pp;
    const canvas = document.getElementById('scene').getBoundingClientRect();
    const zones = input.getDropZones();
    const pairs = [];
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const distance = Math.hypot(zones[i].x - zones[j].x, zones[i].y - zones[j].y);
        pairs.push({
          i, j,
          a: zones[i].station.stationId,
          b: zones[j].station.stationId,
          distance,
          radiusSum: zones[i].radius + zones[j].radius,
        });
      }
    }
    pairs.sort((a, b) => a.distance - b.distance);
    return {
      layout: game._layoutMode,
      activeStations: [...game.stations.values()].filter((station) => station.enabled).length,
      canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height },
      zones: zones.map((zone) => ({
        id: zone.station.stationId,
        x: zone.x,
        y: zone.y,
        radius: zone.radius,
      })),
      pairs,
      visible: zones.every((zone) => (
        zone.x - zone.radius >= canvas.left
        && zone.x + zone.radius <= canvas.right
        && zone.y - zone.radius >= canvas.top
        && zone.y + zone.radius <= canvas.bottom
      )),
    };
  });
}

async function prepareProbeFood(page) {
  return page.evaluate(() => {
    const { game, input, stage3d } = window.__pp;
    for (const station of game.stations.values()) station.release();
    const T = window.__ppTHREE;
    if (!window.__arcadeProbe.food) {
      const group = new T.Group();
      group.position.set(0, 2.0, 1.1);
      group.add(new T.Object3D());
      stage3d.scene.add(group);
      window.__arcadeProbe.food = { state: 'idle', group, model: group.children[0] };
    }
    window.__arcadeProbe.food.state = 'idle';
    input.setEnabled(true);
    return true;
  });
}

async function screenPoint(page, objectKind, stationId) {
  return page.evaluate(({ kind, id }) => {
    const { game, stage3d } = window.__pp;
    const canvas = document.getElementById('scene').getBoundingClientRect();
    const value = kind === 'food'
      ? window.__arcadeProbe.food?.group.position
      : game.stations.get(id)?.root.position.clone().setY(game.stations.get(id).root.position.y + 1.0);
    if (!value) return null;
    const projected = value.clone().project(stage3d.camera);
    return {
      x: canvas.left + (projected.x * 0.5 + 0.5) * canvas.width,
      y: canvas.top + (-projected.y * 0.5 + 0.5) * canvas.height,
    };
  }, { kind: objectKind, id: stationId });
}

async function verifyResizeKeepsIdentity(page, viewport) {
  if (viewport.name !== 'tablet-landscape') return;
  const before = await page.evaluate(() => window.__pp.game._activeStationOrder.slice());
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(() => window.__pp.pump(0.5));
  const wide = await page.evaluate(() => ({
    order: window.__pp.game._activeStationOrder.slice(),
    layout: window.__pp.game._layoutMode,
  }));
  assert.deepEqual(wide.order, before, `${viewport.name}: resize reshuffled station identities`);
  assert.equal(wide.layout, 'grid-wide', `${viewport.name}: wide resize did not apply the wide layout`);

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.waitForTimeout(100);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.evaluate(() => window.__pp.pump(0.5));
  const narrow = await page.evaluate(() => ({
    order: window.__pp.game._activeStationOrder.slice(),
    layout: window.__pp.game._layoutMode,
  }));
  assert.deepEqual(narrow.order, before, `${viewport.name}: return resize reshuffled station identities`);
  assert.equal(narrow.layout, 'grid-narrow', `${viewport.name}: return resize did not restore the narrow layout`);
}

async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  await sleep(40);
}

async function runViewport(browser, viewport) {
  const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await bootStage(page);
  const metrics = await collectMetrics(page);
  assert.equal(metrics.activeStations, 8, `${viewport.name}: Stage 8 should expose eight stations`);
  assert.equal(metrics.zones.length, 8, `${viewport.name}: expected eight drop zones`);
  assert.ok(['grid-wide', 'grid-narrow'].includes(metrics.layout), `${viewport.name}: ${metrics.layout}`);
  assert.equal(metrics.visible, true, `${viewport.name}: every drop zone must stay on-screen`);
  assert.ok(Math.min(...metrics.zones.map((zone) => zone.radius)) >= 44, `${viewport.name}: touch zone below 44px`);
  assert.ok(metrics.pairs.every((pair) => pair.distance >= pair.radiusSum), `${viewport.name}: overlapping drop zones`);
  await verifyResizeKeepsIdentity(page, viewport);
  if (process.env.PP_LAYOUT_VISUAL_ONLY) await page.evaluate(() => window.__pp.pump(2));
  if (process.env.PP_LAYOUT_SHOT) {
    const rendered = await page.evaluate(() => {
      const { stage3d } = window.__pp;
      stage3d.render(0);
      const canvas = stage3d.renderer.domElement;
      const gl = stage3d.renderer.getContext();
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let binary = '';
      for (let i = 0; i < pixels.length; i += 0x8000) {
        binary += String.fromCharCode(...pixels.subarray(i, Math.min(i + 0x8000, pixels.length)));
      }
      return { width: canvas.width, height: canvas.height, data: btoa(binary) };
    });
    writeFileSync(process.env.PP_LAYOUT_SHOT, encodePng(
      rendered.width,
      rendered.height,
      Buffer.from(rendered.data, 'base64'),
    ));
  }
  if (process.env.PP_LAYOUT_VISUAL_ONLY) {
    console.log(`PASS visual ${viewport.name}: ${metrics.layout}`);
    await page.close();
    return;
  }

  await page.evaluate(() => {
    const input = window.__pp.input;
    const game = window.__pp.game;
    window.__arcadeProbe = { drops: [], returns: 0, wrongDrops: game.wrongDrops || 0, food: null };
    input._pickFood = () => window.__arcadeProbe.food;
    input.opts.onPick = () => {};
    input.opts.onDrop = (food, station) => {
      window.__arcadeProbe.drops.push(station.stationId);
      food.state = 'idle';
      station.release();
    };
    input.opts.onReturn = (food) => {
      window.__arcadeProbe.returns++;
      food.state = 'idle';
    };
  });

  const stationIds = metrics.zones.map((zone) => zone.id);
  for (const stationId of stationIds) {
    assert.ok(await prepareProbeFood(page), `${viewport.name}: no test food for ${stationId}`);
    const from = await screenPoint(page, 'food', stationId);
    const to = await screenPoint(page, 'station', stationId);
    assert.ok(from && to, `${viewport.name}: missing drag points for ${stationId}`);
    await drag(page, from, to);
    const selected = await page.evaluate(() => window.__arcadeProbe.drops.at(-1));
    assert.equal(selected, stationId, `${viewport.name}: drag selected ${selected || 'nothing'} instead of ${stationId}`);
  }

  const pair = metrics.pairs[0];
  assert.ok(await prepareProbeFood(page), `${viewport.name}: no midpoint test food`);
  const from = await screenPoint(page, 'food', pair.a);
  const midpoint = {
    x: (metrics.zones[pair.i].x + metrics.zones[pair.j].x) / 2,
    y: (metrics.zones[pair.i].y + metrics.zones[pair.j].y) / 2,
  };
  const before = await page.evaluate(() => ({
    drops: window.__arcadeProbe.drops.length,
    returns: window.__arcadeProbe.returns,
    wrongDrops: window.__pp.game.wrongDrops || 0,
  }));
  await drag(page, from, midpoint);
  const after = await page.evaluate(() => ({
    drops: window.__arcadeProbe.drops.length,
    returns: window.__arcadeProbe.returns,
    wrongDrops: window.__pp.game.wrongDrops || 0,
  }));
  assert.equal(after.drops, before.drops, `${viewport.name}: midpoint selected a station`);
  assert.equal(after.returns, before.returns + 1, `${viewport.name}: midpoint did not return the food`);
  assert.equal(after.wrongDrops, before.wrongDrops, `${viewport.name}: midpoint counted as a wrong station`);
  assert.equal(errors.length, 0, `${viewport.name}: browser errors: ${errors.join(' | ')}`);

  console.log(`PASS ${viewport.name}: ${metrics.layout}, min zone ${Math.min(...metrics.zones.map((zone) => zone.radius)).toFixed(1)}px, min gap ${metrics.pairs[0].distance.toFixed(1)}px`);
  await page.close();
}

const browser = await chromium.launch({
  executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  assert.ok(SELECTED_VIEWPORTS.length, `Unknown viewport: ${process.env.PP_LAYOUT_VIEWPORT || ''}`);
  for (const viewport of SELECTED_VIEWPORTS) await runViewport(browser, viewport);
  console.log('Arcade layout regression passed.');
} finally {
  await browser.close();
}
