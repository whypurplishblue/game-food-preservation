/**
 * Behaviour harness for the 3D Fact Book.
 *
 * Screenshots prove it looks right; this proves it BEHAVES right — the page
 * drag commits and reverses, the model viewer never reaches the book, the
 * keyboard and Escape work, and the narrow layout stacks instead of shrinking.
 *
 *   node tools/factbooktest.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const URL = process.env.PP_URL || 'http://localhost:4173/';
const OUT = process.env.PP_OUT || 'shots/factbook';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

/**
 * Inspect a selected Pickling food in the jar's own frame.  The tall cylinder
 * is the jar wall; the small inset from its bounds is an explicit, readable
 * interior envelope rather than a screenshot/pixel threshold.  A rectangular
 * envelope is intentionally used here: it is conservative for the food's
 * generated meshes and does not pretend the food is a perfect circle.
 */
const inspectPicklingPlacement = (page, expectedFoodId) => page.evaluate((expectedId) => {
  const T = window.__ppTHREE;
  const fb = window.__pp.game.factBook;
  const activity = fb._mobileActivity;
  const station = activity?.station;
  const food = station?.food;
  if (!T || !activity || !station || !food) {
    return { expectedId, foodId: food?.foodId || null, fitWithinInterior: false, verticalCentered: false };
  }

  const inFrame = (host, object) => {
    host.updateWorldMatrix(true, true);
    object.updateWorldMatrix(true, true);
    const world = new T.Box3().setFromObject(object);
    const local = new T.Box3();
    const point = new T.Vector3();
    for (const x of [world.min.x, world.max.x]) {
      for (const y of [world.min.y, world.max.y]) {
        for (const z of [world.min.z, world.max.z]) {
          local.expandByPoint(host.worldToLocal(point.set(x, y, z)));
        }
      }
    }
    return local;
  };

  const foodBox = inFrame(station.jar, food.model);
  const jarMeshes = [];
  station.jar.traverse((object) => {
    if (!object.isMesh) return;
    const box = inFrame(station.jar, object);
    const size = box.getSize(new T.Vector3());
    // The vessel wall is the only tall mesh in the jar.  This avoids coupling
    // the assertion to child indexes when animated liquid/lid pieces change.
    if (size.y > 0.75 && size.x < 1.2 && size.z < 1.2) jarMeshes.push({ box, size });
  });
  jarMeshes.sort((a, b) => b.size.y - a.size.y);
  const vessel = jarMeshes[0]?.box || inFrame(station.jar, station.jar);
  const vesselSize = vessel.getSize(new T.Vector3());
  const wallInset = 0.08;
  const floorInset = 0.08;
  const interior = {
    minX: vessel.min.x + wallInset,
    maxX: vessel.max.x - wallInset,
    minY: vessel.min.y + floorInset,
    maxY: vessel.max.y - floorInset,
    minZ: vessel.min.z + wallInset,
    maxZ: vessel.max.z - wallInset,
  };
  const foodCenter = foodBox.getCenter(new T.Vector3());
  const interiorCenterY = (interior.minY + interior.maxY) * 0.5;
  const epsilon = 0.025;
  const verticalTolerance = 0.18;
  const fitWithinInterior = foodBox.min.x >= interior.minX - epsilon &&
    foodBox.max.x <= interior.maxX + epsilon &&
    foodBox.min.y >= interior.minY - epsilon &&
    foodBox.max.y <= interior.maxY + epsilon &&
    foodBox.min.z >= interior.minZ - epsilon &&
    foodBox.max.z <= interior.maxZ + epsilon;
  const verticalDelta = Math.abs(foodCenter.y - interiorCenterY);
  const result = {
    expectedId,
    foodId: food.foodId,
    visible: food.group.visible,
    foodParent: food.group.parent?.name || '',
    foodBox: { min: foodBox.min.toArray(), max: foodBox.max.toArray(), size: foodBox.getSize(new T.Vector3()).toArray(), center: foodCenter.toArray() },
    vesselBox: { min: vessel.min.toArray(), max: vessel.max.toArray(), size: vesselSize.toArray() },
    interior,
    fitWithinInterior,
    verticalDelta,
    verticalTolerance,
    verticalCentered: verticalDelta <= verticalTolerance,
  };
  return result;
}, expectedFoodId);

const inspectFoodEnvelope = (page, hostKey, min, max) => page.evaluate(({ hostKey, min, max }) => {
  const T = window.__ppTHREE;
  const station = window.__pp.game.factBook._mobileActivity?.station;
  const food = station?.food;
  const host = station?.[hostKey];
  if (!T || !food || !host) return { fits: false, reason: 'missing food or host' };
  host.updateWorldMatrix(true, true);
  food.model.updateWorldMatrix(true, true);
  const world = new T.Box3().setFromObject(food.model);
  const local = new T.Box3();
  const point = new T.Vector3();
  for (const x of [world.min.x, world.max.x]) for (const y of [world.min.y, world.max.y]) {
    for (const z of [world.min.z, world.max.z]) {
      local.expandByPoint(host.worldToLocal(point.set(x, y, z)));
    }
  }
  const epsilon = 0.03;
  const fits = local.min.x >= min[0] - epsilon && local.max.x <= max[0] + epsilon &&
    local.min.y >= min[1] - epsilon && local.max.y <= max[1] + epsilon &&
    local.min.z >= min[2] - epsilon && local.max.z <= max[2] + epsilon;
  return { fits, min: local.min.toArray(), max: local.max.toArray(), envelope: { min, max } };
}, { hostKey, min, max });

/**
 * Verify that a placed food and its station still form one assembly as the
 * turntable rotates.  Both are measured in the viewer pivot's local frame, so
 * this is independent of camera projection and does not rely on pixels.
 */
const placedAssemblyRotationCheck = (page) => page.evaluate(() => {
  const T = window.__ppTHREE;
  const fb = window.__pp.game.factBook;
  const activity = fb._mobileActivity;
  const pivot = fb.methodViewer.pivot;
  const station = activity?.station;
  const food = station?.food;
  if (!T || !pivot || !station || !food) return null;
  const relative = () => station.root.worldToLocal(food.group.getWorldPosition(new T.Vector3())).toArray();
  pivot.updateWorldMatrix(true, true);
  const before = relative();
  const oldY = pivot.rotation.y;
  pivot.rotation.y += 0.31;
  pivot.updateWorldMatrix(true, true);
  const after = relative();
  pivot.rotation.y = oldY;
  pivot.updateWorldMatrix(true, true);
  return Math.hypot(...before.map((v, i) => v - after[i]));
});

/**
 * Vacuum is a useful cross-check for the shared placement contract: its film
 * target is derived from the actual food bounds.  Keep this to finite geometry
 * and envelope relationships, rather than asserting an exact animation frame.
 */
const inspectVacuumGeometry = (page) => page.evaluate(() => {
  const T = window.__ppTHREE;
  const fb = window.__pp.game.factBook;
  const activity = fb._mobileActivity;
  const station = activity?.station;
  const food = station?.food;
  if (!T || !station || !food) return { ok: false, reason: 'no docked food' };

  const inFrame = (host, object) => {
    host.updateWorldMatrix(true, true);
    object.updateWorldMatrix(true, true);
    const world = new T.Box3().setFromObject(object);
    const local = new T.Box3();
    const point = new T.Vector3();
    for (const x of [world.min.x, world.max.x]) {
      for (const y of [world.min.y, world.max.y]) {
        for (const z of [world.min.z, world.max.z]) {
          local.expandByPoint(host.worldToLocal(point.set(x, y, z)));
        }
      }
    }
    return local;
  };
  const pose = station._targetPose;
  const open = station._openPose;
  const foodBox = inFrame(station.body, food.model);
  const finite = (value) => Number.isFinite(value);
  const poseFinite = pose && ['cx', 'cz', 'halfX', 'halfZ', 'bottom', 'top'].every((key) => finite(pose[key]));
  const poseInsideOpen = poseFinite && pose.halfX <= open.halfX + 0.001 &&
    pose.halfZ <= open.halfZ + 0.001 && pose.bottom >= open.bottom - 0.001 &&
    pose.top <= Math.min(open.top, station._lidPumpClearance()) + 0.001;
  const envelopeEpsilon = 0.06;
  const foodWithinPose = poseFinite && foodBox.min.x >= pose.cx - pose.halfX - envelopeEpsilon &&
    foodBox.max.x <= pose.cx + pose.halfX + envelopeEpsilon &&
    foodBox.min.z >= pose.cz - pose.halfZ - envelopeEpsilon &&
    foodBox.max.z <= pose.cz + pose.halfZ + envelopeEpsilon &&
    foodBox.min.y >= pose.bottom - envelopeEpsilon &&
    foodBox.max.y <= pose.top + envelopeEpsilon;
  const surfaces = ['filmTop', 'filmBottom', 'filmFront', 'filmBack', 'filmLeft', 'filmRight'].map((key) => {
    const surface = station[key];
    const positions = surface?.geometry?.attributes?.position?.array;
    const box = surface ? new T.Box3().setFromObject(surface) : new T.Box3();
    return {
      key,
      visible: !!surface?.visible,
      nonEmpty: !box.isEmpty(),
      finite: !!positions && Array.from(positions).every(Number.isFinite),
    };
  });
  const surfacesHealthy = surfaces.length === 6 && surfaces.every((surface) =>
    surface.visible && surface.nonEmpty && surface.finite);
  return {
    ok: !!station.bag?.visible && poseFinite && poseInsideOpen && foodWithinPose && surfacesHealthy,
    foodId: food.foodId,
    filmProgress: station._filmProgress,
    fitK: station._fitK,
    targetFitK: station._targetFitK,
    pose,
    foodBox: { min: foodBox.min.toArray(), max: foodBox.max.toArray() },
    poseFinite,
    poseInsideOpen,
    foodWithinPose,
    surfaces,
  };
});

