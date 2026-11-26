const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const settings = html.slice(html.indexOf('function renderSettings()'), html.indexOf('function renderSettings()') + 9000);

test('Settings is cloud-only: no local/offline-mode or "cloud copy" wording', () => {
  assert.doesNotMatch(html, /cloud copy/i);
  assert.doesNotMatch(settings, /Local only|Optional Google|stay in this browser/);
  assert.match(settings, /Your account/);
});

test('file backups, diagnostics and clear-data live inside Advanced; CSV export stays visible', () => {
  const adv = settings.indexOf('<details class="settings-advanced"');
  assert.ok(adv > 0, 'Advanced section exists');
  for (const a of ['data-action="export"', 'data-action="import"', 'data-action="clear-data"', 'renderSyncIssuePanel()']) {
    assert.ok(settings.indexOf(a) > adv, a + ' should be inside Advanced');
  }
  assert.ok(settings.indexOf('data-action="export-csv"') < adv, 'CSV export stays visible');
  assert.match(settings, /syncIssue\|\|syncNeedsChoice\(\)\)\?' open'/, 'Advanced opens by itself when sync needs attention');
});
