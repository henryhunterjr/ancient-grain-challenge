// Winners desk for the Challenge Host Desk: prize fulfillment, Grand Teton shipment list,
// weekly announcements, and nudges for bakers who stalled. Loaded by admin.html after login.
window.AGCWinners = (() => {
  const { rpc, el } = AGC;
  const SITE = "https://challenge.bakinggreatbread.com";
  const FROM_NAME = "Henry Hunter";
  const SIGNATURE = "\n\nHenry Hunter\nCrust & Crumb Academy\nhenrysbreadkitchen@gmail.com";
  const DRAW_DATES = ["2026-10-16","2026-10-23","2026-10-30","2026-11-06","2026-11-13","2026-11-20","2026-11-27"];
  const FINALE = "2026-12-01";
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

  let ctx = { key: null, data: null, tasks: [] };
  let winners = [];

  // ---------- helpers ----------
  const $ = id => document.getElementById(id);
  const first = n => String(n || "").trim().split(/\s+/)[0] || "there";
  const publicName = n => { const p = String(n || "").trim().split(/\s+/); return p[0] + (p[1] ? " " + p[1][0] + "." : ""); };
  const fmt = d => d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const fmtDay = d => d ? new Date(d).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }) : "";
  const shortDay = d => new Date(d + "T12:00:00").toLocaleDateString([], { month: "short", day: "numeric" });
  const longDay = d => new Date(d + "T12:00:00").toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  const esc = v => {
    let text = String(v ?? "");
    // Quoting CSV alone does not stop spreadsheet formula evaluation.
    if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const html = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Gmail compose in a new tab. A plain mailto: link needs a desktop mail app, which Henry's browser doesn't have.
  const compose = (to, subject, body) => "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(to || "") + "&su=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
  const emailText = (to, subject, body) => `To: ${to || ""}\nSubject: ${subject}\n\n${body}`;
  const claimLink = w => SITE + "/claim?c=" + w.claim_token;
  const isGrand = w => w.kind === "grand";
  const prizeWords = w => isGrand(w) ? "the 25 lb grand prize" : "a 5 lb bag of grain";
  const bagWords = w => isGrand(w) ? "25 lb bag" : "5 lb bag";
  const addressLines = w => [w.ship_name, w.address1, w.address2, [w.city, w.ship_region, w.postal].filter(Boolean).join(", "), w.ship_country].filter(Boolean);
  const hasAddress = w => !!(w.address1 && w.city);
  const overdue = w => w.claim_expires_at && !hasAddress(w) && w.status === "notified" && new Date(w.claim_expires_at) < new Date();

  // Label for a draw from its date: "Week 3 · Oct 30" or "Finale · Dec 1".
  function labelFor(dateLike) {
    const d = new Date(dateLike); const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    // Nearest scheduled draw date wins, so a Saturday catch-up draw still lands in the right week.
    const days = s => Math.abs((new Date(s + "T12:00:00") - new Date(ymd + "T12:00:00")) / 864e5);
    const all = [...DRAW_DATES, FINALE];
    const nearest = all.reduce((best, x) => days(x) < days(best) ? x : best, all[0]);
    if (nearest === FINALE) return "Finale · " + shortDay(FINALE);
    return `Week ${DRAW_DATES.indexOf(nearest) + 1} · ${shortDay(nearest)}`;
  }
  function nextDrawDate(from = new Date()) {
    const ymd = from.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    return DRAW_DATES.find(x => x > ymd) || FINALE;
  }
  const weekOf = w => w.label || labelFor(w.drawn_at);

  // Modules in lesson order, and the next one a baker hasn't finished.
  const modules = () => ctx.tasks.filter(t => t.category === "module" && t.active).sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key));
  function nextLesson(entrant) {
    const done = new Set((entrant.claims || []).filter(c => c.status === "verified").map(c => c.task_key));
    return modules().find(m => !done.has(m.key)) || null;
  }
  const lessonUrl = m => `${SITE}/lesson?m=${m.key}`;
  const lastActivity = e => (e.claims || []).reduce((m, c) => c.claimed_at > m ? c.claimed_at : m, e.created_at);
  const realEntrants = () => (ctx.data?.entrants || []).filter(e => !e.disqualified && !e.is_test);

  function copyBtn(text, label = "Copy") {
    const b = el("button", { type: "button", class: "ghost small" }, label);
    b.onclick = async () => { try { await navigator.clipboard.writeText(typeof text === "function" ? text() : text); b.textContent = "Copied"; setTimeout(() => b.textContent = label, 1500); } catch { b.textContent = "Select and copy"; } };
    return b;
  }
  function download(name, content, type = "text/csv") {
    const a = el("a", { href: URL.createObjectURL(new Blob([content], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  async function mark(w, event) {
    const r = await rpc("admin_winner_mark", { p_key: ctx.key, p_draw_id: w.draw_id, p_event: event });
    if (r.error) throw new Error(r.error);
    await load();
  }

  // ---------- email copy, in Henry's voice ----------
  const progressLine = w => w.modules_verified >= 7
    ? "You've already finished all seven lessons, so you're in the drawing for the 25 lb grand prize on December 1 too."
    : `You've finished ${w.modules_verified} of the seven lessons. Finish all seven and you're in the drawing for the 25 lb grand prize on December 1.`;

  function winnerEmail(w) {
    const due = w.claim_expires_at ? fmtDay(w.claim_expires_at) : fmtDay(new Date(Date.now() + 7 * 864e5));
    const subject = isGrand(w) ? "You won the 25 lb grand prize in the Ancient Grain Challenge" : "You won a 5 lb bag of grain in the Ancient Grain Challenge";
    const body = `Hi ${first(w.full_name)},

Good news. Your name came up in the ${weekOf(w)} drawing for the Ancient Grain Challenge. You won ${prizeWords(w)} from Grand Teton Ancient Grains.

To get it shipped, open your private claim link and tell us where to send it and which grain you'd like:
${claimLink(w)}

Please do that within 7 days, by ${due}. After that the bag goes back into the drawing for another baker.

${isGrand(w) ? "" : progressLine(w) + "\n\n"}Congratulations, and keep baking.${SIGNATURE}`;
    return { subject, body };
  }
  function reminderEmail(w) {
    const due = w.claim_expires_at ? fmtDay(w.claim_expires_at) : "the end of the week";
    return { subject: `Quick reminder: your ${bagWords(w)} of grain is waiting`, body: `Hi ${first(w.full_name)},

Just a nudge. You won ${prizeWords(w)} in the Ancient Grain Challenge, and I haven't received your shipping details yet.

Here's your private claim link again. It takes about a minute:
${claimLink(w)}

I need it by ${due} so Grand Teton can ship this week's bags together. If I don't hear from you by then, the bag goes back into the drawing.

If the link gives you any trouble, just reply to this email with your address and the grain you'd like.${SIGNATURE}` };
  }
  function shippedEmail(w) {
    return { subject: `Your ${bagWords(w)} of ${w.grain || "grain"} is on the way`, body: `Hi ${first(w.full_name)},

Your ${bagWords(w)} of ${w.grain || "grain"} shipped from Grand Teton Ancient Grains in Driggs, Idaho.${w.tracking ? `

Tracking: ${w.tracking}` : ""}

When it lands, mill it fresh if you can and bake something. Then post it in the Academy or tag me. I'd love to see what you make with it.

${w.modules_verified >= 7 ? "You've finished all seven lessons, so you're still in the December 1 drawing for the 25 lb grand prize." : "You're still in the running for the 25 lb grand prize on December 1 once you finish all seven lessons."}${SIGNATURE}` };
  }
  function dmText(w) {
    return `Congratulations, ${first(w.full_name)}! Your name came up in the ${weekOf(w)} drawing for the Ancient Grain Challenge. You won ${prizeWords(w)} from Grand Teton Ancient Grains.

Tap this private link to tell us where to ship it and which grain you'd like. Please do it within 7 days:
${claimLink(w)}

Keep the link to yourself, it's tied to your prize. Henry`;
  }
  function partnerEmail(list, label) {
    const lines = list.map((w, i) => `${i + 1}. ${w.ship_name || w.full_name}
   ${[w.address1, w.address2].filter(Boolean).join(", ")}
   ${[w.city, w.ship_region, w.postal].filter(Boolean).join(", ")}, ${w.ship_country || w.country}${w.phone ? "\n   Phone: " + w.phone : ""}
   Grain: ${w.grain || "Surprise me"} · ${bagWords(w)}`).join("\n\n");
    return { subject: `Ancient Grain Challenge winners, ${label}: ${list.length} ${list.length === 1 ? "bag" : "bags"} to ship`, body: `Hi Adam,

Here are the Ancient Grain Challenge winners for ${label}, with shipping details and the grain each one picked. ${list.length} ${list.length === 1 ? "bag" : "bags"} total. The same list is attached as a CSV.

${lines}

Thank you, and please thank Jade. These bakers earned it by finishing the lessons.

If you can send me tracking numbers once they go out, I'll pass them along to the winners.${SIGNATURE}` };
  }
  function partnerCsv(list) {
    const cols = ["week", "prize", "ship_name", "address1", "address2", "city", "state_province", "postal", "country", "phone", "grain", "email", "drawn_at"];
    const rows = list.map(w => [weekOf(w), bagWords(w), w.ship_name || w.full_name, w.address1, w.address2, w.city, w.ship_region, w.postal, w.ship_country || w.country, w.phone, w.grain || "Surprise me", w.email, new Date(w.drawn_at).toISOString().slice(0, 10)]);
    return [cols.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  }

  // ---------- announcements ----------
  function announcement(list, label) {
    const next = nextDrawDate();
    const isFinale = list.some(isGrand);
    const bullets = list.map(w => `• ${publicName(w.full_name)}${w.region ? " (" + w.region + ")" : ""}: ${isGrand(w) ? "25 lb grand prize" : "5 lb bag"}${w.grain && w.grain !== "Surprise me" ? ", " + w.grain : ""}`).join("\n");
    const count = list.filter(w => !isGrand(w)).length;
    const nextLine = isFinale ? "" : `\n\nNext drawing is ${longDay(next)}. Finish one lesson and you're in. Every verified point is one more entry, and you can only win one 5 lb bag, so new names keep coming up.`;
    const skool = `🎉 ${label} winners: Ancient Grain Challenge

${count ? `${count === 1 ? "One baker" : count + " bakers"} just won a 5 lb bag of grain from Grand Teton Ancient Grains${isFinale ? ", and we have a grand prize winner" : ""}:` : "We have a grand prize winner:"}

${bullets}

Congratulations. Winners, check your email for a private claim link. Tell us where to ship and which grain you want.${nextLine}

Haven't started? The lessons are short and free: ${SITE}/#lessons
Already registered? Find your entry and see your progress: ${SITE}/#me`;
    const facebook = `🎉 We just drew the ${label} winners in the Ancient Grain Challenge.

${bullets}

Each of them gets a 5 lb bag of grain from Grand Teton Ancient Grains, shipped to their door${isFinale ? ", and one takes home the 25 lb grand prize" : ""}.

This challenge is free and open to everyone, not just Academy members. Watch a short lesson on ancient grains or fresh-milled flour, pass the quiz, and your name goes in the hat.${nextLine}

Start here: ${SITE}`;
    const newsletterHtml = `<h2>${html(label)} winners: Ancient Grain Challenge</h2>
<p>${count ? `${count === 1 ? "One baker" : count + " bakers"} won a 5 lb bag of grain from Grand Teton Ancient Grains this week` : "We have a grand prize winner"}:</p>
<ul>
${list.map(w => `  <li><strong>${html(publicName(w.full_name))}</strong>${w.region ? ", " + html(w.region) : ""}: ${isGrand(w) ? "25 lb grand prize" : "5 lb bag"}${w.grain && w.grain !== "Surprise me" ? ", " + html(w.grain) : ""}</li>`).join("\n")}
</ul>
${isFinale ? "" : `<p>Next drawing is ${longDay(next)}. Finish one lesson and you're in. Finish all seven and you qualify for the 25 lb grand prize on December 1.</p>`}
<p><a href="${SITE}/#lessons">Watch the next lesson</a> · <a href="${SITE}/#me">Check your entry</a></p>`;
    const newsletterText = `${label} winners: Ancient Grain Challenge

${bullets}
${isFinale ? "" : `
Next drawing is ${longDay(next)}. Finish one lesson and you're in. Finish all seven and you qualify for the 25 lb grand prize on December 1.`}
Watch the next lesson: ${SITE}/#lessons
Check your entry: ${SITE}/#me`;
    return { skool, facebook, newsletterHtml, newsletterText };
  }

  // ---------- nudges ----------
  function nudgeEmail(e) {
    const next = nextLesson(e); const n = e.modules_verified || 0; const draw = longDay(nextDrawDate());
    const subject = n === 0 ? "Your first lesson takes 15 minutes, and it puts you in Friday's drawing" : `You're ${7 - n} lesson${7 - n === 1 ? "" : "s"} from the grand prize drawing`;
    const opener = n === 0
      ? `You registered for the Ancient Grain Challenge but haven't started a lesson yet. No problem. We just drew this week's winners, and I'd like to see your name in the next one.`
      : `We just drew this week's Ancient Grain Challenge winners, and I want you in the next one. You've finished ${n} of the seven lessons.`;
    const lessonPart = next ? `Your next lesson is ${next.title}. It runs about 15 minutes, and passing the quiz puts you in the drawing on ${draw} for a 5 lb bag of grain:
${lessonUrl(next)}` : `You've finished every lesson, so you're already in every drawing that's left.`;
    const body = `Hi ${first(e.full_name)},

${opener}

${lessonPart}

Finish all seven and you qualify for the 25 lb grand prize on December 1. Your entry and points are here anytime: ${SITE}/#me

See you Friday.${SIGNATURE}`;
    return { subject, body };
  }
  function blastText(label, list) {
    const next = longDay(nextDrawDate());
    const names = list.length ? list.map(w => publicName(w.full_name)).join(", ") : "this week's winners";
    return `Subject: We drew ${list.length || "this week's"} winners. Are you in Friday's drawing?

Hi bakers,

We just drew the ${label} winners in the Ancient Grain Challenge: ${names}. Each one gets a 5 lb bag of grain from Grand Teton Ancient Grains.

If your name wasn't called, here's the thing. Most of you who registered haven't finished a lesson yet, and one finished lesson is all it takes to be in Friday's drawing on ${next}. The lessons are 15 minutes each. Watch one, pass the quiz, and you're in.

Pick up where you left off: ${SITE}/#me
Start with From Berries to Bread: ${SITE}/#lessons

Finish all seven and you qualify for the 25 lb grand prize on December 1.

Henry`;
  }

  // ---------- rendering ----------
  function pill(w) {
    const map = { drawn: ["pending", "Needs notice"], notified: ["pending", "Waiting on address"], address_received: ["verified", "Ready for Grand Teton"], sent_to_partner: ["req", "At Grand Teton"], shipped: ["verified", "Shipped"], forfeited: ["rejected", "Forfeited"] };
    const [cls, text] = map[w.status] || ["pending", w.status];
    return el("span", { class: "pill " + cls, text: overdue(w) ? "Past 7 days" : text });
  }
  function timeline(w) {
    const steps = [["Drawn", w.drawn_at], ["Notified", w.notified_at], ["Reminded", w.reminded_at], ["Address", w.address_received_at], ["To Grand Teton", w.sent_to_partner_at], ["Shipped", w.shipped_at], ["Announced", w.announced_at]];
    return el("div", { class: "muted", style: "font-size:.85rem;display:flex;flex-wrap:wrap;gap:6px 14px" }, ...steps.map(([n, t]) => el("span", { style: t ? "" : "opacity:.5" }, `${t ? "✓" : "○"} ${n}${t ? " " + fmt(t) : ""}`)));
  }
  function addressForm(w, onSaved) {
    const f = {};
    const inp = (k, label, val) => el("label", {}, label, f[k] = el("input", { value: val || "" }));
    const form = el("div", { class: "stack", style: "gap:8px" },
      el("div", { class: "grid2" }, inp("ship_name", "Name on label", w.ship_name || w.full_name), inp("grain", "Grain", w.grain)),
      inp("address1", "Street", w.address1), inp("address2", "Apt / unit", w.address2),
      el("div", { class: "grid2" }, inp("city", "City", w.city), inp("region", "State / province", w.ship_region)),
      el("div", { class: "grid2" }, inp("postal", "ZIP / postal", w.postal), inp("country", "Country", w.ship_country || w.country)),
      el("div", { class: "grid2" }, inp("phone", "Phone", w.phone), inp("tracking", "Tracking number", w.tracking)));
    const msg = el("span", { class: "msg", role: "status" });
    const save = el("button", { type: "button", class: "small" }, "Save details");
    save.onclick = async () => {
      save.disabled = true;
      const fields = Object.fromEntries(Object.entries(f).map(([k, n]) => [k, n.value.trim()]));
      try {
        const r = await rpc("admin_winner_edit", { p_key: ctx.key, p_draw_id: w.draw_id, p_fields: fields });
        if (r.error) throw 0;
        if (fields.address1 && fields.city && !w.address_received_at) await rpc("admin_winner_mark", { p_key: ctx.key, p_draw_id: w.draw_id, p_event: "address_received" });
        await load(); onSaved && onSaved();
      } catch { msg.className = "msg err"; msg.textContent = "Couldn't save."; save.disabled = false; }
    };
    form.append(el("div", { class: "bar" }, save, msg));
    return form;
  }
  function winnerCard(w) {
    const msg = el("span", { class: "msg", role: "status" });
    const act = (label, fn, cls = "small") => { const b = el("button", { type: "button", class: cls }, label); b.onclick = async () => { b.disabled = true; try { await fn(); } catch { msg.className = "msg err"; msg.textContent = "Couldn't save. Try again."; b.disabled = false; } }; return b; };
    const link = (label, href) => el("a", { class: "btn-link ghost-link", style: "padding:6px 12px;font-size:.85rem", href, target: "_blank", rel: "noopener", text: label });
    const notice = winnerEmail(w), remind = reminderEmail(w), shipped = shippedEmail(w);
    const actions = el("div", { class: "bar" });
    if (w.status === "drawn") actions.append(link("Open winner email in Gmail", compose(w.email, notice.subject, notice.body)), copyBtn(emailText(w.email, notice.subject, notice.body), "Copy email"), act("Mark notified", () => mark(w, "notified")));
    if (w.status === "notified") actions.append(link("Open reminder email in Gmail", compose(w.email, remind.subject, remind.body)), copyBtn(emailText(w.email, remind.subject, remind.body), "Copy email"), act("Mark reminded", () => mark(w, "reminded"), "ghost small"));
    if (w.status === "sent_to_partner") actions.append(link("Open shipped email in Gmail", compose(w.email, shipped.subject, shipped.body)), copyBtn(emailText(w.email, shipped.subject, shipped.body), "Copy email"), act("Mark shipped", () => mark(w, "shipped")));
    if (!w.announced_at && w.status !== "forfeited") actions.append(act("Mark announced", () => mark(w, "announced"), "ghost small"));
    if (["drawn", "notified"].includes(w.status)) {
      const forfeit = act("Forfeit (no reply)", async () => { if (confirm(`Forfeit ${w.full_name}'s ${bagWords(w)}? They won't be able to claim it, and the bag goes back to the pool for the next draw.`)) await mark(w, "forfeited"); else forfeit.disabled = false; }, "ghost small");
      actions.append(forfeit);
    }
    actions.append(msg);

    const details = el("div", { class: "stack", style: "gap:8px", hidden: true });
    const toggle = el("button", { type: "button", class: "ghost small" }, hasAddress(w) ? "Edit details" : "Enter address by hand");
    toggle.onclick = () => { details.hidden = !details.hidden; if (!details.hidden && !details.childElementCount) details.append(addressForm(w, () => details.hidden = true)); };

    const labelIn = el("input", { value: w.label || "", placeholder: labelFor(w.drawn_at), style: "max-width:200px" });
    const labelSave = act("Save label", async () => { const r = await rpc("admin_set_draw_label", { p_key: ctx.key, p_draw_id: w.draw_id, p_label: labelIn.value.trim() || labelFor(w.drawn_at) }); if (r.error) throw 0; await load(); }, "ghost small");

    const notes = el("textarea", { rows: 2, placeholder: "Notes (replied by email, asked for Spelt instead, etc.)" }); notes.value = w.notes || "";
    const notesSave = act("Save note", async () => { const r = await rpc("admin_winner_edit", { p_key: ctx.key, p_draw_id: w.draw_id, p_fields: { notes: notes.value.trim() } }); if (r.error) throw 0; await load(); }, "ghost small");

    return el("div", { class: "card winner stack", style: "gap:8px" },
      el("div", { class: "bar", style: "justify-content:space-between" },
        el("strong", { text: `${weekOf(w)} · ${w.prize}: ${w.full_name} (${w.grain || w.preferred_grain || "no grain chosen"})` }), pill(w)),
      el("span", { class: "muted", text: `${w.email} · ${[w.region, w.country].filter(Boolean).join(", ")} · From: ${w.skool_name} · ${w.modules_verified}/7 lessons · ${w.entries} entries of ${w.pool_size} · drawn ${fmt(w.drawn_at)}` }),
      timeline(w),
      overdue(w) ? el("p", { class: "msg err", text: `No address and the 7 day window closed ${fmtDay(w.claim_expires_at)}. Send one more reminder or forfeit and draw again.` }) : null,
      hasAddress(w) ? el("p", { style: "white-space:pre-line;margin:0", text: addressLines(w).join("\n") + (w.phone ? "\n" + w.phone : "") + (w.tracking ? "\nTracking: " + w.tracking : "") }) : null,
      el("div", { class: "bar" }, el("input", { readonly: true, class: "code", value: claimLink(w), "aria-label": "Private claim link", style: "flex:1 1 320px" }), copyBtn(claimLink(w), "Copy claim link"), copyBtn(() => dmText(w), "Copy DM for Skool or Facebook")),
      actions,
      el("div", { class: "bar" }, toggle, labelIn, labelSave),
      details,
      el("div", { class: "bar" }, el("div", { style: "flex:1 1 320px" }, notes), notesSave));
  }

  function renderWinners() {
    const sel = $("win-week"); const current = sel.value;
    const weeks = [...new Set(winners.map(weekOf))];
    sel.replaceChildren(el("option", { value: "", text: "All drawings" }), ...weeks.map(x => el("option", { value: x, text: x })));
    if (weeks.includes(current)) sel.value = current;
    const list = winners.filter(w => !sel.value || weekOf(w) === sel.value);
    const by = s => winners.filter(w => w.status === s).length;
    $("win-tiles").replaceChildren(...[["Need notice", by("drawn")], ["Waiting on address", by("notified")], ["Ready for Grand Teton", by("address_received")], ["At Grand Teton", by("sent_to_partner")], ["Shipped", by("shipped")]]
      .map(([l, n]) => el("div", { class: "tile" }, el("b", { text: String(n) }), el("span", { class: "muted", text: l }))));
    const unlabeled = winners.filter(w => !w.label);
    $("win-fix-labels").hidden = !unlabeled.length;
    $("win-fix-labels").textContent = `Fill in ${unlabeled.length} missing label${unlabeled.length === 1 ? "" : "s"}`;
    $("win-list").replaceChildren(...(list.length ? list.map(winnerCard) : [el("p", { class: "muted", text: "No winners yet. Draw one above and it shows up here." })]));
  }

  function renderPartner() {
    const to = $("partner-email").value.trim();
    const ready = winners.filter(w => w.status === "address_received");
    const label = [...new Set(ready.map(weekOf))].join(" + ") || "this week";
    const mail = partnerEmail(ready, label);
    $("partner-count").textContent = ready.length ? `${ready.length} ${ready.length === 1 ? "bag is" : "bags are"} ready to send to Grand Teton (${label}). Download the CSV, open the email and attach it, then mark them sent.` : "Nothing waiting. Winners show up here once their address is in.";
    $("partner-table").replaceChildren(...ready.map(w => el("div", { class: "winner-row" },
      el("strong", { text: w.ship_name || w.full_name }), el("span", { class: "muted", text: addressLines(w).slice(1).join(", ") + (w.phone ? " · " + w.phone : "") }), el("span", { class: "pill verified", text: (w.grain || "Surprise me") + " · " + bagWords(w) }))));
    $("partner-csv").disabled = !ready.length;
    $("partner-csv").onclick = () => download(`grand-teton-shipments-${new Date().toISOString().slice(0, 10)}.csv`, partnerCsv(ready));
    const a = $("partner-mail"); a.href = compose(to, mail.subject, mail.body); $("partner-copy").onclick = async () => { try { await navigator.clipboard.writeText(emailText(to, mail.subject, mail.body)); $("partner-copy").textContent = "Copied"; setTimeout(() => $("partner-copy").textContent = "Copy email text", 1500); } catch {} }; $("partner-copy").disabled = !ready.length; a.classList.toggle("disabled", !ready.length); a.setAttribute("aria-disabled", String(!ready.length));
    $("partner-mark").disabled = !ready.length;
    $("partner-mark").onclick = async () => {
      if (!confirm(`Mark ${ready.length} winner${ready.length === 1 ? "" : "s"} as sent to Grand Teton? Their claim links lock after this.`)) return;
      $("partner-mark").disabled = true;
      for (const w of ready) await rpc("admin_winner_mark", { p_key: ctx.key, p_draw_id: w.draw_id, p_event: "sent_to_partner" });
      await load();
    };
    const all = winners.filter(hasAddress);
    $("partner-all").disabled = !all.length;
    $("partner-all").onclick = () => download("grand-teton-all-winners.csv", partnerCsv(all));
  }

  function renderAnnounce() {
    const sel = $("ann-week"); const current = sel.value;
    const weeks = [...new Set(winners.map(weekOf))];
    sel.replaceChildren(...weeks.map(x => el("option", { value: x, text: x })));
    sel.value = weeks.includes(current) ? current : weeks[0] || "";
    const list = winners.filter(w => weekOf(w) === sel.value && w.status !== "forfeited");
    const box = $("ann-out");
    if (!list.length) { box.replaceChildren(el("p", { class: "muted", text: "Draw this week's winners first." })); return; }
    const a = announcement(list, sel.value);
    const block = (title, text, hint) => el("div", { class: "stack", style: "gap:6px" }, el("div", { class: "bar", style: "justify-content:space-between" }, el("strong", { text: title }), copyBtn(text)), hint ? el("span", { class: "muted", text: hint }) : null, Object.assign(el("textarea", { rows: 9, readonly: true }), { value: text }));
    const unannounced = list.filter(w => !w.announced_at);
    const markAll = el("button", { type: "button", class: "small", disabled: !unannounced.length }, unannounced.length ? `Mark ${sel.value} announced` : "Announced");
    markAll.onclick = async () => { markAll.disabled = true; for (const w of unannounced) await rpc("admin_winner_mark", { p_key: ctx.key, p_draw_id: w.draw_id, p_event: "announced" }); await load(); };
    box.replaceChildren(
      block("Skool post (Crust & Crumb Academy)", a.skool),
      block("Facebook post (Baking Great Bread at Home)", a.facebook, "Add your photo of the bags or the Grand Teton image."),
      block("Newsletter block, HTML (paste into the Recipe Pantry newsletter editor)", a.newsletterHtml),
      block("Newsletter block, plain text", a.newsletterText),
      el("div", { class: "bar" }, markAll));
  }

  function renderNudges() {
    const E = realEntrants();
    const band = e => e.modules_verified >= 7 ? "done" : e.modules_verified >= 4 ? "4-6" : e.modules_verified >= 1 ? "1-3" : "0";
    const counts = { "0": 0, "1-3": 0, "4-6": 0, done: 0 }; E.forEach(e => counts[band(e)]++);
    $("nudge-tiles").replaceChildren(...[["Registered, no lessons", counts["0"]], ["1 to 3 lessons", counts["1-3"]], ["4 to 6 lessons", counts["4-6"]], ["All 7 done", counts.done]]
      .map(([l, n]) => el("div", { class: "tile" }, el("b", { text: String(n) }), el("span", { class: "muted", text: l }))));
    const filter = $("nudge-filter").value;
    const list = E.filter(e => filter === "all" ? e.modules_verified < 7 : band(e) === filter).sort((a, b) => lastActivity(a).localeCompare(lastActivity(b)));
    $("nudge-count").textContent = `${list.length} baker${list.length === 1 ? "" : "s"}`;
    const bcc = list.map(e => e.email).join(",");
    $("nudge-bcc").onclick = async () => { try { await navigator.clipboard.writeText(bcc); $("nudge-bcc").textContent = "Copied"; setTimeout(() => $("nudge-bcc").textContent = "Copy all emails", 1500); } catch {} };
    $("nudge-bcc").disabled = !list.length;
    $("nudge-rows").replaceChildren(...list.map(e => {
      const next = nextLesson(e); const m = nudgeEmail(e);
      return el("tr", {},
        el("td", {}, el("strong", { text: e.full_name }), el("br"), el("small", { text: e.email })),
        el("td", { class: "num", text: `${e.modules_verified}/7` }),
        el("td", { text: next ? next.title : "All done" }),
        el("td", { text: fmt(lastActivity(e)) }),
        el("td", {}, el("a", { class: "btn-link ghost-link", style: "padding:6px 12px;font-size:.85rem", href: compose(e.email, m.subject, m.body), target: "_blank", rel: "noopener", text: "Open nudge in Gmail" }), " ", copyBtn(emailText(e.email, m.subject, m.body), "Copy")));
    }));
    const thisWeek = winners.filter(w => w.status !== "forfeited" && weekOf(w) === weekOf(winners[0] || { drawn_at: new Date() }));
    const blast = $("nudge-blast"); blast.value = blastText(weekOf(winners[0] || { drawn_at: new Date() }), thisWeek);
  }

  async function load() {
    const r = await rpc("admin_winners", { p_key: ctx.key });
    if (r.error) return;
    winners = r;
    renderWinners(); renderPartner(); renderAnnounce(); renderNudges();
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $("win-week").onchange = renderWinners;
    $("ann-week").onchange = renderAnnounce;
    $("nudge-filter").onchange = renderNudges;
    $("partner-email").value = ls.get("agc_partner_email") || "";
    $("partner-email").oninput = () => { ls.set("agc_partner_email", $("partner-email").value.trim()); renderPartner(); };
    $("nudge-blast-copy").onclick = async () => { try { await navigator.clipboard.writeText($("nudge-blast").value); $("nudge-blast-copy").textContent = "Copied"; setTimeout(() => $("nudge-blast-copy").textContent = "Copy", 1500); } catch {} };
    $("win-fix-labels").onclick = async () => {
      $("win-fix-labels").disabled = true;
      for (const w of winners.filter(x => !x.label)) await rpc("admin_set_draw_label", { p_key: ctx.key, p_draw_id: w.draw_id, p_label: labelFor(w.drawn_at) });
      await load(); $("win-fix-labels").disabled = false;
    };
    const dl = $("draw-label"); if (dl && !dl.value) dl.placeholder = labelFor(new Date());
  }

  // Called by admin.html after each successful overview load.
  async function refresh(next) {
    ctx = { ...ctx, ...next };
    wire();
    const dl = $("draw-label"); if (dl && !dl.value) dl.value = labelFor(new Date());
    await load();
  }
  return { refresh, labelFor, publicName, announcement, nudgeEmail, winnerEmail, partnerCsv };
})();
