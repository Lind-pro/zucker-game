(function () {
  'use strict';

  // Coordinates share the four guidelines at y = 40, 115, 190, 265.
  // Each path is one pen-down stroke, in handwriting order.
  const letters = {
    a: { width: 105, strokes: ['M82 128 C64 104 21 109 21 151 C21 192 63 205 82 174', 'M82 116 V190'] },
    o: { width: 105, strokes: ['M55 115 C10 113 10 190 55 190 C101 190 101 115 55 115'] },
    e: { width: 105, strokes: ['M20 148 H85 C84 102 22 102 19 147 C14 190 56 207 85 177'] },
    i: { width: 48, strokes: ['M24 115 V190', 'M24 80 v0.5'] },
    u: { width: 105, strokes: ['M23 115 V164 C23 201 66 197 82 171', 'M82 115 V190'] },
    ü: { width: 105, strokes: ['M23 115 V164 C23 201 66 197 82 171', 'M82 115 V190', 'M32 80 v0.5', 'M73 80 v0.5'] },
    b: { width: 105, strokes: ['M24 45 V190', 'M24 133 C58 93 88 120 88 153 C88 187 56 204 24 175'] },
    p: { width: 105, strokes: ['M24 115 V259', 'M24 133 C58 93 88 120 88 153 C88 187 56 204 24 175'] },
    m: { width: 150, strokes: ['M20 115 V190', 'M20 139 C29 108 74 102 74 143 V190', 'M74 139 C85 106 130 105 130 143 V190'] },
    f: { width: 85, strokes: ['M72 54 C51 32 32 46 32 74 V190', 'M12 115 H68'] },
    d: { width: 105, strokes: ['M82 128 C64 104 21 109 21 151 C21 192 63 205 82 174', 'M82 45 V190'] },
    t: { width: 82, strokes: ['M31 63 V169 Q31 202 65 183', 'M12 115 H65'] },
    n: { width: 105, strokes: ['M22 115 V190', 'M22 140 C32 107 82 102 82 143 V190'] },
    l: { width: 48, strokes: ['M24 45 V190'] },
    g: { width: 105, strokes: ['M82 128 C64 104 21 109 21 151 C21 192 63 205 82 174', 'M82 116 V223 C82 256 40 265 22 238'] },
    k: { width: 105, strokes: ['M24 45 V190', 'M83 115 L27 154 L87 190'] },
    h: { width: 105, strokes: ['M22 45 V190', 'M22 140 C32 107 82 102 82 143 V190'] },
    j: { width: 72, strokes: ['M49 115 V223 Q49 257 15 245', 'M49 80 v0.5'] },
    q: { width: 105, strokes: ['M82 128 C64 104 21 109 21 151 C21 192 63 205 82 174', 'M82 116 V259'] },
    x: { width: 105, strokes: ['M20 115 L85 190', 'M85 115 L20 190'] },
    z: { width: 105, strokes: ['M20 115 H85 L20 190 H85'] },
    c: { width: 105, strokes: ['M85 127 C59 99 20 115 20 153 C20 189 59 207 85 178'] },
    s: { width: 98, strokes: ['M79 125 C42 98 7 125 35 147 C49 158 80 153 79 173 C77 198 35 196 17 181'] },
    r: { width: 82, strokes: ['M23 115 V190', 'M23 139 Q40 105 67 120'] },
    y: { width: 105, strokes: ['M16 115 L52 181', 'M84 115 L23 259'] },
    w: { width: 124, strokes: ['M10 115 L36 190 L62 115', 'M62 115 L88 190 L114 115'] }
  };

  const groups = [
    { id: 'vowels', label: '单韵母', preview: 'a o e', lessons: ['a o e i u ü'], sound: '先来听一听，再跟着读。' },
    { id: 'initials', label: '声母', preview: 'b p m', lessons: ['b p m f', 'd t n l', 'g k h', 'j q x', 'z c s', 'zh ch sh r'], sound: '一起来认识声母。' },
    { id: 'yw', label: 'y 和 w', preview: 'y w', lessons: ['y w'], sound: '来认识这两个拼音朋友。' },
    { id: 'finals', label: '复韵母 · er', preview: 'ai ei', lessons: ['ai ei ui', 'ao ou iu', 'ie üe er'], sound: '听一听，连起来读。' },
    { id: 'syllables', label: '整体认读', preview: 'zhi chi', lessons: ['zhi chi shi ri', 'zi ci si', 'yi wu yu', 'ye yue yuan', 'yin yun ying'], sound: '这些音节，要一口气读出来。' }
  ];
  const audioNames = {
    a: 'a1', o: 'o1', e: 'e1', i: 'yi1', u: 'wu1', ü: 'yu1',
    b: 'bo1', p: 'po1', m: 'mo1', f: 'fo1', d: 'de1', t: 'te1', n: 'ne1', l: 'le1',
    g: 'ge1', k: 'ke1', h: 'he1', j: 'ji1', q: 'qi1', x: 'xi1',
    zh: 'zhi1', ch: 'chi1', sh: 'shi1', r: 'ri1', z: 'zi1', c: 'ci1', s: 'si1', y: 'yi1', w: 'wu1',
    ai: 'ai1', ei: 'ei1', ui: 'wei1', ao: 'ao1', ou: 'ou1', iu: 'you1', ie: 'ye1', üe: 'yue1', er: 'er1',
    zhi: 'zhi1', chi: 'chi1', shi: 'shi1', ri: 'ri1', zi: 'zi1', ci: 'ci1', si: 'si1',
    yi: 'yi1', wu: 'wu1', yu: 'yu1', ye: 'ye1', yue: 'yue1', yuan: 'yuan1', yin: 'yin1', yun: 'yun1', ying: 'ying1'
  };
  const toneLetters = { a: 'āáǎà', o: 'ōóǒò', e: 'ēéěè', i: 'īíǐì', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
  const tonePaths = ['M-22 0 H22', 'M-20 7 L20 -10', 'M-22 -9 L0 9 L22 -9', 'M-20 -10 L20 7'];

  function strokesFor(value, tone = 0) {
    const chars = [...value];
    const width = chars.reduce((sum, char) => sum + letters[char].width, 0) + (chars.length - 1) * 12;
    let x = (640 - width) / 2;
    const result = [];
    chars.forEach(char => {
      const glyph = letters[char];
      glyph.strokes.forEach((d, index) => {
        if (char === 'i' && tone && chars.length === 1 && index === 1) return;
        result.push({ d, x, y: 0, char });
      });
      if (tone && chars.length === 1 && toneLetters[char]) {
        result.push({ d: tonePaths[tone - 1], x: x + glyph.width / 2, y: char === 'ü' ? 48 : 75, char });
      }
      x += glyph.width + 12;
    });
    return result;
  }

  window.PinyinData = { letters, groups, audioNames, toneLetters, strokesFor };
})();
