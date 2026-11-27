'use strict';
let historyOpen=false,showChinese=localStorage.getItem('classChinese')!=='off',historyLimit=40;
let latestTerm='',latestId='';
function classroom(){
  return `<div class="classmode"><div class="classDock"><div id="classhistory"></div><div id="classgloss" aria-live="polite"></div>
    <div class="classTools">${act('classHistory','已记单词','quiet')}${act('classChinese','显示中文','quiet')}<span class="classhint" id="classhint" role="status">${captureFailures.length?act('failed','重试未保存的输入','link'):''}</span></div>
    <form id="capture"><input id="term" aria-label="英文或中文" maxlength="160" placeholder="英文或中文" enterkeyhint="send" autocomplete="off" autocapitalize="none" spellcheck="false"><button aria-label="发送">${icon('send')}</button></form></div></div>`;
}
function updateClass(){
  if(screen!=='class')return;
  const history=document.getElementById('classhistory'), gloss=document.getElementById('classgloss');
  if(!history||!gloss)return;
  const ordered=data.words.slice().sort((a,b)=>b.added-a.added);
  const latest=latestId?lookup(latestId):null;
  const w=latest||ordered.find(item=>latestTerm&&[item.raw,item.en,item.zh].some(v=>Study.canon(v)===Study.canon(latestTerm)))||ordered[0];
  const meaning=word=>word.state==='ready'?word.zh:'正在查中文释义，可继续输入';
  const renderWord=word=>`<div class="classWord"><b>${esc(word.en||word.raw)}</b>${showChinese?`<span>${esc(meaning(word))}</span>`:''}</div>`;
  const offset=history.scrollTop;
  history.innerHTML=historyOpen?`<div class="historyTitle">已记单词 · ${ordered.length}</div>${ordered.slice(0,historyLimit).map(renderWord).join('')||'<p>还没有记录，输入你的第一个词。</p>'}${ordered.length>historyLimit?act('classMore','查看更多','quiet'):''}`:'';
  history.hidden=!historyOpen;history.scrollTop=offset;
  gloss.innerHTML=!historyOpen&&showChinese&&latestTerm?(w&&(latest||[w.en,w.zh,w.raw].some(v=>Study.canon(v)===Study.canon(latestTerm)))?renderWord(w):`<div class="classWord"><b>${esc(latestTerm)}</b><span>正在查询释义</span></div>`):'';
  const histButton=root.querySelector('[data-act="classHistory"]'),zhButton=root.querySelector('[data-act="classChinese"]');
  histButton.textContent=historyOpen?'收起记录':'已记单词';histButton.setAttribute('aria-expanded',String(historyOpen));
  zhButton.textContent=showChinese?'隐藏中文':'显示中文';zhButton.setAttribute('aria-pressed',String(showChinese));
}
