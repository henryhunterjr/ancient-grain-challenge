(() => {
  const {el,store}=AGC,box=document.getElementById('recovery');
  const params=new URLSearchParams(location.hash.slice(1));
  let credential=params.size===1&&params.getAll('r').length===1&&!location.search?params.get('r'):null;
  history.replaceState(null,'',location.pathname);
  const invalid=()=>box.replaceChildren(el('p',{class:'msg',role:'status',text:'This sign-in link is invalid, expired, or already used. Request a new link. Your entry and points are still there.'}),AGC.emailRecoveryForm());
  if(!/^[A-Za-z0-9_-]{43}$/.test(credential||'')){invalid();return;}
  // GET/link scanners never consume the credential. Only this deliberate click
  // redeems it. Fragment is stripped before any API call; no analytics run here.
  const button=el('button',{type:'button'},'Continue to recover my entry');
  const message=el('p',{class:'msg',role:'status'});
  box.replaceChildren(el('p',{text:'Use this private link once to recover your existing entry. Your code and points will stay unchanged.'}),button,message);
  button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;message.textContent='Checking your sign-in link.';
    let identity=store.get('agc_token');
    try {
      const response=await fetch('/api/recovery/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential}),referrerPolicy:'no-referrer'});
      const result=await response.json();
      if(!response.ok){credential=null;invalid();return;}
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.token||'')||typeof result.first_name!=='string')throw Error('confirmation');
      credential=null;
      const use=el('button',{type:'button'},`Use my recovered entry for ${result.first_name}`);
      box.replaceChildren(el('h2',{text:`Entry recovered for ${result.first_name}`}),
        el('p',{text:'Save your private code now. Confirm this is your entry before continuing.'}),AGC.codePanel(result.token),
        ...(identity&&identity!==result.token?[el('p',{class:'msg',text:'This browser is signed in to a different entry. Continuing will switch this browser to your recovered entry.'})]:[]),use);
      use.addEventListener('click',()=>{
        if(store.get('agc_token')!==identity){
          box.append(el('p',{role:'status',text:'The entry session changed in another tab. Confirm again to switch to your recovered entry.'}));
          identity=store.get('agc_token');use.textContent=`Confirm switch to ${result.first_name}`;return;
        }
        finish(result);
      });
    } catch { credential=null;box.replaceChildren(el('p',{role:'status',class:'msg',text:'We could not confirm recovery. Request a new link; the previous link may already have been used. Your existing entry and points are unchanged.'}),AGC.emailRecoveryForm()); }
  });
  function finish(result){
    store.set('agc_token',result.token);
    box.replaceChildren(el('h2',{text:`Signed in as ${result.first_name}`}),AGC.codePanel(result.token),
      el('p',{text:'Your existing entry is ready. Pending quiz scores still require your explicit save confirmation.'}),
      ...(store.durable('agc_token')?[el('a',{class:'btn-link',href:'/#me',text:'Go to my entry'})]:[]),
      ...(store.durable('agc_token')&&QuizPending()?[el('a',{class:'btn-link',href:'/record-score',text:'Return to record my pending score'})]:[]));
  }
  function QuizPending(){try{return !!localStorage.getItem('agc_pending_quiz_v1');}catch{return false;}}
})();
