/* Node 22+, a dedicated emulator, and an empty debug notebook are required. */
const {execFileSync}=require('node:child_process');
const assert=require('node:assert/strict');
const adb=process.env.INKWORDS_ADB||'adb',serial=process.env.ANDROID_SERIAL;
if(!serial)throw Error('Set ANDROID_SERIAL to the dedicated QA emulator');
const cmd=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'}).trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pkg='cn.inkwords.debug';
let socket,seq=0,port;
async function connect(){
  cmd('shell','am','start','-n',pkg+'/cn.inkwords.MainActivity');
  for(let i=0;i<55;i++){
    try{
      const pid=cmd('shell','pidof',pkg);
      if(!pid){await sleep(500);continue;}
      port=cmd('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
      const list=await (await fetch('http://127.0.0.1:'+port+'/json')).json();
      const page=list.find(p=>p.url.includes('inkwords.invalid'));
      if(!page)throw Error('page still loading');
      socket=new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
      await wait("document.querySelector('[data-act=class]')!==null");return;
    }catch(e){if(port){cmd('forward','--remove','tcp:'+port);port=null;}await sleep(900);}
  }throw Error('debug WebView unavailable');
}
async function ev(expression){
  const id=++seq;
  const reply=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{socket.removeEventListener('message',listener);reject(Error('evaluation timeout'));},15000);
    function listener(m){
      const r=JSON.parse(m.data);if(r.id!==id)return;
      clearTimeout(timer);socket.removeEventListener('message',listener);
      if(r.error||r.result.exceptionDetails)reject(Error(JSON.stringify(r.error||r.result.exceptionDetails)));
      else resolve(r.result.result.value);
    }socket.addEventListener('message',listener);
  });
  socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true,userGesture:true}}));return reply;
}
async function wait(expr){
  for(let i=0;i<70;i++){if(await ev(expr))return;await sleep(150);}throw Error('Timeout: '+expr);
}
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
const button=(name,val)=>click(`[data-act="${name}"]`+(val===undefined?'':`[data-v="${val}"]`));
const snapshot=()=>ev("rpc('snapshot')");
function disconnect(){if(socket)socket.close();if(port){cmd('forward','--remove','tcp:'+port);port=null;}}
async function run(){
  await connect();assert.equal((await snapshot()).words.length,0,'use a fresh debug installation');
  await button('class');await wait("getComputedStyle(document.querySelector('.classmode')).backgroundColor==='rgb(0, 0, 0)'");
  await ev(`for(const v of ['apple',' APPLE ','苹果','课堂','look up','important','inkwords classroom unreleased qzx']){let f=document.querySelector('#term');f.value=v;document.querySelector('#capture button').click();if(f.value!=='')throw Error('field not cleared')}`);
  await wait("rpc('snapshot').then(d=>d.words.length===5&&d.words.filter(w=>w.state==='ready').length===4)");
  console.log('PASS classroom black surface, rapid bilingual capture, clear, phrases, automatic deduplication and persistent unknown');
  await ev('goBack()');await button('book');await wait("document.querySelector('#search')!==null");
  await ev("let f=document.querySelector('#search'); f.value='apple';f.dispatchEvent(new Event('input',{bubbles:true}))");
  await wait("document.querySelectorAll('#words [data-act=detail]').length===1");
  await button('detail');await button('favorite');await wait("document.body.innerText.includes('已收藏')");
  await button('edit');
  await ev("document.querySelector('#f-category').value='英语课'; document.querySelector('#edit button').click()");
  await wait("screen==='detail' && document.body.innerText.includes('英语课')");
  console.log('PASS search, favorite and editable category');
  await ev('goBack()');await button('home');await button('review');await wait("!!document.querySelector('[data-act=flip]')");
  assert.ok(!(await ev("document.querySelector('.flash').innerText")).includes('苹果'));
  await button('flip');await wait("!!document.querySelector('.definition')");await button('rate','3');
  await wait("session.at===1");console.log('PASS flashcard reveal, rating and progression');
  await ev('goBack()');await button('quiz');
  for(const mode of ['enZh','mistakes','zhEn','choice','audio']){
    await button('startQuiz',mode);await wait("screen==='test' && session.ids.length>0");
    const count=await ev('session.ids.length');
    for(let i=0;i<count;i++){
      if(mode==='choice'){
        await ev("Array.from(document.querySelectorAll('[data-act=choose]')).find(b=>session.options[+b.dataset.v]===active().zh).click()");
      }else{
        const incorrect=mode==='enZh'&&i===0;
        const expr=incorrect?"'绝对无关的答案'":mode==='enZh'?"Study.senses(active().zh)[0]":"active().en";
        await ev("document.querySelector('#response').value="+expr+";document.querySelector('#answer button').click()");
      }
      await wait('!!session.response');await button('next');
    }
    await wait("document.body.innerText.includes('本轮明细')");
    console.log('PASS '+mode+' complete session, grading and results');
    await ev('goBack()');
  }
  assert.equal((await snapshot()).words.filter(w=>w.mistake).length,0);
  await button('home');await button('stats');await wait("document.body.innerText.includes('最近七天')");
  await button('home');await button('settings');
  await ev("let t=document.querySelector('#theme'); t.value='dark';t.dispatchEvent(new Event('change',{bubbles:true}))");
  assert.ok(await ev("document.body.classList.contains('dark')"));
  const before=(await snapshot()).words.map(w=>[w.id,w.right,w.wrong,w.favorite,w.category]).sort();
  disconnect();cmd('shell','am','force-stop',pkg);await connect();
  assert.deepEqual((await snapshot()).words.map(w=>[w.id,w.right,w.wrong,w.favorite,w.category]).sort(),before);
  assert.ok(await ev("document.body.classList.contains('dark')"));
  console.log('PASS dashboard, statistics, theme and data persistence after process restart');
  disconnect();
}
module.exports={connect,disconnect,cmd,ev,wait,button,snapshot};
if(require.main===module)run().catch(e=>{console.error(e);try{disconnect();}catch{}process.exitCode=1;});
