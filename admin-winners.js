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
  const isMixer = w => w.kind === "mixer";
  const partnerName = w => isMixer(w) ? "NutriMill" : "Grand Teton Ancient Grains";
  const isGrand = w => w.kind === "grand";
  const prizeWords = w => isMixer(w) ? "a Bosch Universal Plus stand mixer" : isGrand(w) ? "the 25 lb grand prize" : "a 5 lb bag of grain";
  const bagWords = w => isMixer(w) ? "Bosch Universal Plus stand mixer" : isGrand(w) ? "25 lb bag" : "5 lb bag";
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
  const weekOf = w => w.label || (isMixer(w) ? "Mixer · Dec 1" : labelFor(w.drawn_at));

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
    const subject = isMixer(w) ? "You won the Bosch Universal Plus mixer in the Ancient Grain Challenge" : isGrand(w) ? "You won the 25 lb grand prize in the Ancient Grain Challenge" : "You won a 5 lb bag of grain in the Ancient Grain Challenge";
    const body = `Hi ${first(w.full_name)},

Good news. Your name came up in the ${weekOf(w)} drawing for the Ancient Grain Challenge. You won ${prizeWords(w)} from ${partnerName(w)}.

To get it shipped, open your private claim link and tell us where to send it${isMixer(w) ? "" : " and which grain you'd like"}:
${claimLink(w)}

Please do that within 7 days, by ${due}. After that the prize goes back into the drawing for another baker.

${isGrand(w) || isMixer(w) ? "" : progressLine(w) + "\n\n"}Congratulations, and keep baking.${SIGNATURE}`;
    return { subject, body };
  }
  function reminderEmail(w) {
    const due = w.claim_expires_at ? fmtDay(w.claim_expires_at) : "the end of the week";
    return { subject: `Quick reminder: your ${bagWords(w)}${isMixer(w) ? "" : " of grain"} is waiting`, body: `Hi ${first(w.full_name)},

Just a nudge. You won ${prizeWords(w)} in the Ancient Grain Challenge, and I haven't received your shipping details yet.

Here's your private claim link again. It takes about a minute:
${claimLink(w)}

I need it by ${due} so ${partnerName(w)} can ship your prize. If I don't hear from you by then, the prize goes back into the drawing.

If the link gives you any trouble, just reply to this email with your address${isMixer(w) ? "" : " and the grain you'd like"}.${SIGNATURE}` };
  }
  function shippedEmail(w) {
    if (isMixer(w)) return { subject: "Your Bosch Universal Plus mixer is on the way", body: `Hi ${first(w.full_name)},

Your Bosch Universal Plus stand mixer shipped from NutriMill.${w.tracking ? "\n\nTracking: " + w.tracking : ""}

I hope you enjoy baking with it. Share a photo in the Academy when it arrives. I'd love to see what you make.${SIGNATURE}` };
    return { subject: `Your ${bagWords(w)} of ${w.grain || "grain"} is on the way`, body: `Hi ${first(w.full_name)},

Your ${bagWords(w)} of ${w.grain || "grain"} shipped from Grand Teton Ancient Grains in Driggs, Idaho.${w.tracking ? `

Tracking: ${w.tracking}` : ""}

When it lands, mill it fresh if you can and bake something. Then post it in the Academy or tag me. I'd love to see what you make with it.

${w.modules_verified >= 7 ? "You've finished all seven lessons, so you're still in the December 1 drawing for the 25 lb grand prize." : "You're still in the running for the 25 lb grand prize on December 1 once you finish all seven lessons."}${SIGNATURE}` };
  }
  function dmText(w) {
    return `Congratulations, ${first(w.full_name)}! Your name came up in the ${weekOf(w)} drawing for the Ancient Grain Challenge. You won ${prizeWords(w)} from ${partnerName(w)}.

Tap this private link to tell us where to ship it${isMixer(w) ? "" : " and which grain you'd like"}. Please do it within 7 days:
${claimLink(w)}

Keep the link to yourself, it's tied to your prize. Henry`;
  }
  function partnerEmail(list, label) {
    if (list.some(isMixer)) return { subject: `Ancient Grain Challenge mixer winner, ${label}`, body: `Hello NutriMill team,

Here is the Bosch Universal Plus stand mixer winner's shipping information. The same details are in the attached CSV.

${list.map(w => [w.ship_name || w.full_name, ...addressLines(w).slice(1), w.phone ? "Phone: " + w.phone : ""].filter(Boolean).join("\n")).join("\n\n")}

Please send me the tracking number when it ships so I can pass it to the winner. Thank you for providing the mixer.${SIGNATURE}` };
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
    const rows = list.map(w => [weekOf(w), bagWords(w), w.ship_name || w.full_name, w.address1, w.address2, w.city, w.ship_region, w.postal, w.ship_country || w.country, w.phone, isMixer(w) ? "" : w.grain || "Surprise me", w.email, new Date(w.drawn_at).toISOString().slice(0, 10)]);
    return [cols.join(","), ...rows.map(r => r.map(esc).join(","))].join("\n");
  }

  // ---------- announcements ----------
  function announcement(list, label) {
    const finale = list.some(w => isGrand(w) || isMixer(w));
    const description = w => `${isMixer(w) ? "Bosch Universal Plus stand mixer from NutriMill" : isGrand(w) ? "25 lb grand prize from Grand Teton Ancient Grains" : "5 lb bag from Grand Teton Ancient Grains"}${!isMixer(w) && w.grain && w.grain !== "Surprise me" ? ", " + w.grain : ""}`;
    const bullets = list.map(w => `• ${publicName(w.full_name)}${w.region ? " (" + w.region + ")" : ""}: ${description(w)}`).join("\n");
    const next = finale ? "" : `Next drawing is ${longDay(nextDrawDate())}. Finish one lesson and you're in the grain drawing. Every verified point is one more entry, and you can only win one 5 lb bag. Registration also enters you in the December 1 mixer drawing, with one entry plus your verified points.`;
    const text = `${label} winners: Ancient Grain Challenge

${bullets}

Congratulations. Winners, check your email for your private prize claim link and send your shipping details.
${next ? "\n" + next + "\n" : ""}
Watch the lessons: ${SITE}/#lessons
Check your entry: ${SITE}/#me`;
    const newsletterHtml = `<h2>${html(label)} winners: Ancient Grain Challenge</h2>
<ul>
${list.map(w => `  <li><strong>${html(publicName(w.full_name))}</strong>${w.region ? ", " + html(w.region) : ""}: ${html(description(w))}</li>`).join("\n")}
</ul>
${next ? `<p>${html(next)}</p>` : ""}
<p><a href="${SITE}/#lessons">Watch the lessons</a> · <a href="${SITE}/#me">Check your entry</a></p>`;
    return { skool: "🎉 " + text, facebook: "🎉 " + text, newsletterHtml, newsletterText: text };
  }

  // ---------- nudges ----------
  function nudgeEmail(e) {
    const next = nextLesson(e); const n = e.modules_verified || 0; const draw = longDay(nextDrawDate());
    const subject = !next ? "Your next bake after From Berries to Bread" : n === 0 ? "Your first Ancient Grain lesson is ready" : `You're ${7 - n} lesson${7 - n === 1 ? "" : "s"} from the grand prize drawing`;
    const opener = n === 0
      ? `You registered for the Ancient Grain Challenge but haven't started a lesson yet. No problem. I'd like to see you take the next step this week.`
      : `Here’s your Ancient Grain Challenge progress this week. You've finished ${n} of the seven lessons.`;
    const lessonPart = next ? `Your next lesson is ${next.title}. Watch it, pass the quiz, and record your YouTube comment name for credit toward the drawing on ${draw} for a 5 lb bag of grain:
${lessonUrl(next)}` : `You've finished all seven lessons and qualified for the December 1 grain grand prize. Put that learning into a bake and share it with us.`;
    const saved = mailed.get(e.id);
    const scoreNote = saved?.next_score == null ? '' : `Best recorded score for ${next?.title || 'your next lesson'}: ${saved.next_score}%.\n\n`;
    const completedNote = (saved?.completed_lessons || []).map(x => x.title + (x.score == null ? '' : ` (${x.score}%)`)).join('; ');
    const member = AGCOutreach.status(e);
    const invite = member === 'member' ? "Bring your questions into the Academy. We're baking alongside you.\nhttps://skoo.ly/crust-crumb-academy"
      : member === 'unmatched' ? "If you haven't joined Crust & Crumb Academy yet, come bake with us. You'll find bakers working through the same questions.\nhttps://skoo.ly/crust-crumb-academy"
      : "Need a hand with the next bake? You'll find us inside Crust & Crumb Academy.\nhttps://skoo.ly/crust-crumb-academy";
    const body = `Hi ${first(e.full_name)},

${opener}

${lessonPart}

${scoreNote}${completedNote ? 'Completed: ' + completedNote + '.\n\n' : ''}Finish all seven and you qualify for the 25 lb grand prize on December 1. Your entry and points are here anytime: ${SITE}/#me

You've earned ${e.verified_points || 0} verified points, giving you ${1 + (e.verified_points || 0)} mixer entries.

${invite}${SIGNATURE}`;
    return { subject, body };
  }
  function blastText(label, list) {
    const next = longDay(nextDrawDate());
    const names = list.length ? list.map(w => publicName(w.full_name)).join(", ") : "this week's winners";
    return `Subject: We drew ${list.length || "this week's"} winners. Are you in Friday's drawing?

Hi bakers,

We just drew the ${label} winners in the Ancient Grain Challenge: ${names}. Each one gets a 5 lb bag of grain from Grand Teton Ancient Grains.

If your name wasn't called, here's the thing. One finished lesson is all it takes to be in Friday's drawing on ${next}. Watch one, pass its quiz, and record the YouTube name you commented under to claim credit.

Pick up where you left off: ${SITE}/#me
Start with From Berries to Bread: ${SITE}/#lessons

Finish all seven and you qualify for the 25 lb grand prize on December 1.

Henry`;
  }

  // ---------- rendering ----------
  function pill(w) {
    const partner = isMixer(w) ? "NutriMill" : "Grand Teton";
    const map = { drawn: ["pending", "Needs notice"], notified: ["pending", "Waiting on address"], address_received: ["verified", `Ready for ${partner}`], sent_to_partner: ["req", `At ${partner}`], shipped: ["verified", "Shipped"], forfeited: ["rejected", "Forfeited"] };
    const [cls, text] = map[w.status] || ["pending", w.status];
    return el("span", { class: "pill " + cls, text: overdue(w) ? "Past 7 days" : text });
  }
  function timeline(w) {
    const steps = [["Drawn", w.drawn_at], ["Notified", w.notified_at], ["Reminded", w.reminded_at], ["Address", w.address_received_at], [`To ${isMixer(w) ? "NutriMill" : "Grand Teton"}`, w.sent_to_partner_at], ["Shipped", w.shipped_at], ["Announced", w.announced_at]];
    return el("div", { class: "muted", style: "font-size:.85rem;display:flex;flex-wrap:wrap;gap:6px 14px" }, ...steps.map(([n, t]) => el("span", { style: t ? "" : "opacity:.5" }, `${t ? "✓" : "○"} ${n}${t ? " " + fmt(t) : ""}`)));
  }
  function addressForm(w, onSaved) {
    const f = {};
    const inp = (k, label, val) => el("label", {}, label, f[k] = el("input", { value: val || "" }));
    const form = el("div", { class: "stack", style: "gap:8px" },
      el("div", { class: "grid2" }, inp("ship_name", "Name on label", w.ship_name || w.full_name), isMixer(w) ? null : inp("grain", "Grain", w.grain)),
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
      const forfeit = act("Forfeit (no reply)", async () => { if (confirm(`Forfeit ${w.full_name}'s ${bagWords(w)}? They won't be able to claim it, and the prize goes back to the pool for the next draw.`)) await mark(w, "forfeited"); else forfeit.disabled = false; }, "ghost small");
      actions.append(forfeit);
    }
    actions.append(msg);

    const details = el("div", { class: "stack", style: "gap:8px", hidden: true });
    const toggle = el("button", { type: "button", class: "ghost small" }, hasAddress(w) ? "Edit details" : "Enter address by hand");
    toggle.onclick = () => { details.hidden = !details.hidden; if (!details.hidden && !details.childElementCount) details.append(addressForm(w, () => details.hidden = true)); };

    const labelIn = el("input", { value: w.label || "", placeholder: weekOf(w), style: "max-width:200px" });
    const labelSave = act("Save label", async () => { const r = await rpc("admin_set_draw_label", { p_key: ctx.key, p_draw_id: w.draw_id, p_label: labelIn.value.trim() || weekOf(w) }); if (r.error) throw 0; await load(); }, "ghost small");

    const notes = el("textarea", { rows: 2, placeholder: "Notes (replied by email, asked for Spelt instead, etc.)" }); notes.value = w.notes || "";
    const notesSave = act("Save note", async () => { const r = await rpc("admin_winner_edit", { p_key: ctx.key, p_draw_id: w.draw_id, p_fields: { notes: notes.value.trim() } }); if (r.error) throw 0; await load(); }, "ghost small");

    return el("div", { class: "card winner stack", style: "gap:8px" },
      el("div", { class: "bar", style: "justify-content:space-between" },
        el("strong", { text: `${weekOf(w)} · ${w.prize}: ${w.full_name}${isMixer(w) ? "" : " (" + (w.grain || w.preferred_grain || "no grain chosen") + ")"}` }), pill(w)),
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
    $("win-tiles").replaceChildren(...[["Need notice", by("drawn")], ["Waiting on address", by("notified")], ["Ready for partner", by("address_received")], ["At partner", by("sent_to_partner")], ["Shipped", by("shipped")]]
      .map(([l, n]) => el("div", { class: "tile" }, el("b", { text: String(n) }), el("span", { class: "muted", text: l }))));
    const unlabeled = winners.filter(w => !w.label);
    $("win-fix-labels").hidden = !unlabeled.length;
    $("win-fix-labels").textContent = `Fill in ${unlabeled.length} missing label${unlabeled.length === 1 ? "" : "s"}`;
    $("win-list").replaceChildren(...(list.length ? list.map(winnerCard) : [el("p", { class: "muted", text: "No winners yet. Draw one above and it shows up here." })]));
  }

  function renderPartner() {
    const mixer = $("partner-kind").value === "mixer";
    const partner = mixer ? "NutriMill" : "Grand Teton";
    const slug = mixer ? "nutrimill" : "grand-teton";
    const belongs = w => isMixer(w) === mixer;
    $("partner-email-label").textContent = partner + " email";
    $("partner-mail").textContent = `Open email to ${partner} in Gmail`;
    $("partner-mark").textContent = `Mark batch sent to ${partner}`;
    $("partner-all").textContent = `Download every ${mixer ? "mixer" : "grain"} winner with an address`;
    const to = $("partner-email").value.trim();
    const ready = winners.filter(w => belongs(w) && w.status === "address_received");
    const label = [...new Set(ready.map(weekOf))].join(" + ") || "this week";
    const mail = partnerEmail(ready, label);
    $("partner-count").textContent = ready.length ? `${ready.length} ${mixer ? "mixer is" : ready.length === 1 ? "bag is" : "bags are"} ready to send to ${partner} (${label}). Download the CSV, open the email and attach it, then mark them sent.` : "Nothing waiting. Winners show up here once their address is in.";
    $("partner-table").replaceChildren(...ready.map(w => el("div", { class: "winner-row" },
      el("strong", { text: w.ship_name || w.full_name }), el("span", { class: "muted", text: addressLines(w).slice(1).join(", ") + (w.phone ? " · " + w.phone : "") }), el("span", { class: "pill verified", text: (isMixer(w) ? "" : (w.grain || "Surprise me") + " · ") + bagWords(w) }))));
    $("partner-csv").disabled = !ready.length;
    $("partner-csv").onclick = () => download(`${slug}-shipments-${new Date().toISOString().slice(0, 10)}.csv`, partnerCsv(ready));
    const a = $("partner-mail"); a.href = compose(to, mail.subject, mail.body); $("partner-copy").onclick = async () => { try { await navigator.clipboard.writeText(emailText(to, mail.subject, mail.body)); $("partner-copy").textContent = "Copied"; setTimeout(() => $("partner-copy").textContent = "Copy email text", 1500); } catch {} }; $("partner-copy").disabled = !ready.length; a.classList.toggle("disabled", !ready.length); a.setAttribute("aria-disabled", String(!ready.length));
    $("partner-mark").disabled = !ready.length;
    $("partner-mark").onclick = async () => {
      if (!confirm(`Mark ${ready.length} winner${ready.length === 1 ? "" : "s"} as sent to ${partner}? Their claim links lock after this.`)) return;
      $("partner-mark").disabled = true;
      for (const w of ready) await rpc("admin_winner_mark", { p_key: ctx.key, p_draw_id: w.draw_id, p_event: "sent_to_partner" });
      await load();
    };
    const all = winners.filter(w => belongs(w) && hasAddress(w));
    $("partner-all").disabled = !all.length;
    $("partner-all").onclick = () => download(`${slug}-all-winners.csv`, partnerCsv(all));
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
      block("Facebook post (Baking Great Bread at Home)", a.facebook, "Add a photo of the prizes or the giveaway graphic."),
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
    const query = $('nudge-search').value.trim().toLowerCase();
    const memberFilter = $('nudge-membership').value;
    const list = E.filter(e => (filter === "all" ? e.modules_verified < 7 : band(e) === filter)
      && (!query || (e.full_name + ' ' + e.email).toLowerCase().includes(query))
      && (memberFilter === 'all' || AGCOutreach.status(e) === memberFilter)).sort((a, b) => lastActivity(a).localeCompare(lastActivity(b)));
    $("nudge-total").textContent = `(${E.length})`;
    $("nudge-count").textContent = `${list.length} baker${list.length === 1 ? "" : "s"}`;
    const bcc = list.map(e => e.email).join(",");
    $("nudge-bcc").onclick = async () => { try { await navigator.clipboard.writeText(bcc); $("nudge-bcc").textContent = "Copied"; setTimeout(() => $("nudge-bcc").textContent = "Copy all emails", 1500); } catch {} };
    $("nudge-bcc").disabled = !list.length;
    $("nudge-rows").replaceChildren(...list.map(e => {
      const next = nextLesson(e); const m = nudgeEmail(e);
      return el("tr", {},
        el("td", {}, el("strong", { text: e.full_name }), el("br"), el("small", { text: e.email })),
        el("td", { text: AGCCampaign.membershipLabel(AGCOutreach.status(e)) }),
        el("td", { class: "num", text: `${e.modules_verified}/7` }),
        el("td", { text: next ? next.title : "All done" }),
        el("td", { text: fmt(lastActivity(e)) }),
        el("td", { class: "muted", text: mailed.get(e.id)?.last_sent_at ? fmt(mailed.get(e.id).last_sent_at) : "" }),
        el("td", {}, el("a", { class: "btn-link ghost-link", style: "padding:6px 12px;font-size:.85rem", href: compose(e.email, m.subject, m.body), target: "_blank", rel: "noopener", text: "Open nudge in Gmail" }), " ", copyBtn(emailText(e.email, m.subject, m.body), "Copy")));
    }));
    const thisWeek = AGCCampaign.latestWinners(winners);
    const grainWinners = thisWeek;
    const blast = $("nudge-blast"); blast.value = blastText(weekOf(grainWinners[0] || { drawn_at: new Date() }), thisWeek);
  }

  // ---------- "your next lesson" emails (Supabase function progress-mail) ----------
  const PM_URL = "https://pmhytaaajbhzyldmxmzb.supabase.co/functions/v1/progress-mail";
  let mailed = new Map(), pmEligible = null, pmArmed = false;
  async function pm(action, extra = {}) {
    const res = await fetch(PM_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, key: ctx.key, ...extra }) });
    let data = {}; try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  }
  async function pmPreview() {
    const btn = $("pm-send"), msg = $("pm-msg");
    if (!btn) return;
    try {
      const r = await pm("preview");
      if (!r.ok) throw new Error(r.data.error || r.status);
      mailed = new Map(r.data.rows.map(x => [x.entrant_id, x]));
      pmEligible = r.data.eligible; pmArmed = false;
      btn.textContent = pmEligible ? `Email ${pmEligible} baker${pmEligible === 1 ? "" : "s"}` : "Everyone is up to date";
      btn.disabled = !pmEligible;
      if (r.data.recently_emailed) msg.textContent = `${r.data.recently_emailed} baker${r.data.recently_emailed === 1 ? " was" : "s were"} emailed in the last ${r.data.gap_days} days and will be skipped.`;
      renderNudges();
    } catch (e) { btn.textContent = "Email sending unavailable"; btn.disabled = true; msg.textContent = "Couldn't reach the email sender. Refresh to try again."; }
  }
  function wireProgressMail() {
    const test = $("pm-test"), send = $("pm-send"), msg = $("pm-msg");
    if (!test) return;
    $('pm-samples').onclick = async () => {
      $('pm-samples').disabled = true;
      try {
        const r = await pm('samples'); if (!r.ok || !Array.isArray(r.data.samples)) throw Error('samples');
        $('pm-samples-list').replaceChildren(...r.data.samples.map(s => {
          const frame = el('iframe', { title: 'Email preview for ' + s.first_name, sandbox: '', style: 'width:100%;height:600px;border:0' });
          frame.srcdoc = s.html;
          return el('details', {}, el('summary', { text: s.subject + ' · ' + AGCCampaign.membershipLabel(s.membership_status) }), frame);
        }));
        msg.textContent = r.data.samples.length + ' message variants ready to review. No emails sent. Preview buttons go to the entry page; sent messages get a private sign-in link.';
      } catch { msg.textContent = 'Message preview is unavailable. The updated sender must be deployed first.'; }
      $('pm-samples').disabled = false;
    };
    test.onclick = async () => {
      test.disabled = true; msg.textContent = "Sending your preview…";
      const r = await pm("test");
      msg.textContent = r.ok ? `Preview sent to ${r.data.to.join(" and ")}. The button in it works, so tap it to try the full flow.` : "The preview didn't send. Try again in a minute.";
      test.disabled = false;
    };
    send.onclick = async () => {
      if (!pmEligible) return;
      if (!pmArmed) { pmArmed = true; send.textContent = `Tap again to send ${pmEligible} emails now`; setTimeout(() => { if (pmArmed) { pmArmed = false; pmPreview(); } }, 8000); return; }
      pmArmed = false; send.disabled = true; msg.textContent = `Sending ${pmEligible} emails…`;
      const r = await pm("send", { expect: pmEligible });
      await pmPreview();
      if (r.ok) msg.textContent = `Sent ${r.data.sent} emails. The Emailed column shows who got one.`;
      else if (r.status === 409) msg.textContent = "The list changed since this page loaded. Check the new count and send again.";
      else msg.textContent = "Sending failed, and nobody was marked as emailed. Try again in a few minutes.";
    };
  }

  async function load() {
    const r = await rpc("admin_winners", { p_key: ctx.key });
    if (r.error) return;
    winners = r;
    $("winner-total").textContent = `(${winners.length})`;
    await AGCOutreach.refresh({ ...ctx, winners });
    renderWinners(); renderPartner(); renderAnnounce(); renderNudges();
  }

  let wired = false;
  function wire() {
    if (wired) return; wired = true;
    $("win-week").onchange = renderWinners;
    $("ann-week").onchange = renderAnnounce;
    $("nudge-filter").onchange = renderNudges;
    $("nudge-membership").onchange = renderNudges;
    $("nudge-search").oninput = renderNudges;
    wireProgressMail(); pmPreview();
    $("partner-email").value = ls.get("agc_partner_email") || "";
    const partnerKey = () => $("partner-kind").value === "mixer" ? "agc_nutrimill_email" : "agc_partner_email";
    $("partner-kind").onchange = () => { $("partner-email").value = ls.get(partnerKey()) || ""; renderPartner(); };
    $("partner-email").oninput = () => { ls.set(partnerKey(), $("partner-email").value.trim()); renderPartner(); };
    $("nudge-blast-copy").onclick = async () => { try { await navigator.clipboard.writeText($("nudge-blast").value); $("nudge-blast-copy").textContent = "Copied"; setTimeout(() => $("nudge-blast-copy").textContent = "Copy", 1500); } catch {} };
    $("win-fix-labels").onclick = async () => {
      $("win-fix-labels").disabled = true;
      for (const w of winners.filter(x => !x.label)) await rpc("admin_set_draw_label", { p_key: ctx.key, p_draw_id: w.draw_id, p_label: weekOf(w) });
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
  return { refresh, labelFor, publicName, announcement, nudgeEmail, winnerEmail, partnerCsv, renderNudges };
})();
