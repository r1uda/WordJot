'use strict';
function quizMenu(){
  const wrong=ready().filter(w=>w.mistake).length;
  return area('单词测试',`<p class="muted">每轮最多 10 词，提交后查看答案。</p><div class="list">${Object.keys(modes).map(k=>act('startQuiz',`<span class="tileicon">${icon(k==='audio'?'sound':k==='mistakes'?'pen':'test')}</span><span class="grow"><b>${modes[k][0]}</b><small>${modes[k][1]}${k==='mistakes'?' · '+wrong+' 词':''}</small></span>${icon('next')}`,'wordrow quiztype',k)).join('')}</div>`);
}
function begin(kind,mode,all=false){
  let pool=kind==='review'?Study.deck(data.words,Date.now(),all):Study.shuffle(ready().filter(w=>mode!=='mistakes'||w.mistake));
  if(mode==='choice')pool=pool.filter(w=>Study.choices(w,ready()).length>=2);
  session={kind,mode,ids:pool.slice(0,kind==='review'?20:10).map(w=>w.id),at:0,answers:[],revealed:false,response:null,options:null,all};
  navigate(kind==='review'?'review':'test');if(mode==='audio'&&pool.length)play(pool[0].en);
}
function active(){return session&&lookup(session.ids[session.at]);}
function play(text){rpc('speak',{en:text}).catch(fail);}
function fillExample(w){
  if(!w||!w.en||w.example)return;
  rpc('example',{id:w.id}).catch(()=>{});
}
function learning(){
  const s=session,isReview=s.kind==='review',title=isReview?'卡片背诵':modes[s.mode][0];
  if(!s.ids.length){
    const t=isReview?(ready().length?'今天的到期词已学完':'还没有可背诵的词'):s.mode==='mistakes'?'当前没有待巩固的错词':s.mode==='choice'?'还需要不同释义的词条':'还没有可测试的词';
    const hint=isReview&&ready().length?'还可以自由背诵已收录的词条。':s.mode==='choice'?'至少需要两个释义不同的已查词条。':s.mode==='mistakes'?'测试中答错的词会自动加入，答对后移出。':'在课堂速记中录入词语，释义就绪后即可学习。';
    return area(title,empty(t,hint,isReview&&ready().length?act('reviewAll','自由背诵','secondary'):act('book','查看单词本','secondary')),false);
  }
  if(s.at>=s.ids.length)return results();
  const w=active();
  if(!w)return area(title,empty('词条已变更','请返回并重新开始本轮。',act('home','返回首页','secondary')),false);
  const top=`<div class="progressline">${isReview?'背诵进度':'测试进度'}　${s.at+1} / ${s.ids.length}</div><div class="meter"><i style="width:${100*(s.at+1)/s.ids.length}%"></i></div>`;
  if(isReview){
    const front=`<span class="english">${esc(w.en)}</span>`;
    const back=s.revealed?`<div class="details"><span class="small">${esc([w.ipa,w.pos].filter(Boolean).join(' · '))}</span><div class="definition">${esc(w.zh)}</div>${w.example?`<p class="sample">${esc(w.example)}</p>`:''}</div>`:'';
    return area(title,`${top}<button type="button" data-act="flip" aria-label="${s.revealed?'词条释义':'点击查看释义'}" class="flash card">${front}${back}</button><div class="between"><small>${s.revealed?'这次记得怎样？':'点击卡片查看释义'}</small>${act('speak',icon('sound')+' 朗读','link',w.en)}</div>${s.revealed?`<div class="rating">${grades.map((g,i)=>act('rate',g,i>=2?'primary':'secondary',i)).join('')}</div>`:''}`,false);
  }
  const mode=s.mode==='mistakes'?'zhEn':s.mode;
  const prompt=mode==='audio'?act('speak',icon('sound')+' 播放读音','primary',w.en):`<div class="${mode==='enZh'||mode==='choice'?'english':'question'}">${esc(mode==='enZh'||mode==='choice'?w.en:w.zh)}</div>`;
  let controls='';
  if(s.response){
    const r=s.response;
    controls=`<div class="panel"><b class="${r.correct?'ok':'bad'}">${r.correct?'回答正确':'需要巩固'}</b><p>你的答案　${esc(r.given)}</p><div class="definition">正确答案　${esc(r.expected)}</div><p class="muted">掌握程度　${levels[r.level]}</p></div>${act('next',s.at+1===s.ids.length?'查看结果':'下一词','primary wide')}`;
  }else if(mode==='choice'){
    if(!s.options)s.options=Study.choices(w,ready());
    controls=s.options.map((v,i)=>act('choose',esc(v),'option',i)).join('');
  }else{
    controls=`<form id="answer"><input id="response" aria-label="答案" placeholder="${mode==='enZh'?'输入一项中文释义':'输入英文单词或短语'}" maxlength="500" enterkeyhint="done" autocapitalize="none" spellcheck="false" autocomplete="off"><button class="primary wide">提交答案</button></form>`;
  }
  return area(title,`${top}<div class="card"><small>${modes[s.mode][1]}</small><div class="segment">${prompt}</div></div><div class="segment">${controls}</div>`,false);
}
function results(){
  const s=session,ok=s.answers.filter(r=>r.correct).length;
  return area(s.kind==='review'?'背诵完成':'测试结果',`<div class="hero"><div>${s.kind==='review'?'回忆正确率':'本轮正确率'}</div><strong class="big">${Math.round(100*ok/(s.answers.length||1))}%</strong><div>共 ${s.answers.length} 词 · 正确 ${ok} · 待巩固 ${s.answers.length-ok}</div></div>
  ${section('本轮明细')}<div class="list">${s.answers.slice().sort((a,b)=>Number(a.correct)-Number(b.correct)).map(r=>`<div class="panel"><div class="between"><b>${esc(r.en)}</b><span class="${r.correct?'ok':'bad'}">${r.correct?'正确':'待巩固'}</span></div><p class="definition">${esc(r.zh)}</p><small>本次${s.kind==='review'?'评价':'回答'}　${esc(r.given)} · ${levels[r.level]}</small></div>`).join('')}</div><div class="actions">${act('home','返回首页','primary')}${s.kind==='test'&&ok<s.answers.length?act('startQuiz','再练错词','secondary','mistakes'):''}</div>`,false);
}
function render(){
  const views={home,dictionary:Lexicon.page,book,detail:details,edit,class:classroom,stats,settings,quiz:quizMenu,review:learning,test:learning,cet:Cet.menu,cetCard:Cet.cardPage};
  root.innerHTML=views[screen]();
}
function navigate(name){
  if(screen==='dictionary'&&name!=='detail'&&name!=='dictionary')Lexicon.leave();
  screen=name;deleteConfirm=false;applyTheme();render();window.scrollTo(0,0);
  if(name==='dictionary')Lexicon.open();
  if(name==='class'){
    updateClass();refresh().catch(fail);
    document.getElementById('term').focus();
    setTimeout(()=>{const h=document.getElementById('classhint');if(h&&!captureFailures.length&&h.textContent==='系统返回可退出')h.textContent='';},2600);
  }
}
async function refresh(draw=true){
  const gen=++generation, result=await rpc('snapshot');if(gen!==generation)return;
  data=result;
  if(!draw||screen==='edit')return;
  if(screen==='dictionary'){Lexicon.draw();return;}
  if(screen==='class'){updateClass();return;}
  if(screen==='book'&&document.activeElement.id==='search'){document.getElementById('words').innerHTML=wordList();return;}
  if(screen==='test'&&session&&active()&&!session.response)return;
  render();
}
window.dataChanged=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh().catch(fail),100);};
function goBack(){
  if(screen==='home')return false;
  if(locked)return true;
  if(screen==='cetCard')navigate('cet');
  else if(screen==='class'&&historyOpen){historyOpen=false;updateClass();return true;}
  else if(screen==='edit')navigate('detail');
  else if(screen==='detail')navigate(origin);
  else if(screen==='test')navigate('quiz');
  else navigate('home');
  refresh().catch(fail);return true;
}
window.goBack=goBack;
async function saveGrade(grade,given,correct,expected){
  if(locked)return;locked=true;
  try{
    const s=session,w=active();
    const event=s.event||(s.event=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    const updated=await rpc('grade',{id:w.id,grade,kind:s.kind,event});
    Object.assign(w,updated);
    const result={en:w.en,zh:w.zh,given,correct,expected,level:w.level};
    s.answers.push(result);s.event=null;
    if(s.kind==='review')advance();else{s.response=result;render();}
  }finally{locked=false;}
}
function advance(){
  const s=session;s.at++;s.revealed=false;s.response=null;s.options=null;render();window.scrollTo(0,0);
  const w=active();if(s.mode==='audio'&&w)play(w.en);
}
async function submitAnswer(given){
  if(!given.trim()){tell('请先输入答案');return;}
  const w=active(),mode=session.mode;
  const ok=mode==='choice'?given===w.zh:Study.correct(mode,given,w);
  await saveGrade(ok?2:0,given,ok,(mode==='enZh'||mode==='choice')?w.zh:w.en);
}
async function capture(term){
  try{
    const r=await rpc('capture',{term});
    if(!r.duplicate)savedCount++;
    latestTerm=term;latestId=r.id||'';if(screen==='class')refresh().catch(fail);
    const h=document.getElementById('classhint');if(h&&!captureFailures.length)h.textContent=r.duplicate?'已在单词本中':'已记录 · '+savedCount;
  }catch(e){
    captureFailures.push(term);if(screen==='class')document.getElementById('classhint').innerHTML=act('failed','重试未保存的输入','link');throw e;
  }
}
async function action(a,v){
  if(locked)return;
  if(a==='back'){goBack();return;}
  if(a.startsWith('cet')){
    locked=true;try{await Cet.handle(a,v);}finally{locked=false;}return;
  }
  if(a==='classHistory'||a==='classChinese'||a==='classMore'){
    if(a==='classHistory'){historyOpen=!historyOpen;historyLimit=40;}
    if(a==='classChinese'){
      showChinese=!showChinese;localStorage.setItem('classChinese',showChinese?'on':'off');
      if(showChinese&&!latestTerm&&data.words.length){const w=data.words.slice().sort((x,y)=>y.added-x.added)[0];latestTerm=w.raw;latestId=w.id;}
    }
    if(a==='classMore')historyLimit+=40;
    updateClass();await refresh();return;
  }
  if(['dictionary','home','book','settings','quiz','stats','class'].includes(a)){navigate(a);if(a!=='class')await refresh();return;}
  if(a==='review'||a==='reviewAll'||a==='startQuiz'){
    if(a==='startQuiz'&&v==='audio'&&!(await rpc('voiceReady'))){
      tell('请先启用英语语音或稍后重试');navigate('settings');return;
    }
    await refresh(false);begin(a==='startQuiz'?'test':'review',a==='startQuiz'?v:'',a==='reviewAll');return;
  }
  switch(a){
    case 'dictAdd':await Lexicon.add();break;
    case 'failed':{const terms=captureFailures.splice(0);for(const t of terms)await capture(t).catch(fail);break;}
    case 'detail':origin=screen;selected=v;navigate('detail');break;
    case 'filter':filter=v;limit=80;render();break;
    case 'more':limit+=80;render();break;
    case 'favorite':await rpc('favorite',{id:selected});await refresh();break;
    case 'edit':navigate('edit');break;
    case 'deleteAsk':
      if(!deleteConfirm){deleteConfirm=true;render();break;}
      await rpc('delete',{id:selected});await refresh(false);navigate('book');tell('词条已删除');break;
    case 'cancelDelete':deleteConfirm=false;render();break;
    case 'speak':play(v);break;
    case 'example':{tell('正在查询例句');const has=await rpc('example',{id:selected,force:true});tell(has?'例句已保存':'暂未取得例句，可稍后重试');await refresh();break;}
    case 'flip':if(!session.revealed){session.revealed=true;render();play(active().en);fillExample(active());}break;
    case 'rate':if(session.revealed)await saveGrade(+v,grades[+v],+v>=2,active().zh);break;
    case 'choose':if(!session.response)await submitAnswer(session.options[+v]);break;
    case 'next':if(session.response)advance();break;
    case 'tts':await rpc('ttsSettings');break;
    case 'source':await rpc('source',{url:v});break;
    case 'retry':await rpc('retry');tell('已安排重新查询');break;
    case 'export':case 'import':{const msg=await rpc(a);if(msg){tell(msg);await refresh();}break;}
  }
}
root.addEventListener('click',e=>{const b=e.target.closest('[data-act]');if(b)action(b.dataset.act,b.dataset.v).catch(fail);});
root.addEventListener('input',e=>{if(e.target.id==='search'){search=e.target.value;limit=80;document.getElementById('words').innerHTML=wordList();}});
root.addEventListener('change',e=>{
  if(e.target.id==='theme'){if(!Ink.setTheme(e.target.value))tell('外观设置保存失败');applyTheme();}
  if(e.target.id==='sort'){sorting=e.target.value;limit=80;render();}
  if(e.target.id==='category'){category=e.target.value;limit=80;render();}
});
root.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='dictForm'){Lexicon.search();return;}
  if(e.target.id==='capture'){
    const field=document.getElementById('term'),term=field.value.trim();
    if(!term)return;
    if(!/[a-zA-Z\u3400-\u9fff]/.test(term)){tell('请输入中文或英文词语');return;}
    field.value='';field.focus();capture(term).catch(fail);
  }else if(e.target.id==='answer'){submitAnswer(document.getElementById('response').value.trim()).catch(fail);}
  else if(e.target.id==='edit'){
    const payload={id:selected};new FormData(e.target).forEach((v,k)=>payload[k]=v);
    rpc('edit',payload).then(()=>refresh(false)).then(()=>{navigate('detail');tell('已保存');}).catch(fail);
  }
});
applyTheme();render();refresh().catch(fail);
