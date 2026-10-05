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

test('illustration requires image and warns about an empty rich-text page', () => {
  const blank = node('a', 'illustration', {textHtml:'<p>&nbsp;<br></p>',intentionalEnd:true});
  const result = checkStory([blank], [], 'a');
  assert.ok(result.some(i=>i.id==='a:image' && i.severity==='error'));
  assert.ok(result.some(i=>i.id==='a:illustration-text' && i.severity==='warning'));
  blank.data.imageUrl='cover.png';blank.data.textHtml='<p>Een scène</p>';
  assert.deepEqual(checkStory([blank], [], 'a'), []);
});

test('effect endpoint order and ignored invalid kind are reported at the effect node', () => {
  const fx=node('fx','effect',{effectKind:'unknown',effectStart:'b',effectEnd:'a'});
  const result=checkStory([node('a'),node('b','text',{intentionalEnd:true}),fx],[{source:'a',target:'b'}],'a');
  for(const id of ['fx:effect-kind','fx:effect-route']) assert.ok(result.some(i=>i.id===id && i.nodeId==='fx'));
});

test('effect bypass checks real choice routes and remains safe with cycles', () => {
  const fx=node('fx','effect',{effectKind:'alarm',effectStart:'a',effectEnd:'end'});
  const a=node('a','choice',{choices:[{label:'Stop',targetNodeId:'end'},{label:'Verder',targetNodeId:'other'}]});
  const end=node('end','text',{intentionalEnd:true}),other=node('other','text',{intentionalEnd:true});
  assert.ok(checkStory([a,end,other,fx],[],'a').some(i=>i.id==='fx:effect-bypass'));
  assert.ok(!checkStory([a,end,other,fx],[{source:'other',target:'a'}],'a').some(i=>i.id.startsWith('fx:')));
  a.data.choices=[{label:'Stop',targetNodeId:'end'}];
  assert.ok(!checkStory([a,end,other,fx],[{source:'a',target:'other'}],'a').some(i=>i.id.startsWith('fx:')));
});
