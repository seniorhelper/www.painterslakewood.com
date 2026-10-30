/* Painter Hotline field estimator: proposal snapshot, HTML view, PDF and office delivery (v2).
   Shared by /estimator/ (salesperson) and /proposal/ (client view of a sent proposal). */
(function (root) {
  "use strict";
  var D = {};

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { n = Math.round(Number(n) || 0); return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US"); }
  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).slice(0, 10).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  }
  function addDays(iso, n) {
    var p = String(iso).slice(0, 10).split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  D.esc = esc; D.money = money; D.fmtDate = fmtDate; D.addDays = addDays; D.todayISO = todayISO;

  var TYPE_LABEL = { room: "Interior", cabinets: "Cabinets", exterior: "Exterior", deck: "Deck", fence: "Fence" };

  /* Freeze an estimate + its computed result into a self-contained snapshot.
     Prices in a snapshot never change, even if the price book changes later. */
  D.snapshot = function (est, R, P, brand, Engine) {
    var date = est.proposalDate || todayISO();
    var areasById = {};
    var areas = [];
    (est.areas || []).forEach(function (a) {
      if (a.enabled === false) return;
      var o = { id: a.id, name: a.name || TYPE_LABEL[a.type] || "Area", type: a.type, lines: [], notes: a.notes || "" };
      areasById[a.id] = o; areas.push(o);
    });
    R.tiers.better.lines.forEach(function (l) { if (areasById[l.areaId]) areasById[l.areaId].lines.push(Engine.scopeText(l)); });
    var tiers = {};
    Engine.TIERS.forEach(function (k) {
      var t = R.tiers[k];
      tiers[k] = { label: t.label, name: t.name, summary: t.summary, products: t.products, total: t.total, regular: t.regular, savings: t.savings, savingsPct: t.savingsPct, rush: t.rush, afterHours: t.afterHours,
        schedule: t.schedule, areaTotals: t.areaTotals, lead: t.lead, travel: t.travel, minimumApplied: t.minimumApplied,
        addons: t.addonLines.map(function (x) { return { label: x.label, qty: x.qty, unit: x.unit, total: x.total, credited: x.credited }; }) };
    });
    var c = est.customer || {};
    return {
      v: 2, id: est.id, date: date, validUntil: addDays(date, (P.proposal && P.proposal.validDays) || 30),
      brand: { name: brand.name, site: brand.site, phone: brand.phone, tel: brand.tel, legal: brand.legal || "" },
      customer: { name: c.name || "", phone: c.phone || "", email: c.email || "", address: c.address || "", city: c.city || "", zip: c.zip || "", yearBuilt: c.yearBuilt || "" },
      rep: (est.project && est.project.rep) || "",
      notes: (est.project && est.project.notes) || "",
      selected: (est.project && est.project.selected) || "better",
      tiers: tiers, areas: areas.filter(function (a) { return a.lines.length; }),
      promo: R.promoOn ? { detail: P.promo.detail, label: P.promo.label, ends: P.promo.endsISO } : null,
      lead: R.leadOn ? P.leadSafe.label : "",
      zone: R.zone && R.zone.label && (R.zone.pct || R.zone.flat) ? R.zone.label : "",
      warranty: P.proposal.warranty, terms: P.proposal.terms, priceBook: P.version
    };
  };

  /* Client-facing proposal HTML. */
  D.html = function (s, opts) {
    opts = opts || {};
    var sel = opts.selected || s.selected;
    var h = [];
    var c = s.customer;
    h.push('<article class="pv" aria-label="Painting proposal">');
    h.push('<header class="pv-head"><div><p class="pv-kicker">Painting proposal</p><h2 class="pv-title">' + esc(c.name || "Customer") + '</h2>');
    h.push('<p class="pv-addr">' + esc([c.address, c.city, c.zip].filter(Boolean).join(", ")) + '</p></div>');
    h.push('<dl class="pv-meta"><div><dt>Date</dt><dd>' + esc(fmtDate(s.date)) + '</dd></div><div><dt>Valid through</dt><dd>' + esc(fmtDate(s.validUntil)) + '</dd></div>' +
      (s.rep ? '<div><dt>Estimator</dt><dd>' + esc(s.rep) + '</dd></div>' : '') + '<div><dt>Questions</dt><dd><a href="tel:' + esc(s.brand.tel) + '">' + esc(s.brand.phone) + '</a></dd></div></dl></header>');

    h.push('<h3 class="pv-h">Your options</h3><div class="pv-opts" role="radiogroup" aria-label="Choose an option">');
    ["good", "better", "best"].forEach(function (k) {
      var t = s.tiers[k]; if (!t) return;
      var on = k === sel;
      h.push('<div class="pv-opt' + (on ? ' on' : '') + '" data-tier="' + k + '">' +
        '<p class="pv-opt-l">' + esc(t.label) + (t.name ? ': ' + esc(t.name) : '') + (k === "better" ? ' <span class="pv-pop">Most chosen</span>' : '') + '</p>' +
        (t.savings > 0 ? '<p class="pv-was"><s>' + money(t.regular) + '</s></p>' : '') +
        '<p class="pv-price">' + money(t.total) + '</p>' +
        '<p class="pv-sum">' + esc(t.summary) + '</p>' +
        '<p class="pv-prod">' + esc(t.products) + '</p>' +
        (opts.choose ? '<button type="button" class="btn ' + (on ? 'btn-main' : 'btn-line') + ' pv-pick" data-pick="' + k + '" aria-pressed="' + on + '">' + (on ? 'Selected' : 'Choose ' + esc(t.label)) + '</button>' : (on ? '<p class="pv-chosen">Selected</p>' : '')) +
        '</div>');
    });
    h.push('</div>');
    if (s.promo) h.push('<p class="pv-promo"><b>' + esc(s.promo.label) + '.</b> ' + esc(s.promo.detail) + '.' + (s.tiers[sel].savings > 0 ? ' On the ' + esc(s.tiers[sel].label) + ' option that is ' + money(s.tiers[sel].savings) + ', about ' + Math.round(s.tiers[sel].savingsPct * 100) + '% off the total.' : '') + '</p>');

    var T = s.tiers[sel];
    h.push('<h3 class="pv-h">Scope of work</h3>');
    s.areas.forEach(function (a) {
      h.push('<section class="pv-area"><div class="pv-area-h"><h4>' + esc(a.name) + '</h4><span>' + money(T.areaTotals[a.id] || 0) + '</span></div><ul>');
      a.lines.forEach(function (l) { h.push('<li>' + esc(l) + '</li>'); });
      h.push('</ul>' + (a.notes ? '<p class="pv-note">' + esc(a.notes) + '</p>' : '') + '</section>');
    });
    var extras = [];
    T.addons.forEach(function (x) { extras.push([x.label + (x.unit !== "flat" ? " (" + x.qty + " " + x.unit + ")" : "") + (x.credited ? " (credited)" : ""), x.total]); });
    if (T.lead) extras.push([s.lead, T.lead]);
    if (T.rush) extras.push(["Rush start (within 7 days)", T.rush]);
    if (T.afterHours) extras.push(["Evening / weekend scheduling", T.afterHours]);
    if (T.travel) extras.push(["Travel: " + s.zone, T.travel]);
    if (extras.length) {
      h.push('<section class="pv-area"><div class="pv-area-h"><h4>Also included</h4></div><ul class="pv-money">');
      extras.forEach(function (e) { h.push('<li><span>' + esc(e[0]) + '</span><b>' + money(e[1]) + '</b></li>'); });
      h.push('</ul></section>');
    }
    if (s.notes) h.push('<p class="pv-note"><b>Notes:</b> ' + esc(s.notes) + '</p>');

    h.push('<h3 class="pv-h">Investment: ' + esc(T.label) + '</h3><ul class="pv-money pv-total">');
    if (T.savings > 0) {
      h.push('<li><span>Regular price</span><b><s>' + money(T.regular) + '</s></b></li>');
      h.push('<li><span>' + esc(s.promo ? s.promo.label : "Discount") + '</span><b>-' + money(T.savings) + '</b></li>');
    }
    h.push('<li class="pv-grand"><span>Total</span><b>' + money(T.total) + '</b></li>');
    if (T.minimumApplied) h.push('<li><span>Includes our minimum project charge.</span><b></b></li>');
    h.push('</ul><h3 class="pv-h">Payment schedule</h3><ul class="pv-money">');
    T.schedule.forEach(function (p) { h.push('<li><span>' + esc(p.label) + ' (' + Math.round(p.pct * 100) + '%)</span><b>' + money(p.amount) + '</b></li>'); });
    h.push('</ul>');
    h.push('<h3 class="pv-h">Warranty</h3><p>' + esc(s.warranty) + '</p>');
    h.push('<h3 class="pv-h">Terms</h3><ol class="pv-terms">');
    s.terms.forEach(function (t) { h.push('<li>' + esc(t) + '</li>'); });
    h.push('</ol>');
    if (s.brand.legal) h.push('<p class="pv-legal">' + esc(s.brand.legal) + '</p>');
    h.push('</article>');
    return h.join("");
  };

  /* ---------- share link encoding (no photos, no signature) ---------- */
  function b64u(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function unb64u(str) { str = str.replace(/-/g, "+").replace(/_/g, "/"); while (str.length % 4) str += "="; var b = atob(str), out = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }
  function pipe(bytes, Stream) { return new Response(new Blob([bytes]).stream().pipeThrough(new Stream("deflate-raw"))).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  D.encode = function (snap) {
    var bytes = new TextEncoder().encode(JSON.stringify(snap));
    if (typeof CompressionStream === "function") {
      return pipe(bytes, CompressionStream).then(function (z) { return "z" + b64u(z); }).catch(function () { return "j" + b64u(bytes); });
    }
    return Promise.resolve("j" + b64u(bytes));
  };
  D.decode = function (str) {
    try {
      var kind = str.charAt(0), bytes = unb64u(str.slice(1));
      if (kind === "z") return pipe(bytes, DecompressionStream).then(function (u) { return JSON.parse(new TextDecoder().decode(u)); });
      return Promise.resolve(JSON.parse(new TextDecoder().decode(bytes)));
    } catch (e) { return Promise.reject(e); }
  };

  /* ---------- plain-text summary (email, SMS, office) ---------- */
  D.textSummary = function (s, link) {
    var T = s.tiers[s.selected], L = [];
    L.push(s.brand.name + " painting proposal for " + (s.customer.name || "you"));
    L.push("Date: " + fmtDate(s.date) + "  |  Valid through " + fmtDate(s.validUntil));
    L.push("");
    ["good", "better", "best"].forEach(function (k) { var t = s.tiers[k]; L.push((k === s.selected ? "> " : "  ") + t.label + ": " + money(t.total) + (t.savings > 0 ? " (regular " + money(t.regular) + ")" : "")); });
    if (s.promo) L.push(s.promo.detail);
    L.push("");
    s.areas.forEach(function (a) { L.push(a.name + " - " + money(T.areaTotals[a.id] || 0)); a.lines.forEach(function (l) { L.push("  - " + l); }); });
    L.push("");
    T.schedule.forEach(function (p) { L.push(p.label + ": " + money(p.amount)); });
    if (link) { L.push(""); L.push("Review and sign: " + link); }
    L.push("Questions: " + s.brand.phone);
    return L.join("\n");
  };

  /* ---------- PDF (pdf-lib, loaded on demand, works offline once cached) ---------- */
  var libP = null;
  D.loadLib = function (src) {
    if (root.PDFLib) return Promise.resolve(root.PDFLib);
    if (!libP) libP = new Promise(function (res, rej) {
      var sc = document.createElement("script"); sc.src = src; sc.onload = function () { res(root.PDFLib); }; sc.onerror = function () { libP = null; rej(new Error("PDF library failed to load")); };
      document.head.appendChild(sc);
    });
    return libP;
  };
  var WIN = "—–‘’“”•…€™";
  function clean(s) {
    return String(s == null ? "" : s).replace(/[‐-‒]/g, "-").replace(/ /g, " ").split("").map(function (ch) {
      var c = ch.charCodeAt(0);
      if (ch === "\n" || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN.indexOf(ch) > -1) return ch;
      return c === 9 ? " " : "";
    }).join("");
  }
  function dataUrlBytes(u) { var b = atob(u.split(",")[1]), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function hexRgb(rgb, hex) { var h = (hex || "#0b5ed7").replace("#", ""); if (h.length === 3) h = h.split("").map(function (x) { return x + x; }).join(""); return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255); }

  /* opts: {lib, logoBytes (jpg/png), logoType, color, signature:{name,date,data,consent}, photos:[{area,data}]} */
  D.pdf = function (s, opts) {
    opts = opts || {};
    var L = opts.lib;
    var rgb = L.rgb;
    var brand = hexRgb(rgb, opts.color), ink = rgb(0.09, 0.13, 0.2), mute = rgb(0.36, 0.42, 0.5), line = rgb(0.85, 0.88, 0.92), soft = rgb(0.96, 0.97, 0.985);
    var W = 612, H = 792, M = 46;
    return L.PDFDocument.create().then(function (doc) {
      doc.setTitle(clean(s.brand.name + " proposal - " + (s.customer.name || "")));
      doc.setAuthor(clean(s.brand.name)); doc.setCreator(clean(s.brand.name + " estimator")); doc.setSubject("Painting proposal");
      return Promise.all([doc.embedFont(L.StandardFonts.Helvetica), doc.embedFont(L.StandardFonts.HelveticaBold)]).then(function (f) {
        var F = f[0], B = f[1], page, y;
        function newPage() { page = doc.addPage([W, H]); y = H - M; }
        function need(h) { if (y - h < M + 24) newPage(); }
        function wrap(txt, font, size, maxW) {
          var out = [];
          clean(txt).split("\n").forEach(function (para) {
            var words = para.split(/\s+/), cur = "";
            words.forEach(function (w) {
              var t = cur ? cur + " " + w : w;
              if (font.widthOfTextAtSize(t, size) <= maxW) cur = t;
              else { if (cur) out.push(cur); while (font.widthOfTextAtSize(w, size) > maxW && w.length > 1) { var k = w.length; while (k > 1 && font.widthOfTextAtSize(w.slice(0, k), size) > maxW) k--; out.push(w.slice(0, k)); w = w.slice(k); } cur = w; }
            });
            out.push(cur);
          });
          return out;
        }
        function text(txt, o) {
          o = o || {}; var size = o.size || 10, font = o.bold ? B : F, x = o.x || M, maxW = o.w || (W - M - x), lh = o.lh || size * 1.35;
          var ls = wrap(txt, font, size, maxW);
          ls.forEach(function (l) { need(lh); page.drawText(l, { x: x, y: y - size, size: size, font: font, color: o.color || ink }); y -= lh; });
          return ls.length * lh;
        }
        function right(txt, xr, yy, size, font, color) { txt = clean(txt); page.drawText(txt, { x: xr - font.widthOfTextAtSize(txt, size), y: yy, size: size, font: font, color: color || ink }); }
        function rule(gap) { need(12); y -= (gap || 6); page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.7, color: line }); y -= (gap || 6); }
        function heading(t) { need(34); y -= 8; text(t, { bold: true, size: 13, color: brand }); y -= 2; }

        newPage();
        var p0 = Promise.resolve();
        if (opts.logoBytes) p0 = (opts.logoType === "png" ? doc.embedPng(opts.logoBytes) : doc.embedJpg(opts.logoBytes)).catch(function () { return null; });
        return p0.then(function (logo) {
          var topY = y;
          if (logo) { var sc = Math.min(150 / logo.width, 70 / logo.height); page.drawImage(logo, { x: M, y: topY - logo.height * sc, width: logo.width * sc, height: logo.height * sc }); }
          right(s.brand.name, W - M, topY - 14, 15, B, brand);
          right(s.brand.phone + "  |  " + s.brand.site, W - M, topY - 30, 10, F, mute);
          right("Proposal " + String(s.id || "").slice(-6).toUpperCase(), W - M, topY - 46, 10, F, mute);
          y = topY - 82;
          rule(4);
          var c = s.customer;
          var colY = y;
          text("PREPARED FOR", { size: 8, bold: true, color: mute });
          text(c.name || "Customer", { size: 12, bold: true });
          if (c.address || c.city) text([c.address, c.city, c.zip].filter(Boolean).join(", "), { size: 10 });
          if (c.phone || c.email) text([c.phone, c.email].filter(Boolean).join("  |  "), { size: 10, color: mute });
          var leftEnd = y; y = colY;
          var mx = 380;
          text("DATE", { size: 8, bold: true, color: mute, x: mx }); text(fmtDate(s.date), { size: 10, x: mx });
          text("VALID THROUGH", { size: 8, bold: true, color: mute, x: mx }); text(fmtDate(s.validUntil), { size: 10, x: mx });
          if (s.rep) { text("ESTIMATOR", { size: 8, bold: true, color: mute, x: mx }); text(s.rep, { size: 10, x: mx }); }
          y = Math.min(y, leftEnd) - 4;

          heading("Your options");
          var keys = ["good", "better", "best"], cw = (W - 2 * M - 16) / 3, boxH = 0;
          var blocks = keys.map(function (k) { var t = s.tiers[k]; return { k: k, t: t, sum: wrap(t.summary, F, 8.5, cw - 16), prod: wrap(t.products, F, 7.5, cw - 16) }; });
          blocks.forEach(function (b) { boxH = Math.max(boxH, 64 + b.sum.length * 11 + b.prod.length * 9.5 + 10); });
          need(boxH + 8);
          blocks.forEach(function (b, i) {
            var x = M + i * (cw + 8), top = y, on = b.k === s.selected;
            page.drawRectangle({ x: x, y: top - boxH, width: cw, height: boxH, color: on ? soft : rgb(1, 1, 1), borderColor: on ? brand : line, borderWidth: on ? 2 : 0.8 });
            var yy = top - 16;
            page.drawText(clean(b.t.label + (b.t.name ? ": " + b.t.name : "") + (on ? " (selected)" : "")), { x: x + 8, y: yy, size: 10, font: B, color: on ? brand : ink }); yy -= 22;
            page.drawText(clean(money(b.t.total)), { x: x + 8, y: yy, size: 17, font: B, color: ink });
            if (b.t.savings > 0) { var was = money(b.t.regular), ww = F.widthOfTextAtSize(was, 9), wx = x + cw - 8 - ww; page.drawText(was, { x: wx, y: yy + 3, size: 9, font: F, color: mute }); page.drawLine({ start: { x: wx, y: yy + 6 }, end: { x: wx + ww, y: yy + 6 }, thickness: 0.8, color: mute }); }
            yy -= 16;
            b.sum.forEach(function (l) { page.drawText(l, { x: x + 8, y: yy, size: 8.5, font: F, color: ink }); yy -= 11; });
            yy -= 3;
            b.prod.forEach(function (l) { page.drawText(l, { x: x + 8, y: yy, size: 7.5, font: F, color: mute }); yy -= 9.5; });
          });
          y -= boxH + 6;
          if (s.promo) text(s.promo.label + ". " + s.promo.detail + "." + (s.tiers[s.selected].savings > 0 ? " On " + s.tiers[s.selected].label + ": saves " + money(s.tiers[s.selected].savings) + ", about " + Math.round(s.tiers[s.selected].savingsPct * 100) + "% off the total." : ""), { size: 9, bold: true, color: brand });

          var T = s.tiers[s.selected];
          heading("Scope of work (" + T.label + ")");
          s.areas.forEach(function (a) {
            need(40);
            var yy = y;
            text(a.name, { bold: true, size: 11 });
            right(money(T.areaTotals[a.id] || 0), W - M, yy - 11, 11, B, ink);
            a.lines.forEach(function (l) { text("•  " + l, { size: 9.5, x: M + 10 }); });
            if (a.notes) text("Notes: " + a.notes, { size: 9, x: M + 10, color: mute });
            y -= 4;
          });
          var extras = [];
          T.addons.forEach(function (x) { extras.push([x.label + (x.unit !== "flat" ? " (" + x.qty + " " + x.unit + ")" : "") + (x.credited ? " (credited)" : ""), x.total]); });
          if (T.lead) extras.push([s.lead, T.lead]);
          if (T.rush) extras.push(["Rush start (within 7 days)", T.rush]);
          if (T.afterHours) extras.push(["Evening / weekend scheduling", T.afterHours]);
          if (T.travel) extras.push(["Travel: " + s.zone, T.travel]);
          if (extras.length) {
            need(30); text("Also included", { bold: true, size: 11 });
            extras.forEach(function (e) { var yy = y; text("•  " + e[0], { size: 9.5, x: M + 10, w: W - 2 * M - 90 }); right(money(e[1]), W - M, yy - 9.5, 9.5, F, ink); });
          }
          if (s.notes) { y -= 4; text("Project notes: " + s.notes, { size: 9.5, color: mute }); }

          heading("Investment");
          function row(label, val, bold) { need(16); var yy = y; text(label, { size: 10.5, bold: bold, w: W - 2 * M - 110 }); right(val, W - M, yy - 10.5, 10.5, bold ? B : F, ink); }
          if (T.savings > 0) { row("Regular price", money(T.regular)); row(s.promo ? s.promo.label : "Discount", "-" + money(T.savings)); }
          row(T.label + " total", money(T.total), true);
          if (T.minimumApplied) text("Includes our minimum project charge.", { size: 8.5, color: mute });
          y -= 4;
          text("Payment schedule", { bold: true, size: 11 });
          T.schedule.forEach(function (p) { row(p.label + " (" + Math.round(p.pct * 100) + "%)", money(p.amount)); });

          heading("Warranty");
          text(s.warranty, { size: 9.5 });
          heading("Terms");
          s.terms.forEach(function (t, i) { text((i + 1) + ".  " + t, { size: 9, x: M + 4 }); });
          if (s.brand.legal) { y -= 2; text(s.brand.legal, { size: 8, color: mute }); }

          heading("Acceptance");
          var sig = opts.signature || {};
          text("By signing, the customer accepts the " + T.label + " option for " + money(T.total) + " and the terms above.", { size: 9.5 });
          var p1 = sig.data ? doc.embedPng(dataUrlBytes(sig.data)).catch(function () { return null; }) : Promise.resolve(null);
          return p1.then(function (img) {
            need(110);
            var by = y - 70;
            if (img) { var sc2 = Math.min(220 / img.width, 62 / img.height); page.drawImage(img, { x: M, y: by + 4, width: img.width * sc2, height: img.height * sc2 }); }
            page.drawLine({ start: { x: M, y: by }, end: { x: M + 260, y: by }, thickness: 0.8, color: ink });
            page.drawLine({ start: { x: 360, y: by }, end: { x: W - M, y: by }, thickness: 0.8, color: ink });
            if (sig.date) page.drawText(clean(fmtDate(sig.date)), { x: 362, y: by + 6, size: 11, font: F, color: ink });
            page.drawText("Customer signature" + (sig.name ? ": " + clean(sig.name) : ""), { x: M, y: by - 12, size: 8.5, font: F, color: mute });
            page.drawText("Date", { x: 362, y: by - 12, size: 8.5, font: F, color: mute });
            y = by - 24;
            if (sig.consent) text("Signed electronically. The signer agreed to use an electronic signature for this proposal" + (sig.at ? " (" + sig.at + ")" : "") + ".", { size: 8, color: mute });

            var photos = opts.photos || [];
            var chain = Promise.resolve();
            if (photos.length) {
              chain = chain.then(function () { newPage(); text("Photos from the walkthrough", { bold: true, size: 13, color: brand }); y -= 4; });
              var colW = (W - 2 * M - 12) / 2, col = 0, rowTop = 0, rowH = 0;
              photos.forEach(function (ph) {
                chain = chain.then(function () {
                  var bytes = dataUrlBytes(ph.data);
                  var emb = /^data:image\/png/.test(ph.data) ? doc.embedPng(bytes) : doc.embedJpg(bytes);
                  return emb.then(function (im) {
                    var sc3 = Math.min(colW / im.width, 190 / im.height), w = im.width * sc3, h = im.height * sc3;
                    if (col === 0) { need(h + 24); rowTop = y; rowH = 0; }
                    var x = M + col * (colW + 12);
                    page.drawImage(im, { x: x, y: rowTop - h, width: w, height: h });
                    page.drawText(clean(ph.area || "").slice(0, 60), { x: x, y: rowTop - h - 11, size: 8, font: F, color: mute });
                    rowH = Math.max(rowH, h + 20);
                    col = 1 - col;
                    if (col === 0) y = rowTop - rowH;
                  }).catch(function () {});
                });
              });
              chain = chain.then(function () { if (col === 1) y = rowTop - rowH; });
            }
            return chain;
          }).then(function () {
            var pages = doc.getPages(), n = pages.length;
            pages.forEach(function (pg, i) {
              var foot = clean(s.brand.name + "  |  " + s.brand.phone + "  |  " + s.brand.site);
              pg.drawText(foot, { x: M, y: 24, size: 8, font: F, color: mute });
              var pn = "Page " + (i + 1) + " of " + n;
              pg.drawText(pn, { x: W - M - F.widthOfTextAtSize(pn, 8), y: 24, size: 8, font: F, color: mute });
            });
            return doc.save();
          });
        });
      });
    });
  };

  /* ---------- office delivery: hardened FormSubmit (honeypot, time trap, interaction gate,
     endpoint assembled at runtime from base64 parts on <body data-*>) ---------- */
  var t0 = Date.now(), human = false;
  if (root.document) ["keydown", "pointerdown", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { human = true; }, { passive: true, capture: true }); });
  function d64(x) { try { return atob(x || ""); } catch (e) { return ""; } }
  D.send = function (fd, subject) {
    if (!human) return Promise.resolve("blocked");
    if (Date.now() - t0 < 4000) return Promise.resolve("fast");
    var hp = fd.get("_honey"); if (hp) return Promise.resolve("blocked");
    var B = document.body.dataset, at = String.fromCharCode(64);
    fd.set("_subject", subject); fd.set("_captcha", "false"); fd.set("_template", "table");
    var url = "https://" + d64(B.h1) + d64(B.h2) + "/ajax/" + d64(B.u1) + d64(B.u2) + at + d64(B.d1) + d64(B.d2);
    return fetch(url, { method: "POST", body: fd, headers: { Accept: "application/json" } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return (r.ok && (j.success === true || j.success === "true")) ? "ok" : "unconfirmed"; }); })
      .catch(function () { return "fail"; });
  };
  D.email = function () { var B = document.body.dataset; return d64(B.e1) + String.fromCharCode(64) + d64(B.e2); };

  root.PHDoc = D;
})(typeof self !== "undefined" ? self : this);
