const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'pinyin-check-'));

async function strokePoints(page, index) {
  return page.locator('#ghost path').nth(index).evaluate(node => {
    const length = node.getTotalLength();
    const count = Math.max(1, Math.ceil(length / 3));
    const matrix = node.getScreenCTM();
    return Array.from({ length: count + 1 }, (_, i) => {
      const local = node.getPointAtLength(length * i / count);
      const point = new DOMPoint(local.x, local.y).matrixTransform(matrix);
      return { x: point.x, y: point.y };
    });
  });
}

async function trace(page, index) {
  const points = await strokePoints(page, index);
  await page.mouse.move(points[0].x, points[0].y);
  await page.mouse.down();
  for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
  await page.mouse.up();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        window.lastTestAudio = this.src;
        if (window.blockTestAudio) return Promise.reject(new DOMException('Blocked for test', 'NotAllowedError'));
        return originalPlay.call(this);
      };
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    assert.equal(await page.locator('.letter-tile').count(), 6);
    assert.equal(await page.locator('#ink path').count(), 2);
    assert.ok(await page.locator('svg.lucide').count() > 20);
    await page.screenshot({ path: path.join(screenshots, 'desktop.png'), fullPage: true });

    const names = fs.readdirSync(path.join(root, 'audio')).filter(name => name.endsWith('.mp3'));
    const audioResults = await page.evaluate(async names => {
      const results = [];
      for (const name of names) {
        results.push(await new Promise(resolve => {
          const audio = new Audio(`audio/${name}`);
          const timeout = setTimeout(() => resolve({ name, error: 'timeout' }), 4000);
          audio.onloadedmetadata = () => { clearTimeout(timeout); resolve({ name, duration: audio.duration }); };
          audio.onerror = () => { clearTimeout(timeout); resolve({ name, error: 'decode' }); };
          audio.load();
        }));
      }
      return results;
    }, names);
    assert.equal(audioResults.length, 58);
    assert.ok(audioResults.every(item => !item.error && item.duration > .2 && item.duration < 5), JSON.stringify(audioResults.filter(item => item.error)));

    await page.locator('#sound').click();
    await page.waitForFunction(() => document.querySelector('#learned').textContent.includes('1 / 6'));
    await page.locator('#play').click();
    await page.waitForFunction(() => Number(document.querySelector('#ink path').style.strokeDashoffset) < 170);
    await page.locator('#play').click();
    const paused = await page.locator('#ink path').first().getAttribute('style');
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#ink path').first().getAttribute('style'), paused);
    await page.locator('#play').click();
    await page.waitForFunction(paused => document.querySelector('#ink path').getAttribute('style') !== paused, paused);
    await page.locator('#letters [data-item="o"]').click();
    assert.equal(await page.locator('#ink path').count(), 1);

    // Tones must change both the recording and the written glyph.
    await page.locator('[data-item="i"]').click();
    await page.locator('[data-tone="2"]').click();
    assert.equal(await page.locator('#ghost path').count(), 2);
    assert.ok((await page.locator('#board').getAttribute('aria-label')).includes('í'));
    await page.locator('[data-item="ü"]').click();
    await page.locator('[data-tone="3"]').click();
    assert.equal(await page.locator('#ghost path').count(), 5);
    await page.locator('[data-mode="write"]').click();
    await page.locator('[data-item="a"]').click();

    // A tap, reversed direction, or a shortcut across the bowl is not handwriting.
    const points = await strokePoints(page, 0);
    await page.mouse.click(points[0].x, points[0].y);
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await page.mouse.move(points.at(-1).x, points.at(-1).y);
    await page.mouse.down();
    for (const point of [...points].reverse()) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    await page.mouse.move(points.at(-1).x, points.at(-1).y, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await trace(page, 0);
    assert.equal(await page.locator('#undo').isDisabled(), false);
    await page.locator('#undo').click();
    assert.equal(await page.locator('#undo').isDisabled(), true);
    await trace(page, 0);
    await trace(page, 1);
    assert.equal(await page.locator('#boardCelebration').isVisible(), true);
    const starsAfterWriting = Number(await page.locator('#stars').innerText());
    await page.locator('#clear').click();
    assert.equal(await page.locator('#undo').isDisabled(), true);
    assert.equal(await page.locator('#boardCelebration').isVisible(), false);
    await trace(page, 0);
    await trace(page, 1);
    assert.equal(Number(await page.locator('#stars').innerText()), starsAfterWriting);

    await page.locator('[data-mode="quiz"]').click();
    for (let round = 0; round < 5; round++) {
      await page.locator('.answer:not([disabled])').first().waitFor();
      // Observe the native media API without changing its playback behavior.
      const played = await page.evaluate(() => window.lastTestAudio.split('/').pop().replace('.mp3', ''));
      assert.ok(played);
      const answer = await page.evaluate(played => [...document.querySelectorAll('.answer')].find(button => window.PinyinData.audioNames[button.dataset.answer] === played)?.dataset.answer, played);
      assert.ok(answer, `No matching answer for ${played}`);
      if (round === 0) {
        await page.locator(`.answer:not([data-answer="${answer}"])`).first().click();
        assert.equal(await page.locator('#quizNext').isVisible(), false);
      }
      await page.locator(`.answer[data-answer="${answer}"]`).click();
      assert.equal(await page.locator('#quizNext').isVisible(), true);
      await page.locator('#quizNext').click();
    }
    assert.equal(await page.locator('#quizResult').isVisible(), true);
    assert.equal(Number(await page.locator('#stars').innerText()), starsAfterWriting + 5);
    await page.screenshot({ path: path.join(screenshots, 'quiz-result.png'), fullPage: true });
    await page.reload();
    assert.equal(Number(await page.locator('#stars').innerText()), starsAfterWriting + 5);

    await page.locator('#mute').click();
    await page.locator('[data-mode="quiz"]').click();
    assert.equal(await page.locator('#audioError').isVisible(), true);
    assert.equal(await page.locator('.answer:not([disabled])').count(), 0);
    await page.locator('#retryAudio').click();
    await page.locator('.answer:not([disabled])').first().waitFor();
    await page.evaluate(() => { window.blockTestAudio = true; });
    await page.locator('[data-group="initials"]').click();
    await page.locator('#audioError').waitFor();
    assert.equal(await page.locator('.answer:not([disabled])').count(), 0);
    await page.evaluate(() => { window.blockTestAudio = false; });
    await page.locator('#retryAudio').click();
    await page.locator('.answer:not([disabled])').first().waitFor();

    await page.locator('[data-mode="write"]').click();
    await page.locator('[data-group="vowels"]').click();
    await page.locator('[data-item="ü"]').click();
    await page.locator('[data-tone="3"]').click();
    for (let i = 0; i < 5; i++) await trace(page, i);
    assert.equal(await page.locator('#boardCelebration').isVisible(), true);
    await page.locator('[data-group="syllables"]').click();
    for (let i = 0; i < 3; i++) await page.locator('#nextPage').click();
    await page.locator('[data-item="yuan"]').click();
    for (let i = 0; i < 8; i++) await trace(page, i);
    assert.equal(await page.locator('#boardCelebration').isVisible(), true);

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 844 });
      await page.locator('[data-mode="write"]').click();
      await page.locator('[data-group="vowels"]').click();
      await trace(page, 0);
      await trace(page, 1);
      assert.equal(await page.locator('#boardCelebration').isVisible(), true, `Trace alignment at ${width}px`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}px`);
      for (const box of await page.locator('.letter-tile').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })))) {
        assert.ok(box.width >= 44 && box.height >= 44, `Small letter target at ${width}px`);
      }
      await page.screenshot({ path: path.join(screenshots, `write-${width}.png`), fullPage: true });
    }

    // Cancellation cannot accidentally finish a touch stroke.
    const touchContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const touchPage = await touchContext.newPage();
    await touchPage.goto(url);
    await touchPage.locator('[data-mode="write"]').tap();
    const client = await touchContext.newCDPSession(touchPage);
    const touchPoints = await strokePoints(touchPage, 0);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoints[0]] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoints[3]] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    assert.equal(await touchPage.locator('#undo').isDisabled(), true);
    for (let index = 0; index < 2; index++) {
      const points = await strokePoints(touchPage, index);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
      for (const point of points.slice(1)) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    assert.equal(await touchPage.locator('#boardCelebration').isVisible(), true);
    await touchContext.close();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', recordings: audioResults.length, screenshots }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
