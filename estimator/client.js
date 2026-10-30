/* Client view of a sent proposal (/proposal/#...). Read, choose an option, sign, approve. */
(function () {
  "use strict";
  var D = window.PHDoc, BR = JSON.parse(document.getElementById("est-brand").textContent);
  var $ = function (s) { return document.querySelector(s); };
  var snap = null, sig = "", sel = "better";
  var box = $("#proposal-view");

  function say(m, cls) { var o = $("#out"); o.className = "msg " + (cls || "ok"); o.innerHTML = m; }
  function render() {
    box.innerHTML = D.html(snap, { selected: sel, choose: true }) +
      '<section class="signbox" aria-labelledby="sig-h"><h3 id="sig-h">Approve this proposal</h3>' +
      '<div class="grid"><div class="fld"><label for="sname">Your name</label><input id="sname" type="text" autocomplete="name" value="' + D.esc(snap.customer.name) + '"></div>' +
      '<div class="fld"><label for="sdate">Date</label><input id="sdate" type="date" value="' + D.todayISO() + '"></div></div>' +
      '<p class="hint">Sign with your finger, a stylus or a mouse inside the box.</p><canvas id="pad" class="pad" width="900" height="260" role="img" aria-label="Signature area"></canvas>' +
      '<div class="row"><button type="button" class="btn btn-line sm" id="padclear">Clear signature</button></div>' +
      '<label class="chk"><input type="checkbox" id="consent"><span>I agree to sign this proposal electronically, and that my electronic signature has the same effect as signing on paper.</span></label>' +
      '<input type="text" name="_honey" id="hp" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px">' +
      '<div class="actions"><button type="button" class="btn btn-main" id="approve">Approve and sign</button><button type="button" class="btn btn-line" id="dl">Download PDF</button>' +
      '<a class="btn btn-line" href="tel:' + D.esc(snap.brand.tel) + '">Call ' + D.esc(snap.brand.phone) + '</a></div><p class="msg" id="out" role="status" aria-live="polite"></p></section>';
    pad();
  }
  function pad() {
    var c = $("#pad"), x = c.getContext("2d"), on = false, last = null;
    x.lineWidth = 4; x.lineCap = "round"; x.strokeStyle = "#0d1b2e";
    function pt(e) { var r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; }
    c.addEventListener("pointerdown", function (e) { on = true; last = pt(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
    c.addEventListener("pointermove", function (e) { if (!on) return; var p = pt(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; });
    function end() { if (on) { on = false; sig = c.toDataURL("image/png"); } }
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    $("#padclear").addEventListener("click", function () { x.clearRect(0, 0, c.width, c.height); sig = ""; });
  }
  function signature() { return sig ? { name: $("#sname").value, date: $("#sdate").value, data: sig, consent: $("#consent").checked, at: new Date().toISOString() } : null; }
  function pdf() {
    var s = Object.assign({}, snap, { selected: sel });
    return Promise.all([D.loadLib(BR.pdfLib), fetch(BR.logoPdf).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; })])
      .then(function (x) { return D.pdf(s, { lib: x[0], logoBytes: x[1], logoType: "jpg", color: BR.pdfColor, signature: signature() }); });
  }
  function fileName() { return (snap.brand.name + " proposal " + snap.customer.name).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") + ".pdf"; }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.dataset.pick) { var keep = { name: $("#sname").value, consent: $("#consent").checked }; sel = t.dataset.pick; var s0 = sig; render(); sig = ""; $("#sname").value = keep.name; $("#consent").checked = keep.consent; if (s0) say("Option changed. Please sign again.", "info"); return; }
    if (t.id === "dl") { pdf().then(function (b) { var u = URL.createObjectURL(new Blob([b], { type: "application/pdf" })), a = document.createElement("a"); a.href = u; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove(); }).catch(function () { say("The PDF could not be built. Please call " + D.esc(snap.brand.phone) + ".", "warn"); }); return; }
    if (t.id === "approve") {
      if (!sig) { say("Please sign in the box first.", "warn"); return; }
      if (!$("#consent").checked) { say("Please check the box agreeing to sign electronically.", "warn"); return; }
      if (!$("#sname").value.trim()) { say("Please type your name.", "warn"); $("#sname").focus(); return; }
      t.disabled = true; t.textContent = "Sending...";
      pdf().then(function (bytes) {
        var T = snap.tiers[sel], fd = new FormData();
        fd.append("_honey", $("#hp").value);
        fd.append("source", BR.site + " /proposal/ (customer approval)");
        fd.append("customer", $("#sname").value); fd.append("phone", snap.customer.phone); fd.append("email", snap.customer.email);
        fd.append("address", [snap.customer.address, snap.customer.city, snap.customer.zip].filter(Boolean).join(", "));
        fd.append("approved_option", T.label + " " + D.money(T.total));
        fd.append("signed", "Signed electronically " + $("#sdate").value + " (consent checked)");
        fd.append("proposal_id", String(snap.id || ""));
        fd.append("summary", D.textSummary(Object.assign({}, snap, { selected: sel })));
        fd.append("attachment", new File([bytes], fileName(), { type: "application/pdf" }));
        return D.send(fd, "Proposal APPROVED — " + BR.site + " | " + $("#sname").value + " | " + D.money(T.total));
      }).then(function (st) {
        if (st === "ok") { say("Approved. Thank you! We will call you to lock in your dates. Your signed PDF is downloading now."); $("#dl").click(); t.textContent = "Approved"; return; }
        var m = { fast: "Give it a few seconds, then press approve again.", blocked: "Please tap the page once, then press approve again." }[st] || ("We could not confirm that went through. Please call " + D.esc(snap.brand.phone) + " so nothing gets lost.");
        say(m, "warn"); t.disabled = false; t.textContent = "Approve and sign";
      });
    }
  });

  var h = location.hash.replace(/^#/, "");
  if (!h) { box.innerHTML = '<p class="msg warn">This link is missing the proposal. Please call ' + D.esc(BR.phone) + ' and we will resend it.</p>'; return; }
  D.decode(h).then(function (s) {
    if (!s || !s.tiers) throw new Error("bad");
    snap = s; sel = s.selected || "better";
    render();
    if (s.validUntil && D.todayISO() > s.validUntil) say("This proposal expired on " + D.fmtDate(s.validUntil) + ". Call " + D.esc(s.brand.phone) + " and we will refresh it.", "warn");
  }).catch(function () { box.innerHTML = '<p class="msg warn">This proposal link could not be opened. It may have been cut off when it was copied. Please call ' + D.esc(BR.phone) + '.</p>'; });
})();