const browser = await chromium.launch({
  executablePath: process.env.PP_CHROME || undefined,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const errors = [];

async function session(viewport, fn, opts = {}) {
  const page = await browser.newPage({ viewport, ...opts });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.__pp, null, { timeout: 30000 });
  await fn(page);
  await page.close();
}

const openBook = async (page) => {
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  // The book is held shut for a beat and then opens itself; nothing to click.
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 20000 });
};
const state = (page) => page.evaluate(() => {
  const fb = window.__pp.game.factBook;
  return { index: fb.index, state: fb.state, turn: fb.tTurn.value, open: fb.book.openness };
});
const settle = (page) => page.waitForFunction(
  () => ['reading', 'food'].includes(window.__pp.game.factBook.state), null, { timeout: 20000 });

// ---------------------------------------------------------------- desktop
await session({ width: 1600, height: 900 }, async (page) => {
  console.log('\n[desktop 1600x900]');
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  // Pin the shut pose so the beat before the automatic open can be inspected
  // without racing it; the in-game session below proves the timer really fires.
  await page.evaluate(() => clearTimeout(window.__pp.game.factBook._openTimer));
  const shut = await state(page);
  check('the book arrives shut', shut.state === 'closed' && shut.open < 0.15,
    `state=${shut.state} openness=${shut.open.toFixed(2)}`);
  check('the shut book announces itself as the control',
    await page.evaluate(() => {
      const z = document.querySelector('.pp-fb__bookzone');
      return z.getAttribute('role') === 'button' && !!z.getAttribute('aria-label') && z.tabIndex >= 0;
    }));
  check('audio control is icon-only but accessible',
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.pp-quick [data-quick="mute"]')];
      return buttons.length > 0 && buttons.every((button) => {
        const label = button.querySelector('.pp-quick__label');
        const icon = button.querySelector('.pp-quick__icon');
        return !!icon?.textContent.trim() && !label?.textContent.trim() &&
          !!button.getAttribute('aria-label') && !!button.title;
      });
    }));
  // Opened from the keyboard, to prove the reader can still open it early.
  await page.focus('.pp-fb__bookzone');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 20000 });
  check('opens on the methods divider',
    await page.evaluate(() => {
      const fb = window.__pp.game.factBook;
      return fb.index === 0 && fb.model.spreads[0].kind === 'divider' && fb.model.spreads[0].group === 'playable';
    }));
  check('the book carries no title or spoilage spread',
    await page.evaluate(() => window.__pp.game.factBook.model.spreads
      .every((s) => !['contents', 'spoilage-a', 'spoilage-b'].includes(s.kind))));
  check('pagination starts with the first navigation page',
    await page.evaluate(() => {
      const count = document.querySelector('.pp-fb__count')?.textContent;
      const total = window.__pp.game.factBook.model.spreads.length;
      return count === `Page 1 of ${total}`;
    }));
  check('book is fully open', Math.abs((await state(page)).open - 1) < 0.001);
  check('desktop expand waits for an interactive method viewer',
    await page.evaluate(() => document.querySelector('.pp-fb__expand')?.hidden === true));

  // --- a committed drag turns the page and never springs back
  const zone = await (await page.$('.pp-fb__bookzone')).boundingBox();
  const y = zone.y + zone.height * 0.5;
  await page.mouse.move(zone.x + zone.width * 0.78, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(zone.x + zone.width * (0.78 - 0.05 * i), y);
    await sleep(16);
  }
  const mid = await state(page);
  check('dragging drives the turn directly', mid.turn > 0.3 && mid.state === 'drag', `turn=${mid.turn.toFixed(2)}`);
  await page.mouse.up();
  await settle(page);
  const after = await state(page);
  check('a committed page does not spring back', after.index === 1 && after.turn === 1, `index=${after.index}`);

  // --- an abandoned drag returns to the page it came from
  await page.mouse.move(zone.x + zone.width * 0.8, y);
  await page.mouse.down();
  await page.mouse.move(zone.x + zone.width * 0.72, y, { steps: 6 });
  await page.mouse.up();
  await settle(page);
  check('a short drag is abandoned', (await state(page)).index === 1);

  // --- keyboard
  await page.keyboard.press('ArrowRight');
  await settle(page);
  check('ArrowRight turns forward', (await state(page)).index === 2);
  await page.keyboard.press('ArrowLeft');
  await settle(page);
  check('ArrowLeft turns back', (await state(page)).index === 1);

  // --- the tab strip is generated from the curriculum
  const tabs = await page.$$eval('.pp-fb__tab', (n) => n.map((b) => b.textContent.trim()));
  const methods = await page.evaluate(() => window.__pp.content.METHODS && Object.keys(window.__pp.content.METHODS));
  check('one tab per curriculum method', tabs.length === methods.length, `${tabs.length} tabs / ${methods.length} methods`);

  await page.evaluate(() => window.__pp.game.factBook.goToMethod('drying'));
  await settle(page);
  await page.waitForFunction(() =>
    document.querySelector('.pp-fb__lead')?.classList.contains('is-exam'),
    null, { timeout: 5000 });
  const desktopMethodLayout = await page.evaluate(() => {
    const inner = document.querySelector('.pp-fb__panelinner');
    const lead = document.querySelector('.pp-fb__lead');
    return {
      examAtTop: lead?.classList.contains('is-exam') && !!lead.textContent.trim(),
      noDuplicateExamSection: !document.querySelector('.pp-fb__examsec'),
      noVerticalScroll: inner && inner.scrollHeight <= inner.clientHeight + 1,
      expandVisible: !!document.querySelector('.pp-fb__expand') &&
        !document.querySelector('.pp-fb__expand').hidden &&
        getComputedStyle(document.querySelector('.pp-fb__expand')).display !== 'none',
      expandIsIconOnly: document.querySelector('.pp-fb__expand')?.textContent.trim() === '⤢',
      expandLabel: document.querySelector('.pp-fb__expand')?.getAttribute('aria-label') === 'Explore in 3D' &&
        document.querySelector('.pp-fb__expand')?.title === 'Explore in 3D',
    };
  });
  check('exam note replaces the method information at the top', desktopMethodLayout.examAtTop);
  check('desktop method panel fits without vertical scrolling', desktopMethodLayout.noVerticalScroll,
    `${desktopMethodLayout.noVerticalScroll ? 'fits' : 'overflows'}`);
  check('the lower duplicate exam section is removed', desktopMethodLayout.noDuplicateExamSection);
  check('desktop method viewer exposes an icon-only expand control',
    desktopMethodLayout.expandVisible && desktopMethodLayout.expandIsIconOnly && desktopMethodLayout.expandLabel,
    JSON.stringify(desktopMethodLayout));
  const dryIdx = await state(page);

  // --- rotating the model must not reach the book
  const vp = await (await page.$('.pp-fb__viewport')).boundingBox();
  const before = await page.evaluate(() => window.__pp.game.factBook.methodViewer.az);
  await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
  await page.mouse.down();
  await page.mouse.move(vp.x + vp.width * 0.9, vp.y + vp.height * 0.4, { steps: 10 });
  await page.mouse.up();
  await sleep(400);
  const afterRot = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  const s2 = await state(page);
  check('dragging the model rotates it', Math.abs(afterRot - before) > 0.2);
  check('dragging the model does not turn the page', s2.index === dryIdx.index && s2.state === 'reading');

  // --- desktop expansion reuses the mobile full-screen model surface
  const poseBeforeExpand = await page.evaluate(() => {
    const v = window.__pp.game.factBook.methodViewer;
    return { az: v._targetAz, el: v._targetEl, zoom: v._targetZoom };
  });
  await page.click('.pp-fb__expand');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  const desktopFullscreen = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const overlay = document.querySelector('.pp-fb__mobilemodel');
    const viewport = document.querySelector('.pp-fb__mobileviewport')?.getBoundingClientRect();
    const back = document.querySelector('.pp-fb__mobileback');
    const animate = document.querySelector('.pp-fb__mobileanimate');
    const mute = document.querySelector('.pp-quick.is-overlay.is-factbook');
    const expand = document.querySelector('.pp-fb__expand');
    const v = fb.methodViewer;
    return {
      overlayVisible: !!overlay && !overlay.hidden && getComputedStyle(overlay).display !== 'none',
      bodyHidden: getComputedStyle(document.querySelector('.pp-fb__body')).visibility === 'hidden',
      fillsStage: !!viewport && viewport.width > window.innerWidth * 0.75 && viewport.height > window.innerHeight * 0.55,
      backVisible: !!back && !back.hidden && getComputedStyle(back).display !== 'none',
      animateVisible: !!animate && !animate.hidden && getComputedStyle(animate).display !== 'none',
      muteVisible: !!mute && getComputedStyle(mute).display !== 'none',
      expandHidden: !!expand && expand.hidden,
      foodCards: document.querySelectorAll('.pp-fb__mobilefood').length === fb._mv.foods.length,
      pose: { az: v._targetAz, el: v._targetEl, zoom: v._targetZoom },
    };
  });
  check('desktop expand opens the shared full-screen model surface',
    desktopFullscreen.overlayVisible && desktopFullscreen.bodyHidden && desktopFullscreen.fillsStage &&
      desktopFullscreen.backVisible && desktopFullscreen.animateVisible && desktopFullscreen.muteVisible &&
      desktopFullscreen.expandHidden && desktopFullscreen.foodCards,
    JSON.stringify(desktopFullscreen));
  check('desktop expansion preserves the current camera pose',
    Math.abs(desktopFullscreen.pose.az - poseBeforeExpand.az) < 0.001 &&
      Math.abs(desktopFullscreen.pose.el - poseBeforeExpand.el) < 0.001 &&
      Math.abs(desktopFullscreen.pose.zoom - poseBeforeExpand.zoom) < 0.001,
    JSON.stringify({ before: poseBeforeExpand, after: desktopFullscreen.pose }));
  await page.click('.pp-fb__mobilefood:nth-child(1)');
  await page.waitForFunction(() => !!window.__pp.game.factBook._mobileActivity?.flight, null, { timeout: 3000 });
  check('desktop full-screen food cards start the existing handoff',
    await page.evaluate(() => {
      const fb = window.__pp.game.factBook;
      return !!fb._mobileActivity?.flight && !fb._mobileActivity.station.food &&
        fb._mobileActivity.entries.every((entry) => !entry.food.group.visible);
    }));
  await page.waitForFunction(() => {
    const fb = window.__pp.game.factBook;
    return !!fb._mobileActivity?.station.food && !!fb._autoplay;
  }, null, { timeout: 10000 });
  check('desktop full-screen food placement starts station autoplay', await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    return !!fb._mobileActivity?.station.food && !!fb._autoplay;
  }));
  await page.click('.pp-fb__mobileback');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
  const afterDesktopBack = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    return {
      overlayHidden: document.querySelector('.pp-fb__mobilemodel')?.hidden === true,
      inlineVisible: getComputedStyle(document.querySelector('.pp-fb__viewport')).display !== 'none',
      expandVisible: document.querySelector('.pp-fb__expand')?.hidden === false,
      activityDisposed: !fb._mobileActivity,
      spinRestored: fb.methodViewer.spin > 0,
    };
  });
  check('Back to book restores the desktop inline viewer',
    afterDesktopBack.overlayHidden && afterDesktopBack.inlineVisible && afterDesktopBack.expandVisible &&
      afterDesktopBack.activityDisposed && afterDesktopBack.spinRestored,
    JSON.stringify(afterDesktopBack));
  await page.click('.pp-fb__expand');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
  check('Escape closes only the desktop full-screen viewer', await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    return fb.isOpen && !fb._mobileModelOpen && fb.state === 'reading' &&
      document.querySelector('.pp-fb__mobilemodel')?.hidden === true;
  }));

  // --- food inspection round trip
  await page.click('.pp-fb__cards .pp-fb__card:not(:disabled)');
  await sleep(500);
  check('inspecting a food enters the food state', (await state(page)).state === 'food');
  check('expand is hidden while inspecting a food',
    await page.evaluate(() => document.querySelector('.pp-fb__expand')?.hidden === true));
  await page.click('.pp-fb__backfood');
  await sleep(400);
  check('back to method leaves the book open',
    (await state(page)).state === 'reading' && (await page.evaluate(() => window.__pp.game.factBook.isOpen)));

  // --- a reference-only food is present but not inspectable
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('boiling'));
  await settle(page);
  const cards = await page.$$eval('.pp-fb__card', (n) => n.map((b) => ({ name: b.textContent.trim(), disabled: b.disabled })));
  check('reference-only foods are still taught', cards.length === 2 && cards.every((c) => c.disabled),
    cards.map((c) => c.name).join(', '));

  await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    fb.jumpTo(fb.model.spreads.length - 1);
  });
  await settle(page);
  check('pagination ends with the final navigation page',
    await page.evaluate(() => {
      const fb = window.__pp.game.factBook;
      const total = fb.model.spreads.length;
      return document.querySelector('.pp-fb__count')?.textContent === `Page ${total} of ${total}`;
    }));

  // --- Escape closes, physically, and hands the game back
  await page.keyboard.press('Escape');
  await sleep(120);
  check('closing animates rather than vanishing',
    await page.evaluate(() => window.__pp.game.factBook.isOpen && window.__pp.game.factBook.state === 'closing'));
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 8000 });
  check('the title screen comes back', await page.evaluate(() => !!document.querySelector('.pp-title')));
});

