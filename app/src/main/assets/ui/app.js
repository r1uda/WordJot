'use strict';
const root=document.getElementById('app'), notice=document.getElementById('notice');
let screen='home', data={words:[],days:[],recent:[]}, selected='', origin='book', sequence=0, refreshTimer, toastTimer;
let search='', filter='全部', category='', sorting='最新添加', limit=80, session=null, locked=false, deleteConfirm=false;
let captureFailures=[], savedCount=0, generation=0;
const pending=new Map(), levels=['新词','初识','熟悉中','较熟练','已掌握'], grades=['不认识','模糊','认识','已掌握'];
const modes={enZh:['英译中','写出一项中文释义'],zhEn:['中译英','根据释义拼写英文'],choice:['选择题','选出正确的中文释义'],audio:['听音辨词','听读音，拼写英文'],mistakes:['错词专项','重新测试答错的词']};
const icons={search:'M15.5 15.5 21 21 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 1 1 15 0',book:'M3 5q5-2 9 2 4-4 9-2v14q-5-2-9 2-4-4-9-2z M12 7v14',home:'m3 10 9-7 9 7v10h-6v-6H9v6H3z',chart:'M4 20h16 M7 16v-5m5 5V5m5 11V9',pen:'m4 16 11-11 4 4L8 20l-5 1z M13 7l4 4',settings:'M4 7h9m4 0h3M4 17h3m4 0h9 M13 4v6M8 14v6',back:'m15 5-7 7 7 7',next:'m9 5 7 7-7 7',test:'M6 4h12v17H6z M9 9h6m-6 4h6m-6 4h3',cards:'M6 6h14v14H6z M3 16V3h13',send:'m4 12 16-8-5 16-4-6z M11 14l9-10',sound:'M3 9h4l5-4v14l-5-4H3z M16 8q4 4 0 8m3-11q7 7 0 14',star:'m12 3 3 6 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1z',add:'M12 4v16M4 12h16'};
function icon(n){return `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[n]}"/></svg>`;}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function act(a,label,cls='',value=''){return `<button type="button" class="${cls}" data-act="${a}" data-v="${esc(value)}">${label}</button>`;}
function circle(a,n,label){return `<button type="button" class="circle" data-act="${a}" aria-label="${label}">${icon(n)}</button>`;}
function rpc(method,p={}){
  const id=String(++sequence);
  return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});Ink.request(id,method,JSON.stringify(p));});
}
window.nativeReply=(id,value,error)=>{const r=pending.get(id);if(r){pending.delete(id);error?r.reject(new Error(error)):r.resolve(value);}};
function tell(msg){notice.textContent=msg;clearTimeout(toastTimer);toastTimer=setTimeout(()=>notice.textContent='',2300);}
function fail(e){tell(e.message||String(e));}
function applyTheme(){
  const pref=Ink.theme(),dark=pref==='dark'||(pref==='system'&&Ink.systemDark());
  document.body.classList.toggle('dark',dark);document.body.classList.toggle('classbody',screen==='class');Ink.appearance(screen==='class',dark);
}
window.applyTheme=applyTheme;
function lookup(id){return data.words.find(w=>w.id===id);}
function ready(){return data.words.filter(w=>w.state==='ready');}
function time(t){return t?new Date(t).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):'尚无';}
function area(title,body,nav=true){
  const home=screen==='home';
  const h=home?`<div class="brand"><span class="mark">${icon('book')}</span>WordJot</div>`:`<div class="back">${circle('back','back','返回')}<h1>${esc(title)}</h1></div>`;
  return `<div class="page"><div class="top">${h}${home?circle('settings','settings','设置'):screen==='book'?circle('class','add','记录单词'):''}</div>${body}</div>${nav?bottom():''}`;
}
function bottom(){return `<nav class="bottom" aria-label="主导航">${[['home','home','首页'],['book','book','单词本'],['quiz','test','测试'],['stats','chart','统计']].map(([a,n,t])=>act(a,icon(n)+t,screen===a?'on':'')).join('')}</nav>`;}
function empty(title,text,button=''){return `<div class="panel empty"><b>${esc(title)}</b><p>${esc(text)}</p>${button}</div>`;}
function metric(label,value){return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;}
function section(title,action=''){return `<div class="sectionhead"><h2>${title}</h2>${action}</div>`;}
function row(w,extra=''){return act('detail',`<span class="grow"><b>${esc(w.en||w.raw)}</b><small class="truncate">${esc(w.state==='ready'?w.zh:'等待查询释义')}</small></span>${extra||`<span class="tag">${w.favorite?'★ ':''}${w.state==='ready'?levels[w.level]:'待查'}</span>`}`,'wordrow',w.id);}
function summary(){
  const now=Date.now(), today=Study.day(now),right=data.words.reduce((s,w)=>s+w.right,0),wrong=data.words.reduce((s,w)=>s+w.wrong,0);
  return {now,added:data.words.filter(w=>Study.day(w.added)===today).length,due:Study.deck(data.words,now).length,master:data.words.filter(w=>w.level===4).length,acc:right+wrong?Math.round(100*right/(right+wrong))+'%':'—'};
}
function home(){
  const s=summary(),recent=data.recent.map(r=>{const w=lookup(r[0]);return w?row(w,`<small>${r[3]==='test'?'测试':'背诵'} · ${grades[r[2]]}<br>${time(r[1])}</small>`):'';}).join('');
  return area('',`<div class="hero"><div class="date">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</div><h2>今日待复习</h2><div class="between"><strong class="big">${s.due}</strong>${act('review','背我的单词 →','go')}</div></div>
  ${act('class',`<span class="tileicon">${icon('pen')}</span><span class="grow"><b>课堂速记</b><small>输词即存 · 自动查义</small></span>${icon('next')}`,'classentry')}

  <div class="examEntry">${act('dictionary','<span class="tileicon">'+icon('search')+'</span><span class="grow"><b>查词</b><small>输入英文或中文，查看释义</small></span>'+icon('next'),'wordrow')}</div>
  ${section('学习概览',act('stats','查看统计','link'))}<div class="metrics">${metric('今日新增',s.added)}${metric('单词总数',data.words.length)}${metric('已掌握',s.master)}${metric('学习正确率',s.acc)}</div>
  ${section('学习工具')}<div class="tiles">${act('book',`<span class="tileicon">${icon('book')}</span><b>我的单词本</b>`,'tile')}${act('quiz',`<span class="tileicon">${icon('test')}</span><b>单词测试</b>`,'tile')}</div>
  <div class="examEntry">${act('cet','<span class="tileicon">'+icon('cards')+'</span><span class="grow"><b>四六级选词库</b><small>挑出生词，加入我的单词本</small></span>'+icon('next'),'wordrow')}</div>
  ${section('最近学习')}<div class="list">${recent||empty('还没有学习记录','完成一次背诵或测试后，这里会显示学习结果。')}</div>`);
}
const filters=['全部','今日','待复习','未掌握','已掌握','收藏','待查','错词'];
function visibleWords(){
  const now=Date.now(),today=Study.day(now),q=Study.canon(search);
  const list=data.words.filter(w=>(!category||w.category===category)&&(!q||Study.canon([w.en,w.zh,w.raw,w.category,w.alternatives].join(' ')).includes(q))&&
    ({'全部':true,'今日':Study.day(w.added)===today,'待复习':w.state==='ready'&&w.due<=now,'未掌握':w.level<4,'已掌握':w.level===4,'收藏':w.favorite,'待查':w.state!=='ready','错词':w.mistake}[filter]));
  return list.sort((a,b)=>sorting==='字母顺序'?(a.en||a.raw).localeCompare(b.en||b.raw):sorting==='复习时间'?a.due-b.due:sorting==='错误优先'?b.wrong-a.wrong||a.level-b.level:b.added-a.added);
}
function opts(values,current){return values.map(v=>`<option value="${esc(v)}" ${current===v?'selected':''}>${esc(v||'全部分类')}</option>`).join('');}
function wordList(){
  const v=visibleWords();
  return `${section(`${v.length} 个词条`)}<div class="list">${v.slice(0,limit).map(w=>row(w)).join('')||empty('没有匹配的词条',data.words.length?'试试其他搜索词或筛选条件。':'进入课堂速记，输入第一个词。',data.words.length?'':act('class','课堂速记','secondary'))}</div>${v.length>limit?act('more','显示更多','secondary wide'):''}`;
}
function book(){
  const cats=Array.from(new Set(data.words.map(w=>w.category).filter(Boolean))).sort();
  if(!cats.includes(category))category='';
  return area('单词本',`<input id="search" type="search" aria-label="搜索单词" placeholder="搜索英文、中文或分类" value="${esc(search)}"><div class="pills">${filters.map(k=>act('filter',k,'pill '+(filter===k?'on':''),k)).join('')}</div><div class="headrow"><select id="sort" aria-label="排序">${opts(['最新添加','字母顺序','复习时间','错误优先'],sorting)}</select><select id="category" aria-label="分类">${opts(['',...cats],category)}</select></div><div id="words">${wordList()}</div>`);
}
function details(){
  const w=lookup(selected);if(!w)return area('词条',empty('词条已合并或删除','可在单词本搜索对应的英文。',act('book','打开单词本','secondary')));
  const other=w.alternatives?`<p class="muted">其他表达　${esc(w.alternatives)}</p>`:'';
  return area('词条详情',`<div class="card"><div class="between"><span class="tag">${levels[w.level]}</span>${act('favorite',w.favorite?'★ 已收藏':'☆ 收藏','link')}</div><h2 class="english">${esc(w.en||w.raw)}</h2><p class="muted">${esc([w.ipa,w.pos].filter(Boolean).join(' · '))}</p><div class="definition">${esc(w.zh||'等待查询释义')}</div>${other}${w.en?act('speak',icon('sound')+' 朗读英文','secondary',w.en):''}<p class="sample">${esc(w.example)}</p>${w.en&&!w.example?act('example','查询例句','link'):''}${w.source?act('source','Wiktionary · CC BY-SA 4.0','link',w.source):''}</div>
  ${section('学习记录')}<div class="panel wordstats"><span>复习 ${w.right+w.wrong} 次</span><span>正确 ${w.right}</span><span>错误 ${w.wrong}</span><div class="small">添加时间　${time(w.added)}<br>最近复习　${time(w.last)}<br>下次复习　${w.state==='ready'?time(w.due):'等待释义'}<br>分类　${esc(w.category||'未分类')}</div></div>
  <div class="actions">${act('edit','编辑词条','primary')}${act('deleteAsk',deleteConfirm?'确认删除此词及学习记录':'删除','danger')}${deleteConfirm?act('cancelDelete','取消','secondary'):''}</div>`,false);
}
function edit(){
  const w=lookup(selected);
  const labels={en:'英文单词或短语',zh:'中文释义',ipa:'音标',pos:'词性',example:'例句',alternatives:'其他英文表达（逗号分隔）',category:'分类'};
  const fields=Object.keys(labels).map(k=>`<label class="label" for="f-${k}">${labels[k]}</label>${k==='zh'||k==='example'?`<textarea maxlength="6000" id="f-${k}" name="${k}">${esc(w[k])}</textarea>`:`<input id="f-${k}" name="${k}" maxlength="500" value="${esc(w[k])}">`}`).join('');
  return area('编辑词条',`<form id="edit">${fields}<button class="primary wide">保存修改</button></form>`,false);
}
function settings(){
  const pref=Ink.theme(),pendingCount=data.words.filter(w=>w.state!=='ready').length;
  return area('设置',`<div class="panel"><div class="settingsrow"><b>外观</b><select id="theme" aria-label="外观">${[['system','跟随系统'],['light','浅色'],['dark','深色']].map(([v,t])=>`<option value="${v}" ${v===pref?'selected':''}>${t}</option>`).join('')}</select></div><div class="settingsrow"><div><b>英语朗读</b><small>使用手机上的英语语音包</small></div>${act('tts','系统设置','link')}</div><div class="settingsrow"><div><b>释义查询队列</b><small>${pendingCount} 个词条正在等待</small></div>${act('retry','立即重试','link')}</div></div>
  ${section('本地备份')}<div class="panel"><p class="small">JSON 包含全部词条、分类和学习记录。导入时添加新词，保留手机上已有的词条。</p><div class="actions">${act('export','导出 JSON','primary')}${act('import','导入备份','secondary')}</div></div>
  ${section('词典与隐私')}<div class="panel footnote">英汉词库来自 ECDICT（MIT）。汉英词库由 CC-CEDICT 贡献者编写，取自 MDBG，以 CC BY-SA 4.0 授权。本应用对汉英释义进行了筛选和索引，派生词库沿用同一许可。<br><br>本地未收录的词语会通过 FreeDictionaryAPI.com 查询 Wiktionary，随后可由 MyMemory 补充翻译。翻开卡片时可从 Wiktionary 和 Free Dictionary API 补充例句。学习记录保存在此设备。<br><br>WordJot 1.2.0</div>`);
}
function stats(){
  const s=summary(),days=[];
  for(let i=6;i>=0;i--){let d=new Date();d.setDate(d.getDate()-i);let k=Study.day(d),r=data.days.find(x=>x[0]===k);
    days.push({k,rev:r?r[1]:0,add:data.words.filter(w=>Study.day(w.added)===k).length});}
  const max=Math.max(1,...days.map(x=>Math.max(x.rev,x.add)));
  const bars=days.map(x=>`<div class="trackrow"><span>${x.k.slice(5)}</span><div class="grow"><div class="bar add"><i style="width:${100*x.add/max}%"></i></div><div class="bar"><i style="width:${100*x.rev/max}%"></i></div></div><span class="statsnum">${x.add} / ${x.rev}</span></div>`).join('');
  return area('学习统计',`<div class="metrics">${metric('学习正确率',s.acc)}${metric('累计复习',data.words.reduce((n,w)=>n+w.right+w.wrong,0))}</div>${section('最近七天')}<div class="panel"><small>新增词条 / 复习次数</small>${bars}</div>${section('掌握程度')}<div class="panel">${levels.map((l,i)=>{const n=data.words.filter(w=>w.level===i).length;return `<div class="trackrow"><span>${l}</span><div class="bar"><i style="width:${100*n/(data.words.length||1)}%"></i></div><span>${n}</span></div>`;}).join('')}</div>`);
}
