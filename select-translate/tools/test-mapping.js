// 自测:从 background.js 提取真实的 mapLinesFromSentences / charSplit,验证多行批量映射逻辑
'use strict';
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');

function grabFn(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('未找到 ' + name);
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

const sandbox = {};
eval(grabFn('charSplit') + '; sandbox.charSplit = charSplit;');
eval(grabFn('mapLinesFromSentences') + '; sandbox.mapLinesFromSentences = mapLinesFromSentences;');

const { charSplit, mapLinesFromSentences } = sandbox;
let fail = 0;
function eq(name, actual, expect) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect);
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (ok ? '' : '\n  期望: ' + JSON.stringify(expect) + '\n  实际: ' + JSON.stringify(actual)));
  if (!ok) fail++;
}

// 1. 三行各自成句,orig 段含换行、trans 换行数一致
let texts = ['Good morning', 'Good afternoon everyone, welcome aboard.', 'Good evening'];
let sents = [
  { orig: 'Good morning\n', trans: '早上好\n' },
  { orig: 'Good afternoon everyone, welcome aboard.\n', trans: '大家下午好，欢迎登机。\n' },
  { orig: 'Good evening', trans: '晚上好' }
];
eq('三行逐句映射', mapLinesFromSentences(sents, texts), ['早上好', '大家下午好，欢迎登机。', '晚上好']);

// 2. 跨行句子:orig 一段含两个换行、trans 保留换行
texts = ['Line one here', 'Second line', 'Third'];
sents = [{ orig: 'Line one here\nSecond line\nThird', trans: '第一行\n第二行\n第三' }];
eq('跨行句子换行保留', mapLinesFromSentences(sents, texts), ['第一行', '第二行', '第三']);

// 3. 跨行句子但译文丢了换行 → 按字符权重拆
texts = ['Hello world', 'This is a much longer second line of text'];
sents = [{ orig: 'Hello world\nThis is a much longer second line of text', trans: '你好世界这是一段长很多的第二行文字' }];
const r3 = mapLinesFromSentences(sents, texts);
eq('丢换行按权重拆行数', r3.length, 2);
eq('丢换行不产生空行', r3.every(t => t.trim().length > 0), true);

// 4. 一行多句(句号切分),orig 多段、无换行
texts = ['Hello world. How are you?'];
sents = [{ orig: 'Hello world. ', trans: '你好世界。' }, { orig: 'How are you?', trans: '你好吗？' }];
eq('单行多句合并', mapLinesFromSentences(sents, texts), ['你好世界。你好吗？']);

// 5. 对齐失败要抛错(orig 长度对不上)
texts = ['abc'];
sents = [{ orig: 'abcd', trans: '错' }];
let threw = false;
try { mapLinesFromSentences(sents, texts); } catch (e) { threw = true; }
eq('对齐失败抛错', threw, true);

// 6. charSplit 基本性质:段数、拼接还原、非空
const parts = charSplit('一二三四五', [10, 5, 5]);
eq('charSplit 拼接还原', parts.join(''), '一二三四五');
eq('charSplit 段数', parts.length, 3);

// 7. charSplit 空/零权重不崩
eq('charSplit 零权重', charSplit('abc', [0, 3]).length, 2);

console.log(fail ? `\n${fail} 个用例失败` : '\n全部通过');
process.exit(fail ? 1 : 0);
