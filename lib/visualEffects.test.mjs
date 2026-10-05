import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readVisualEffects, activeVisualEffects, isEffectBoundary } from './visualEffects.ts';
import { checkStory } from './storyCheck.ts';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Execute the real editor/export and Reader normalization functions with a fixture.
function functionsFrom(file, names, dependencies = {}) {
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) functions.push(node.getText(source));
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(functions.length, names.length);
  const code = ts.transpileModule(functions.join('\n'), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(dependencies), code + '\nreturn {' + names.join(',') + '};')(...Object.values(dependencies));
}

const config = { id: 'fx', kind: 'fog', start: 'a', end: 'c', color: '#ef4444', intensity: .35 };
const effects = [config];
test('begin inclusive, end exclusive; branches use visited route only', () => {
  assert.equal(activeVisualEffects(effects, ['before']).length, 0);
  assert.equal(activeVisualEffects(effects, ['a', 'branch']).length, 1);
  assert.equal(activeVisualEffects(effects, ['other', 'c']).length, 0);
  assert.equal(activeVisualEffects(effects, ['a', 'b', 'c']).length, 0);
});
test('replay prefix, restart and re-entering a loop restore correct state', () => {
  const history = ['a', 'b', 'c'];
  assert.equal(activeVisualEffects(effects, history.slice(0, 2)).length, 1);
  assert.equal(activeVisualEffects(effects, []).length, 0);
  assert.equal(activeVisualEffects(effects, [...history, 'a']).length, 1);
});
test('overlapping effects stop independently and deleted endpoints disable effect', () => {
  const both = [...effects, { ...config, id: 'alarm', kind: 'alarm', start: 'b', end: 'd' }];
  assert.equal(activeVisualEffects(both, ['a', 'b']).length, 2);
  assert.deepEqual(activeVisualEffects(both, ['a', 'b', 'c']).map(e => e.kind), ['alarm']);
  assert.equal(activeVisualEffects(effects, ['a'], new Set(['a', 'b'])).length, 0);
});
test('editor project and Reader export preserve equivalent effects', () => {
  const project = { nodes: [{ id: 'fx', data: { type: 'effect', effectKind: 'fog', effectStart: 'a', effectEnd: 'c' } }] };
  assert.deepEqual(readVisualEffects(project), effects);
  assert.deepEqual(readVisualEffects(JSON.parse(JSON.stringify({ effects }))), effects);
  assert.ok(isEffectBoundary(effects, 'a'));
  assert.ok(isEffectBoundary(effects, 'c'));
  assert.ok(!isEffectBoundary(effects, 'b'));
});
test('malformed settings cannot render unsafe CSS or invalid ranges', () => {
  assert.deepEqual(readVisualEffects({effects:[null, {}, {...config, kind:'invalid'}, {...config,end:'a'}]}), []);
  assert.deepEqual(readVisualEffects({nodes:[null], effects: {}}), []);
  const [safe] = readVisualEffects({effects:[{...config,color:'url(bad)',intensity:100}]});
  assert.equal(safe.color, '#ef4444');
  assert.equal(safe.intensity, .65);
});
test('story validation ignores effect in paths but validates endpoints', () => {
  const story = [{id:'a',data:{type:'text',label:'Start'}},{id:'c',data:{type:'text',label:'End',intentionalEnd:true}}];
  const fx = {id:'fx',data:{type:'effect',label:'Mist',effectKind:'fog',effectStart:'a',effectEnd:'c'}};
  assert.deepEqual(checkStory([...story,fx],[{source:'a',target:'c'}],'a'), []);
  assert.ok(checkStory([...story,{...fx,data:{...fx.data,effectEnd:'missing'}}],[{source:'a',target:'c'}],'a').some(i => i.id === 'fx:effect'));
});
test('actual project export and Reader load retain effects, paths and start node', () => {
  const nodes = ['a','b','c'].map(id => ({id,position:{x:0,y:0},data:{type:'text',label:id,text:'Example'}}));
  nodes.push({id:'fx',data:{type:'effect',label:'Mist',effectKind:'fog',effectStart:'a',effectEnd:'c'}});
  const edges = [{id:'ab',source:'a',target:'b'},{id:'bc',source:'b',target:'c'}];
  const editor = functionsFrom('../app/editor/page.tsx', ['isNonStoryNode','getStoryNodes','getSafeStartNodeId','getReaderStoryData'], {nodes,edges,startNodeId:'a',dashboardSaveForm:{title:'Demo'},storyVariables:[],readVisualEffects});
  const reader = functionsFrom('../app/books/[bookId]/read/page.tsx', ['normalizeNode','normalizeBook'], {readVisualEffects});
  const exported = editor.getReaderStoryData();
  for (const project of [{nodes,edges,startNodeId:'a'}, exported]) {
    const loaded = reader.normalizeBook(JSON.parse(JSON.stringify(project)), {});
    assert.deepEqual(loaded.effects, effects);
    assert.deepEqual(loaded.nodes.map(n=>n.id), ['a','b','c']);
    assert.equal(loaded.edges.length, 2);
    assert.equal(loaded.startNodeId, 'a');
  }
});
