(function () {
  'use strict';
  const subjects = [
    { id: 'all', name: '全部', icon: 'layout-grid' },
    { id: 'chinese', name: '语文', icon: 'book-open', color: '#20796b' },
    { id: 'math', name: '数学', icon: 'calculator', color: '#426dc1' },
    { id: 'english', name: '英语', icon: 'languages', color: '#ba4865' },
    { id: 'thinking', name: '思维', icon: 'puzzle', color: '#92651b' }
  ];
  const lessons = [
    { id: 'pinyin', title: '拼音启蒙', subject: 'chinese', detail: 'a o e · 声母、韵母与四声', storage: 'pinyin-classroom-v1', stars: 'stars' },
    { id: 'characters', title: '看图识字', subject: 'chinese', detail: '日月山水 · 28 个汉字', storage: 'characters-game-v1', stars: 'totalStars' },
    { id: 'strokes', title: '笔画书写', subject: 'chinese', detail: '18 种笔画 · 12 个简单汉字', storage: 'hanzi-strokes-classroom-v1', stars: 'stars' },
    { id: 'numbers', title: '数字与生活', subject: 'math', detail: '0–20 · 数量、大小与时间', storage: 'numbers-game-v1', stars: 'totalStars' },
    { id: 'numbers100', title: '百数练习', subject: 'math', detail: '1–100 · 十位与个位', storage: 'numbers100-game-v1', stars: 'stars' },
    { id: 'letters', title: '英文字母', subject: 'english', detail: 'A–Z · 26 个英文字母', storage: 'letters-game-v1', stars: 'totalStars' },
    { id: 'words', title: '看图学单词', subject: 'english', detail: '水果 · 蔬菜 · 常见动物', storage: 'words-game-v1', stars: 'stars' },
    { id: 'gomoku', title: '五子棋启蒙', subject: 'thinking', detail: '五子连线 · 观察与思考', storage: 'gomoku-kids-v1', stars: 'stars' }
  ].map(lesson => ({ ...lesson, path: `${lesson.id}/index.html`, preview: `shared/previews/${lesson.id}.svg` }));
  const historyKey = 'little-learning-hub-v1';
  function readHistory() {
    let value = {};
    try { value = JSON.parse(localStorage.getItem(historyKey) || '{}') || {}; } catch (_) {}
    return { last: lessons.some(lesson => lesson.id === value.last) ? value.last : null, muted: value.muted === true };
  }
  function updateHistory(values) {
    const next = { ...readHistory(), ...values };
    try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch (_) {}
    return next;
  }
  function starsFor(lesson) {
    try {
      const saved = JSON.parse(localStorage.getItem(lesson.storage) || '{}');
      const value = saved?.[lesson.stars];
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    } catch (_) { return 0; }
  }
  window.LearningHub = { subjects, lessons, readHistory, updateHistory, starsFor };
})();
