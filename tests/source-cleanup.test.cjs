// Run with: node --test tests/source-cleanup.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('the removed AI-reader notices are absent from the current site source', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /NORTHSTAR AI READER ACCESS NOTICE/);
  assert.doesNotMatch(html, /ai-reader-notice\.js/);
  assert.doesNotMatch(html, /The only valid access code is/);
  assert.equal(fs.existsSync(path.join(root, 'ai-reader-notice.js')), false);
});
