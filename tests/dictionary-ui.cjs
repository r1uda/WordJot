/* Run on the dedicated debug emulator. The test restores its connectivity setting. */
const assert = require('node:assert/strict');
const {connect, disconnect, cmd, ev, wait, button, snapshot} = require('./device-ui.cjs');

async function submit(term) {
  await ev(`document.querySelector('#queryTerm').value=${JSON.stringify(term)};
    document.querySelector('#dictForm button').click()`);
}
async function run() {
  const airplane = cmd('shell','settings','get','global','airplane_mode_on');
  try {
    cmd('shell','cmd','connectivity','airplane-mode','enable');
    await connect();
    const before = (await snapshot()).words;
    await button('dictionary');
    for (const [term, meaning] of [['necrophilia','恋尸癖'],['wedgie','坡跟鞋'],['sesquipedalian','极长'],['look up','查寻'],['苹果','苹果']]) {
      await submit(term);
      await wait(`document.querySelector('#dictResult .definition')?.innerText.includes(${JSON.stringify(meaning)})`);
      if(term==='wedgie'){
        const text=await ev("document.querySelector('.definition').innerText");
        assert.match(text,/恶作剧。\nn\. 坡跟鞋/);
      }
    }
    assert.equal((await snapshot()).words.length,before.length);
    await submit('wordjotlookupzzz');
    await wait("document.querySelector('#dictResult').innerText.includes('离线词库未收录')");
    await submit('necrophilia');await submit('wedgie');
    await wait("document.querySelector('#dictResult .english')?.textContent==='wedgie'");
    const existing=before.find(w=>w.en==='wedgie');
    if(!existing)await button('dictAdd');
    await wait("document.querySelector('#dictResult [data-act=detail]')!==null");
    const after=(await snapshot()).words;
    assert.equal(after.length,before.length+(existing?0:1));
    const added=after.find(w=>w.en==='wedgie');
    assert.match(added.zh,/恶作剧/);
    const repeated=await ev("rpc('dictionaryQuery',{term:'WEDGIE'}).then(r=>rpc('dictionaryAdd',{term:'WEDGIE',card:r.card}))");
    assert.equal(repeated,added.id);
    assert.equal((await snapshot()).words.length,after.length);
    await button('detail',added.id);
    await wait("screen==='detail'");
    await ev('goBack()');
    await wait("document.querySelector('#queryTerm')?.value==='wedgie' && !!document.querySelector('#dictResult .english')");
    if(!existing)await ev(`rpc('delete',{id:${JSON.stringify(added.id)}})`);
    console.log('PASS airplane mode: uncommon words, both wedgie senses, Chinese, phrase, no-result state, stale searches, opt-in save, deduplication and back navigation');
  } finally {
    disconnect();
    cmd('shell','cmd','connectivity','airplane-mode',airplane==='1'?'enable':'disable');
  }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
