// Shared API helper for the Ancient Grain Challenge.
const AGC = (() => {
  const URL = "https://pmhytaaajbhzyldmxmzb.supabase.co/rest/v1/rpc/";
  const KEY = "sb_publishable_D7GNfZ-2yw3hTN7A4jdUIg_0HJP9jzP";
  async function rpc(name, body = {}) {
    const res = await fetch(URL + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + KEY },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error("Server error " + res.status + (t ? ": " + t.slice(0, 200) : ""));
    }
    return res.json();
  }
  const transient = new Map();
  const store = {
    get(k) { if (transient.has(k)) return transient.get(k); try { return localStorage.getItem(k); } catch { return null; } },
    set(k,v) { try { localStorage.setItem(k,v); if (localStorage.getItem(k)!==v) throw Error(); transient.delete(k); return true; }
      catch { transient.set(k,v); return false; } },
    del(k) { try { localStorage.removeItem(k); transient.delete(k); } catch { transient.set(k,null); } },
    durable(k) { return !transient.has(k); },
  };
  function el(tag, attrs = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  }
  // Lessons: YouTube IDs and muse.ai quiz links, keyed by task key. Order comes from the tasks table.
  const LESSONS = {
    m3: { videos: ["smiOhsBluSY"], quiz: "https://muse.ai/s/from-berries-to-bread-module-one-kj65x0xbgxctgu" },
    m7: { videos: ["Lyjw-E4a-Qk"], quiz: "https://muse.ai/s/rye-redefined-quiz-lxm6dxqxlxxkxoxkn" },
    m1: { videos: ["QoGpW6hXxz8"], quiz: "https://muse.ai/s/why-ancient-wheat-dough-feels-xht6epxj9xxxrrn" },
    m2: { videos: ["1GGZgB2TMgY"], quiz: "https://muse.ai/s/the-kneading-fallacy-xox06exr433x0xoxm" },
    m4: { videos: ["xWSZYfOUkrw"], quiz: "https://muse.ai/s/which-wheat-berry-xyr6exixztixzgi" },
    m6: { videos: ["30SLfbm1fZk"], quiz: "https://muse.ai/s/mastering-einkorn-gs6exki0xyxbfxe" },
    m5: { videos: ["gK2UtnJUxX8", "2d-3xPuWsQc"], quiz: "https://muse.ai/s/ancient-grain-sourdough-starter-jv6exlxjhxj67f" }
  };
  function videoBox(id, i) {
    const box = el("div", { class: "video" });
    const b = el("button", { type: "button", class: "video-play", "aria-label": "Play lesson video " + (i + 1) },
      el("img", { src: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg", alt: "", loading: "lazy" }),
      el("span", { class: "play-icon", "aria-hidden": "true", text: "▶" }));
    b.addEventListener("click", () => {
      box.replaceChildren(el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0", title: "Lesson video", allow: "accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "true" }));
    });
    box.append(b);
    return box;
  }
  function quizPercentage(value) {
    if (typeof value !== "string" && typeof value !== "number") return null;
    const text = String(value).trim();
    if (!/^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/.test(text)) return null;
    const score = Number(text);
    return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
  }
  function lessonProof(youtubeName, score) {
    const name = youtubeName.trim();
    const percentage = quizPercentage(score);
    if (!name || name.length > 120 || /[\r\n]| · Score: /i.test(name)) throw new Error("youtube_name");
    if (percentage === null || percentage < 70) throw new Error("quiz_score");
    return `YouTube: ${name} · Score: ${percentage}%`;
  }
  function taskDescription(task) {
    return task.description;
  }
  function codePanel(token) {
    const input=el('textarea',{class:'code',readonly:true,rows:'2','aria-label':'Your private entry code',autocomplete:'off',spellcheck:'false'},token);
    const message=el('p',{class:'msg',role:'status'});
    const button=el('button',{type:'button'},'Copy code');
    button.addEventListener('click',async()=>{
      let copied=false;
      try { await navigator.clipboard.writeText(token); copied=true; } catch {
        input.focus(); input.select(); input.setSelectionRange(0,input.value.length);
        try { copied=document.execCommand('copy'); } catch {}
      }
      message.textContent=copied ? 'Code copied. Keep it private.' : 'Copy is unavailable. Your code is selected. Copy it with your keyboard or touch menu and save it somewhere private.';
    });
    return el('div',{class:'stack'},el('p',{text:'Your private entry code. Save it to return on another phone or computer. Anyone with this code can access your entry. Do not post or share it.'}),
      input,button,message,...(!store.durable('agc_token') ? [el('p',{class:'msg',role:'status',text:'This browser could not save your sign-in. Your code is shown now. Copy or write it down before leaving; this page can keep you signed in only while it remains open.'})] : []));
  }
  function emailRecoveryForm() {
    const email=el('input',{id:'recovery-email',type:'email',autocomplete:'email',required:true,maxlength:'254'});
    const message=el('p',{class:'msg',role:'status'}),button=el('button',{type:'submit'},'Email me a sign-in link');
    const form=el('form',{},el('p',{text:'Lost your code? Use the email on your existing entry. The private sign-in link expires after 15 minutes.'}),
      el('label',{for:'recovery-email'},'Email on your entry',email),button,message);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(button.disabled||!form.reportValidity())return;
      button.disabled=true;message.textContent='Requesting your sign-in link.';
      try {
        const response=await fetch('/api/recovery/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.value.trim()}),referrerPolicy:'no-referrer'});
        const result=await response.json();if(!response.ok||typeof result.message!=='string')throw Error('request');
        message.textContent=result.message;
      } catch { message.textContent='We could not confirm the request. Try again later or use your saved entry code. Your entry and points are still there.'; }
      button.disabled=false;
    });return form;
  }
  return { rpc, store, el, LESSONS, videoBox, quizPercentage, lessonProof, taskDescription, codePanel, emailRecoveryForm };
})();
