'use strict';
const Lexicon=(()=>{
  let version=0, term='', result=null, message='', saving=false;
  function page(){
    return area('查词','<form id="dictForm" class="dictSearch"><input type="search" id="queryTerm" maxlength="160" autocomplete="off" enterkeyhint="search" aria-label="查询词语" placeholder="输入英文、中文或短语"><button class="primary">查询</button></form><div id="dictResult" aria-live="polite"></div>');
  }
  function draw(){
    const box=document.getElementById('dictResult');
    if(!box)return;
    if(!result){box.innerHTML=message?'<p class="muted">'+esc(message)+'</p>':'';return;}
    const w=result.card;
    const known=data.words.find(x=>x.state==='ready'&&(Study.canon(x.en)===Study.canon(w.en)||Study.canon(x.raw)===Study.canon(term)));
    const source=result.local?'离线词典':w.source?'Wiktionary · CC BY-SA 4.0':'MyMemory 在线翻译';
    box.innerHTML='<article class="card"><div class="between"><small>'+source+'</small>'+act('speak',icon('sound')+' 朗读','link',w.en)+'</div><h2 class="english">'+esc(w.en)+'</h2><p class="muted">'+esc([w.ipa,w.pos].filter(Boolean).join(' · '))+'</p><div class="definition">'+esc(w.zh)+'</div>'+(w.alternatives?'<p>其他表达　'+esc(w.alternatives)+'</p>':'')+(w.example?'<p class="sample">'+esc(w.example)+'</p>':'')+(w.source?act('source','查看词条来源','link',w.source):'')+'<div class="actions">'+(known?act('detail','已在单词本 · 查看','secondary',known.id):act('dictAdd',saving?'正在保存…':'加入我的单词本','primary'))+'</div></article>';
  }
  function open(){
    const field=document.getElementById('queryTerm');
    field.value=term;
    if(!result)field.focus();
    draw();
  }
  function clear(){version++;result=null;message='';draw();}
  function leave(){clear();term='';}
  async function search(){
    const field=document.getElementById('queryTerm');
    const query=field.value.trim();clear();
    if(!query){field.focus();return;}
    const seq=version;term=query;message='正在查词…';draw();
    try{
      const found=await rpc('dictionaryQuery',{term:query});
      if(seq!==version)return;
      result=found;message=found?'':'暂未查到双语释义，可以检查拼写或换一种表达。';
    }catch(e){if(seq===version)message=e.message||'查询失败，请重试';}
    if(seq===version)draw();
  }
  async function add(){
    if(!result||saving)return;
    const card=result.card,query=term;
    saving=true;draw();
    try{await rpc('dictionaryAdd',{term:query,card});await refresh(false);tell('已加入我的单词本');}
    finally{saving=false;draw();}
  }
  document.addEventListener('input',e=>{if(e.target.id==='queryTerm')clear();});
  return {page,draw,open,leave,search,add};
})();
