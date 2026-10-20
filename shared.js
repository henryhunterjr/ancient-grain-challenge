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
    set(k, v) { try { localStorage.setItem(k, v); if (localStorage.getItem(k) !== v) throw Error(); transient.delete(k); return true; }
      catch { transient.set(k, v); return false; } },
    del(k) { try { localStorage.removeItem(k); transient.delete(k); } catch { transient.set(k, null); } },
    durable(k) { try { return !!store.get(k) && localStorage.getItem(k) === store.get(k); } catch { return false; } },
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
  // Lessons: original YouTube IDs, stable quiz IDs, and public quiz routes, keyed by task key. Order comes from the tasks table.
  const LESSONS = {
    m3: { videos: ["smiOhsBluSY"], quizId: "from-berries-to-bread-module-one-kj65x0xbgxctgu", quiz: "/quiz?quiz=from-berries-to-bread-module-one-kj65x0xbgxctgu" },
    m7: { videos: ["Lyjw-E4a-Qk"], quizId: "rye-redefined-quiz-lxm6dxqxlxxkxoxkn", quiz: "/quiz?quiz=rye-redefined-quiz-lxm6dxqxlxxkxoxkn" },
    m1: { videos: ["QoGpW6hXxz8"], quizId: "why-ancient-wheat-dough-feels-xht6epxj9xxxrrn", quiz: "/quiz?quiz=why-ancient-wheat-dough-feels-xht6epxj9xxxrrn" },
    m2: { videos: ["1GGZgB2TMgY"], quizId: "the-kneading-fallacy-xox06exr433x0xoxm", quiz: "/quiz?quiz=the-kneading-fallacy-xox06exr433x0xoxm" },
    m4: { videos: ["xWSZYfOUkrw"], quizId: "which-wheat-berry-xyr6exixztixzgi", quiz: "/quiz?quiz=which-wheat-berry-xyr6exixztixzgi" },
    m6: { videos: ["30SLfbm1fZk"], quizId: "mastering-einkorn-gs6exki0xyxbfxe", quiz: "/quiz?quiz=mastering-einkorn-gs6exki0xyxbfxe" },
    m5: { videos: ["gK2UtnJUxX8", "2d-3xPuWsQc"], quizId: "ancient-grain-sourdough-starter-jv6exlxjhxj67f", quiz: "/quiz?quiz=ancient-grain-sourdough-starter-jv6exlxjhxj67f" }
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
    const input = el('textarea', { class: 'code entry-code', readonly: true, rows: '2', 'aria-label': 'Your private entry code', autocomplete: 'off', spellcheck: 'false' }, token);
    const message = el('p', { class: 'msg', role: 'status', 'aria-live': 'polite' });
    const button = el('button', { type: 'button', class: 'entry-code-copy' }, 'Copy code');
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      if (store.get('agc_token') !== token) { message.textContent = 'Your entry changed. Return to Your entry to copy the current code.'; return; }
      button.disabled = true;
      let copied = false;
      try { await navigator.clipboard.writeText(token); copied = true; } catch {
        input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
        try { copied = document.execCommand('copy'); } catch {}
      }
      message.className = 'msg' + (copied ? ' ok' : '');
      message.textContent = copied ? 'Code copied. Save it somewhere private.' : 'Automatic copy is unavailable. Your code is selected; copy it manually or write it down.';
      button.disabled = false;
    });
    return el('div', { class: 'stack entry-code-panel' },
      el('strong', { text: 'Your private entry code' }), input, button, message,
      el('p', { class: 'muted', text: 'Copy or write down this code now. Use it to return on another phone or computer. Anyone with this code can access your entry; keep it private.' }),
      ...(!store.durable('agc_token') ? [el('p', { class: 'msg', role: 'status', text: 'This browser could not save your sign-in. Save your code before leaving; this page can keep you signed in only while it remains open.' })] : []));
  }
  // Email sign-in link. The server answers the same way for every address, so
  // this form never reveals who registered. A pending quiz score rides along in
  // the link so it still saves when the email opens in a different browser.
  const SIGNIN_URL = "https://pmhytaaajbhzyldmxmzb.supabase.co/functions/v1/entry-signin";
  async function signin(body) {
    const res = await fetch(SIGNIN_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), referrerPolicy: "no-referrer" });
    let data = null; try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }
  function emailSignIn(getQuiz, next) {
    const input = el("input", { id: "signin-email", type: "email", required: true, autocomplete: "email", inputmode: "email", maxlength: "254", placeholder: "you@example.com" });
    const button = el("button", { type: "submit" }, "Email me a sign-in link");
    const msg = el("p", { class: "msg", role: "status", "aria-live": "polite" });
    const form = el("form", { class: "stack signin-email", novalidate: true },
      el("label", { for: "signin-email" }, "The email you registered with", input), el("div", {}, button), msg);
    form.addEventListener("submit", async (e) => {
      e.preventDefault(); if (button.disabled) return;
      const email = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.className = "msg err"; msg.textContent = "Enter the email address you registered with."; return; }
      button.disabled = true; msg.className = "msg"; msg.textContent = "Sending…";
      const pending = typeof getQuiz === "function" ? getQuiz() : null;
      try {
        const r = await signin({ action: "request", email, ...(next ? { next } : {}), ...(pending ? { quiz: { quiz: pending.quiz, score: pending.score, total: pending.total } } : {}) });
        if (!r.ok) throw new Error(r.data?.error || "status");
        msg.className = "msg ok"; msg.textContent = r.data?.message || "Check your inbox for your sign-in link.";
        button.textContent = "Send another link";
      } catch (err) {
        msg.className = "msg err";
        msg.textContent = err.message === "email" ? "Enter the email address you registered with." : "We couldn't send a link right now. Try again in a minute, or sign in with your entry code.";
      }
      setTimeout(() => { button.disabled = false; }, 4000);
    });
    return form;
  }
  return { rpc, store, el, LESSONS, videoBox, quizPercentage, lessonProof, taskDescription, codePanel, signin, emailSignIn };
})();
