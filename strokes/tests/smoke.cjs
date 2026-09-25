const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'strokes-check-'));

async function ready(page) {
  await page.locator('#board[data-ready="true"]').waitFor();
}
async function pointsFor(page, index) {
  return page.evaluate(index => {
    const id = document.querySelector('#board').dataset.item;
    const item = window.StrokeLessons.items[id];
    const shape = item.kind === 'stroke' ? window.StrokeShapes[id] : window.StrokeCharacters[item.source];
    const board = document.querySelector('#board');
    const rect = board.getBoundingClientRect();
    const t = HanziWriter.getScalingTransform(board.clientWidth, board.clientWidth, 16);
    const points = shape.medians[index].map(([x, y]) => ({ x: rect.x + t.x + x * t.scale, y: rect.y + board.clientWidth - t.y - y * t.scale }));
    return points.flatMap((point, i) => {
      if (!i) return [point];
      const previous = points[i - 1];
      const count = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 4));
      return Array.from({ length: count }, (_, n) => ({ x: previous.x + (point.x - previous.x) * (n + 1) / count, y: previous.y + (point.y - previous.y) * (n + 1) / count }));
    });
  }, index);
}
async function trace(page, index, reverse = false) {
  const points = await pointsFor(page, index);
  if (reverse) points.reverse();
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}
async function complete(page) {
  const count = await page.locator('.stroke-step').count();
  for (let index = 0; index < count; index++) {
    await trace(page, index);
    await page.waitForFunction(expected => Number(document.querySelector('#board').dataset.completed) === expected, index + 1);
  }
  assert.equal(await page.locator('#boardCelebration').isVisible(), true);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.testAudio = this.src;
        if (window.blockAudio) return Promise.reject(new DOMException('test', 'NotAllowedError'));
        return play.call(this);
      };
    });
    await page.goto(url); await ready(page);
    await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });
    assert.equal(await page.locator('.letter-tile').count(), 6);
    const catalog = await page.evaluate(() => {
      const { groups, items } = window.StrokeLessons;
      return groups.map(group => ({ id: group.id, lessons: group.lessons, counts: Object.fromEntries(group.lessons.flat().map(id => [id, items[id].names.length])) }));
    });
    assert.equal(catalog.flatMap(group => group.lessons.flat()).length, 30);
    const audioFiles = fs.readdirSync(path.join(root, 'audio')).filter(name => name.endsWith('.mp3'));
    const audioResults = await page.evaluate(async names => {
      const results = [];
      for (const name of names) results.push(await new Promise(resolve => {
        const audio = new Audio(`audio/${name}`);
        const timer = setTimeout(() => resolve({ name, error: 'timeout' }), 4000);
        audio.onloadedmetadata = () => { clearTimeout(timer); resolve({ name, duration: audio.duration }); };
        audio.onerror = () => { clearTimeout(timer); resolve({ name, error: 'decode' }); };
        audio.load();
      }));
      return results;
    }, audioFiles);
    assert.equal(audioResults.length, 30);
    assert.ok(audioResults.every(item => !item.error && item.duration > .2 && item.duration < 6));
    await page.locator('#sound').click();
    await page.waitForFunction(() => document.querySelector('#learned').textContent.includes('1 / 6'));
    await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector('#play').getAttribute('aria-label') === '暂停笔顺动画');
    await page.waitForTimeout(200);
    await page.locator('#play').click();
    await page.waitForTimeout(40);
    const paused = await page.locator('#writerHost').innerHTML();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#writerHost').innerHTML(), paused);
    await page.locator('#play').click();
    await page.waitForFunction(() => document.querySelector('#strokeStatus').textContent.includes('写好啦'));

    await page.locator('[data-mode="write"]').click(); await ready(page);
    const start = (await pointsFor(page, 0))[0];
    await page.mouse.click(start.x, start.y);
    assert.equal(await page.locator('#board').getAttribute('data-completed'), '0');
    await trace(page, 0, true);
    assert.equal(await page.locator('#board').getAttribute('data-completed'), '0');
    await trace(page, 0);
    await page.locator('#boardCelebration').waitFor();
    await page.locator('#undo').click();
    assert.equal(await page.locator('#board').getAttribute('data-completed'), '0');
    assert.equal(await page.locator('#boardCelebration').isVisible(), false);

    // Every supplied outline must be drawable using its published median path.
    for (const group of catalog) {
      await page.locator(`[data-group="${group.id}"]`).click(); await ready(page);
      for (let pageIndex = 0; pageIndex < group.lessons.length; pageIndex++) {
        if (pageIndex) { await page.locator('#nextPage').click(); await ready(page); }
        for (const id of group.lessons[pageIndex]) {
          await page.locator(`.letter-tile[data-item="${id}"]`).click(); await ready(page);
          assert.equal(await page.locator('.stroke-step').count(), group.counts[id]);
          await complete(page);
        }
      }
      await page.screenshot({ path: path.join(screenshots, `${group.id}.png`), fullPage: true });
      console.log(`Traced ${group.id}`);
    }
    const writtenStars = Number(await page.locator('#stars').innerText());
    assert.equal(writtenStars, 30);
    await page.locator('#undo').click();
    assert.equal(await page.locator('#board').getAttribute('data-completed'), '3');
    await trace(page, 3);
    assert.equal(Number(await page.locator('#stars').innerText()), writtenStars);
    await page.locator('#clear').click();
    assert.equal(await page.locator('#board').getAttribute('data-completed'), '0');

    await page.locator('[data-mode="quiz"]').click();
    for (let round = 0; round < 5; round++) {
      await page.locator('.answer:not([disabled])').first().waitFor();
      const answer = await page.evaluate(() => window.testAudio.split('/').pop().replace('.mp3', ''));
      if (!round) {
        await page.locator(`.answer:not([data-answer="${answer}"])`).first().click();
        assert.equal(await page.locator('#quizNext').isVisible(), false);
      }
      await page.locator(`[data-answer="${answer}"]`).click();
      assert.equal(await page.locator('#quizNext').isVisible(), true);
      await page.locator('#quizNext').click();
    }
    assert.equal(await page.locator('#quizResult').isVisible(), true);
    assert.equal(Number(await page.locator('#stars').innerText()), writtenStars + 5);
    await page.reload(); await ready(page);
    assert.equal(Number(await page.locator('#stars').innerText()), writtenStars + 5);

    await page.locator('#mute').click();
    await page.locator('[data-mode="quiz"]').click();
    assert.equal(await page.locator('#audioError').isVisible(), true);
    assert.equal(await page.locator('.answer:not([disabled])').count(), 0);
    await page.locator('#retryAudio').click();
    await page.locator('.answer:not([disabled])').first().waitFor();
    await page.evaluate(() => { window.blockAudio = true; });
    await page.locator('[data-group="hooks"]').click();
    await page.locator('#audioError').waitFor();
    assert.equal(await page.locator('.answer:not([disabled])').count(), 0);
    await page.evaluate(() => { window.blockAudio = false; });
    await page.locator('#retryAudio').click();
    await page.locator('.answer:not([disabled])').first().waitFor();

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
      await page.locator('[data-mode="write"]').click();
      await page.locator('[data-group="characters"]').click(); await ready(page);
      await page.locator('#nextPage').click(); await ready(page);
      await page.locator('.letter-tile[data-item="char-6728"]').click(); await ready(page);
      await complete(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
      assert.ok(await page.locator('.letter-tile').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width >= 44 && node.getBoundingClientRect().height >= 44)));
      await page.screenshot({ path: path.join(screenshots, `write-${width}.png`), fullPage: true });
    }

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touchPage = await touch.newPage();
    await touchPage.goto(url); await ready(touchPage);
    await touchPage.locator('[data-mode="write"]').tap(); await ready(touchPage);
    const client = await touch.newCDPSession(touchPage);
    const points = await pointsFor(touchPage, 0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [points[5]] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await touchPage.locator('#board').getAttribute('data-completed'), '0');
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
    for (const point of points.slice(1)) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touchPage.locator('#boardCelebration').waitFor();
    await touch.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    console.log(JSON.stringify({ result: 'PASS', items: 30, recordings: audioResults.length, screenshots }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
