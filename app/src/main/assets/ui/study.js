'use strict';
const Study = (() => {
  const canon = s => String(s || '').normalize('NFKC').toLowerCase().trim()
    .replace(/[’‘]/g,"'").replace(/[‐‑–]/g,'-').replace(/\s+/g,' ').replace(/[.!?。！？]+$/,'');
  const groups = [
    '放弃 舍弃 抛弃 摒弃', '重要 重大 要紧', '开始 开端 起始', '完成 做完',
    '购买 买 购入', '帮助 帮忙 协助 援助', '迅速 快速 飞快', '美丽 漂亮 好看',
    '高兴 开心 快乐 愉快', '选择 挑选 选取', '困难 艰难', '保护 守护',
    '取得 获得 获取 得到', '提高 提升', '减少 减小 降低', '增加 增多 增加量',
    '理解 了解 领会', '回答 答复 回复', '经常 常常 时常', '聪明 聪慧 聪颖'
  ].map(x => x.split(' '));
  function zkey(s) {
    return canon(s).replace(/^(?:(?:[a-z]+\.)+\s*)+/,'').replace(/\[[^\]]*\]|【[^】]*】|\([^)]*\)/g,'')
      .replace(/[…·~～\s]/g,'').replace(/(.{2,})(?:的|地)$/,'$1');
  }
  function senses(s) { return String(s).split(/[,，;；、\n\/|]+/).map(zkey).filter(Boolean); }
  function sameSense(a,b){return a===b || groups.some(g=>g.includes(a)&&g.includes(b));}
  function correct(mode, answer, word) {
    const given=canon(answer);
    if(!given)return false;
    if(mode==='enZh') {
      const expected=senses(word.zh), parts=senses(given);
      return parts.length>0 && parts.every(a=>expected.some(b=>sameSense(a,b)));
    }
    if(mode==='audio')return canon(word.en)===given;
    return [word.en].concat((word.alternatives||'').split(/[,，;；\n]/)).some(x=>canon(x)===given);
  }
  function shuffle(list,rng=Math.random) {
    const a=list.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
  }
  function choices(word, words,rng=Math.random) {
    const labels=[word.zh],seen=senses(word.zh);
    const ranked=shuffle(words.filter(w=>w.id!==word.id&&w.state==='ready'),rng)
      .sort((a,b)=>Number(b.pos===word.pos)-Number(a.pos===word.pos));
    for(const w of ranked){
      const terms=senses(w.zh);
      if(!terms.length||terms.some(t=>seen.some(s=>sameSense(s,t))))continue;
      labels.push(w.zh);seen.push(...terms);if(labels.length===4)break;
    }return shuffle(labels,rng);
  }
  function priority(w,now) {
    const daysLate=Math.max(0,now-w.due)/86400000;
    return 2*Math.log1p(daysLate)+2*w.misses+3*w.wrong/(w.right+w.wrong+1)+(4-w.level)*.6;
  }
  function deck(words,now,all=false){
    return words.filter(w=>w.state==='ready'&&(all||w.due<=now))
      .sort((a,b)=>Number(b.due<=now)-Number(a.due<=now)||priority(b,now)-priority(a,now)||a.due-b.due);
  }
  function day(t){const d=new Date(t);return [d.getFullYear(),('0'+(d.getMonth()+1)).slice(-2),('0'+d.getDate()).slice(-2)].join('-');}
  return {canon,correct,choices,deck,shuffle,day,senses};
})();
if(typeof module!=='undefined')module.exports=Study;