// -------------------------------------------------------- opened in-game
await session({ width: 1600, height: 900 }, async (page) => {
  console.log('\n[in game]');
  await page.click('[data-act="play"]');
  await page.click('[data-mode="learning"]');
  await page.click('[data-act="go"]');
  await page.waitForFunction(() => window.__pp.game.mode === 'playing', null, { timeout: 15000 });
  await page.click('.pp-hud .pp-icon-btn');           // the Fact Book button
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  // Nothing is clicked here: the book must open itself after its held beat.
  const t0 = Date.now();
  await settle(page);
  check('the shut book opens itself, unprompted', Date.now() - t0 < 8000, `${Date.now() - t0} ms`);
  check('the HUD is out of the way', await page.evaluate(() => window.__pp.hud.root.classList.contains('is-hidden')));

  // Closing part-way through a page turn must resolve, not strand the sheet.
  await page.evaluate(() => window.__pp.game.factBook.go(1));
  await sleep(120);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 10000 });
  check('closing mid-turn resolves safely',
    await page.evaluate(() => !window.__pp.game.factBook.book.turning));
  check('play resumes', await page.evaluate(() => window.__pp.game.mode === 'playing'));
  check('the HUD comes back', await page.evaluate(() => !window.__pp.hud.root.classList.contains('is-hidden')));
  check('audio control stays icon-only in the HUD',
    await page.evaluate(() => {
      const button = document.querySelector('.pp-quick.is-hud [data-quick="mute"]');
      return !!button && !!button.querySelector('.pp-quick__icon')?.textContent.trim() &&
        !button.querySelector('.pp-quick__label')?.textContent.trim() &&
        !!button.getAttribute('aria-label') && !!button.title;
    }));

  // Completing the final learning method schedules a quiz after the teaching
  // banner. The result screen must not win that delay and cover the quiz.
  await page.evaluate(async () => {
    const { game, content } = window.__pp;
    for (const food of game.foods) food.dispose();
    game.foods.length = 0;
    game.stageId = content.LEARNING_STAGES.length;
    game.stage = content.LEARNING_STAGES.at(-1);
    const methodId = game.stage.methods.at(-1);
    const foodId = content.METHODS[methodId].foods.find((id) => content.FOODS[id]);
    game._learningMethodsDone = new Set(game.stage.methods.slice(0, -1));
    game._learningQuizzed = new Set(game.stage.methods.slice(0, -1));
    await game._finishInteraction({
      foodId, state: 'processing', _wrongStationTried: false, _spawnedAt: game.elapsed,
      group: new window.__ppTHREE.Group(), markPreserved() {},
    }, { playSuccess: () => Promise.resolve(), release() {} }, methodId, 1);
  });
  check('final learning quiz is pending before results', await page.evaluate(() =>
    window.__pp.game.mode === 'teaching' && !window.__pp.game.screens.isOpen));
  await page.waitForFunction(() => window.__pp.game.mode === 'quiz' && window.__pp.game.quiz.isOpen,
    null, { timeout: 5000 });
  check('final learning quiz appears before results', await page.evaluate(() =>
    window.__pp.game.mode === 'quiz' && !window.__pp.game.screens.isOpen));
  await page.click('.pp-quiz__opt');
  await page.click('.pp-quiz__next');
  await page.waitForFunction(() => window.__pp.game.mode === 'result');
  check('learning results wait until the final quiz closes', await page.evaluate(() =>
    window.__pp.game.screens.isOpen && !window.__pp.game.quiz.isOpen));
  check('final learning results do not offer another level', await page.evaluate(() =>
    !document.querySelector('.pp-result [data-act="next"]')));
  await page.click('.pp-result [data-act="menu"]');
  await page.waitForFunction(() => !!document.querySelector('.pp-title'));
  await page.click('[data-act="play"]');
  await page.waitForFunction(() => !!document.querySelector('.pp-mode-select'));
  check('completed learning mode is not offered as resumable', await page.evaluate(() =>
    !document.querySelector('[data-act="continue"][data-mode="learning"]') &&
    !!document.querySelector('.pp-mode-card[data-mode="learning"]')));
});

