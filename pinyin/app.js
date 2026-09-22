(function () {
  'use strict';

  const { groups, letters, audioNames, toneLetters, strokesFor } = window.PinyinData;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const storageKey = 'pinyin-classroom-v1';
  const validItems = Object.keys(audioNames);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
  const cleanList = list => Array.isArray(list) ? list.filter(value => validItems.includes(value)) : [];
  const progress = {
    heard: new Set(cleanList(saved.heard)),
    written: new Set(cleanList(saved.written)),
    stars: Number.isSafeInteger(saved.stars) && saved.stars >= 0 ? saved.stars : 0
  };
  const state = { mode: 'learn', group: groups.some(group => group.id === saved.group) ? saved.group : 'vowels', page: 0, item: 'a', tone: 0, muted: saved.muted === true };
  let paths = [];
  let animation = null;
  let frame = 0;
  let completed = 0;
  let drawing = null;
  let traceGuide = null;
  let quiz = null;
  let audioToken = 0;
  let retry = null;
  let feedbackTimer = 0;
  let audioContext = null;
  const player = new Audio();
  player.preload = 'auto';

  function icons(root = document) {
    if (window.lucide) window.lucide.createIcons({ root });
  }

  function iconButton(button, name, label) {
    button.innerHTML = `<i data-lucide="${name}"></i>`;
    button.setAttribute('aria-label', label);
    button.dataset.tip = label;
    icons(button);
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ heard: [...progress.heard], written: [...progress.written], stars: progress.stars, group: state.group, muted: state.muted }));
    } catch (_) {}
    $('stars').textContent = progress.stars;
  }

  function group() { return groups.find(item => item.id === state.group); }
  function pageItems() { return group().lessons[state.page].split(' '); }
  function groupItems() { return group().lessons.flatMap(lesson => lesson.split(' ')); }
  function label(item = state.item, tone = state.tone) { return tone && toneLetters[item] ? [...toneLetters[item]][tone - 1] : item; }
  function svgNode(tag, attributes = {}) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }
  function makePath(stroke) {
    return svgNode('path', { d: stroke.d, transform: `translate(${stroke.x} ${stroke.y})`, class: 'glyph-path' });
  }

  function glyph(item, tone = 0) {
    const width = [...item].reduce((sum, char) => sum + letters[char].width, 0) + (item.length - 1) * 12;
    const top = /[bdfhklt]/.test(item) || (tone && item === 'ü') ? 30 : /[ijü]/.test(item) || tone ? 55 : 100;
    const bottom = /[gpqjy]/.test(item) ? 273 : 204;
    const svg = svgNode('svg', { viewBox: `${(640 - width) / 2 - 9} ${top - 10} ${width + 18} ${bottom - top + 20}`, 'aria-hidden': 'true', focusable: 'false' });
    strokesFor(item, tone).forEach(stroke => svg.append(makePath(stroke)));
    return svg;
  }

  function feedback(message = '') {
    clearTimeout(feedbackTimer);
    $('feedback').textContent = message;
  }

  function stopAudio() {
    audioToken++;
    player.onended = null;
    player.onerror = null;
    player.onplaying = null;
    player.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    document.querySelectorAll('.playing').forEach(node => node.classList.remove('playing'));
  }

  function audioFailure(message) {
    $('audioErrorText').textContent = message;
    $('audioError').hidden = false;
    document.querySelectorAll('.playing').forEach(node => node.classList.remove('playing'));
  }

  function playSound(item = state.item, tone = state.tone, onEnd) {
    stopAudio();
    const token = audioToken;
    retry = () => playSound(item, tone, onEnd);
    $('audioError').hidden = true;
    if (state.muted) {
      audioFailure('声音已关闭');
      return;
    }
    const name = tone && toneLetters[item] ? audioNames[item].replace(/1$/, String(tone)) : audioNames[item];
    player.src = `audio/${name}.mp3`;
    player.playbackRate = 1;
    player.onplaying = () => {
      if (token !== audioToken) return;
      $(state.mode === 'quiz' ? 'quizSound' : 'sound').classList.add('playing');
      if (state.mode === 'quiz' && quiz && !quiz.solved) {
        quiz.heard = true;
        document.querySelectorAll('.answer').forEach(button => { button.disabled = false; });
      }
    };
    player.onended = () => {
      if (token !== audioToken) return;
      document.querySelectorAll('.playing').forEach(node => node.classList.remove('playing'));
      if (state.mode !== 'quiz') {
        progress.heard.add(item);
        save();
        renderShelf();
      }
      if (onEnd) onEnd();
    };
    player.onerror = () => { if (token === audioToken) audioFailure('声音没有加载成功，请再试一次'); };
    const playPromise = player.play();
    if (playPromise) playPromise.catch(error => {
      if (token === audioToken && error.name !== 'AbortError') audioFailure('点一下，重新播放声音');
    });
  }

  // Only Mandarin voices speak instructions. Pinyin always uses bundled recordings.
  function prompt(message) {
    stopAudio();
    if (state.muted || !('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => /^zh[-_](CN|Hans)/i.test(v.lang)) || voices.find(v => v.lang === 'zh');
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN';
    utterance.voice = voice;
    utterance.rate = .85;
    speechSynthesis.speak(utterance);
  }

  function chime() {
    if (state.muted) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume();
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const time = audioContext.currentTime + index * .1;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(.06, time + .02);
        gain.gain.exponentialRampToValueAtTime(.001, time + .24);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(time);
        oscillator.stop(time + .25);
      });
    } catch (_) {}
  }

  function updateMute() {
    iconButton($('mute'), state.muted ? 'volume-x' : 'volume-2', state.muted ? '打开声音' : '关闭声音');
    $('mute').setAttribute('aria-pressed', String(state.muted));
    save();
  }

  function renderCategories() {
    $('categories').replaceChildren();
    groups.forEach(item => {
      const button = document.createElement('button');
      button.className = `category${item.id === state.group ? ' active' : ''}`;
      button.dataset.group = item.id;
      button.setAttribute('aria-pressed', String(item.id === state.group));
      button.innerHTML = `<strong>${item.preview}</strong><span>${item.label}</span>`;
      button.onclick = () => {
        stopActivity();
        state.group = item.id;
        state.page = 0;
        state.tone = 0;
        state.item = pageItems()[0];
        save();
        renderCategories();
        if (state.mode === 'quiz') startQuiz();
        else { renderLearning(); playSound(); if (state.mode === 'learn') startAnimation(); }
      };
      $('categories').append(button);
    });
  }

  function renderShelf() {
    const items = pageItems();
    $('letters').style.setProperty('--tile-count', items.length);
    document.querySelector('.shelf-heading').hidden = group().lessons.length === 1;
    $('letters').replaceChildren();
    items.forEach(item => {
      const button = document.createElement('button');
      button.className = `letter-tile${item === state.item ? ' active' : ''}`;
      button.dataset.item = item;
      button.setAttribute('aria-label', `学习 ${item}`);
      button.setAttribute('aria-pressed', String(item === state.item));
      button.append(glyph(item));
      if (progress.heard.has(item)) {
        const mark = document.createElement('span');
        mark.className = 'heard-mark';
        mark.innerHTML = '<i data-lucide="check"></i>';
        button.append(mark);
      }
      button.onclick = () => selectItem(item);
      $('letters').append(button);
    });
    $('pageLabel').textContent = `${state.page + 1} / ${group().lessons.length}`;
    $('previousPage').disabled = state.page === 0;
    $('nextPage').disabled = state.page === group().lessons.length - 1;
    $('position').textContent = `${groupItems().indexOf(state.item) + 1} / ${groupItems().length}`;
    $('previous').disabled = groupItems().indexOf(state.item) === 0;
    $('next').disabled = groupItems().indexOf(state.item) === groupItems().length - 1;
    const heard = groupItems().filter(item => progress.heard.has(item)).length;
    $('learned').innerHTML = `<i data-lucide="ear"></i> ${heard} / ${groupItems().length}`;
    $('learned').setAttribute('aria-label', `已听过 ${heard} 个，共 ${groupItems().length} 个`);
    $('progressFill').style.width = `${heard / groupItems().length * 100}%`;
    icons();
  }

  function renderTones() {
    $('tones').replaceChildren();
    $('tones').hidden = !toneLetters[state.item];
    if (!toneLetters[state.item]) return;
    for (let tone = 1; tone <= 4; tone++) {
      const button = document.createElement('button');
      button.className = `tone-button${state.tone === tone ? ' active' : ''}`;
      button.setAttribute('aria-label', `第${tone}声 ${label(state.item, tone)}`);
      button.setAttribute('aria-pressed', String(state.tone === tone));
      button.dataset.tone = tone;
      button.append(glyph(state.item, tone));
      const name = document.createElement('span');
      name.textContent = `${tone} 声`;
      button.append(name);
      button.onclick = () => {
        stopActivity();
        state.tone = state.tone === tone ? 0 : tone;
        renderLearning();
        playSound();
        if (state.mode === 'learn') startAnimation();
      };
      $('tones').append(button);
    }
  }

  function renderBoard() {
    stopAnimation();
    drawing = null;
    traceGuide = null;
    completed = 0;
    $('boardCelebration').hidden = true;
    $('ghost').replaceChildren();
    $('ink').replaceChildren();
    $('traceInk').replaceChildren();
    const strokes = strokesFor(state.item, state.tone);
    const glyphWidth = [...state.item].reduce((sum, char) => sum + letters[char].width, 0) + (state.item.length - 1) * 12;
    const boardWidth = Math.max(340, glyphWidth + 80);
    $('board').setAttribute('viewBox', `${(640 - boardWidth) / 2} 20 ${boardWidth} 270`);
    paths = strokes.map(stroke => {
      $('ghost').append(makePath(stroke));
      const path = makePath(stroke);
      $('ink').append(path);
      const length = path.getTotalLength();
      path.style.strokeDasharray = length;
      path.style.strokeDashoffset = length;
      return { ...stroke, path, length };
    });
    $('board').setAttribute('aria-label', `${label()} 的笔顺，共 ${paths.length} 笔`);
    $('board').classList.toggle('tracing', state.mode === 'write');
    $('strokeSteps').replaceChildren();
    paths.forEach((_, index) => {
      const button = document.createElement('button');
      button.className = 'stroke-step';
      button.textContent = index + 1;
      button.setAttribute('aria-label', `演示第 ${index + 1} 笔`);
      button.onclick = () => startAnimation(index, true);
      $('strokeSteps').append(button);
    });
    if (state.mode === 'write') updateTrace();
    else {
      paths.forEach(item => { item.path.style.strokeDashoffset = 0; });
      $('strokeStatus').textContent = `共 ${paths.length} 笔`;
    }
  }

  function renderLearning() {
    $('groupLabel').textContent = group().label;
    $('lessonLabel').textContent = group().lessons[state.page];
    $('undo').hidden = state.mode !== 'write';
    $('clear').hidden = state.mode !== 'write';
    feedback();
    renderBoard();
    renderShelf();
    renderTones();
  }

  function selectItem(item) {
    stopActivity();
    state.item = item;
    state.tone = 0;
    renderLearning();
    playSound();
    if (state.mode === 'learn') startAnimation();
  }

  function selectOffset(offset) {
    const index = groupItems().indexOf(state.item) + offset;
    const item = groupItems()[index];
    if (!item) return;
    state.page = group().lessons.findIndex(lesson => lesson.split(' ').includes(item));
    selectItem(item);
  }

  function stepState(index, count) {
    [...$('strokeSteps').children].forEach((button, position) => {
      button.classList.toggle('active', position === index);
      button.classList.toggle('done', position < count);
    });
  }

  function stopAnimation() {
    cancelAnimationFrame(frame);
    animation = null;
    $('pencil').style.display = 'none';
    iconButton($('play'), 'play', '播放笔顺动画');
  }

  function startAnimation(index = 0, single = false) {
    stopAnimation();
    drawing = null;
    $('traceInk').replaceChildren();
    $('startDot').style.display = 'none';
    $('boardCelebration').hidden = true;
    paths.forEach((item, position) => { item.path.style.strokeDashoffset = position < index ? 0 : item.length; });
    animation = { index, single, started: null, paused: false, elapsed: 0 };
    iconButton($('play'), 'pause', '暂停笔顺动画');
    $('pencil').style.display = '';
    frame = requestAnimationFrame(animate);
  }

  function animate(now) {
    if (!animation || animation.paused) return;
    if (animation.started === null) animation.started = now - animation.elapsed;
    const item = paths[animation.index];
    const duration = Math.max(650, Math.min(1600, item.length * 6)) * ($('slow').checked ? 1.5 : 1);
    animation.elapsed = now - animation.started;
    const fraction = Math.min(1, animation.elapsed / duration);
    item.path.style.strokeDashoffset = item.length * (1 - fraction);
    const point = item.path.getPointAtLength(item.length * fraction);
    $('pencil').setAttribute('transform', `translate(${item.x + point.x} ${item.y + point.y})`);
    $('strokeStatus').textContent = `第 ${animation.index + 1} 笔 / 共 ${paths.length} 笔`;
    stepState(animation.index, animation.index);
    if (animation.elapsed >= duration + 450) {
      if (animation.single || animation.index === paths.length - 1) {
        const lastIndex = animation.index;
        const single = animation.single;
        stopAnimation();
        if (state.mode === 'write') updateTrace();
        else {
          stepState(-1, single ? lastIndex + 1 : paths.length);
          $('strokeStatus').textContent = single ? `第 ${lastIndex + 1} 笔 / 共 ${paths.length} 笔` : `写好啦 · ${paths.length} 笔`;
        }
        return;
      }
      animation.index++;
      animation.started = null;
      animation.elapsed = 0;
    }
    frame = requestAnimationFrame(animate);
  }

  function toggleAnimation() {
    if (!animation) { startAnimation(); return; }
    animation.paused = !animation.paused;
    if (animation.paused) {
      cancelAnimationFrame(frame);
      iconButton($('play'), 'play', '继续笔顺动画');
    } else {
      animation.started = null;
      iconButton($('play'), 'pause', '暂停笔顺动画');
      frame = requestAnimationFrame(animate);
    }
  }

  function updateTrace() {
    $('traceInk').replaceChildren();
    paths.forEach((item, index) => { item.path.style.strokeDashoffset = index < completed ? 0 : item.length; });
    $('undo').disabled = completed === 0;
    stepState(completed, completed);
    traceGuide = null;
    if (completed === paths.length) {
      $('startDot').style.display = 'none';
      $('strokeStatus').textContent = '写好啦！';
      $('boardCelebration').hidden = false;
      return;
    }
    const item = paths[completed];
    const count = Math.max(1, Math.ceil(item.length / 4));
    traceGuide = Array.from({ length: count + 1 }, (_, index) => {
      const point = item.path.getPointAtLength(item.length * index / count);
      return { x: point.x + item.x, y: point.y + item.y };
    });
    const first = traceGuide[0];
    $('startDot').style.display = '';
    $('startDot').setAttribute('transform', `translate(${first.x} ${first.y})`);
    $('startDot').querySelector('text').textContent = completed + 1;
    $('strokeStatus').textContent = `第 ${completed + 1} 笔 / 共 ${paths.length} 笔`;
  }

  function pointerPosition(event) {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform($('board').getScreenCTM().inverse());
  }
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function beginTrace(event) {
    if (state.mode !== 'write' || animation || drawing || !traceGuide || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const point = pointerPosition(event);
    if (distance(point, traceGuide[0]) > 25) {
      feedback('从小圆点开始');
      prompt('从小圆点开始，慢慢写。');
      return;
    }
    event.preventDefault();
    $('board').setPointerCapture(event.pointerId);
    const path = svgNode('path', { class: 'glyph-path', d: `M${point.x} ${point.y}` });
    $('traceInk').append(path);
    drawing = { pointer: event.pointerId, point, path, d: `M${point.x} ${point.y}`, reached: 0, travelled: 0, offPath: 0 };
    feedback();
  }

  function moveTrace(event) {
    if (!drawing || drawing.pointer !== event.pointerId) return;
    event.preventDefault();
    const point = pointerPosition(event);
    const segment = distance(point, drawing.point);
    // Visit interpolated points so fast fingers cannot jump over an entire stroke.
    const samples = Math.max(1, Math.ceil(segment / 5));
    for (let sample = 1; sample <= samples; sample++) {
      const next = { x: drawing.point.x + (point.x - drawing.point.x) * sample / samples, y: drawing.point.y + (point.y - drawing.point.y) * sample / samples };
      let closest = drawing.reached;
      let closestDistance = Infinity;
      const start = Math.max(0, drawing.reached - 3);
      const end = Math.min(traceGuide.length - 1, drawing.reached + 9);
      for (let index = start; index <= end; index++) {
        const value = distance(next, traceGuide[index]);
        if (value < closestDistance) { closestDistance = value; closest = index; }
      }
      if (closestDistance <= 22) drawing.reached = Math.max(drawing.reached, closest);
      else drawing.offPath += segment / samples;
    }
    drawing.travelled += segment;
    drawing.point = point;
    drawing.d += ` L${point.x} ${point.y}`;
    drawing.path.setAttribute('d', drawing.d);
  }

  function endTrace(event) {
    if (!drawing || drawing.pointer !== event.pointerId) return;
    if (event.type === 'pointerup') moveTrace(event);
    const item = paths[completed];
    const isDot = item.length < 2;
    const accepted = event.type === 'pointerup' && drawing.offPath < Math.max(20, item.length * .22) &&
      (isDot ? drawing.travelled < 24 : drawing.reached >= (traceGuide.length - 1) * .88 && drawing.travelled >= item.length * .63 && drawing.travelled <= item.length * 2.5 && distance(drawing.point, traceGuide.at(-1)) < 26);
    drawing = null;
    if ($('board').hasPointerCapture(event.pointerId)) $('board').releasePointerCapture(event.pointerId);
    if (accepted) {
      completed++;
      updateTrace();
      if (completed === paths.length) {
        if (!progress.written.has(state.item)) { progress.written.add(state.item); progress.stars++; save(); }
        feedback('写得真棒！');
        chime();
      }
    } else {
      updateTrace();
      if (event.type === 'pointerup') { feedback('再试一次，慢慢来'); prompt('没关系，再试一次。'); }
    }
  }

  function stopActivity() {
    stopAudio();
    stopAnimation();
    drawing = null;
    clearTimeout(feedbackTimer);
    $('audioError').hidden = true;
  }

  function changeMode(mode) {
    stopActivity();
    state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    $('learning').hidden = mode === 'quiz';
    $('quiz').hidden = mode !== 'quiz';
    if (mode === 'quiz') startQuiz();
    else {
      quiz = null;
      renderLearning();
      if (mode === 'write') prompt('从小圆点开始，沿着拼音慢慢写。写错了可以退回一笔。');
      else { playSound(); startAnimation(); }
    }
  }

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function startQuiz() {
    stopActivity();
    const pool = groupItems();
    const sequence = [];
    while (sequence.length < 5) {
      const batch = shuffle(pool);
      if (batch[0] === sequence.at(-1)) batch.reverse();
      sequence.push(...batch);
    }
    quiz = { sequence: sequence.slice(0, 5), index: 0, solved: false, heard: false, firstTry: 0, attempts: 0 };
    $('quizResult').hidden = true;
    $('quizSound').hidden = false;
    $('answers').hidden = false;
    $('quizFeedback').hidden = false;
    nextQuestion();
  }

  function nextQuestion() {
    stopAudio();
    if (!quiz) return;
    quiz.solved = false;
    quiz.heard = false;
    quiz.attempts = 0;
    quiz.answer = quiz.sequence[quiz.index];
    $('quizNext').hidden = true;
    $('quizFeedback').textContent = '';
    $('answers').replaceChildren();
    renderDots();
    const alternatives = shuffle(groupItems()).filter(item => audioNames[item] !== audioNames[quiz.answer]);
    // y/w need a third, distinct sound. Do not offer i/y or u/w together.
    if (alternatives.length < 2) alternatives.push(...shuffle(['a', 'o', 'e']).slice(0, 2 - alternatives.length));
    shuffle([quiz.answer, ...alternatives.slice(0, 2)]).forEach(item => {
      const button = document.createElement('button');
      button.className = 'answer';
      button.dataset.answer = item;
      button.setAttribute('aria-label', `选择 ${item}`);
      button.append(glyph(item));
      button.disabled = true;
      button.onclick = () => checkAnswer(item, button);
      $('answers').append(button);
    });
    playSound(quiz.answer, 0);
  }

  function renderDots() {
    $('roundDots').innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < quiz.index || (i === quiz.index && quiz.solved) ? 'done' : i === quiz.index ? 'current' : ''}"></span>`).join('');
    $('roundDots').setAttribute('aria-label', `第 ${Math.min(5, quiz.index + 1)} 题，共 5 题`);
  }

  function checkAnswer(item, button) {
    if (!quiz || quiz.solved || !quiz.heard) return;
    quiz.attempts++;
    if (item !== quiz.answer) {
      button.classList.remove('wrong');
      void button.offsetWidth;
      button.classList.add('wrong');
      $('quizFeedback').textContent = '再听一次，你可以的';
      playSound(quiz.answer, 0);
      return;
    }
    stopAudio();
    quiz.solved = true;
    if (quiz.attempts === 1) quiz.firstTry++;
    progress.stars++;
    progress.heard.add(item);
    save();
    button.classList.add('correct');
    document.querySelectorAll('.answer').forEach(answer => {
      answer.disabled = true;
      answer.classList.toggle('dimmed', answer !== button);
    });
    $('quizFeedback').textContent = '找对啦！';
    $('quizNext').hidden = false;
    iconButton($('quizNext'), quiz.index === 4 ? 'flag' : 'arrow-right', quiz.index === 4 ? '完成练习' : '下一题');
    renderDots();
    chime();
  }

  function finishQuiz() {
    stopAudio();
    $('quizSound').hidden = true;
    $('answers').hidden = true;
    $('quizNext').hidden = true;
    $('quizFeedback').hidden = true;
    $('quizResult').hidden = false;
    $('resultText').textContent = `收集了 5 颗星星`;
    prompt('太棒了！五道题都完成了。休息一下，也可以再玩一次。');
  }

  $('board').addEventListener('pointerdown', beginTrace);
  $('board').addEventListener('pointermove', moveTrace);
  $('board').addEventListener('pointerup', endTrace);
  $('board').addEventListener('pointercancel', endTrace);
  $('board').addEventListener('lostpointercapture', event => {
    if (drawing && drawing.pointer === event.pointerId) { drawing = null; updateTrace(); }
  });
  document.querySelectorAll('[data-mode]').forEach(button => { button.onclick = () => changeMode(button.dataset.mode); });
  $('sound').onclick = () => playSound();
  $('play').onclick = toggleAnimation;
  $('replay').onclick = () => startAnimation();
  $('undo').onclick = () => { stopAnimation(); drawing = null; completed = Math.max(0, completed - 1); $('boardCelebration').hidden = true; feedback(); updateTrace(); };
  $('clear').onclick = () => { stopAnimation(); drawing = null; completed = 0; $('boardCelebration').hidden = true; feedback(); updateTrace(); };
  $('previous').onclick = () => selectOffset(-1);
  $('next').onclick = () => selectOffset(1);
  $('previousPage').onclick = () => { if (state.page > 0) { state.page--; selectItem(pageItems()[0]); } };
  $('nextPage').onclick = () => { if (state.page < group().lessons.length - 1) { state.page++; selectItem(pageItems()[0]); } };
  $('quizSound').onclick = () => { if (quiz) playSound(quiz.answer, 0); };
  $('quizNext').onclick = () => { if (!quiz || !quiz.solved) return; quiz.index++; if (quiz.index === 5) finishQuiz(); else nextQuestion(); };
  $('again').onclick = startQuiz;
  $('help').onclick = () => prompt(state.mode === 'write' ? '从小圆点开始，沿着拼音慢慢写。' : state.mode === 'quiz' ? '听一听，找出刚才听到的拼音。' : '点一个拼音，听一听，跟着读。小铅笔会教你怎么写。');
  $('mute').onclick = () => { state.muted = !state.muted; stopAudio(); updateMute(); if (!state.muted && state.mode === 'quiz' && quiz && quiz.index < 5) playSound(quiz.answer, 0); };
  $('retryAudio').onclick = () => { if (state.muted) { state.muted = false; updateMute(); } if (retry) retry(); };
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    stopAudio();
    if (animation && !animation.paused) toggleAnimation();
    if (drawing) { drawing = null; updateTrace(); }
  });
  window.addEventListener('pagehide', stopActivity);
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  state.item = pageItems()[0];
  renderCategories();
  renderLearning();
  updateMute();
  icons();
})();
