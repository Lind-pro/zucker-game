(function () {
  'use strict';
  const hub = window.LearningHub;
  const $ = id => document.getElementById(id);
  let selected = 'all';
  let muted = hub.readHistory().muted;
  let spoken = 0;
  const icons = () => window.lucide.createIcons();
  const number = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 });
  function stopVoice() {
    spoken++;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    document.querySelectorAll('.speaking').forEach(node => node.classList.remove('speaking'));
  }
  function speak(text, button, quiet = false) {
    stopVoice(); $('voiceStatus').textContent = '';
    if (muted) { if (!quiet) $('voiceStatus').textContent = '首页声音已关闭'; return; }
    if (!('speechSynthesis' in window)) { if (!quiet) $('voiceStatus').textContent = '这台设备暂时无法朗读'; return; }
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(item => /^zh[-_](CN|Hans)/i.test(item.lang)) || voices.find(item => item.lang === 'zh');
    if (!voice) { if (!quiet) $('voiceStatus').textContent = '这台设备暂时没有中文朗读声音'; return; }
    const token = spoken;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice; utterance.lang = 'zh-CN'; utterance.rate = .85;
    button.classList.add('speaking');
    utterance.onend = utterance.onerror = () => { if (token === spoken) button.classList.remove('speaking'); };
    speechSynthesis.speak(utterance);
  }
  function renderSubjects() {
    $('subjects').replaceChildren();
    hub.subjects.forEach(subject => {
      const button = document.createElement('button');
      button.className = `subject${selected === subject.id ? ' active' : ''}`;
      button.dataset.subject = subject.id;
      button.setAttribute('aria-pressed', selected === subject.id);
      button.style.setProperty('--subject-color', subject.color || '#334944');
      button.innerHTML = `<i data-lucide="${subject.icon}"></i><span>${subject.name}</span>`;
      button.onclick = () => {
        selected = subject.id;
        renderSubjects(); renderLessons();
        const active = $('subjects').querySelector(`[data-subject="${subject.id}"]`);
        active.focus({ preventScroll: true });
        speak(subject.id === 'all' ? '全部学习内容' : `${subject.name}学习`, active, true);
      };
      $('subjects').append(button);
    });
    icons();
  }
  function renderLessons() {
    const lessons = hub.lessons.filter(lesson => selected === 'all' || lesson.subject === selected);
    $('lessonCount').textContent = `${lessons.length} 个学习项目`;
    $('lessons').replaceChildren();
    lessons.forEach(lesson => {
      const subject = hub.subjects.find(item => item.id === lesson.subject);
      const card = document.createElement('article');
      card.className = `lesson-card ${lesson.subject}`;
      card.dataset.lesson = lesson.id;
      card.style.setProperty('--accent', subject.color);
      const link = document.createElement('a');
      link.className = 'lesson-link'; link.href = lesson.path;
      link.setAttribute('aria-label', `学习${lesson.title}`);
      link.innerHTML = `<div class="lesson-art"><img src="${lesson.preview}" alt="" width="320" height="180"><span class="subject-label">${subject.name}</span></div><div class="lesson-info"><h3>${lesson.title}</h3><p>${lesson.detail}</p></div>`;
      const bottom = document.createElement('div');
      bottom.className = 'lesson-bottom';
      const stars = hub.starsFor(lesson);
      const status = document.createElement('span');
      status.className = 'lesson-status';
      if (stars > 0) {
        status.innerHTML = `<i data-lucide="star"></i><span>${number.format(stars)}</span>`;
        status.setAttribute('aria-label', `已获得 ${stars} 颗星星`);
      } else status.textContent = subject.name + '启蒙';
      const sound = document.createElement('button');
      sound.className = 'icon-button lesson-sound';
      sound.setAttribute('aria-label', `听${lesson.title}的名称`);
      sound.dataset.tip = '听名称'; sound.innerHTML = '<i data-lucide="volume-2"></i>';
      sound.onclick = () => speak(lesson.title, sound);
      bottom.append(status, sound); card.append(link, bottom); $('lessons').append(card);
    });
    icons();
  }
  function updateResume() {
    const lesson = hub.lessons.find(item => item.id === hub.readHistory().last);
    $('resume').hidden = !lesson;
    if (!lesson) return;
    $('resumeImage').src = lesson.preview; $('resumeTitle').textContent = lesson.title;
    $('resumeLink').href = lesson.path; $('resumeLink').setAttribute('aria-label', `继续学习${lesson.title}`);
  }
  function updateMute() {
    $('mute').innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}"></i>`;
    const label = muted ? '打开首页声音' : '关闭首页声音';
    $('mute').setAttribute('aria-label', label); $('mute').dataset.tip = label;
    $('mute').setAttribute('aria-pressed', muted); icons();
  }
  function refresh() {
    muted = hub.readHistory().muted;
    const total = hub.lessons.reduce((sum, lesson) => sum + hub.starsFor(lesson), 0);
    $('totalStars').textContent = number.format(total);
    $('totalStars').parentElement.setAttribute('aria-label', `学习星星，共 ${total} 颗`);
    updateResume(); updateMute(); renderLessons();
  }
  $('mute').onclick = () => { muted = !muted; stopVoice(); hub.updateHistory({ muted }); $('voiceStatus').textContent = ''; updateMute(); };
  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    const lesson = hub.lessons.find(item => link.getAttribute('href') === item.path);
    if (lesson) hub.updateHistory({ last: lesson.id });
    stopVoice();
  });
  window.addEventListener('pageshow', refresh);
  window.addEventListener('storage', refresh);
  window.addEventListener('pagehide', stopVoice);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopVoice(); else refresh(); });
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  renderSubjects(); refresh();
})();
