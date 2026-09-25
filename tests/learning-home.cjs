const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const home = pathToFileURL(path.join(root, 'index.html')).href;
const screenshots = fs.mkdtempSync(path.join(os.tmpdir(), 'learning-home-'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(home);
    const lessons = await page.evaluate(() => window.LearningHub.lessons);
    assert.equal(lessons.length, 8);
    assert.equal(await page.title(), '小小学习乐园');
    assert.equal(await page.locator('#resume').isVisible(), false);
    assert.equal(await page.locator('a[href*="unboxing"]').count(), 0);
    assert.ok(await page.locator('.lesson-art img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)));

    for (const [category, count] of [['chinese', 3], ['math', 2], ['english', 2], ['thinking', 1], ['all', 8]]) {
      await page.locator(`[data-subject="${category}"]`).click();
      assert.equal(await page.locator('.lesson-card').count(), count);
      assert.equal(await page.locator(`[data-subject="${category}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.dataset.subject), category);
      assert.equal(await page.locator('#voiceStatus').innerText(), '');
    }
    const seeded = { 'numbers-game-v1': { stars: 2, totalStars: 12, muted: true }, 'letters-game-v1': { stars: 1, totalStars: 7, muted: true }, 'pinyin-classroom-v1': { heard: ['a'], written: ['a'], stars: 3, group: 'vowels', muted: true } };
    await page.evaluate(seeded => { for (const [key, value] of Object.entries(seeded)) localStorage.setItem(key, JSON.stringify(value)); }, seeded);
    await page.reload();
    assert.equal(await page.locator('#totalStars').innerText(), '22');
    for (const [key, value] of Object.entries(seeded)) {
      assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), value);
    }

    // Exercise all entry/return links, including direct visits and the new lesson.
    for (const lesson of lessons) {
      await page.locator(`.lesson-card[data-lesson="${lesson.id}"] .lesson-link`).click();
      await page.waitForURL(pathToFileURL(path.join(root, lesson.path)).href);
      assert.equal(await page.title(), `${lesson.title} · 小小学习乐园`);
      assert.equal(await page.locator('html').getAttribute('data-lesson'), lesson.id);
      assert.equal(await page.evaluate(() => LearningHub.readHistory().last), lesson.id);
      assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'), '学习乐园');
      const back = page.getByRole('link', { name: '返回学习首页', exact: true });
      assert.equal(await back.count(), 1);
      await back.click(); await page.waitForURL(home);
      assert.equal(await page.locator('#resumeTitle').innerText(), lesson.title);
      assert.equal(await page.locator('#resumeLink').getAttribute('href'), lesson.path);
    }
    await page.locator('#resumeLink').click();
    await page.waitForURL('**/gomoku/index.html');
    await page.getByRole('link', { name: '返回学习首页', exact: true }).click(); await page.waitForURL(home);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('numbers-game-v1')).totalStars), 12);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('letters-game-v1')).totalStars), 7);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pinyin-classroom-v1')).stars), 3);

    await page.goto(pathToFileURL(path.join(root, 'strokes/index.html')).href);
    await page.getByRole('link', { name: '返回学习首页', exact: true }).click(); await page.waitForURL(home);
    assert.equal(await page.locator('#resumeTitle').innerText(), '笔画书写');
    await page.goto(pathToFileURL(path.join(root, 'unboxing/index.html')).href);
    await page.waitForURL(home);
    assert.ok(!(await page.locator('body').innerText()).includes('拆快递'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, '小小学习乐园');
    assert.equal(manifest.short_name, '学习乐园');
    assert.ok(manifest.shortcuts.every(shortcut => !shortcut.url.includes('unboxing') && fs.existsSync(path.join(root, shortcut.url))));
    assert.ok(fs.existsSync(path.join(root, 'archive/unboxing.html')));

    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: width === 768 ? 1024 : 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${width}`);
      assert.ok(await page.locator('.subject,.lesson-sound').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().width >= 44 && node.getBoundingClientRect().height >= 44)));
      assert.ok(await page.locator('.lesson-info').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth)));
      await page.screenshot({ path: path.join(screenshots, `home-${width}.png`), fullPage: true });
    }
    // Corrupt optional hub history must not affect access to lessons or old data.
    await page.evaluate(() => { localStorage.setItem('little-learning-hub-v1', '{broken'); });
    await page.reload();
    assert.equal(await page.locator('.lesson-card').count(), 8);
    assert.equal(await page.locator('#resume').isVisible(), false);
    await page.locator('#mute').click();
    await page.reload();
    assert.equal(await page.locator('#mute').getAttribute('aria-pressed'), 'true');
    await page.locator('.lesson-sound').first().click();
    assert.equal(await page.locator('#voiceStatus').innerText(), '首页声音已关闭');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ result: 'PASS', lessons: lessons.length, screenshots }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
