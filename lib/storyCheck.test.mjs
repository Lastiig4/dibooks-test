import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkStory } from './storyCheck.ts';
const node = (id, type = 'text', data = {}) => ({ id, data: { label: id, type, ...data } });
test('cycles terminate and scratchpads are excluded', () => {
  assert.deepEqual(checkStory([node('a'), node('b'), node('note', 'scratchpad')], [{source:'a',target:'b'}, {source:'b',target:'a'}], 'a'), []);
});
test('choice data determines reachability, not stale display edges; 99 choices supported', () => {
  const choices = Array.from({length:99}, (_,i) => ({label:`Keuze ${i}`, targetNodeId:'end'}));
  const result = checkStory([node('a','choice',{choices}), node('end','text',{intentionalEnd:true}), node('orphan','text',{intentionalEnd:true})], [{source:'a',target:'orphan'}], 'a');
  assert.deepEqual(result.map(i=>i.id), ['orphan:unreachable']);
});
test('missing destinations cannot be suppressed by intentional end', () => {
  const result = checkStory([node('a','choice',{intentionalEnd:true, choices:[{label:'Go',targetNodeId:'missing'}]})], [], 'a');
  assert.equal(result[0].severity, 'error');
  assert.match(result[0].message, /bestemming/);
});
test('both condition and minigame branches are traversed', () => {
  const result = checkStory([node('a','condition',{conditionTrueTargetNodeId:'b',conditionFalseTargetNodeId:'c'}),node('b','minigame',{miniGameSuccessTargetNodeId:'c',miniGameFailTargetNodeId:'d'}),node('c','text',{intentionalEnd:true}),node('d','text',{intentionalEnd:true})], [], 'a');
  assert.deepEqual(result, []);
});
test('missing start, media, and orphaned edges are reported', () => {
  const result = checkStory([node('a','image'),node('b','cutscene')], [{source:'gone',target:'a'}], 'gone');
  for (const id of ['start','a:image','b:video','edge:gone:a']) assert.ok(result.some(i=>i.id===id));
});
test('stored videos accepted and intentional ending round-trips in project data', () => {
  const nodes = JSON.parse(JSON.stringify([node('a','cutscene',{videoStoragePath:'videos/clip.mp4',intentionalEnd:true})]));
  assert.deepEqual(checkStory(nodes, [], 'a'), []);
  nodes[0].data.intentionalEnd = false;
  assert.equal(checkStory(nodes, [], 'a')[0].canMarkEnd, true);
});
