(function () {
  'use strict';
  const strokes = [
    ['heng', '横', 'héng', '一', 0, ['heng2']],
    ['shu', '竖', 'shù', '十', 1, ['shu4']],
    ['pie', '撇', 'piě', '人', 0, ['pie3']],
    ['na', '捺', 'nà', '人', 1, ['na4']],
    ['dian', '点', 'diǎn', '六', 0, ['dian3']],
    ['ti', '提', 'tí', '江', 2, ['ti2']],
    ['hengzhe', '横折', 'héng zhé', '口', 1, ['heng2', 'zhe2']],
    ['shuzhe', '竖折', 'shù zhé', '山', 1, ['shu4', 'zhe2']],
    ['hengpie', '横撇', 'héng piě', '水', 1, ['heng2', 'pie3']],
    ['piezhe', '撇折', 'piě zhé', '云', 2, ['pie3', 'zhe2']],
    ['piedian', '撇点', 'piě diǎn', '女', 0, ['pie3', 'dian3']],
    ['shuwan', '竖弯', 'shù wān', '四', 3, ['shu4', 'wan1']],
    ['henggou', '横钩', 'héng gōu', '字', 2, ['heng2', 'gou1']],
    ['shugou', '竖钩', 'shù gōu', '小', 0, ['shu4', 'gou1']],
    ['wangou', '弯钩', 'wān gōu', '子', 1, ['wan1', 'gou1']],
    ['hengzhegou', '横折钩', 'héng zhé gōu', '力', 0, ['heng2', 'zhe2', 'gou1']],
    ['shuwangou', '竖弯钩', 'shù wān gōu', '儿', 1, ['shu4', 'wan1', 'gou1']],
    ['xiegou', '斜钩', 'xié gōu', '戈', 1, ['xie2', 'gou1']]
  ].map(([id, name, pinyin, source, index, audio]) => ({ id, name, pinyin, source, index, audio, kind: 'stroke', names: [id] }));
  const characters = [
    ['一', 'yī', 'yi1', ['heng']],
    ['二', 'èr', 'er4', ['heng', 'heng']],
    ['三', 'sān', 'san1', ['heng', 'heng', 'heng']],
    ['十', 'shí', 'shi2', ['heng', 'shu']],
    ['人', 'rén', 'ren2', ['pie', 'na']],
    ['大', 'dà', 'da4', ['heng', 'pie', 'na']],
    ['口', 'kǒu', 'kou3', ['shu', 'hengzhe', 'heng']],
    ['日', 'rì', 'ri4', ['shu', 'hengzhe', 'heng', 'heng']],
    ['田', 'tián', 'tian2', ['shu', 'hengzhe', 'heng', 'shu', 'heng']],
    ['木', 'mù', 'mu4', ['heng', 'shu', 'pie', 'na']],
    ['山', 'shān', 'shan1', ['shu', 'shuzhe', 'shu']],
    ['水', 'shuǐ', 'shui3', ['shugou', 'hengpie', 'pie', 'na']]
  ].map(([name, pinyin, sound, names]) => ({ id: `char-${name.codePointAt(0).toString(16)}`, name, pinyin, audio: [sound], source: name, names, kind: 'character' }));
  const groups = [
    { id: 'basic', label: '基础笔画', preview: '一 丨 丿', lessons: [strokes.slice(0, 6).map(item => item.id)] },
    { id: 'turns', label: '转弯笔画', preview: '口 山', lessons: [strokes.slice(6, 12).map(item => item.id)] },
    { id: 'hooks', label: '带钩笔画', preview: '小 儿', lessons: [strokes.slice(12).map(item => item.id)] },
    { id: 'characters', label: '简单汉字', preview: '人 木 水', lessons: [characters.slice(0, 6).map(item => item.id), characters.slice(6).map(item => item.id)] }
  ];
  window.StrokeLessons = { strokes, characters, items: Object.fromEntries([...strokes, ...characters].map(item => [item.id, item])), groups };
})();
