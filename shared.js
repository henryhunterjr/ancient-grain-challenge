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
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
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
  return { rpc, store, el };
})();
