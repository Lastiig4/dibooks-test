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


const node=(id,type)=>({id,position:{x:0,y:0},data:{type,label:id,text:'Scène',textHtml:'<p>Scène</p>'}});
test('illustration export and Reader roundtrip preserve all settings and replay/page metrics',()=>{
 const nodes=[node('a','text'),{...node('b','illustration'),data:{...node('b','illustration').data,imageUrl:'data:image/png;base64,abc',imageAlt:'Gevecht',illustrationSide:'left',illustrationMotion:false,illustrationFocusX:30,illustrationFocusY:70}},node('c','text')];
 const edges=[{id:'ab',source:'a',target:'b'},{id:'bc',source:'b',target:'c'}];
 const editor=functionsFrom('../app/editor/page.tsx',['isNonStoryNode','getStoryNodes','getSafeStartNodeId','getReaderStoryData'],{nodes,edges,startNodeId:'a',dashboardSaveForm:{title:'Demo'},storyVariables:[],readVisualEffects});
 const reader=functionsFrom('../app/books/[bookId]/read/page.tsx',['normalizeNode','normalizeBook','isReaderReplayVisibleNode','getReaderRunStepPageCount'],{readVisualEffects});
 for(const project of [{nodes,edges,startNodeId:'a'},editor.getReaderStoryData()]){
  const book=reader.normalizeBook(JSON.parse(JSON.stringify(project)),{}),b=book.nodes[1];
  assert.equal(b.type,'illustration');assert.equal(b.imageUrl,nodes[1].data.imageUrl);assert.equal(b.illustrationSide,'left');assert.equal(b.illustrationMotion,false);assert.equal(b.illustrationFocusX,30);assert.equal(b.illustrationFocusY,70);
  assert.ok(reader.isReaderReplayVisibleNode(b));assert.equal(reader.getReaderRunStepPageCount({nodeId:'b',lastPageCount:8},book),8);
 }
});
test('editor text chains stop at both sides of illustrations and keep regular chains',()=>{
 const nodes=[node('a','text'),node('b','text'),node('c','illustration'),node('d','illustration'),node('e','text')],edges=nodes.slice(1).map((n,i)=>({source:nodes[i].id,target:n.id}));
 const {collectTextChain}=functionsFrom('../app/editor/page.tsx',['collectTextChain'],{nodes,edges,getEditorNodeSceneInfo:()=>'',getStoryEdges:e=>e,escapeHtml:s=>s,readVisualEffects,isEffectBoundary});
 assert.deepEqual(collectTextChain('a').textNodes.map(n=>n.id),['a','b']);assert.equal(collectTextChain('a').nextNodeAfterChain.id,'c');
 assert.deepEqual(collectTextChain('c').textNodes.map(n=>n.id),['c']);assert.equal(collectTextChain('c').nextNodeAfterChain.id,'d');assert.equal(collectTextChain('d').nextNodeAfterChain.id,'e');
});
test('story check requires illustration image',()=>{
 const n=node('a','illustration');n.data.intentionalEnd=true;
 assert.ok(checkStory([n],[],'a').some(i=>i.id==='a:image'));
 n.data.imageUrl='test.png';assert.deepEqual(checkStory([n],[],'a'),[]);
});
