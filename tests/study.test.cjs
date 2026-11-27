const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/src/main/assets/ui/study.js');
const word={id:'a',en:'abandon',zh:'vt. 放弃, 抛弃, 遗弃\nn. 放任',alternatives:'give up',state:'ready',level:1,misses:0,right:1,wrong:0,due:1};
test('Chinese alternatives, POS, common synonyms and rejection of partial guesses',()=>{
  for(const x of ['放弃','抛弃','舍弃','放弃，遗弃'])assert.ok(S.correct('enZh',x,word));
  for(const x of ['放','不放弃','放弃，飞机',''])assert.equal(S.correct('enZh',x,word),false);
});
test('English spelling, casing, phrases, punctuation and saved equivalent',()=>{
  for(const x of ['ABANDON','  abandon. ','give   up'])assert.ok(S.correct('zhEn',x,word));
  assert.equal(S.correct('audio','abandno',word),false);
  assert.equal(S.correct('audio','give up',word),false);
});
test('distinct choice options, no duplicate or semantically equivalent distractors',()=>{
  const others=['放弃','舍弃','飞机','天空','草地',''].map((zh,i)=>({...word,id:String(i),zh}));
  const a=S.choices(word,[word,...others]);assert.equal(a.length,4);assert.ok(a.includes(word.zh));assert.ok(!a.includes('舍弃'));
});
test('due, mistake priority, pending exclusions, free practice',()=>{
  const words=[word,{...word,id:'wrong',wrong:5,misses:2},{...word,id:'future',due:100},{...word,id:'pending',state:'pending'}];
  assert.deepEqual(S.deck(words,10).map(w=>w.id),['wrong','a']);
  assert.deepEqual(S.deck(words,10,true).map(w=>w.id),['wrong','a','future']);
});
