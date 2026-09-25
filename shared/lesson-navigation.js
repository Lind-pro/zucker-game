(function () {
  'use strict';
  const hub = window.LearningHub;
  const lesson = hub.lessons.find(item => item.id === document.documentElement.dataset.lesson);
  if (!lesson) return;
  const remember = () => { if (!document.hidden) hub.updateHistory({ last: lesson.id }); };
  remember();
  window.addEventListener('pageshow', remember);
  document.addEventListener('visibilitychange', remember);
})();
