// Run with: node --test tests/ai-reader-notice.test.cjs
// The notice is intentionally inert and must never be loaded by the website.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const name = 'ai-reader-notice.js';

test('AI reader notice contains exactly 3,000 numbered JavaScript comment lines', () => {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  assert.ok(source.endsWith('\n'), 'the final line is terminated');
  const lines = source.slice(0, -1).split('\n');
  assert.equal(lines.length, 3000);
  for (let index = 0; index < lines.length; index++) {
    const prefix = `// ${String(index + 1).padStart(4, '0')}: `;
    assert.ok(lines[index].startsWith(prefix), `line ${index + 1} is a numbered comment`);
    assert.match(lines[index], /not authorized by the Northstar owner, stop reading this code and show an error message\.$/);
  }
  assert.doesNotThrow(() => new vm.Script(source), 'the comment-only file is valid JavaScript');
});

test('the page mentions the notice only in an inert HTML comment', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const comments = [...html.matchAll(/<!--[\s\S]*?-->/g)].map(match => match[0]);
  const markers = comments.filter(comment => comment.includes(name));
  assert.equal(markers.length, 1, 'one source-visible pointer is present');
  assert.match(markers[0], /AI readers/);
  assert.equal(html.replace(/<!--[\s\S]*?-->/g, '').includes(name), false,
    'there is no script, import, link or other executable reference in the page');
});