// ------------------------------------------------------------ narrow layout
await session({ width: 820, height: 1180 }, async (page) => {
  console.log('\n[narrow 820x1180]');
  // The presented pose has to fit a tall, narrow screen too.
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  await page.evaluate(() => clearTimeout(window.__pp.game.factBook._openTimer));
  await sleep(400);
  await page.screenshot({ path: `${OUT}/20a-narrow-shut.png` });
  await page.evaluate(() => window.__pp.game.factBook.openBook());
  await settle(page);
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('pickling'));
  await settle(page);
  await sleep(400);
  const mobileBook = await page.evaluate(() => {
    const b = document.querySelector('.pp-fb__bookzone').getBoundingClientRect();
    const p = document.querySelector('.pp-fb__panel').getBoundingClientRect();
    const nav = document.querySelector('.pp-fb__nav');
    const tabs = document.querySelector('.pp-fb__tabs');
    const visible = (element) => {
      if (!element || getComputedStyle(element).display === 'none') return false;
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0;
    };
    return {
      panelHidden: getComputedStyle(document.querySelector('.pp-fb__panel')).display === 'none' && p.height === 0,
      bookUsesStage: b.height > window.innerHeight * 0.65,
      navigationHidden: [nav, tabs].every((element) =>
        element && getComputedStyle(element).display === 'none'),
      controlsVisible: [
        document.querySelector('.pp-fb__close'),
        document.querySelector('.pp-quick.is-overlay.is-factbook'),
      ].every(visible),
    };
  });
  check('mobile preview shows the book and utility controls', mobileBook.panelHidden && mobileBook.bookUsesStage && mobileBook.controlsVisible);
  check('mobile preview hides navigation but keeps controls', mobileBook.navigationHidden);
  await page.screenshot({ path: `${OUT}/20-narrow.png` });
});

