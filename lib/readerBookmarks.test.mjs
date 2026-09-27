import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookmarkKey, parseBookmarks, bookmarkAvailable } from './readerBookmarks.ts';
const mark = { id: 'one', nodeId: 'scene', stepIndex: 2, enteredAt: '2026-09-27T10:00:00Z', offset: 1800, pageIndex: 3, label: 'Hoofdstuk 1', createdAt: '2026-09-27T10:05:00Z' };
test('bookmarks round-trip without changing their text anchor', () => {
  assert.deepEqual(parseBookmarks(JSON.stringify([mark])), [mark]);
});
test('storage is isolated by account and book', () => {
  assert.notEqual(bookmarkKey('a','book'), bookmarkKey('b','book'));
  assert.notEqual(bookmarkKey('a','book'), bookmarkKey('a','other'));
});
test('malformed and negative anchors are rejected', () => {
  assert.deepEqual(parseBookmarks('{broken'), []);
  assert.deepEqual(parseBookmarks(JSON.stringify([{ ...mark, offset: -1 }, { ...mark, stepIndex: 0.5 }, null])), []);
});
test('same node in a new reading run cannot open an old bookmark', () => {
  const history = [{nodeId:'intro'}, {nodeId:'choice'}, {nodeId:'scene', enteredAt:mark.enteredAt}];
  assert.equal(bookmarkAvailable(mark, history), true);
  assert.equal(bookmarkAvailable(mark, [...history.slice(0,2), {nodeId:'scene', enteredAt:'new-run'}]), false);
  assert.equal(bookmarkAvailable(mark, history.slice(0,2)), false);
});
test('repeated node visits use the specific history step', () => {
  assert.equal(bookmarkAvailable(mark, [{nodeId:'scene', enteredAt:mark.enteredAt}, {nodeId:'x'}, {nodeId:'scene',enteredAt:'later'}]), false);
});
