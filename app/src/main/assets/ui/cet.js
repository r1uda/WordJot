'use strict';
const Cet = (() => {
  const bands=['基础','进阶','挑战'];
  let profile={},current=null,shown=false,kept=0,skipped=0,finished=false,showSkipped=false,skipLimit=30;
  const exam=()=>Number(profile.exam)===6?6:4;
  const bit=()=>exam()===4?1:2;
  const floor=()=>Number(profile['floor'+exam()]??1);
  const band=()=>Number(profile['band'+exam()]??floor());
  function pool(){
    const known=new Set(data.words.map(w=>Study.canon(w.en||w.raw)));
    return cetWords.filter(([en,mask,tier])=>(mask&bit())&&tier>=floor()&&!profile['skip:'+en]&&!known.has(en));
  }
  function choose(){
    const candidates=pool();
    const near=candidates.filter(row=>row[2]===band());
    if(!near.length)candidates.sort((a,b)=>Math.abs(a[2]-band())-Math.abs(b[2]-band()));
    const group=near.length?near:candidates.filter(row=>Math.abs(row[2]-band())===Math.abs(candidates[0][2]-band()));
    current=group.length?group[Math.floor(Math.random()*group.length)]:null;
    shown=false;
  }
  function skippedEntries(){
    return cetWords.filter(([en,mask])=>(mask&bit())&&profile['skip:'+en])
      .sort((a,b)=>Number(profile['skip:'+b[0]])-Number(profile['skip:'+a[0]]));
  }
  function menu(){
    const n=pool().length,k=skippedEntries();
    const names=['从基础开始','跳过基础','只练挑战词'];
    const filtered=showSkipped?`<div class="list">${k.slice(0,skipLimit).map(([en,,,zh])=>
      `<div class="wordrow"><div class="grow"><b>${esc(en)}</b><small class="truncate">${esc(zh)}</small></div>${act('cetUndo','恢复','link',en)}</div>`).join('')}${k.length>skipLimit?act('cetMore','更多','secondary'):''}</div>`:'';
    return area('四六级选词库',`<p class="muted">从词库里挑出不会的词，和课堂记录一起放进我的单词本。</p><div class="pills">${[4,6].map(v=>act('cetExam',v===4?'四级 CET-4':'六级 CET-6','pill '+(v===exam()?'on':''),v)).join('')}</div>
    ${section('从哪个难度开始？')}<div class="actions">${names.map((name,i)=>act('cetFloor',name,'pill '+(floor()===i?'on':''),i)).join('')}</div>
    <p class="muted">连续两次觉得太简单，下一词会提高难度；连续两次需要背，会在所选范围内调低难度。</p>
    <div class="panel"><div class="between"><b>当前推荐 · ${bands[band()]}</b><small>${n} 个候选词</small></div>${n?act('cetStart','挑选生词','primary wide'):''}${!n?'<p class="small">这个范围已筛完，可调整难度或恢复跳过的词。</p>':''}</div>
    <div class="actions">${act('book','打开我的单词本','secondary')}${act('review','去背我的单词','secondary')}</div>
    ${section('已跳过的词',k.length?act('cetSkipped',showSkipped?'收起':('查看 '+k.length+' 词'),'link'):'')} ${filtered||(!k.length?'<p class="small">暂无跳过的词。</p>':'')}`,false);
  }
  function cardPage(){
    if(finished||!current)return area('本轮选词',`<div class="panel"><h2>本轮完成</h2><p>已加入我的单词本 ${kept} 词 · 跳过 ${skipped} 词</p></div><div class="actions">${act('review','去背我的单词','primary')}${act('book','打开我的单词本','secondary')}${pool().length?act('cetStart','继续选词','secondary'):''}</div>`,false);
    const [en,,tier,zh,ipa,pos]=current;
    return area(exam()===4?'四级选词':'六级选词',`<p class="progressline">本轮 ${kept+skipped+1} / 10　·　${bands[tier]}</p>
      <button type="button" class="flash card" data-act="cetReveal"><span class="english">${esc(en)}</span>${shown?`<div class="details"><small>${esc([ipa,pos].filter(Boolean).join(' · '))}</small><div class="definition">${esc(zh)}</div></div>`:'<small>点卡片看中文</small>'}</button>
      <div class="between">${act('cetReveal',shown?'隐藏中文':'看中文释义','link')}${act('speak','朗读','link',en)}</div>
      <div class="rating">${act('cetEasy','太简单，跳过','secondary')}${act('cetKeep','不会，加入我的单词本','primary')}</div><p class="small">本轮已加入 ${kept} 词</p>`,false);
  }
  async function write(changes,card){
    const p={changes,exam:exam()};
    if(card)p.card={en:card[0],zh:card[3],ipa:card[4],pos:card[5]};
    await rpc('cetAction',p);
    for(const [k,v] of Object.entries(changes)){if(v===null)delete profile[k];else profile[k]=String(v);}
  }
  async function handle(a,v){
    if(a==='cet'){profile=await rpc('cetProfile');showSkipped=false;navigate('cet');return;}
    if(a==='cetExam'){await write({exam:Number(v)});showSkipped=false;}
    if(a==='cetFloor'){const e=exam();await write({['floor'+e]:Number(v),['band'+e]:Number(v),['run'+e]:0});}
    if(a==='cetStart'){kept=0;skipped=0;finished=false;choose();navigate('cetCard');return;}
    if(a==='cetReveal')shown=!shown;
    if(a==='cetSkipped'){showSkipped=!showSkipped;skipLimit=30;}
    if(a==='cetMore')skipLimit+=30;
    if(a==='cetUndo'){await write({['skip:'+v]:null});tell('已放回候选词');}
    if((a==='cetKeep'||a==='cetEasy')&&current){
      const e=exam(),easy=a==='cetEasy',dir=easy?1:-1,prior=Number(profile['run'+e]||0);
      let run=prior*dir>0?prior+dir:dir,tier=band();
      if(Math.abs(run)>=2){tier=Math.max(floor(),Math.min(2,tier+dir));run=0;}
      const changes={['band'+e]:tier,['run'+e]:run};
      if(easy)changes['skip:'+current[0]]=Date.now();
      await write(changes,easy?null:current);
      if(easy)skipped++;else{kept++;await refresh(false);}
      finished=kept+skipped>=10;if(!finished)choose();
    }
    render();
  }
  return {menu,cardPage,handle};
})();