// ------------------------------------------------------ landscape phone
await session({ width: 667, height: 375 }, async (page) => {
  console.log('\n[landscape phone 667x375]');
  await page.click('[data-act="fact"]');
  await page.waitForFunction(() => window.__pp.game.factBook?.isOpen, null, { timeout: 15000 });
  await page.evaluate(() => clearTimeout(window.__pp.game.factBook._openTimer));
  const closedPanel = await page.evaluate(() => {
    const panel = document.querySelector('.pp-fb__panel');
    const style = getComputedStyle(panel);
    return {
      opacity: Number(style.opacity),
      pointerEvents: style.pointerEvents,
      visible: style.display !== 'none' && panel.getBoundingClientRect().width > 0 &&
        Number(style.opacity) > 0.01,
    };
  });
  check('landscape mobile panel waits for the book to open',
    closedPanel.opacity < 0.1 && closedPanel.pointerEvents === 'none' && !closedPanel.visible,
    JSON.stringify(closedPanel));
  await page.evaluate(() => window.__pp.game.factBook.openBook());
  await settle(page);
  const mobileBook = await page.evaluate(() => {
    const book = document.querySelector('.pp-fb__bookzone').getBoundingClientRect();
    const panel = document.querySelector('.pp-fb__panel');
    const inner = document.querySelector('.pp-fb__panelinner');
    const art = document.querySelector('.pp-fb__mobileart');
    const explore = document.querySelector('.pp-fb__mobile-explore');
    const navigation = [
      document.querySelector('.pp-fb__nav'),
      document.querySelector('.pp-fb__tabs'),
    ];
    const visible = (element) => {
      if (!element || getComputedStyle(element).display === 'none') return false;
      const r = element.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0;
    };
    return {
      bookUsesStage: book.height > window.innerHeight * 0.45,
      panelVisible: getComputedStyle(panel).display !== 'none' && panel.getBoundingClientRect().width > 260,
      referenceCard: getComputedStyle(panel).borderRadius !== '0px' &&
        getComputedStyle(panel).backgroundColor !== 'rgba(0, 0, 0, 0)',
      panelScrollable: inner.scrollHeight > inner.clientHeight,
      overviewArtVisible: art.width > 0 && art.height > 0 && !art.closest('[hidden]'),
      navigationHidden: navigation.every((element) =>
        element && getComputedStyle(element).display === 'none'),
      controlsVisible: [
        document.querySelector('.pp-fb__close'),
        document.querySelector('.pp-quick.is-overlay.is-factbook'),
      ].every(visible),
    };
  });
  check('landscape phone preview shows the book and information panel',
    mobileBook.bookUsesStage && mobileBook.panelVisible && mobileBook.referenceCard &&
    mobileBook.navigationHidden && mobileBook.controlsVisible);
  check('landscape phone content card is vertically scrollable', mobileBook.panelScrollable);
  check('landscape phone overview includes its illustration', mobileBook.overviewArtVisible);
  check('landscape phone preview hides page arrows and dots', mobileBook.navigationHidden);
  await page.screenshot({ path: `${OUT}/20b-landscape-phone.png` });

  await page.evaluate(() => window.__pp.game.factBook.goToMethod('pickling'));
  await settle(page);
  const mobileMethod = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const panel = document.querySelector('.pp-fb__panel');
    const inner = document.querySelector('.pp-fb__panelinner');
    const art = document.querySelector('.pp-fb__mobileart');
    const artSection = document.querySelector('.pp-fb__mobileartsec');
    const explore = document.querySelector('.pp-fb__mobile-explore');
    const chips = [...document.querySelectorAll('.pp-fb__card.is-mobile-chip')];
    return {
      methodTitle: document.querySelector('.pp-fb__title')?.textContent === fb._mv?.name,
      methodArtVisible: !!art && art.width > 0 && art.height > 0 && !artSection.hidden,
      exploreVisible: !!explore && !explore.hidden && getComputedStyle(explore).display !== 'none' &&
        !!explore.textContent.trim(),
      exploreUnderBook: !!explore && explore.getBoundingClientRect().left < panel.getBoundingClientRect().left &&
        explore.getBoundingClientRect().top > document.querySelector('.pp-fb__bookzone').getBoundingClientRect().top,
      panelExploreHidden: document.querySelector('.pp-fb__mobilepanel-explore')?.hidden === true,
      desktopExpandHidden: document.querySelector('.pp-fb__expand')?.hidden === true,
      inlineViewerHidden: getComputedStyle(document.querySelector('.pp-fb__viewersec')).display === 'none',
      foodChips: chips.length === fb._mv.foods.length && chips.every((chip) =>
        chip.tagName === 'SPAN' && !chip.querySelector('.pp-fb__cardslot')),
      alsoWorksChips: document.querySelectorAll('.pp-fb__alsosec .pp-fb__chip').length === fb._mv.alsoWorks.length,
      scrollable: inner.scrollHeight > inner.clientHeight,
      cardBackground: getComputedStyle(panel).backgroundColor !== 'rgba(0, 0, 0, 0)',
    };
  });
  check('mobile method card keeps its readable content layout',
    mobileMethod.methodTitle && mobileMethod.methodArtVisible && mobileMethod.cardBackground);
  check('mobile method page offers a static illustration', mobileMethod.methodArtVisible);
  check('mobile method page offers a 3D model action below the book',
    mobileMethod.exploreVisible && mobileMethod.exploreUnderBook && mobileMethod.panelExploreHidden,
    JSON.stringify(mobileMethod));
  check('mobile layout keeps the desktop expand control hidden', mobileMethod.desktopExpandHidden);
  check('mobile method hides the inline 3D viewer', mobileMethod.inlineViewerHidden);
  check('mobile method renders foods as text-only chips', mobileMethod.foodChips);
  check('mobile method keeps also-works foods separate', mobileMethod.alsoWorksChips);
  check('mobile method content can scroll vertically', mobileMethod.scrollable);
  await page.screenshot({ path: `${OUT}/20b-method-landscape.png` });
  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  const mobileModel = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const viewport = document.querySelector('.pp-fb__mobileviewport').getBoundingClientRect();
    const overlay = document.querySelector('.pp-fb__mobilemodel');
    const back = document.querySelector('.pp-fb__mobileback');
    const animate = document.querySelector('.pp-fb__mobileanimate');
    const controlState = (element) => {
      const r = element?.getBoundingClientRect();
      return {
        visible: !!element && getComputedStyle(element).display !== 'none' &&
          r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0,
        rect: r ? `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}` : 'missing',
        style: element ? `${getComputedStyle(element).visibility}/${getComputedStyle(element).opacity}/z${getComputedStyle(element).zIndex}` : 'missing',
      };
    };
    const controls = [
      controlState(document.querySelector('.pp-fb__close')),
      controlState(document.querySelector('.pp-quick.is-overlay.is-factbook')),
    ];
    return {
      open: !overlay.hidden && getComputedStyle(overlay).display !== 'none',
      fillsStage: viewport.width > window.innerWidth * 0.8 && viewport.height > window.innerHeight * 0.55,
      titleMatchesMethod: document.querySelector('.pp-fb__mobilemodeltitle')?.textContent === fb._mv?.name,
      modelLoaded: !!fb.methodViewer.holder,
      backVisible: getComputedStyle(back).display !== 'none' && !back.hidden,
      animateVisible: getComputedStyle(animate).display !== 'none' && !animate.hidden &&
        animate.getBoundingClientRect().width > 0 && animate.getBoundingClientRect().height > 0,
      controlsVisible: controls.every((control) => control.visible),
      controlRects: controls.map((control) => control.rect),
    };
  });
  check('mobile method opens a full-screen interactive model',
    mobileModel.open && mobileModel.fillsStage && mobileModel.titleMatchesMethod && mobileModel.modelLoaded);
  check('mobile model has a clear way back to the book', mobileModel.backVisible);
  check('mobile model offers Watch it work', mobileModel.animateVisible);
  check('mobile model keeps mute and close controls visible', mobileModel.controlsVisible,
    mobileModel.controlRects.join('; '));
  const stillAz = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  await sleep(450);
  const stillAzAfter = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  check('mobile Explore 3D does not rotate on its own', Math.abs(stillAzAfter - stillAz) < 0.001,
    `delta=${(stillAzAfter - stillAz).toFixed(4)}`);

  const mobileActivity = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const labels = [...document.querySelectorAll('.pp-fb__mobilefood')];
    const ids = labels.map((label) => label.dataset.foodId);
    const primaryIds = fb._mv.foods.map((food) => food.id);
    const alsoIds = new Set((fb._mv.alsoWorks || []).map((food) => food.id));
    const rects = labels.map((label) => label.getBoundingClientRect());
    return {
      expectedCount: primaryIds.length,
      actualCount: labels.length,
      idsMatchPrimary: ids.length === primaryIds.length && ids.every((id, i) => id === primaryIds[i]),
      excludesAlsoWorks: ids.every((id) => !alsoIds.has(id)),
      labelsVisible: labels.length > 0 && labels.every((label, i) => !label.hidden &&
        getComputedStyle(label).display !== 'none' && rects[i].width > 0 && rects[i].height > 0),
      labelsHaveLocalizedText: labels.every((label) => label.textContent.trim().length > 0),
      thumbnailsVisible: labels.length > 0 && labels.every((label) => {
        const thumb = label.querySelector('.pp-fb__mobilefoodthumb');
        return thumb instanceof HTMLCanvasElement && thumb.width > 0 && thumb.height > 0 &&
          getComputedStyle(thumb).display !== 'none';
      }),
      distinctPositions: new Set(rects.map((rect) => `${Math.round(rect.left)},${Math.round(rect.top)}`)).size === labels.length,
      squareCards: labels.length > 0 && labels.every((label, i) => {
        const style = getComputedStyle(label);
        return Math.abs(rects[i].width - rects[i].height) < 12 &&
          style.borderRadius !== '999px' && style.display === 'flex';
      }),
      noInlineFoodSlots: !document.querySelector('.pp-fb__mobilefoodlayer .pp-fb__cardslot'),
    };
  });
  check('mobile Explore 3D shows exactly the taught primary foods',
    mobileActivity.actualCount === mobileActivity.expectedCount && mobileActivity.idsMatchPrimary);
  check('mobile food labels are visible and positioned separately',
    mobileActivity.labelsVisible && mobileActivity.labelsHaveLocalizedText &&
      mobileActivity.thumbnailsVisible && mobileActivity.distinctPositions,
    JSON.stringify(mobileActivity));
  check('mobile Explore 3D uses square food cards', mobileActivity.squareCards,
    JSON.stringify(mobileActivity));
  check('mobile food activity excludes also-works foods', mobileActivity.excludesAlsoWorks);
  const mobileCards = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const labels = [...document.querySelectorAll('.pp-fb__mobilefood')];
    const layer = document.querySelector('.pp-fb__mobilefoodlayer');
    const layerRect = layer.getBoundingClientRect();
    const rects = labels.map((label) => label.getBoundingClientRect());
    return {
      staticThumbnails: labels.every((label) => !!label.querySelector('.pp-fb__mobilefoodthumb')),
      noInline3dSlots: !document.querySelector('.pp-fb__mobilefoodlayer .pp-fb__cardslot'),
      foodsHidden: fb._mobileActivity.entries.every((entry) => !entry.food.group.visible),
      verticalColumn: rects.every((rect) => rect.left >= layerRect.left &&
        rect.right <= layerRect.right + 2 && rect.top >= layerRect.top &&
        rect.bottom <= layerRect.bottom + 2),
      cardGap: rects.length < 2 || rects.slice(1).every((rect, i) => rect.top > rects[i].bottom - 1),
    };
  });
  check('mobile food cards show static thumbnails with hidden 3D foods',
    mobileCards.staticThumbnails && mobileCards.noInline3dSlots && mobileCards.foodsHidden,
    JSON.stringify(mobileCards));
  check('mobile food cards form a vertical list on the left',
    mobileCards.verticalColumn && mobileCards.cardGap, JSON.stringify(mobileCards));
  await page.screenshot({ path: `${OUT}/20c-landscape-foods.png` });

  const firstFoodSelector = '.pp-fb__mobilefood:nth-child(1)';
  const secondFoodSelector = '.pp-fb__mobilefood:nth-child(2)';
  await page.click(firstFoodSelector);
  const flightStart = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const entry = activity.entries[0];
    const token = document.querySelector('.pp-fb__mobileflighttoken');
    const tokenRect = token?.getBoundingClientRect();
    const sourceRect = entry.label.getBoundingClientRect();
    return {
      tokenVisible: !!token && tokenRect.width > 0 && tokenRect.height > 0 &&
        getComputedStyle(token).opacity !== '0',
      tokenStartsAtCard: !!token && Math.hypot(
        tokenRect.left + tokenRect.width / 2 - (sourceRect.left + sourceRect.width / 2),
        tokenRect.top + tokenRect.height / 2 - (sourceRect.top + sourceRect.height / 2),
      ) < 28,
      stationEmpty: !activity.station.food && !activity.station.busy,
      realFoodHidden: !entry.food.group.visible,
      flightActive: !!activity.flight && activity.flight.entry === entry,
    };
  });
  check('tapping a food card starts a visible handoff from the card',
    flightStart.tokenVisible && flightStart.tokenStartsAtCard && flightStart.stationEmpty &&
      flightStart.realFoodHidden && flightStart.flightActive, JSON.stringify(flightStart));
  await page.screenshot({ path: `${OUT}/20d-landscape-food-flight-start.png` });

  const modelBox = await page.locator('.pp-fb__mobileviewport').boundingBox();
  const azBeforeFlightDrag = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  if (modelBox) {
    await page.mouse.move(modelBox.x + modelBox.width * 0.68, modelBox.y + modelBox.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(modelBox.x + modelBox.width * 0.78, modelBox.y + modelBox.height * 0.52);
    await page.mouse.up();
  }
  const azDuringFlightDrag = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  check('model rotation is held while the food is in flight',
    Math.abs(azDuringFlightDrag - azBeforeFlightDrag) < 0.001,
    `delta=${(azDuringFlightDrag - azBeforeFlightDrag).toFixed(4)}`);

  await sleep(220);
  const flightMid = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const flight = activity.flight;
    return {
      flightProgress: flight?.elapsed || 0,
      tokenMoved: !!flight && Math.hypot(
        flight.current.x - flight.start.x, flight.current.y - flight.start.y,
      ) > 8,
      stationEmpty: !activity.station.food && !activity.station.busy,
      realFoodHidden: !activity.entries[0].food.group.visible,
      tokenVisible: !!document.querySelector('.pp-fb__mobileflighttoken'),
    };
  });
  check('the handoff travels toward the method before accepting the food',
    flightMid.flightProgress > 100 && flightMid.tokenMoved && flightMid.stationEmpty &&
      flightMid.realFoodHidden && flightMid.tokenVisible, JSON.stringify(flightMid));
  await page.screenshot({ path: `${OUT}/20e-landscape-food-flight-mid.png` });

  await page.waitForFunction(() => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const flight = activity?.flight;
    if (!flight) return !!activity?.station?.food;
    const target = fb._mobileFlightTarget(activity);
    return Math.hypot(flight.current.x - target.x, flight.current.y - target.y) < 110;
  }, null, { timeout: 2000 });
  const flightNearTarget = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const flight = activity.flight;
    if (!flight) return { flightStillVisible: false, nearTarget: !!activity.station.food };
    const target = fb._mobileFlightTarget(activity);
    return {
      flightStillVisible: true,
      nearTarget: Math.hypot(flight.current.x - target.x, flight.current.y - target.y) < 110,
    };
  });
  check('the handoff reaches the projected station target',
    flightNearTarget.nearTarget,
    JSON.stringify(flightNearTarget));

  await page.waitForFunction(() => {
    const fb = window.__pp.game.factBook;
    return !!fb._autoplay && !!fb._mobileActivity?.active && !!fb._mobileActivity.station.food;
  }, null, { timeout: 3000 });
  const accepted = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const entry = fb._mobileActivity.entries[0];
    return {
      acceptedFood: fb._mobileActivity.station.food?.foodId === entry.fv.id,
      stationBusy: fb._mobileActivity.station.busy,
      autoplayRunning: !!fb._autoplay,
      flightCleared: !fb._mobileActivity.flight &&
        document.querySelectorAll('.pp-fb__mobileflighttoken').length === 0,
      cardPlaced: entry.label.classList.contains('is-placed') && !entry.label.disabled &&
        entry.label.getAttribute('aria-pressed') === 'true',
      foodVisible: entry.food.group.visible,
    };
  });
  check('the handoff lands, accepts the food, and starts the station demonstration',
    accepted.acceptedFood && accepted.stationBusy && accepted.autoplayRunning &&
      accepted.flightCleared && accepted.cardPlaced && accepted.foodVisible,
    JSON.stringify(accepted));
  await sleep(450);

  // The two primary Pickling foods must both fit the live jar, not merely land
  // somewhere near its plinth.  Measure in jar-local coordinates so this also
  // catches the normalized-holder / food-pivot parent-space mismatch.
  const picklingFoodIds = await page.evaluate(() =>
    window.__pp.game.factBook._mv.foods.map((food) => food.id));
  check('Pickling Explore 3D exposes both primary foods', picklingFoodIds.length === 2,
    picklingFoodIds.join(', '));
  const firstPicklingPlacement = await inspectPicklingPlacement(page, picklingFoodIds[0]);
  check(`Pickling fits ${firstPicklingPlacement.foodId || picklingFoodIds[0]} inside the jar`,
    firstPicklingPlacement.foodId === picklingFoodIds[0] &&
      firstPicklingPlacement.visible && firstPicklingPlacement.fitWithinInterior,
    JSON.stringify(firstPicklingPlacement));
  check(`Pickling centres ${firstPicklingPlacement.foodId || picklingFoodIds[0]} vertically`,
    firstPicklingPlacement.foodId === picklingFoodIds[0] && firstPicklingPlacement.verticalCentered,
    JSON.stringify({ delta: firstPicklingPlacement.verticalDelta, tolerance: firstPicklingPlacement.verticalTolerance }));

  await page.waitForFunction(() => {
    const station = window.__pp.game.factBook._mobileActivity?.station;
    return station?._fill > 0.3 && station._fill < 0.9 && !!station._pouringBottle;
  }, null, { timeout: 6000 });
  const pouringBottleAboveJar = await page.evaluate(() => {
    const T = window.__ppTHREE;
    const station = window.__pp.game.factBook._mobileActivity?.station;
    const bottle = station?._pouringBottle;
    if (!T || !station?.jar || !bottle) return null;
    const centreWorld = new T.Box3().setFromObject(bottle).getCenter(new T.Vector3());
    const centreBody = station.body.worldToLocal(centreWorld);
    const mouthWorld = station.jar.localToWorld(new T.Vector3(0, 1.04, 0));
    const mouthBody = station.body.worldToLocal(mouthWorld);
    return { bottleY: centreBody.y, mouthY: mouthBody.y };
  });
  check('Pickling pouring bottle stays above the jar',
    !!pouringBottleAboveJar && pouringBottleAboveJar.bottleY > pouringBottleAboveJar.mouthY,
    JSON.stringify(pouringBottleAboveJar));
  await page.waitForFunction(() => !window.__pp.game.factBook._autoplay, null, { timeout: 7000 });
  const completedPicklingPlacement = await inspectPicklingPlacement(page, picklingFoodIds[0]);
  check('Pickling food remains fitted after the animation completes',
    completedPicklingPlacement.fitWithinInterior && completedPicklingPlacement.verticalCentered,
    JSON.stringify(completedPicklingPlacement));

  if (picklingFoodIds[1]) {
    await page.click(secondFoodSelector);
    await page.waitForFunction((id) => {
      const fb = window.__pp.game.factBook;
      return fb._mobileActivity?.station?.food?.foodId === id && !!fb._autoplay &&
        !fb._mobileActivity?.flight;
    }, picklingFoodIds[1], { timeout: 5000 });
    await sleep(450);
    const secondPicklingPlacement = await inspectPicklingPlacement(page, picklingFoodIds[1]);
    check(`Pickling fits ${secondPicklingPlacement.foodId || picklingFoodIds[1]} inside the jar`,
      secondPicklingPlacement.foodId === picklingFoodIds[1] &&
        secondPicklingPlacement.visible && secondPicklingPlacement.fitWithinInterior,
      JSON.stringify(secondPicklingPlacement));
    check(`Pickling centres ${secondPicklingPlacement.foodId || picklingFoodIds[1]} vertically`,
      secondPicklingPlacement.foodId === picklingFoodIds[1] && secondPicklingPlacement.verticalCentered,
      JSON.stringify({ delta: secondPicklingPlacement.verticalDelta, tolerance: secondPicklingPlacement.verticalTolerance }));
  }
  await page.screenshot({ path: `${OUT}/20f-landscape-food-landed.png` });

  const assemblyDelta = await placedAssemblyRotationCheck(page);
  const azBeforePlacedDrag = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  if (modelBox) {
    await page.mouse.move(modelBox.x + modelBox.width * 0.68, modelBox.y + modelBox.height * 0.52);
    await page.mouse.down();
    await page.mouse.move(modelBox.x + modelBox.width * 0.78, modelBox.y + modelBox.height * 0.52);
    await page.mouse.up();
  }
  const azAfterPlacedDrag = await page.evaluate(() => window.__pp.game.factBook.methodViewer._targetAz);
  check('manual model rotation resumes after the food is placed',
    Math.abs(azAfterPlacedDrag - azBeforePlacedDrag) > 0.01,
    `delta=${(azAfterPlacedDrag - azBeforePlacedDrag).toFixed(4)}`);
  check('placed food stays attached while the viewer rotates',
    Number.isFinite(assemblyDelta) && assemblyDelta < 1e-5,
    `relative delta=${Number.isFinite(assemblyDelta) ? assemblyDelta.toFixed(4) : 'missing'}`);

  await page.click('.pp-fb__mobilemodelreset');
  await page.waitForFunction(() => {
    const fb = window.__pp.game.factBook;
    return !fb._autoplay && !fb._mobileActivity?.station.food && !fb._mobileActivity?.active;
  }, null, { timeout: 3000 });

  await page.click(firstFoodSelector);
  await sleep(220);
  const midflightReplacementId = await page.evaluate(() =>
    window.__pp.game.factBook._mobileActivity.entries[1]?.fv.id);
  await page.click(secondFoodSelector);
  const midflightReplacement = await page.evaluate((id) => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const oldEntry = activity.entries[0];
    const next = activity.entries.find((entry) => entry.fv.id === id);
    return {
      activeNewEntry: activity.active?.fv.id === id,
      newFlightActive: activity.flight?.entry?.fv.id === id,
      stationStillEmpty: !activity.station.food && !activity.station.busy,
      oldFoodRemoved: !oldEntry.food.group.visible && !oldEntry.placed &&
        !oldEntry.label.classList.contains('is-placing'),
      newFoodStillHidden: !next.food.group.visible,
    };
  }, midflightReplacementId);
  check('a new tap interrupts an in-flight food and starts the replacement flight',
    midflightReplacement.activeNewEntry && midflightReplacement.newFlightActive &&
      midflightReplacement.stationStillEmpty && midflightReplacement.oldFoodRemoved &&
      midflightReplacement.newFoodStillHidden, JSON.stringify(midflightReplacement));
  await page.screenshot({ path: `${OUT}/20g-landscape-food-replace-flight.png` });

  await page.waitForFunction((id) => {
    const fb = window.__pp.game.factBook;
    return fb._mobileActivity?.station.food?.foodId === id && !!fb._autoplay;
  }, midflightReplacementId, { timeout: 3000 });
  const midflightReplacementLanded = await page.evaluate((id) => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const oldEntry = activity.entries[0];
    const next = activity.entries.find((entry) => entry.fv.id === id);
    return {
      stationFood: activity.station.food?.foodId === id,
      oldFoodRemoved: !oldEntry.food.group.visible,
      newFoodVisible: next.food.group.visible,
      autoplayRunning: !!fb._autoplay,
    };
  }, midflightReplacementId);
  check('the replacement food reaches the station and starts its demonstration',
    midflightReplacementLanded.stationFood && midflightReplacementLanded.oldFoodRemoved &&
      midflightReplacementLanded.newFoodVisible && midflightReplacementLanded.autoplayRunning,
    JSON.stringify(midflightReplacementLanded));
  await page.screenshot({ path: `${OUT}/20h-landscape-food-replaced.png` });

  await page.click(firstFoodSelector);
  await page.waitForFunction(() => {
    const fb = window.__pp.game.factBook;
    return fb._mobileActivity?.station.food?.foodId === fb._mobileActivity.entries[0]?.fv.id &&
      !!fb._autoplay;
  }, null, { timeout: 3000 });
  const dockedReplacement = await page.evaluate((id) => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    const oldEntry = activity.entries.find((entry) => entry.fv.id === id);
    const next = activity.entries[0];
    return {
      stationFood: activity.station.food?.foodId === next.fv.id,
      oldFoodRemoved: !oldEntry.food.group.visible && !oldEntry.placed,
      newFoodVisible: next.food.group.visible && next.placed,
      autoplayRunning: !!fb._autoplay,
    };
  }, midflightReplacementId);
  check('a placed food can be replaced and re-animated by tapping another card',
    dockedReplacement.stationFood && dockedReplacement.oldFoodRemoved &&
      dockedReplacement.newFoodVisible && dockedReplacement.autoplayRunning,
    JSON.stringify(dockedReplacement));

  await page.click('.pp-fb__mobilemodelreset');
  await page.waitForFunction(() => {
    const fb = window.__pp.game.factBook;
    return !fb._autoplay && !fb._mobileActivity?.station.food && !fb._mobileActivity?.active;
  }, null, { timeout: 3000 });
  const resetActivity = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const activity = fb._mobileActivity;
    return {
      foodsHome: activity.entries.every((entry) => entry.food.group.position.distanceTo(entry.home) < 0.02),
      foodsHidden: activity.entries.every((entry) => !entry.food.group.visible && entry.food.state === 'idle'),
      cardsEnabled: activity.entries.every((entry) => !entry.label.disabled && !entry.label.classList.contains('is-placed')),
      flightLayerEmpty: document.querySelectorAll('.pp-fb__mobileflighttoken').length === 0 &&
        activity.flight === null,
      cameraReset: Math.abs(fb.methodViewer._targetAz - fb.methodViewer.home.az) < 0.001 &&
        Math.abs(fb.methodViewer._targetEl - fb.methodViewer.home.el) < 0.001,
      ringHidden: activity.station.ring?.visible === false && activity.station._targetHighlight === 0,
    };
  });
  check('reset clears the selected food and restores the camera',
    resetActivity.foodsHome && resetActivity.foodsHidden && resetActivity.cardsEnabled &&
      resetActivity.flightLayerEmpty &&
      resetActivity.cameraReset && resetActivity.ringHidden,
    JSON.stringify(resetActivity));

  await page.click(firstFoodSelector);
  await sleep(180);
  await page.click('.pp-fb__mobileback');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
  const backCleanup = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    return {
      modelClosed: !fb._mobileModelOpen,
      activityDisposed: !fb._mobileActivity,
      stationReleased: !fb._method?.station?.food,
      flightLayerEmpty: document.querySelectorAll('.pp-fb__mobileflighttoken').length === 0,
    };
  });
  check('Back to book cancels an active food handoff cleanly',
    backCleanup.modelClosed && backCleanup.activityDisposed && backCleanup.stationReleased &&
      backCleanup.flightLayerEmpty, JSON.stringify(backCleanup));

  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  await page.click(firstFoodSelector);
  await sleep(180);
  await page.click('.pp-fb__close');
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 8000 });
  const closeCleanup = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    return {
      activityDisposed: !fb._mobileActivity,
      flightLayerEmpty: document.querySelectorAll('.pp-fb__mobileflighttoken').length === 0,
    };
  });
  check('closing the Fact Book cancels an active food handoff cleanly',
    closeCleanup.activityDisposed && closeCleanup.flightLayerEmpty, JSON.stringify(closeCleanup));

  await openBook(page);
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('pickling'));
  await settle(page);
  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });

  await page.click('.pp-fb__mobileanimate');
  await page.waitForFunction(() => window.__pp.game.factBook._autoplay != null, null, { timeout: 3000 });
  check('mobile Watch it work starts the station animation', await page.evaluate(() =>
    document.querySelector('.pp-fb__mobileanimate')?.classList.contains('is-playing')));
  await page.screenshot({ path: `${OUT}/20c-landscape-model.png` });
  await page.click('.pp-fb__mobileback');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
  check('back to book returns to the method spread', await page.evaluate(() =>
    !window.__pp.game.factBook._mobileModelOpen && document.querySelector('.pp-fb__mobilemodel')?.hidden));

  // Vacuum's bag is driven from the same docked food bounds.  Wait until the
  // pump has made measurable progress so the six film surfaces are live, then
  // check their finite geometry and fitted envelope against the food.
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('vacuum'));
  await settle(page);
  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  const vacuumFoodId = await page.$eval('.pp-fb__mobilefood:nth-child(1)', (node) => node.dataset.foodId);
  await page.click('.pp-fb__mobilefood:nth-child(1)');
  await page.waitForFunction((id) => {
    const fb = window.__pp.game.factBook;
    return fb._mobileActivity?.station?.food?.foodId === id && !!fb._autoplay &&
      !fb._mobileActivity?.flight;
  }, vacuumFoodId, { timeout: 5000 });
  await page.waitForFunction(() => {
    const station = window.__pp.game.factBook._mobileActivity?.station;
    return !!station?.food && station._filmProgress > 0.9;
  }, null, { timeout: 12000 });
  const vacuumGeometry = await inspectVacuumGeometry(page);
  check('Vacuum Explore 3D keeps the fitted food and film geometry finite', vacuumGeometry.ok,
    JSON.stringify(vacuumGeometry));
  await page.click('.pp-fb__mobileback');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });

  for (const checkCase of [
    { method: 'salting', host: 'body', min: [-0.34, 1.24, 0.16], max: [0.64, 1.62, 0.80] },
    { method: 'canning', host: 'can', min: [-0.36, 0.12, -0.36], max: [0.36, 0.78, 0.36] },
  ]) {
    await page.evaluate((id) => window.__pp.game.factBook.goToMethod(id), checkCase.method);
    await settle(page);
    await page.click('.pp-fb__mobile-explore');
    await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
    await page.click('.pp-fb__mobilefood:nth-child(1)');
    await page.waitForFunction(() => {
      const fb = window.__pp.game.factBook;
      return !!fb._mobileActivity?.station?.food && !fb._mobileActivity?.flight;
    }, null, { timeout: 5000 });
    await sleep(250);
    const placement = await inspectFoodEnvelope(page, checkCase.host, checkCase.min, checkCase.max);
    check(`${checkCase.method} keeps the selected food in its method area`, placement.fits,
      JSON.stringify(placement));
    if (checkCase.method === 'salting') {
      const demoHidden = await page.evaluate(() => {
        const station = window.__pp.game.factBook._mobileActivity?.station;
        return !!station?.food && !station.demoFood?.visible && !station._demoActive;
      });
      check('salting hides its demonstration fillet when real food is selected', demoHidden);
    }
    await page.click('.pp-fb__mobileback');
    await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
  }

  await page.evaluate(() => window.__pp.game.factBook.goToMethod('smoking'));
  await settle(page);
  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  const referenceFood = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const labels = [...document.querySelectorAll('.pp-fb__mobilefood')];
    const banana = fb._mobileActivity?.entries.find((entry) => entry.fv.id === 'bananas');
    return {
      countMatches: labels.length === fb._mv.foods.length,
      labelsMatchFoods: labels.map((label) => label.dataset.foodId).join(',') === fb._mv.foods.map((food) => food.id).join(','),
      referenceAdapterIsIllustrated: !!banana?.food.model?.isSprite,
      cardHasStaticThumbnail: !!banana?.label && !!banana.label.querySelector('.pp-fb__mobilefoodthumb') &&
        !banana.label.querySelector('.pp-fb__cardslot'),
      alsoWorksAbsent: !(fb._mv.alsoWorks || []).some((food) => labels.some((label) => label.dataset.foodId === food.id)),
    };
  });
  check('reference-only foods keep their illustrated adapter without drawing in cards',
    referenceFood.countMatches && referenceFood.labelsMatchFoods &&
      referenceFood.referenceAdapterIsIllustrated && referenceFood.cardHasStaticThumbnail,
    JSON.stringify(referenceFood));
  check('reference-only activity still excludes also-works foods', referenceFood.alsoWorksAbsent);
  await page.click('.pp-fb__mobileback');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });

  await page.evaluate(() => window.__pp.game.factBook.goToMethod('boiling'));
  await settle(page);
  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  const staticDiorama = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    return {
      nonPlayable: !fb._mv.playable,
      modelLoaded: !!fb.methodViewer.holder,
      noFoodActivity: !fb._mobileActivity && document.querySelectorAll('.pp-fb__mobilefood').length === 0,
      watchHidden: document.querySelector('.pp-fb__mobileanimate')?.hidden === true,
    };
  });
  check('non-playable methods remain static dioramas without drag activity',
    staticDiorama.nonPlayable && staticDiorama.modelLoaded && staticDiorama.noFoodActivity && staticDiorama.watchHidden,
    JSON.stringify(staticDiorama));
  await page.click('.pp-fb__mobileback');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'reading', null, { timeout: 5000 });
});

