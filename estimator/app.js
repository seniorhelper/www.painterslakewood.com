/* Painter Hotline field estimator: app (v2). Needs engine.js, proposal.js and a #est-brand JSON block. */
(function () {
  "use strict";
  var E = window.PHEngine, D = window.PHDoc;
  var BR = JSON.parse(document.getElementById("est-brand").textContent);
  var P = null, est = null, R = null, mgr = false, dirty = false;
  var LS = "phest2:";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = D.esc, money = D.money;

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function lsGet(k) { try { return localStorage.getItem(LS + k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(LS + k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(LS + k); } catch (e) {} }
  function track(n, p) { try { if (window.gtag) window.gtag("event", n, p || {}); } catch (e) {} }

  /* ---------------- photos in IndexedDB (drafts stay small) ---------------- */
  var mem = {}, dbP = null;
  function db() {
    if (dbP) return dbP;
    dbP = new Promise(function (res) {
      try {
        var rq = indexedDB.open("phest2", 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore("photos"); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbP;
  }
  function photoPut(id, data) {
    mem[id] = data;
    return db().then(function (d) { if (!d) return; return new Promise(function (res) { var tx = d.transaction("photos", "readwrite"); tx.objectStore("photos").put(data, id); tx.oncomplete = res; tx.onerror = res; }); });
  }
  function photoGet(id) {
    if (mem[id]) return Promise.resolve(mem[id]);
    return db().then(function (d) { if (!d) return null; return new Promise(function (res) { var rq = d.transaction("photos").objectStore("photos").get(id); rq.onsuccess = function () { if (rq.result) mem[id] = rq.result; res(rq.result || null); }; rq.onerror = function () { res(null); }; }); });
  }
  function photoDel(id) { delete mem[id]; return db().then(function (d) { if (d) d.transaction("photos", "readwrite").objectStore("photos").delete(id); }); }
  function shrink(file) {
    return new Promise(function (res) {
      var img = new Image(), u = URL.createObjectURL(file);
      img.onload = function () {
        var m = 1280, s = Math.min(1, m / Math.max(img.width, img.height)), c = document.createElement("canvas");
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        res(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(null); };
      img.src = u;
    });
  }

  /* ---------------- estimate model ---------------- */
  function blank() {
    var t = D.todayISO();
    return { id: uid(), created: t, updated: Date.now(), proposalDate: t,
      customer: { name: "", phone: "", email: "", address: "", city: "", zip: "", yearBuilt: "" },
      project: { zone: BR.defaultZone || "metro", leadSafe: false, promo: promoLive(), selected: "better", addons: {}, courtesy: "", rep: lsGet("rep") || "", notes: "" },
      areas: [], sign: { name: "", date: t, consent: false, data: "", at: "" } };
  }
  function promoLive() { return !!(P && P.promo && new Date() <= new Date(P.promo.endsISO + "T23:59:59-07:00")); }

  var PRESETS = {
    room: [["Living room", {}], ["Primary bedroom", { walkins: 1 }], ["Bedroom", { closets: 1 }], ["Kitchen", {}], ["Bathroom", {}], ["Dining room", {}], ["Hallway", {}], ["Stairwell", { mode: "flat", flatKey: "flat_stairwell" }], ["Office", {}], ["Family room", {}], ["Basement", {}], ["Laundry", {}], ["Other room", {}]],
    cabinets: [["Kitchen cabinets", {}], ["Bathroom vanity", {}], ["Built-ins", {}]],
    exterior: [["House exterior", { sides: [{ label: "Front", length: "", stories: 1 }, { label: "Back", length: "", stories: 1 }, { label: "Left", length: "", stories: 1 }, { label: "Right", length: "", stories: 1 }] }], ["Detached garage", { sides: [{ label: "All sides", length: "", stories: 1 }] }]],
    deck: [["Deck", {}]], fence: [["Fence", {}]]
  };
  function newArea(type, presetIdx) {
    var pr = PRESETS[type][presetIdx || 0];
    var a = { id: uid(), type: type, name: pr[0], enabled: true, prep: "standard", colorChange: false, notes: "", photos: [] };
    if (type === "room") { a.mode = "dims"; a.include = { walls: true, ceiling: true, baseboard: true }; a.furniture = "light"; }
    if (type === "exterior") { a.siding = "lap_wood"; a.sides = []; }
    if (type === "fence") { a.fenceSides = "1"; a.fenceStyle = "privacy"; }
    var o = pr[1]; for (var k in o) a[k] = JSON.parse(JSON.stringify(o[k]));
    return a;
  }

  /* ---------------- drafts ---------------- */
  function index() { try { return JSON.parse(lsGet("index") || "[]"); } catch (e) { return []; } }
  function save(now) {
    clearTimeout(save.t);
    var go = function () {
      est.updated = Date.now();
      var ok = lsSet("d:" + est.id, JSON.stringify(est));
      var ix = index().filter(function (x) { return x.id !== est.id; });
      var T = R && R.tiers[est.project.selected];
      ix.unshift({ id: est.id, name: est.customer.name || "Untitled estimate", addr: est.customer.address || "", updated: est.updated, total: T ? T.total : 0 });
      lsSet("index", JSON.stringify(ix.slice(0, 60)));
      lsSet("last", est.id);
      var s = $("#est-saved"); if (s) s.textContent = ok ? "Saved " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Not saved (storage full or blocked)";
      dirty = false;
    };
    if (now) go(); else { dirty = true; save.t = setTimeout(go, 500); }
  }
  function load(id) {
    var raw = lsGet("d:" + id); if (!raw) return false;
    try { est = JSON.parse(raw); } catch (e) { return false; }
    est.sign = est.sign || { name: "", date: D.todayISO(), consent: false, data: "" };
    lsSet("last", est.id);
    return true;
  }

  /* ---------------- price book ---------------- */
  function getPrices() {
    var urls = [BR.pricesUrl, BR.pricesFallback].filter(Boolean);
    var i = 0;
    function next() {
      if (i >= urls.length) {
        var c = lsGet("prices"); if (c) { try { return Promise.resolve({ p: JSON.parse(c), src: "saved copy" }); } catch (e) {} }
        return Promise.reject(new Error("no price book"));
      }
      var u = urls[i++];
      return fetch(u, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (p) { if (!p.items || !p.tiers) throw new Error("bad"); lsSet("prices", JSON.stringify(p)); return { p: p, src: u.indexOf("http") === 0 ? "live" : "local" }; })
        .catch(next);
    }
    return next();
  }

  /* ---------------- rendering ---------------- */
  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (String(cur) === String(v) ? " selected" : "") + ">" + esc(label) + "</option>"; }
  function field(label, attr, val, o) {
    o = o || {};
    var id = "f" + Math.random().toString(36).slice(2, 9);
    return '<div class="fld' + (o.cls ? " " + o.cls : "") + '"><label for="' + id + '">' + label + (o.hint ? ' <small>' + o.hint + '</small>' : '') + '</label><input id="' + id + '" ' + attr +
      ' type="' + (o.type || "number") + '"' + (o.type && o.type !== "number" ? "" : ' inputmode="decimal" min="0" step="any"') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + ' value="' + esc(val == null ? "" : val) + '"' + (o.extra || "") + '></div>';
  }
  function sel(label, attr, options, cur) {
    var id = "f" + Math.random().toString(36).slice(2, 9);
    return '<div class="fld"><label for="' + id + '">' + label + '</label><select id="' + id + '" ' + attr + '>' + options.map(function (o) { return opt(o[0], o[1], cur); }).join("") + '</select></div>';
  }
  function chk(label, attr, on, hint) {
    return '<label class="chk"><input type="checkbox" ' + attr + (on ? " checked" : "") + '><span>' + label + (hint ? ' <small>' + hint + '</small>' : '') + '</span></label>';
  }
  function prepOpts() { var L = P.conditions.prepLabels; return Object.keys(P.conditions.prep).map(function (k) { return [k, L[k] || k]; }); }

  function areaBody(a) {
    var h = [], A = function (f) { return 'data-a="' + f + '"'; }, v = function (f) { return a[f]; };
    if (a.type === "room") {
      h.push('<div class="seg" role="group" aria-label="Price this room by"><button type="button" data-mode="flat" aria-pressed="' + (a.mode === "flat") + '">Flat room price</button><button type="button" data-mode="dims" aria-pressed="' + (a.mode === "dims" || !a.mode) + '">L x W x H</button><button type="button" data-mode="sqft" aria-pressed="' + (a.mode === "sqft") + '">Sq ft</button></div>');
      h.push('<div class="grid">');
      if (a.mode === "flat") {
        var flats = Object.keys(P.items).filter(function (k) { return P.items[k].flatroom; });
        h.push(sel("Room type", A("flatKey"), flats.map(function (k) { return [k, P.items[k].label]; }), a.flatKey || flats[1]) + field("How many", A("flatQty"), v("flatQty"), { ph: "1", hint: "hallway = per 10 LF" }));
      } else if (a.mode === "sqft") {
        h.push(field("Wall sq ft", A("wallSqft"), v("wallSqft")) + field("Ceiling sq ft", A("ceilSqft"), v("ceilSqft")) + field("Baseboard LF", A("trimLF"), v("trimLF")) + field("Wall height (ft)", A("H"), v("H"), { ph: "8" }));
      } else {
        h.push(field("Length (ft)", A("L"), v("L"), { ph: "14" }) + field("Width (ft)", A("W"), v("W"), { ph: "12" }) + field("Height (ft)", A("H"), v("H"), { ph: "8" }) +
          field("Door openings", A("doors"), v("doors"), { hint: "subtracted" }) + field("Window openings", A("windows"), v("windows"), { hint: "subtracted" }) + field("Baseboard LF", A("trimLF"), v("trimLF"), { hint: "blank = auto" }));
      }
      h.push('</div>');
      if (a.mode !== "flat") {
        h.push('<div class="incl" role="group" aria-label="Surfaces to paint">' + chk("Walls", 'data-inc="walls"', a.include.walls !== false) + chk("Ceiling", 'data-inc="ceiling"', a.include.ceiling !== false) + chk("Baseboard", 'data-inc="baseboard"', a.include.baseboard !== false) + '</div>');
        h.push('<p class="geo" data-geo></p>');
      } else h.push('<p class="hint">Flat price covers walls, ceiling and baseboards. Add doors, closets and repairs below.</p>');
      h.push('<details class="more"><summary>Doors, trim and closets</summary><div class="grid">' +
        field("Flat doors", A("doorsFlat"), v("doorsFlat"), { hint: "both sides" }) + field("Panel doors", A("doorsPanel"), v("doorsPanel"), { hint: "both sides" }) + field("Door frames", A("doorFrames"), v("doorFrames"), { hint: "sides" }) +
        field("French door sides", A("doorsFrench"), v("doorsFrench")) + field("Windows (sash, sill)", A("windowTrim"), v("windowTrim")) + field("Casing LF", A("casingLF"), v("casingLF")) +
        field("Crown molding LF", A("crownLF"), v("crownLF")) + field("Chair rail LF", A("chairLF"), v("chairLF")) + field("Reach-in closets", A("closets"), v("closets")) +
        field("Walk-in closets", A("walkins"), v("walkins")) + field("Accent walls", A("accentWalls"), v("accentWalls")) + '</div></details>');
      h.push('<details class="more"><summary>Repairs, wallpaper, popcorn</summary><div class="grid">' +
        field("Small patches", A("repairSmall"), v("repairSmall"), { hint: "up to 4 in." }) + field("Medium repairs", A("repairMedium"), v("repairMedium"), { hint: "4-12 in." }) + field("Large repairs", A("repairLarge"), v("repairLarge"), { hint: "to 2x2 ft" }) +
        field("Texture matches", A("textureMatch"), v("textureMatch")) + field("Stain-block primer sq ft", A("primeSqft"), v("primeSqft")) + field("Wallpaper removal sq ft", A("wallpaperSqft"), v("wallpaperSqft")) +
        field("Skim coat sq ft", A("skimSqft"), v("skimSqft")) + field("Popcorn paint-only sq ft", A("popcornPaintSqft"), v("popcornPaintSqft"), { hint: "uncheck Ceiling" }) + field("Popcorn removal sq ft", A("popcornSqft"), v("popcornSqft"), { hint: "after asbestos test" }) +
        '</div><p class="hint">Nail pops and dings are included with prep.</p></details>');
      h.push('<div class="grid">' + sel("Prep level", A("prep"), prepOpts(), a.prep) + sel("Furniture", A("furniture"), Object.keys(P.conditions.furniture).map(function (k) { return [k, P.conditions.furnitureLabels[k] || k]; }), a.furniture) + '</div>');
      h.push('<div class="incl">' + chk("Color change: extra coat (dark to light, bold reds/yellows)", A("colorChange"), a.colorChange) + chk("Full furniture move-out and reset", A("furnitureMove"), a.furnitureMove) +
        (a.mode === "flat" ? "" : chk("High ceiling / tall walls", A("highCeiling"), a.highCeiling === true, "auto over " + P.geometry.highCeilingFt + " ft") + chk("Stairwell / two-story wall", A("stairwell"), a.stairwell)) + '</div>');
    } else if (a.type === "cabinets") {
      h.push('<div class="grid">' + field("Doors", A("doors"), v("doors")) + field("Drawer fronts", A("drawers"), v("drawers")) + field("Boxes / frames LF", A("boxLF"), v("boxLF"), { hint: "uppers + lowers" }) +
        field("Islands", A("islands"), v("islands")) + field("Interiors (boxes)", A("interiorBoxes"), v("interiorBoxes")) + field("New hardware pieces", A("hardwareInstall"), v("hardwareInstall")) +
        field("Old holes to fill", A("hardwareFill"), v("hardwareFill")) + field("Clear-coat refinish pieces", A("clearPieces"), v("clearPieces"), { hint: "keep wood look" }) + '</div>');
      h.push('<div class="grid">' + sel("Prep level", A("prep"), prepOpts(), a.prep) + '</div><div class="incl">' + chk("Big color change (dark to light)", A("colorChange"), a.colorChange) + '</div>');
    } else if (a.type === "exterior") {
      h.push('<div class="grid">' + sel("Siding type", A("siding"), Object.keys(P.siding).map(function (k) { return [k, P.siding[k].label]; }), a.siding) + sel("Prep level", A("prep"), prepOpts(), a.prep) + '</div>');
      h.push('<p class="sub-h">Sides <small>length x stories, or enter sq ft. Power wash included.</small></p><div class="sides">');
      (a.sides || []).forEach(function (s, i) {
        h.push('<div class="side" data-side="' + i + '">' + field("Side", 'data-s="label"', s.label, { type: "text" }) + field("Length (ft)", 'data-s="length"', s.length) +
          sel("Stories", 'data-s="stories"', [["1", "1"], ["2", "2"], ["3", "3"]], s.stories || 1) + field("Gable sq ft", 'data-s="gableSqft"', s.gableSqft) + field("Or sq ft", 'data-s="sqft"', s.sqft) +
          '<button type="button" class="x" data-delside="' + i + '" aria-label="Remove side ' + esc(s.label || i + 1) + '">Remove</button></div>');
      });
      h.push('</div><button type="button" class="btn btn-line sm" data-addside>+ Add side</button>');
      h.push('<p class="geo" data-geo></p>');
      h.push('<div class="grid">' + field("Fascia / rake LF", A("fasciaLF"), v("fasciaLF")) + field("Soffit LF", A("soffitLF"), v("soffitLF")) + field("Gutters LF", A("gutterLF"), v("gutterLF")) +
        field("Windows (trim)", A("windows"), v("windows")) + field("Entry doors", A("entryDoors"), v("entryDoors")) + field("Garage doors, 1-car", A("garageSingle"), v("garageSingle")) +
        field("Garage doors, 2-car", A("garageDouble"), v("garageDouble")) + field("Shutters (pairs)", A("shutters"), v("shutters")) + field("Caulking LF", A("caulkLF"), v("caulkLF")) +
        field("Carpentry hours", A("carpentryHrs"), v("carpentryHrs"), { hint: "wood rot" }) + '</div>');
      h.push('<div class="incl">' + chk("Big color change (dark to light)", A("colorChange"), a.colorChange) + '</div>');
    } else if (a.type === "deck") {
      h.push('<div class="grid">' + field("Floor sq ft", A("floorSqft"), v("floorSqft")) + field("Railing LF", A("railingLF"), v("railingLF")) + field("Steps", A("stairs"), v("stairs")) +
        sel("Prep level", A("prep"), prepOpts(), a.prep) + '</div><p class="hint">Clean, brighten and 2 coats of stain. Horizontal surfaces carry a 1-year warranty.</p>');
    } else if (a.type === "fence") {
      h.push('<div class="grid">' + field("Length (LF)", A("lengthLF"), v("lengthLF")) + sel("Style", A("fenceStyle"), [["privacy", "6 ft privacy"], ["picket", "Picket / split rail"]], a.fenceStyle) +
        sel("Sides", A("fenceSides"), [["1", "One side"], ["2", "Both sides"]], a.fenceSides) + sel("Prep level", A("prep"), prepOpts(), a.prep) + '</div>');
    }
    h.push('<div class="fld wide"><label for="n' + a.id + '">Notes for this area <small>shows on the proposal</small></label><textarea id="n' + a.id + '" data-a="notes" rows="2" placeholder="Colors, sheen, special instructions">' + esc(a.notes) + '</textarea></div>');
    h.push('<div class="photos"><label class="btn btn-line sm"><input type="file" accept="image/*" capture="environment" multiple data-photo hidden>Add photo</label><div class="thumbs" data-thumbs></div></div>');
    return h.join("");
  }
  var TYPE_NAMES = { room: "Interior room", cabinets: "Cabinets", exterior: "Exterior", deck: "Deck", fence: "Fence" };
  function areaCard(a) {
    return '<details class="area" data-id="' + a.id + '" open><summary><span class="a-type">' + TYPE_NAMES[a.type] + '</span><span class="a-name">' + esc(a.name) + '</span><span class="a-sum" data-asum>$0</span></summary>' +
      '<div class="a-body"><div class="grid">' + field("Area name", 'data-a="name"', a.name, { type: "text" }) + '</div>' + areaBody(a) +
      '<div class="a-tools"><button type="button" class="btn btn-line sm" data-dup>Duplicate</button><button type="button" class="btn btn-warn sm" data-del>Remove area</button></div></div></details>';
  }
  function renderAreas() {
    var box = $("#areas");
    box.innerHTML = est.areas.length ? est.areas.map(areaCard).join("") : '<p class="empty">No areas yet. Add the first room, cabinets or exterior below.</p>';
    est.areas.forEach(function (a) { renderThumbs(a); });
  }
  function renderThumbs(a) {
    var box = $('.area[data-id="' + a.id + '"] [data-thumbs]'); if (!box) return;
    box.innerHTML = "";
    (a.photos || []).forEach(function (pid) {
      photoGet(pid).then(function (src) {
        if (!src) return;
        var f = document.createElement("figure");
        f.innerHTML = '<img alt="Photo of ' + esc(a.name) + '" src="' + src + '"><button type="button" class="x" data-delphoto="' + pid + '" aria-label="Delete photo">Delete</button>';
        box.appendChild(f);
      });
    });
  }

  function renderStep1() {
    var c = est.customer, p = est.project, B = function (f) { return 'data-b="' + f + '"'; };
    $("#step1").innerHTML =
      '<h2>Customer and home</h2><div class="grid">' +
      field("Customer name", B("customer.name"), c.name, { type: "text", extra: ' autocomplete="name"' }) +
      field("Phone", B("customer.phone"), c.phone, { type: "tel", extra: ' autocomplete="tel"' }) +
      field("Email", B("customer.email"), c.email, { type: "email", extra: ' autocomplete="email"' }) +
      field("Street address", B("customer.address"), c.address, { type: "text", extra: ' autocomplete="street-address"', cls: "wide" }) +
      field("City", B("customer.city"), c.city, { type: "text" }) + field("ZIP", B("customer.zip"), c.zip, { type: "text", extra: ' inputmode="numeric" maxlength="10"' }) +
      field("Year built", B("customer.yearBuilt"), c.yearBuilt, { hint: "pre-1978 = lead-safe" }) +
      sel("Service area", B("project.zone"), Object.keys(P.zones).map(function (k) { return [k, P.zones[k].label]; }), p.zone) +
      field("Estimator name", B("project.rep"), p.rep, { type: "text" }) + '</div>' +
      '<div class="incl">' + chk(P.leadSafe.label, B("project.leadSafe"), p.leadSafe) + chk(P.surcharges.rushLabel, B("project.rush"), p.rush) + chk(P.surcharges.afterHoursLabel, B("project.afterHours"), p.afterHours) + '</div><p class="hint" id="lead-hint" hidden></p>' +
      '<div class="fld wide"><label for="pnotes">Project notes <small>shows on the proposal</small></label><textarea id="pnotes" ' + B("project.notes") + ' rows="3" placeholder="Access, pets, schedule requests, colors chosen">' + esc(p.notes) + '</textarea></div>';
    leadHint();
  }
  function leadHint() {
    var y = parseInt(est.customer.yearBuilt, 10), h = $("#lead-hint");
    if (!h) return;
    if (y && y < P.rules.leadSafeBeforeYear && !est.project.leadSafe) { h.hidden = false; h.textContent = "Built in " + y + ": EPA RRP rules apply to work that disturbs paint in homes built before 1978. Turn on lead-safe practices unless a test shows no lead."; }
    else h.hidden = true;
  }

  function renderStep3() {
    var p = est.project;
    var addons = (P.addons || []).map(function (d) {
      var v = p.addons[d.id];
      return '<div class="addon">' + chk(esc(d.label) + ' <small>' + money(P.items[d.item].price[0]) + (d.unit === "flat" ? "" : " / " + esc(d.unit)) + '</small>', 'data-addon="' + d.id + '"', !!v) +
        (d.unit === "flat" ? "" : '<input class="qty" type="number" inputmode="decimal" min="0" step="any" aria-label="' + esc(d.qtyLabel || d.unit) + ' for ' + esc(d.label) + '" placeholder="' + esc(d.qtyLabel || d.unit) + '" data-addonqty="' + d.id + '" value="' + esc(typeof v === "number" || typeof v === "string" ? v : "") + '">') + '</div>';
    }).join("");
    var promo = P.promo ? '<div class="promo-box">' + chk("<b>" + esc(P.promo.label) + "</b>", 'data-b="project.promo"', p.promo && promoLive(), esc(P.promo.detail)) + '<p class="promo-eff" id="promo-eff"></p>' + (promoLive() ? "" : '<p class="hint">This promo ended ' + esc(D.fmtDate(P.promo.endsISO)) + '.</p>') + '</div>' : "";
    $("#step3").innerHTML =
      '<h2>Options</h2><p class="hint">Present Best first, then Better. Tap a column to select it for the proposal.</p>' +
      '<div class="opts" id="opts" role="radiogroup" aria-label="Choose the option for the proposal"></div>' + promo +
      '<h3>Add-ons</h3><div class="addons">' + addons + '</div>' +
      '<div class="grid">' + field("Courtesy discount ($)", 'data-b="project.courtesy"', p.courtesy, { hint: "off every option" }) + '</div>' +
      '<div id="sched"></div><ul class="warns" id="warns" aria-live="polite"></ul>' +
      '<div class="mgr-only mgr-panel" id="mgr-panel"></div>';
  }

  function renderOpts() {
    var box = $("#opts"); if (!box) return;
    var sel = est.project.selected;
    box.innerHTML = E.TIERS.map(function (k) {
      var t = R.tiers[k], on = k === sel;
      var badge = mgr ? '<p class="mgr-badge g-' + t.guard + '">' + (t.empty ? "No items" : "Margin " + (t.margin * 100).toFixed(1) + "%") + '<br><small>' + (t.guard === "below-floor" ? "BELOW FLOOR " + money(t.floorPrice) : t.guard === "below-target" ? "Under target (" + money(t.targetPrice) + ")" : t.empty ? "" : "On target") + '</small></p>' : "";
      return '<button type="button" class="opt' + (on ? " on" : "") + '" role="radio" aria-checked="' + on + '" data-tier="' + k + '">' +
        '<span class="o-l">' + esc(t.label) + ' <small>' + esc(t.name || "") + '</small></span>' + (t.savings > 0 ? '<span class="o-was"><s>' + money(t.regular) + '</s></span>' : '') +
        '<span class="o-p">' + money(t.total) + '</span><span class="o-d">Deposit ' + money(t.deposit) + '</span>' +
        '<span class="o-s">' + esc(t.summary) + '</span><span class="o-prod">' + esc(t.products) + '</span>' + badge + '</button>';
    }).join("") + '<div class="opt-detail"><b>' + esc(R.tiers[sel].label) + ':</b> ' + esc(R.tiers[sel].summary) + '<br><small>' + esc(R.tiers[sel].products) + '</small></div>';
  }

  function renderSchedule() {
    var b = $("#sched"); if (!b) return;
    var t = R.tiers[est.project.selected];
    b.innerHTML = '<h3>Payment schedule: ' + esc(t.label) + '</h3><table class="tbl"><tbody>' +
      t.schedule.map(function (s) { return '<tr><th scope="row">' + esc(s.label) + ' <small>' + Math.round(s.pct * 100) + '%</small></th><td>' + money(s.amount) + '</td></tr>'; }).join("") +
      '<tr class="tot"><th scope="row">Total</th><td>' + money(t.total) + '</td></tr></tbody></table>' +
      (t.minimumApplied ? '<p class="hint">Minimum project charge (' + money(t.minimum) + ') applied.</p>' : '');
    var pe = $("#promo-eff");
    if (pe) {
      var sv = t.savings > 0 && R.promoOn;
      pe.innerHTML = sv ? '25% off labor = <b>' + (t.savingsPct * 100).toFixed(1) + '% off this ' + esc(t.label) + ' total</b> (' + money(t.regular) + ' &rarr; ' + money(t.total) + ', saves ' + money(t.savings) + ')' : (R.promoOn && t.minimumApplied ? "The minimum project charge applies, so the promo does not lower this price." : "");
    }
    var w = $("#warns");
    if (w) w.innerHTML = R.warnings.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("");
    var m = $("#mgr-panel");
    if (m && mgr) {
      m.innerHTML = '<h3>Manager view</h3><div class="tblw"><table class="tbl"><thead><tr><th scope="col">Option</th><th scope="col">Price</th><th scope="col">Cost</th><th scope="col">Margin</th><th scope="col">Floor</th></tr></thead><tbody>' +
        E.TIERS.map(function (k) { var t = R.tiers[k]; return '<tr><th scope="row">' + esc(t.label) + '</th><td>' + money(t.total) + '</td><td>' + money(t.cost.total) + '</td><td class="g-' + t.guard + '">' + (t.margin * 100).toFixed(1) + '%</td><td>' + money(t.floorPrice) + '</td></tr>'; }).join("") +
        '</tbody></table></div><p class="hint">Cost = labor hours x $' + P.costModel.loadedLaborPerHour + ' loaded rate + material cost, from price book ' + esc(P.version) + '. ' + esc(R.tiers[est.project.selected].label) + ': ' + R.tiers[est.project.selected].hours + ' labor hours, about ' + R.tiers[est.project.selected].crewDays + ' crew-days. Target ' + Math.round(P.costModel.targetMargin * 100) + '%, floor ' + Math.round(P.costModel.floorMargin * 100) + '%. Promo labor discounts lower margin; cost does not change.</p>' +
        '<details><summary>Change the manager PIN</summary><div class="grid">' + field("New PIN", 'id="newpin"', "", { type: "password", extra: ' inputmode="numeric" autocomplete="new-password"' }) + '</div><button type="button" class="btn btn-line sm" id="mkpin">Make hash</button><pre id="pinout" class="pinout"></pre></details>';
    }
  }

  function snapshot() { return D.snapshot(est, R, P, BR, E); }
  function renderStep4() {
    var s = est.sign;
    $("#step4").innerHTML = '<h2>Proposal and signature</h2><div id="preview" class="preview"></div>' +
      '<section class="signbox" aria-labelledby="sig-h"><h3 id="sig-h">Customer approval</h3><div class="grid">' +
      field("Signer name", 'data-b="sign.name"', s.name, { type: "text", extra: ' autocomplete="name"' }) + field("Date", 'data-b="sign.date"', s.date, { type: "date" }) + '</div>' +
      '<p class="hint">Sign with a finger or stylus inside the box.</p><canvas id="pad" class="pad" width="900" height="260" role="img" aria-label="Signature area"></canvas>' +
      '<div class="row"><button type="button" class="btn btn-line sm" id="padclear">Clear signature</button></div>' +
      chk("I agree to sign this proposal electronically, and that my electronic signature has the same effect as signing on paper.", 'data-b="sign.consent"', s.consent) +
      '</section><div class="actions">' +
      '<button type="button" class="btn btn-main" id="b-pdf">Download PDF</button>' +
      '<button type="button" class="btn btn-main" id="b-office">Send to office</button>' +
      '<button type="button" class="btn btn-line" id="b-share" hidden>Share PDF</button>' +
      '<a class="btn btn-line" id="b-mail" href="#">Email a copy</a><a class="btn btn-line" id="b-sms" href="#">Text a copy</a>' +
      '<button type="button" class="btn btn-line" id="b-link">Copy client link</button></div><p class="msg" id="out" role="status" aria-live="polite"></p>';
    initPad();
    if (navigator.canShare) { try { if (navigator.canShare({ files: [new File(["x"], "x.pdf", { type: "application/pdf" })] })) $("#b-share").hidden = false; } catch (e) {} }
    refreshPreview();
  }
  function refreshPreview() {
    var pv = $("#preview"); if (!pv || !R) return;
    pv.innerHTML = D.html(snapshot());
    var link = "", s = snapshot();
    D.encode(s).then(function (code) {
      link = location.origin + "/proposal/#" + code;
      var sum = D.textSummary(s, link);
      var m = $("#b-mail"); if (m) m.href = "mailto:" + encodeURIComponent(est.customer.email || "") + "?subject=" + encodeURIComponent("Your painting proposal from " + BR.name) + "&body=" + encodeURIComponent(sum);
      var t = $("#b-sms"); if (t) t.href = "sms:" + encodeURIComponent((est.customer.phone || "").replace(/[^\d+]/g, "")) + "?&body=" + encodeURIComponent("Your " + BR.name + " proposal (" + R.tiers[est.project.selected].label + " " + money(R.tiers[est.project.selected].total) + "): " + link);
      refreshPreview.link = link;
    });
  }

  /* ---------------- signature pad ---------------- */
  function initPad() {
    var c = $("#pad"); if (!c) return;
    var x = c.getContext("2d"), drawing = false, last = null;
    x.lineWidth = 4; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#0d1b2e";
    if (est.sign.data) { var im = new Image(); im.onload = function () { x.drawImage(im, 0, 0); }; im.src = est.sign.data; }
    function pt(e) { var r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; }
    c.addEventListener("pointerdown", function (e) { drawing = true; last = pt(e); c.setPointerCapture(e.pointerId); e.preventDefault(); });
    c.addEventListener("pointermove", function (e) { if (!drawing) return; var p = pt(e); x.beginPath(); x.moveTo(last.x, last.y); x.lineTo(p.x, p.y); x.stroke(); last = p; e.preventDefault(); });
    function end() { if (!drawing) return; drawing = false; est.sign.data = c.toDataURL("image/png"); est.sign.at = new Date().toISOString(); save(); }
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end); c.addEventListener("pointerleave", end);
    $("#padclear").addEventListener("click", function () { x.clearRect(0, 0, c.width, c.height); est.sign.data = ""; est.sign.at = ""; save(); });
  }

  /* ---------------- compute + live UI ---------------- */
  function recompute() {
    R = E.compute(est, P);
    est.areas.forEach(function (a) {
      var card = $('.area[data-id="' + a.id + '"]'); if (!card) return;
      var t = R.tiers[est.project.selected];
      $("[data-asum]", card).textContent = money(t.areaTotals[a.id] || 0);
      var g = $("[data-geo]", card);
      if (g && a.type === "room") { var geo = E.roomGeometry(a, P, []); g.textContent = "Walls " + Math.round(geo.wall) + " sq ft · Ceiling " + Math.round(geo.ceiling) + " sq ft · Baseboard " + Math.round(geo.base) + " LF"; }
      if (g && a.type === "exterior") { var q = 0; t.lines.forEach(function (l) { if (l.areaId === a.id && l.key === "ext_body") q = l.qty; }); g.textContent = "Body " + Math.round(q).toLocaleString("en-US") + " sq ft"; }
    });
    var T = R.tiers[est.project.selected];
    $("#bar-tier").textContent = T.label;
    $("#bar-total").textContent = money(T.total);
    var w = $("#bar-was"); w.textContent = T.savings > 0 ? money(T.regular) : ""; w.hidden = !(T.savings > 0);
    $("#bar-mgr").textContent = mgr && !T.empty ? (T.margin * 100).toFixed(0) + "% GM" : "";
    $("#bar-mgr").className = "bar-mgr g-" + T.guard;
    renderOpts(); renderSchedule();
    if (cur === 4) { clearTimeout(recompute.t); recompute.t = setTimeout(refreshPreview, 250); }
  }

  function setPath(path, val) {
    var parts = path.split("."), o = est;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = val;
  }

  /* ---------------- steps ---------------- */
  var cur = 1;
  function go(n) {
    cur = Math.max(1, Math.min(4, n));
    $$(".step").forEach(function (s, i) { s.hidden = i + 1 !== cur; });
    $$(".steps button").forEach(function (b, i) { b.setAttribute("aria-current", i + 1 === cur ? "step" : "false"); });
    if (cur === 4) renderStep4();
    $("#bar-next").textContent = cur < 4 ? "Next" : "Top";
    window.scrollTo(0, 0);
    lsSet("step", String(cur));
  }

  function mountAll() {
    renderStep1(); renderAreas(); renderStep3();
    recompute();
    go(cur);
    $("#est-name").textContent = est.customer.name || "Untitled estimate";
  }

  /* ---------------- events ---------------- */
  function onInput(e) {
    var t = e.target;
    if (t.dataset.b) {
      var v = t.type === "checkbox" ? t.checked : t.value;
      setPath(t.dataset.b, v);
      if (t.dataset.b === "customer.name") $("#est-name").textContent = v || "Untitled estimate";
      if (t.dataset.b.indexOf("customer.yearBuilt") === 0 || t.dataset.b === "project.leadSafe") leadHint();
      if (t.dataset.b === "project.promo" && v && !promoLive()) { t.checked = false; est.project.promo = false; }
      recompute(); save(); return;
    }
    var card = t.closest && t.closest(".area");
    if (card) {
      var a = find(card.dataset.id); if (!a) return;
      if (t.dataset.a) {
        a[t.dataset.a] = t.type === "checkbox" ? t.checked : t.value;
        if (t.dataset.a === "name") $(".a-name", card).textContent = t.value;
      } else if (t.dataset.inc) { a.include[t.dataset.inc] = t.checked; }
      else if (t.dataset.s) { var i = +t.closest("[data-side]").dataset.side; a.sides[i][t.dataset.s] = t.value; }
      else if (t.dataset.photo !== undefined && e.type === "change") { addPhotos(a, t); return; }
      recompute(); save(); return;
    }
    if (t.dataset.addon) { est.project.addons[t.dataset.addon] = t.checked ? (qtyFor(t.dataset.addon) || true) : false; recompute(); save(); return; }
    if (t.dataset.addonqty) {
      var id = t.dataset.addonqty, box = $('[data-addon="' + id + '"]');
      if (t.value && box) box.checked = true;
      est.project.addons[id] = box && box.checked ? (t.value || true) : false; recompute(); save(); return;
    }
  }
  function qtyFor(id) { var q = $('[data-addonqty="' + id + '"]'); return q ? q.value : ""; }
  function find(id) { for (var i = 0; i < est.areas.length; i++) if (est.areas[i].id === id) return est.areas[i]; return null; }
  function addPhotos(a, input) {
    var files = [].slice.call(input.files || [], 0, 8);
    var out = $("#est-saved"); if (out) out.textContent = "Adding photos...";
    Promise.all(files.map(shrink)).then(function (list) {
      return Promise.all(list.filter(Boolean).map(function (data) { var id = "p" + uid(); a.photos.push(id); return photoPut(id, data); }));
    }).then(function () { input.value = ""; renderThumbs(a); save(true); });
  }

  function onClick(e) {
    var t = e.target.closest("button, a"); if (!t) return;
    var card = t.closest(".area"), a = card && find(card.dataset.id);
    if (t.dataset.mode && a) { a.mode = t.dataset.mode; card.outerHTML = areaCard(a); renderThumbs(a); recompute(); save(); return; }
    if (t.hasAttribute("data-addside") && a) { a.sides.push({ label: "Side " + (a.sides.length + 1), length: "", stories: 1 }); rerenderCard(a); return; }
    if (t.dataset.delside && a) { a.sides.splice(+t.dataset.delside, 1); rerenderCard(a); return; }
    if (t.hasAttribute("data-dup") && a) { var c = JSON.parse(JSON.stringify(a)); c.id = uid(); c.name = a.name + " (copy)"; c.photos = []; est.areas.splice(est.areas.indexOf(a) + 1, 0, c); renderAreas(); recompute(); save(); return; }
    if (t.hasAttribute("data-del") && a) { if (!confirm("Remove " + a.name + "?")) return; (a.photos || []).forEach(photoDel); est.areas.splice(est.areas.indexOf(a), 1); renderAreas(); recompute(); save(); return; }
    if (t.dataset.delphoto && a) { a.photos = a.photos.filter(function (p) { return p !== t.dataset.delphoto; }); photoDel(t.dataset.delphoto); renderThumbs(a); save(); return; }
    if (t.dataset.add) { var na = newArea(t.dataset.add, +($("#preset-" + t.dataset.add) ? $("#preset-" + t.dataset.add).value : 0)); est.areas.push(na); renderAreas(); recompute(); save(); var nc = $('.area[data-id="' + na.id + '"]'); if (nc) { nc.scrollIntoView({ block: "start" }); var f = $("input", nc); if (f) f.focus({ preventScroll: true }); } return; }
    if (t.dataset.tier) { est.project.selected = t.dataset.tier; recompute(); save(); return; }
    if (t.dataset.go) { go(+t.dataset.go); return; }
    if (t.id === "bar-next") { if (cur < 4) go(cur + 1); else window.scrollTo(0, 0); return; }
    if (t.id === "b-pdf") { makePdf().then(function (bytes) { download(bytes); }); return; }
    if (t.id === "b-share") { makePdf().then(function (bytes) { var f = new File([bytes], fileName(), { type: "application/pdf" }); return navigator.share({ files: [f], title: "Painting proposal" }); }).catch(function () {}); return; }
    if (t.id === "b-office") { sendOffice(t); return; }
    if (t.id === "b-link") { var l = refreshPreview.link || ""; (navigator.clipboard ? navigator.clipboard.writeText(l) : Promise.reject()).then(function () { say("Client link copied. It opens a signable copy of this proposal (no photos)."); }, function () { prompt("Copy this link", l); }); return; }
    if (t.id === "b-new") { save(true); est = blank(); cur = 1; mountAll(); save(true); return; }
    if (t.id === "b-drafts") { openDrafts(); return; }
    if (t.id === "b-mgr") { if (mgr) { mgr = false; document.body.classList.remove("mgr"); t.setAttribute("aria-pressed", "false"); recompute(); } else $("#pin-dlg").showModal(); return; }
    if (t.id === "mkpin") { var np = $("#newpin").value; if (!/^\d{4,8}$/.test(np)) { $("#pinout").textContent = "Use 4 to 8 digits."; return; } sha(P.manager.pinSalt + np).then(function (hx) { $("#pinout").textContent = '"pinSha256": "' + hx + '"\nPaste this into prices.json under "manager".'; }); return; }
    if (t.dataset.open) { save(true); if (load(t.dataset.open)) { $("#drafts-dlg").close(); cur = 1; mountAll(); } return; }
    if (t.dataset.copy) { var raw = lsGet("d:" + t.dataset.copy); if (raw) { var d = JSON.parse(raw); d.id = uid(); d.customer.name = (d.customer.name || "Estimate") + " (copy)"; d.sign = { name: "", date: D.todayISO(), consent: false, data: "" }; d.proposalDate = D.todayISO(); lsSet("d:" + d.id, JSON.stringify(d)); est = d; save(true); $("#drafts-dlg").close(); cur = 1; mountAll(); } return; }
    if (t.dataset.rm) { if (!confirm("Delete this draft?")) return; lsDel("d:" + t.dataset.rm); lsSet("index", JSON.stringify(index().filter(function (x) { return x.id !== t.dataset.rm; }))); if (t.dataset.rm === est.id) { est = blank(); mountAll(); } openDrafts(); return; }
  }
  function rerenderCard(a) { var card = $('.area[data-id="' + a.id + '"]'); card.outerHTML = areaCard(a); renderThumbs(a); recompute(); save(); }

  function openDrafts() {
    var ix = index();
    $("#drafts-list").innerHTML = ix.length ? ix.map(function (x) {
      return '<li><div><b>' + esc(x.name) + '</b><small>' + esc(x.addr) + (x.addr ? " · " : "") + new Date(x.updated).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + ' · ' + money(x.total) + '</small></div>' +
        '<span><button type="button" class="btn btn-main sm" data-open="' + x.id + '">Open</button><button type="button" class="btn btn-line sm" data-copy="' + x.id + '">Copy</button><button type="button" class="btn btn-warn sm" data-rm="' + x.id + '">Delete</button></span></li>';
    }).join("") : "<li>No saved estimates on this device yet.</li>";
    var d = $("#drafts-dlg"); if (!d.open) d.showModal();
  }

  function sha(s) { return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then(function (b) { return [].map.call(new Uint8Array(b), function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }); }

  /* ---------------- PDF / office ---------------- */
  function fileName() { return (BR.name + " proposal " + (est.customer.name || "") + " " + (est.proposalDate || "")).trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-") + ".pdf"; }
  function say(m, cls) { var o = $("#out"); if (o) { o.className = "msg " + (cls || "ok"); o.innerHTML = m; } }
  function makePdf() {
    say("Building the PDF...", "info");
    var s = snapshot();
    var photoJobs = [];
    est.areas.forEach(function (a) { if (a.enabled !== false) (a.photos || []).forEach(function (pid) { photoJobs.push(photoGet(pid).then(function (d) { return d ? { area: a.name, data: d } : null; })); }); });
    return Promise.all([D.loadLib(BR.pdfLib), fetch(BR.logoPdf).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).catch(function () { return null; }), Promise.all(photoJobs)]).then(function (x) {
      return D.pdf(s, { lib: x[0], logoBytes: x[1], logoType: /\.png$/i.test(BR.logoPdf) ? "png" : "jpg", color: BR.pdfColor, signature: est.sign.data ? est.sign : null, photos: x[2].filter(Boolean) });
    }).then(function (bytes) { say("PDF ready."); track("estimate_pdf", { value: R.tiers[est.project.selected].total }); return bytes; })
      .catch(function (err) { say("The PDF could not be built: " + esc(err.message || err), "warn"); throw err; });
  }
  function download(bytes) {
    var u = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    var a = document.createElement("a"); a.href = u; a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  }
  function sendOffice(btn) {
    var s = snapshot(), T = R.tiers[est.project.selected];
    if (T.empty) { say("Add at least one priced area before sending.", "warn"); return; }
    if (!navigator.onLine) { say("You are offline. The estimate is saved on this device; send it once you have signal.", "warn"); return; }
    btn.disabled = true; var lbl = btn.textContent; btn.textContent = "Sending...";
    makePdf().then(function (bytes) {
      var fd = new FormData();
      fd.append("_honey", "");
      fd.append("source", BR.site + " /estimator/ (field estimate)");
      fd.append("customer", est.customer.name); fd.append("phone", est.customer.phone); fd.append("email", est.customer.email);
      fd.append("address", [est.customer.address, est.customer.city, est.customer.zip].filter(Boolean).join(", "));
      fd.append("estimator", est.project.rep);
      fd.append("selected_option", T.label + " " + money(T.total));
      fd.append("options", E.TIERS.map(function (k) { return R.tiers[k].label + " " + money(R.tiers[k].total); }).join(" | "));
      fd.append("signed", est.sign.data && est.sign.consent ? "Yes, signed on site by " + (est.sign.name || est.customer.name) + " " + est.sign.date : "Not signed yet");
      fd.append("proposal_link", refreshPreview.link || "");
      fd.append("summary", D.textSummary(s));
      fd.append("attachment", new File([bytes], fileName(), { type: "application/pdf" }));
      return D.send(fd, "Field estimate — " + BR.site + " | " + (est.customer.name || "Customer") + " | " + money(T.total));
    }).then(function (st) {
      var m = { ok: ["ok", "Sent to the office."], fast: ["warn", "Give it a few seconds, then send again."], blocked: ["warn", "Tap the screen once, then send again."],
        unconfirmed: ["warn", "The office did not confirm receipt. Download the PDF and call " + esc(BR.phone) + "."], fail: ["warn", "The connection dropped. The estimate is saved here; try again when you have signal."] }[st] || ["warn", "Not sent."];
      say(m[1], m[0]); if (st === "ok") track("estimate_sent_office", { value: T.total });
    }).catch(function () {}).then(function () { btn.disabled = false; btn.textContent = lbl; });
  }

  /* ---------------- boot ---------------- */
  function boot() {
    document.addEventListener("input", onInput);
    document.addEventListener("change", function (e) { if (e.target.dataset && e.target.dataset.photo !== undefined) onInput(e); else if (e.target.tagName === "SELECT" || e.target.type === "checkbox" || e.target.type === "date") onInput(e); });
    document.addEventListener("click", onClick);
    $("#pin-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = $("#pin").value; $("#pin").value = "";
      sha(P.manager.pinSalt + v).then(function (h) {
        if (h === P.manager.pinSha256) { mgr = true; document.body.classList.add("mgr"); $("#b-mgr").setAttribute("aria-pressed", "true"); $("#pin-dlg").close(); recompute(); }
        else $("#pin-msg").textContent = "That PIN did not match.";
      }).catch(function () { $("#pin-msg").textContent = "PIN check needs a secure (https) page."; });
    });
    $$("dialog [data-close]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });
    window.addEventListener("beforeunload", function () { if (dirty) save(true); });
    document.addEventListener("visibilitychange", function () { if (document.hidden && dirty) save(true); });
    window.addEventListener("online", net); window.addEventListener("offline", net); net();

    getPrices().then(function (res) {
      P = res.p;
      $("#pb").textContent = "Price book " + P.version + " (" + res.src + ")";
      var last = lsGet("last");
      if (!(last && load(last))) est = blank();
      cur = +(lsGet("step") || 1) || 1;
      ["room", "cabinets", "exterior"].forEach(function (k) { var s = $("#preset-" + k); if (s) s.innerHTML = PRESETS[k].map(function (p, i) { return opt(i, p[0], 0); }).join(""); });
      mountAll();
      $("#app").removeAttribute("aria-busy");
    }).catch(function () {
      $("#app").innerHTML = '<p class="msg warn">The price book could not be loaded. Connect once to download it, then the estimator works offline.</p>';
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/estimator/sw.js", { scope: "/estimator/" }).then(function () { var o = $("#offline"); if (o) o.textContent = "Works offline"; }).catch(function () {});
  }
  function net() { var o = $("#net"); if (o) { o.textContent = navigator.onLine ? "Online" : "Offline: saving on this device"; o.className = "net " + (navigator.onLine ? "on" : "off"); } }

  window.PHEst = { get est() { return est; }, get result() { return R; }, get prices() { return P; }, save: save, go: go };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
