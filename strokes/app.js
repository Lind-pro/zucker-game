(function () {
  'use strict';
  const { items, groups } = window.StrokeLessons;
  const $ = id => document.getElementById(id);
  const storageKey = 'hanzi-strokes-classroom-v1';
  const NS = 'http://www.w3.org/2000/svg';
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) {}
  const clean = value => new Set(Array.isArray(value) ? value.filter(id => items[id]) : []);
  const progress = { heard: clean(saved.heard), written: clean(saved.written), stars: Number.isSafeInteger(saved.stars) && saved.stars >= 0 ? saved.stars : 0 };
  const state = { mode: 'learn', group: groups.some(group => group.id === saved.group) ? saved.group : 'basic', page: 0, id: 'heng', muted: saved.muted === true };
  let boardEpoch = 0, demoEpoch = 0, soundEpoch = 0;
  let ready = false, completed = 0, animation = null, quiz = null;
  let audioDone = null, retry = null, audioContext = null;
  const player = new Audio();
  player.preload = 'auto';
  const group = () => groups.find(item => item.id === state.group);
  const pageIds = () => group().lessons[state.page];
  const groupIds = () => group().lessons.flat();
  const item = () => items[state.id];
  const shape = id => items[id].kind === 'stroke' ? window.StrokeShapes[id] : window.StrokeCharacters[items[id].source];
  const size = () => $('board').clientWidth;
  const padding = 16;

  function icons() { window.lucide.createIcons(); }
  function buttonIcon(id, name, text) {
    $(id).innerHTML = `<i data-lucide="${name}"></i>`;
    $(id).setAttribute('aria-label', text);
    $(id).dataset.tip = text;
    icons();
  }
  function save() {
    $('stars').textContent = progress.stars;
    try { localStorage.setItem(storageKey, JSON.stringify({ heard: [...progress.heard], written: [...progress.written], stars: progress.stars, group: state.group, muted: state.muted })); } catch (_) {}
  }
  function svg(tag, attrs = {}) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
    return node;
  }
  function glyph(id) {
    const root = svg('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
    const paths = svg('g', { transform: HanziWriter.getScalingTransform(100, 100, 5).transform, fill: 'currentColor' });
    shape(id).strokes.forEach(d => paths.append(svg('path', { d })));
    root.append(paths);
    return root;
  }
  function message(text = '') { $('feedback').textContent = text; }

  function stopSound() {
    soundEpoch++;
    player.onended = player.onerror = player.onplaying = null;
    player.pause();
    if (audioDone) { const done = audioDone; audioDone = null; done(false); }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    document.querySelectorAll('.playing').forEach(node => node.classList.remove('playing'));
  }
  function soundError(text) {
    $('audioErrorText').textContent = text;
    $('audioError').hidden = false;
    document.querySelectorAll('.playing').forEach(node => node.classList.remove('playing'));
  }
  function playSound(id = state.id, options = {}) {
    stopSound();
    const epoch = soundEpoch;
    const question = quiz;
    const questionIndex = question?.index;
    if (!options.quiet) retry = () => playSound(id, options);
    $('audioError').hidden = true;
    if (state.muted) {
      if (!options.quiet) soundError('声音已关闭');
      return Promise.resolve(false);
    }
    return new Promise(resolve => {
      audioDone = resolve;
      const finish = success => {
        if (epoch !== soundEpoch) return;
        document.querySelectorAll('.playing').forEach(node => node.classList.remove('playing'));
        audioDone = null;
        if (success && options.mark) { progress.heard.add(id); save(); renderShelf(); }
        resolve(success);
      };
      player.src = `audio/${id}.mp3`;
      player.onplaying = () => {
        if (epoch !== soundEpoch) return;
        $(state.mode === 'quiz' ? 'quizSound' : 'sound').classList.add('playing');
        if (options.question && quiz === question && quiz.index === questionIndex && !quiz.solved) {
          quiz.heard = true;
          document.querySelectorAll('.answer').forEach(button => { button.disabled = false; });
        }
      };
      player.onended = () => finish(true);
      player.onerror = () => { if (epoch === soundEpoch) { soundError('声音没有加载成功，请再试一次'); finish(false); } };
      const result = player.play();
      if (result) result.catch(error => {
        if (epoch === soundEpoch && error.name !== 'AbortError') { soundError('点一下，重新播放声音'); finish(false); }
      });
    });
  }
  function prompt(text) {
    stopSound();
    if (state.muted || !('speechSynthesis' in window)) return;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => /^zh[-_](CN|Hans)/i.test(v.lang)) || voices.find(v => v.lang === 'zh');
    if (!voice) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN'; utterance.voice = voice; utterance.rate = .85;
    speechSynthesis.speak(utterance);
  }
  function chime() {
    if (state.muted) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContext.resume().catch(() => {});
      [523.25, 659.25, 783.99].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
        const time = audioContext.currentTime + index * .1;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.001, time);
        gain.gain.linearRampToValueAtTime(.055, time + .02);
        gain.gain.exponentialRampToValueAtTime(.001, time + .25);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(time); oscillator.stop(time + .26);
      });
    } catch (_) {}
  }
  function updateMute() {
    buttonIcon('mute', state.muted ? 'volume-x' : 'volume-2', state.muted ? '打开声音' : '关闭声音');
    $('mute').setAttribute('aria-pressed', state.muted);
    save();
  }

  const writer = new HanziWriter('writerHost', {
    width: size(), height: size(), padding,
    charDataLoader: id => shape(id),
    showCharacter: true, showOutline: true,
    strokeColor: '#ac4054', outlineColor: '#ecdee3', drawingColor: '#268577', highlightColor: '#268577',
    strokeFadeDuration: 0, drawingFadeDuration: 120,
    strokeAnimationSpeed: .55, highlightOnComplete: false,
    showHintAfterMisses: 2, markStrokeCorrectAfterMisses: false, acceptBackwardsStrokes: false, leniency: 1.15
  });

  function stopDemo() {
    demoEpoch++;
    if (animation?.wake) animation.wake();
    animation = null;
    writer.cancelQuiz();
    if (ready) { writer.resumeAnimation(); writer.hideCharacter({ duration: 0 }); }
    buttonIcon('play', 'play', '播放笔顺动画');
    $('writerHost').classList.remove('tracing');
    $('startDot').hidden = true;
  }
  function stopActivity() {
    boardEpoch++;
    stopSound(); stopDemo();
    $('audioError').hidden = true;
  }
  function updateSteps(active, count) {
    [...$('strokeSteps').children].forEach((button, index) => {
      button.classList.toggle('active', index === active);
      button.classList.toggle('done', index < count);
    });
  }
  function updateTraceView() {
    const count = item().names.length;
    $('board').dataset.completed = completed;
    $('undo').disabled = !ready || completed === 0;
    updateSteps(completed, completed);
    const done = completed === count;
    $('boardCelebration').hidden = !done;
    $('startDot').hidden = done || state.mode !== 'write' || !!animation;
    if (done) { $('strokeStatus').textContent = '写好啦！'; return; }
    const [x, y] = shape(state.id).medians[completed][0];
    const transform = HanziWriter.getScalingTransform(size(), size(), padding);
    $('startDot').style.left = `${transform.x + x * transform.scale}px`;
    $('startDot').style.top = `${size() - transform.y - y * transform.scale}px`;
    $('startDot').textContent = completed + 1;
    $('strokeStatus').textContent = `第 ${completed + 1} 笔 · ${items[item().names[completed]].name}`;
  }
  async function beginTrace() {
    if (!ready || state.mode !== 'write') return;
    const epoch = boardEpoch;
    writer.cancelQuiz();
    $('writerHost').classList.add('tracing');
    updateTraceView();
    if (completed === item().names.length) { await writer.showCharacter({ duration: 0 }); return; }
    await writer.quiz({
      quizStartStrokeNum: completed,
      onMistake: () => {
        if (epoch !== boardEpoch || animation || state.mode !== 'write') return;
        message('慢慢来，再试一次');
        prompt('没关系，从小圆点开始，再试一次。');
      },
      onCorrectStroke: data => {
        if (epoch !== boardEpoch || animation || state.mode !== 'write') return;
        completed = data.strokeNum + 1;
        message(); updateTraceView();
      },
      onComplete: () => {
        if (epoch !== boardEpoch || animation || state.mode !== 'write') return;
        completed = item().names.length;
        updateTraceView(); message('写得真棒！');
        if (!progress.written.has(state.id)) { progress.written.add(state.id); progress.stars++; save(); }
        chime();
      }
    });
  }

  async function startAnimation(start = 0, single = false) {
    if (!ready || state.mode === 'quiz') return;
    stopSound(); stopDemo();
    const run = { token: demoEpoch, index: start, paused: false, wake: null };
    animation = run;
    $('boardCelebration').hidden = true;
    buttonIcon('play', 'pause', '暂停笔顺动画');
    // quizStartStrokeNum restores preceding strokes; quiz options also set speed.
    await writer.quiz({ quizStartStrokeNum: start, strokeAnimationSpeed: $('slow').checked ? .55 : 1 });
    if (run.token !== demoEpoch) return;
    writer.cancelQuiz();
    const end = single ? start + 1 : item().names.length;
    for (let index = start; index < end; index++) {
      if (run.token !== demoEpoch) return;
      if (run.paused) await new Promise(resolve => { run.wake = resolve; });
      if (run.token !== demoEpoch) return;
      run.index = index;
      const strokeId = item().names[index];
      $('strokeStatus').textContent = `第 ${index + 1} 笔 · ${items[strokeId].name}`;
      updateSteps(index, index);
      await Promise.all([writer.animateStroke(index), playSound(strokeId, { quiet: true })]);
    }
    if (run.token !== demoEpoch) return;
    animation = null;
    buttonIcon('play', 'play', '播放笔顺动画');
    if (state.mode === 'write') await beginTrace();
    else {
      updateSteps(-1, end);
      $('strokeStatus').textContent = single ? `第 ${start + 1} 笔 · ${items[item().names[start]].name}` : `写好啦 · ${item().names.length} 笔`;
    }
  }
  function toggleAnimation() {
    if (!animation) { startAnimation(); return; }
    animation.paused = !animation.paused;
    if (animation.paused) {
      writer.pauseAnimation(); player.pause();
      buttonIcon('play', 'play', '继续笔顺动画');
    } else {
      writer.resumeAnimation();
      if (player.src && !player.ended && !state.muted && audioDone) player.play().catch(() => { soundError('点一下，重新播放声音'); stopSound(); });
      if (animation.wake) { animation.wake(); animation.wake = null; }
      buttonIcon('play', 'pause', '暂停笔顺动画');
    }
  }

  function renderCategories() {
    $('categories').replaceChildren();
    groups.forEach(entry => {
      const button = document.createElement('button');
      button.className = `category${entry.id === state.group ? ' active' : ''}`;
      button.dataset.group = entry.id;
      button.setAttribute('aria-pressed', entry.id === state.group);
      button.innerHTML = `<strong>${entry.preview}</strong><span>${entry.label}</span>`;
      button.onclick = () => {
        state.group = entry.id; state.page = 0;
        save(); renderCategories();
        if (state.mode === 'quiz') { state.id = pageIds()[0]; startQuiz(); }
        else select(pageIds()[0]);
      };
      $('categories').append(button);
    });
  }
  function renderShelf() {
    $('letters').replaceChildren();
    $('letters').style.setProperty('--tile-count', pageIds().length);
    document.querySelector('.shelf-heading').hidden = group().lessons.length === 1;
    pageIds().forEach(id => {
      const entry = items[id], button = document.createElement('button');
      button.className = `letter-tile${id === state.id ? ' active' : ''}`;
      button.dataset.item = id;
      button.setAttribute('aria-label', `学习${entry.name}`);
      button.setAttribute('aria-pressed', id === state.id);
      button.append(glyph(id));
      const name = document.createElement('span');
      name.className = 'tile-name'; name.textContent = entry.name;
      button.append(name);
      if (progress.heard.has(id)) {
        const mark = document.createElement('span');
        mark.className = 'heard-mark'; mark.innerHTML = '<i data-lucide="check"></i>';
        button.append(mark);
      }
      button.onclick = () => select(id);
      $('letters').append(button);
    });
    const all = groupIds(), index = all.indexOf(state.id), heard = all.filter(id => progress.heard.has(id)).length;
    $('pageLabel').textContent = `${state.page + 1} / ${group().lessons.length}`;
    $('previousPage').disabled = state.page === 0;
    $('nextPage').disabled = state.page === group().lessons.length - 1;
    $('previous').disabled = index <= 0;
    $('next').disabled = index >= all.length - 1;
    $('position').textContent = `${index + 1} / ${all.length}`;
    $('learned').innerHTML = `<i data-lucide="ear"></i>${heard} / ${all.length}`;
    $('learned').setAttribute('aria-label', `已听过 ${heard} 个，共 ${all.length} 个`);
    $('progressFill').style.width = `${heard / all.length * 100}%`;
    icons();
  }
  async function renderLearning() {
    const epoch = ++boardEpoch;
    ready = false; completed = 0;
    $('board').dataset.ready = 'false'; $('board').dataset.completed = '0'; $('board').dataset.item = state.id;
    $('board').setAttribute('aria-label', `${item().name}的笔顺，共${item().names.length}笔`);
    ['play', 'replay', 'undo', 'clear'].forEach(id => { $(id).disabled = true; });
    $('undo').hidden = $('clear').hidden = state.mode !== 'write';
    $('boardCelebration').hidden = true;
    $('groupLabel').textContent = group().label;
    $('lessonLabel').replaceChildren(document.createTextNode(item().name + ' '));
    const pronunciation = document.createElement('span');
    pronunciation.id = 'pinyinLabel'; pronunciation.textContent = item().pinyin;
    $('lessonLabel').append(pronunciation);
    $('strokeStatus').textContent = `共 ${item().names.length} 笔`;
    $('strokeSteps').replaceChildren();
    item().names.forEach((stroke, index) => {
      const button = document.createElement('button');
      button.className = 'stroke-step'; button.textContent = index + 1;
      button.setAttribute('aria-label', `演示第${index + 1}笔${items[stroke].name}`);
      button.onclick = () => startAnimation(index, true);
      $('strokeSteps').append(button);
    });
    message(); renderShelf();
    writer.updateDimensions({ width: size(), height: size(), padding });
    await writer.setCharacter(state.id);
    if (epoch !== boardEpoch || state.mode === 'quiz') return;
    ready = true;
    $('board').dataset.ready = 'true';
    ['play', 'replay', 'clear'].forEach(id => { $(id).disabled = false; });
    if (state.mode === 'write') await beginTrace();
    else await writer.showCharacter({ duration: 0 });
  }
  async function select(id, audible = true) {
    stopActivity(); state.id = id;
    const rendered = renderLearning();
    const epoch = boardEpoch;
    const autoEpoch = demoEpoch;
    const spoken = audible ? playSound(id, { mark: true }) : Promise.resolve(false);
    await Promise.all([rendered, spoken]);
    if (epoch === boardEpoch && autoEpoch === demoEpoch && audible && state.mode === 'learn' && !reducedMotion.matches) startAnimation();
  }
  function moveItem(offset) {
    const id = groupIds()[groupIds().indexOf(state.id) + offset];
    if (!id) return;
    state.page = group().lessons.findIndex(lesson => lesson.includes(id)); select(id);
  }
  function changeMode(mode) {
    stopActivity(); state.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active); button.setAttribute('aria-pressed', active);
    });
    $('learning').hidden = mode === 'quiz'; $('quiz').hidden = mode !== 'quiz';
    if (mode === 'quiz') startQuiz();
    else { quiz = null; select(state.id, mode === 'learn'); if (mode === 'write') prompt('从小圆点开始，沿着笔画慢慢写。写错了，可以退回一笔。'); }
  }
  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  function startQuiz() {
    stopActivity();
    quiz = { sequence: shuffle(groupIds()).slice(0, 5), index: 0, solved: false, heard: false };
    $('quizResult').hidden = true;
    $('quizSound').hidden = $('answers').hidden = $('quizFeedback').hidden = false;
    nextQuestion();
  }
  function renderDots() {
    $('roundDots').innerHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < quiz.index || i === quiz.index && quiz.solved ? 'done' : i === quiz.index ? 'current' : ''}"></span>`).join('');
    $('roundDots').setAttribute('aria-label', `第${Math.min(5, quiz.index + 1)}题，共5题`);
  }
  function nextQuestion() {
    quiz.solved = false; quiz.heard = false; quiz.answer = quiz.sequence[quiz.index];
    $('quizNext').hidden = true; $('quizFeedback').textContent = '';
    $('answers').replaceChildren(); renderDots();
    const choices = shuffle([quiz.answer, ...shuffle(groupIds().filter(id => id !== quiz.answer)).slice(0, 2)]);
    choices.forEach(id => {
      const button = document.createElement('button');
      button.className = 'answer'; button.dataset.answer = id; button.disabled = true;
      button.setAttribute('aria-label', `选择${items[id].name}`); button.append(glyph(id));
      button.onclick = () => checkAnswer(id, button);
      $('answers').append(button);
    });
    playSound(quiz.answer, { question: true });
  }
  function checkAnswer(id, button) {
    if (!quiz || !quiz.heard || quiz.solved) return;
    if (id !== quiz.answer) {
      button.classList.remove('wrong'); void button.offsetWidth; button.classList.add('wrong');
      $('quizFeedback').textContent = '再听一次，你可以的'; playSound(quiz.answer, { question: true }); return;
    }
    stopSound(); quiz.solved = true;
    progress.heard.add(id); progress.stars++; save();
    button.classList.add('correct');
    document.querySelectorAll('.answer').forEach(answer => { answer.disabled = true; answer.classList.toggle('dimmed', answer !== button); });
    $('quizFeedback').textContent = '找对啦！'; $('quizNext').hidden = false;
    buttonIcon('quizNext', quiz.index === 4 ? 'flag' : 'arrow-right', quiz.index === 4 ? '完成练习' : '下一题');
    renderDots(); chime();
  }

  document.querySelectorAll('[data-mode]').forEach(button => { button.onclick = () => changeMode(button.dataset.mode); });
  $('play').onclick = toggleAnimation;
  $('replay').onclick = () => startAnimation();
  $('sound').onclick = () => {
    stopDemo();
    if (state.mode === 'write') beginTrace(); else writer.showCharacter({ duration: 0 });
    playSound(state.id, { mark: true });
  };
  $('undo').onclick = () => { stopSound(); stopDemo(); completed = Math.max(0, completed - 1); message(); beginTrace(); };
  $('clear').onclick = () => { stopSound(); stopDemo(); completed = 0; message(); beginTrace(); };
  $('slow').onchange = () => { if (animation) startAnimation(); };
  $('previous').onclick = () => moveItem(-1);
  $('next').onclick = () => moveItem(1);
  $('previousPage').onclick = () => { if (state.page > 0) { state.page--; select(pageIds()[0]); } };
  $('nextPage').onclick = () => { if (state.page < group().lessons.length - 1) { state.page++; select(pageIds()[0]); } };
  $('quizSound').onclick = () => { if (quiz && quiz.index < 5) playSound(quiz.answer, { question: true }); };
  $('quizNext').onclick = () => {
    if (!quiz?.solved) return;
    quiz.index++;
    if (quiz.index < 5) { nextQuestion(); return; }
    stopSound();
    $('quizSound').hidden = $('answers').hidden = $('quizFeedback').hidden = $('quizNext').hidden = true;
    $('quizResult').hidden = false;
    prompt('太棒了，五道题都完成了！');
  };
  $('again').onclick = startQuiz;
  $('help').onclick = () => {
    if (animation) { stopDemo(); if (state.mode === 'write') beginTrace(); else writer.showCharacter({ duration: 0 }); }
    prompt(state.mode === 'write' ? '从小圆点开始，沿着笔画慢慢写。' : state.mode === 'quiz' ? '听一听，找出刚才听到的笔画或者汉字。' : '点一个笔画，听一听它的名字，再看看怎么写。');
  };
  $('mute').onclick = () => { state.muted = !state.muted; stopSound(); updateMute(); if (!state.muted && quiz && quiz.index < 5) playSound(quiz.answer, { question: true }); };
  $('retryAudio').onclick = () => { if (state.muted) { state.muted = false; updateMute(); } if (retry) retry(); };

  // Hanzi Writer uses mouse/touch events. Cancel interrupted or multi-touch input
  // before it can be mistaken for a completed pen stroke.
  const cancelTouch = () => { if (state.mode === 'write' && ready && !animation) { writer.cancelQuiz(); beginTrace(); } };
  $('writerHost').addEventListener('touchcancel', cancelTouch, true);
  $('writerHost').addEventListener('touchstart', event => {
    if (event.touches.length > 1) { event.preventDefault(); event.stopPropagation(); cancelTouch(); }
  }, { capture: true, passive: false });
  $('writerHost').addEventListener('mousedown', event => { if (event.button !== 0) event.stopPropagation(); }, true);
  new ResizeObserver(() => {
    if (!ready || state.mode === 'quiz') return;
    writer.updateDimensions({ width: size(), height: size(), padding });
    if (state.mode === 'write' && !animation) { writer.cancelQuiz(); beginTrace(); }
  }).observe($('board'));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (animation && !animation.paused) toggleAnimation();
    else { stopSound(); cancelTouch(); }
  });
  window.addEventListener('pagehide', stopActivity);
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  state.id = pageIds()[0];
  renderCategories(); select(state.id, false); updateMute(); icons();
})();