// --------------------------------------------------------- reduced motion
await session({ width: 1400, height: 800 }, async (page) => {
  console.log('\n[reduced motion]');
  await openBook(page);
  await page.close;
}, { reducedMotion: 'reduce' });

// ------------------------------------------------------- language + in-game
await session({ width: 1600, height: 900 }, async (page) => {
  console.log('\n[localisation]');
  // Build and close the reusable WebGL book in English first. This catches
  // stale localized view models that a first-open-only test cannot see.
  await openBook(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__pp.game.factBook.isOpen, null, { timeout: 8000 });
  await page.waitForFunction(() => !!document.querySelector('.pp-title'));
  await page.click('[data-quick="language"]');
  await page.click('.pp-language-menu [data-lang="zh"]');
  await sleep(200);
  const stationLabels = await page.evaluate(() =>
    [...window.__pp.game.stations.values()].map((station) => station.plaqueLabel)
  );
  check('station plaques refresh to the chosen language',
    stationLabels.every((label) => label && !/[A-Za-z]/.test(label)), stationLabels.join(', '));
  check('quick-control mute label refreshes with language', await page.evaluate(() => {
    const mute = document.querySelector('[data-quick="mute"]');
    const expected = window.__pp.content.i18n.t('ui.mute');
    return mute?.getAttribute('aria-label') === expected && mute.title === expected && mute.textContent.includes(expected);
  }));
  await openBook(page);
  await page.evaluate(() => window.__pp.game.factBook.goToMethod('salting'));
  await settle(page);
  await sleep(400);
  const title = await page.$eval('.pp-fb__title', (n) => n.textContent);
  const pageCount = await page.$eval('.pp-fb__count', (n) => n.textContent);
  const localizedFacts = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const salting = fb.model.methods.find((method) => method.id === 'salting');
    return {
      title: document.querySelector('.pp-fb__title')?.textContent || '',
      name: salting?.name || '',
      detail: salting?.detail || '',
      exam: salting?.exam || '',
      foodNames: salting?.foods.map((food) => food.name) || [],
    };
  });
  check('the reused book rebuilds all facts in the chosen language',
    title !== 'Salting' && localizedFacts.name !== 'Salting' &&
      localizedFacts.detail.length > 0 && localizedFacts.exam.length > 0 &&
      !localizedFacts.foodNames.includes('Fish'), JSON.stringify(localizedFacts));
  check('navigation-page numbering follows the chosen language',
    pageCount.includes('页') && !pageCount.includes('Page'), pageCount);
  check('desktop expand control localizes with the Fact Book', await page.evaluate(() => {
    const expand = document.querySelector('.pp-fb__expand');
    return expand?.getAttribute('aria-label') === '探索 3D' && expand.title === '探索 3D';
  }));
  await page.screenshot({ path: `${OUT}/21-zh.png` });

  await page.setViewportSize({ width: 667, height: 375 });
  await sleep(300);
  await page.click('.pp-fb__mobile-explore');
  await page.waitForFunction(() => window.__pp.game.factBook.state === 'mobile-model', null, { timeout: 5000 });
  const localizedMobile = await page.evaluate(() => {
    const fb = window.__pp.game.factBook;
    const labels = [...document.querySelectorAll('.pp-fb__mobilefood')];
    const expected = fb._mv.foods.map((food) => food.name);
    return {
      labelsLocalized: labels.map((label) => label.textContent.trim()).join('|') === expected.join('|'),
      instructionLocalized: document.querySelector('.pp-fb__mobilemodelhint')?.textContent.includes('点击食物卡片'),
      resetLocalized: document.querySelector('.pp-fb__mobilemodelreset')?.getAttribute('aria-label') === '重置视角和食物互动',
      watchLocalized: document.querySelector('.pp-fb__mobileanimatelabel')?.textContent === '看看它如何运作',
    };
  });
  check('mobile food labels and activity controls redraw in the chosen language',
    localizedMobile.labelsLocalized && localizedMobile.instructionLocalized &&
      localizedMobile.resetLocalized && localizedMobile.watchLocalized,
    JSON.stringify(localizedMobile));
  await page.click('.pp-fb__mobileback');
});

console.log(errors.length ? `\nCONSOLE ERRORS:\n${[...new Set(errors)].join('\n')}` : '\nno page errors');
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall checks passed');
await browser.close();
process.exit(failures ? 1 : 0);
