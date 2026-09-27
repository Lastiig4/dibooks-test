import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTutorialMetadata, canOfferBookReview } from './bookCompletion.ts';
test('tutorials excluded by official flag, primary genre and genre list', () => {
  for (const book of [{official_tutorial:true},{officialTutorial:true},{primary_genre:' Tutorial '},{primaryGenre:'tutorial'},{genres:['Fantasy','TUTORIAL']}]) assert.equal(isTutorialMetadata(book), true);
  assert.equal(isTutorialMetadata({genres:['Fantasy']}), false);
});
test('only confirmed terminal endings can offer reviews', () => {
  const end = {eligible:true,intentionalEnd:true,replay:false,hasNextPage:false,hasNextRoute:false};
  assert.equal(canOfferBookReview(end), true);
  for (const override of [{eligible:false},{intentionalEnd:false},{replay:true},{hasNextPage:true},{hasNextRoute:true}]) assert.equal(canOfferBookReview({...end,...override}),false);
});
