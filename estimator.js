/* Painter Hotline - field estimator and proposal builder.
   Portable: drop estimator.js on any painting site, set CFG below. */
(function () {
  "use strict";

  var CFG = window.PH_EST_CFG || {
    company: "Painter Hotline",
    legal: "Search Converts LLC, doing business as Painter Hotline",
    phone: "720-208-5645", tel: "+17202085645",
    email: "quote@painterhotline.com",
    site: "painterhotline.com",
    terms: "/terms/",
    logo: "/images/proposal-logo.jpg",
    warranty: "5-year workmanship warranty",
    promoPct: 25,
    promoLabel: "October booking discount (labor)",
    depositPct: 50
  };

  /* ---------- rate card (editable in the tool) ---------- */
  var R = {
    ext_wall: 1.95, ext_scrape_min: 0.25, ext_scrape_med: 0.55, ext_scrape_full: 1.10,
    ext_wash: 0.18, ext_prime: 0.45, ext_window: 38, ext_wintrim: 3.25, ext_door: 95,
    ext_garage: 140, ext_soffit: 4.50, ext_shutter: 45, ext_rail: 14, ext_deck: 2.60, ext_fence: 3.10,
    int_wall: 1.85, int_ceiling: 1.15, int_trim: 3.10, int_door: 85, int_window: 55,
    int_closet: 75, int_accent: 90, int_furniture: 85, int_repair: 65,
    coat2: 0.34, commercial: 1.15, afterhours: 1.25, minimum: 850
  };
  var ZONE = { metro: 1, north: 1.02, plains: 1.04, mountain: 1.12 };

  var SHEENS = ["Flat", "Matte", "Eggshell", "Satin", "Semi-gloss", "Gloss"];
  var COLORS = ["Alabaster SW 7008", "Pure White SW 7005", "Snowbound SW 7004", "Shoji White SW 7042",
    "Agreeable Gray SW 7029", "Repose Gray SW 7015", "Accessible Beige SW 7036", "Mindful Gray SW 7016",
    "Sea Salt SW 6204", "Evergreen Fog SW 9130", "Pewter Green SW 6208", "Urbane Bronze SW 7048",
    "Iron Ore SW 7069", "Tricorn Black SW 6258", "Naval SW 6244", "Dovetail SW 7018",
    "PPG match", "Behr match", "Match existing", "Customer supplying color"];
  var SIDES = ["Front", "Rear", "North", "South", "East", "West"];
  var SIDING = ["Lap / wood siding", "Fiber cement", "Hardboard / masonite", "Stucco", "Brick", "Vinyl", "Aluminum", "Log", "Block", "Mixed"];
  var SCRAPE = [["none", "None needed", 0], ["min", "Minimal", R.ext_scrape_min], ["med", "Medium", R.ext_scrape_med], ["full", "Full / heavy", R.ext_scrape_full]];

  function API() { return window.PHL || window.PBX || window.BHL || window.DPC || window.PH_FORM_API || null; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function el(h) { var d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; }
  function money(n) { return '$' + (Math.round(n)).toLocaleString(); }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  /* ---------- state ---------- */
  var S = {
    mode: 'residential', zone: 'metro', afterhours: false,
    client: {}, prop: {}, paint: { brand: 'Sherwin-Williams', coats: '2', sheen_body: 'Satin', sheen_trim: 'Semi-gloss', sheen_walls: 'Eggshell', sheen_ceil: 'Flat' },
    doExt: true, doInt: false, sides: [], rooms: [], extras: {}, intGlobal: {}, adj: { discount: CFG.promoPct, extra: 0, note: '' },
    sig: { client_name: '', client_date: '', rep_name: '', rep_date: '', data: '' }
  };

  function sideRow(i, name) {
    return '<div class="es-card" data-side="' + i + '">' +
      '<div class="es-head"><b>' + esc(name) + ' elevation</b><button type="button" class="es-x" data-del="' + i + '" aria-label="Remove ' + esc(name) + '">Remove</button></div>' +
      '<div class="es-grid">' +
      '<label>Wall length (ft)<input type="number" min="0" step="1" data-f="len" inputmode="decimal"></label>' +
      '<label>Wall height (ft)<input type="number" min="0" step="1" data-f="hgt" inputmode="decimal"></label>' +
      '<label>Or total wall sq ft<input type="number" min="0" step="10" data-f="sqft" inputmode="decimal"></label>' +
      '<label>Siding type<select data-f="siding">' + SIDING.map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select></label>' +
      '<label>Windows (count)<input type="number" min="0" step="1" data-f="windows" inputmode="numeric"></label>' +
      '<label>Window &amp; door trim painted?<select data-f="trim"><option value="no">No</option><option value="yes" selected>Yes</option></select></label>' +
      '<label>Trim linear feet<input type="number" min="0" step="5" data-f="trimlf" inputmode="numeric"></label>' +
      '<label>Entry doors<input type="number" min="0" step="1" data-f="doors" inputmode="numeric"></label>' +
      '<label>Garage doors<input type="number" min="0" step="1" data-f="garage" inputmode="numeric"></label>' +
      '<label>Soffit &amp; fascia (LF)<input type="number" min="0" step="5" data-f="soffit" inputmode="numeric"></label>' +
      '<label>Shutters (pairs)<input type="number" min="0" step="1" data-f="shutters" inputmode="numeric"></label>' +
      '<label>Railing (LF)<input type="number" min="0" step="5" data-f="rail" inputmode="numeric"></label>' +
      '<label>Scraping<select data-f="scrape">' + SCRAPE.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + '</option>'; }).join('') + '</select></label>' +
      '<label>Power washing<select data-f="wash"><option value="yes" selected>Yes</option><option value="no">No</option></select></label>' +
      '<label>Priming required<select data-f="prime"><option value="no">No</option><option value="spot">Spot prime</option><option value="full">Full prime</option></select></label>' +
      '<label>Primer notes / why<input type="text" data-f="primenote" placeholder="Bare wood at sills, tannin bleed..."></label>' +
      '</div>' +
      '<label class="es-wide">Notes &amp; special instructions for this elevation<textarea rows="2" data-f="notes" placeholder="Sprinkler hitting lower courses, wasp nest at peak, replace two boards..."></textarea></label>' +
      '<div class="es-line"><span>Elevation subtotal</span><b data-out="side">$0</b></div></div>';
  }

  function roomRow(i) {
    return '<div class="es-card" data-room="' + i + '">' +
      '<div class="es-head"><b>Area ' + (i + 1) + '</b><button type="button" class="es-x" data-delroom="' + i + '" aria-label="Remove area">Remove</button></div>' +
      '<div class="es-grid">' +
      '<label>Room / area name<input type="text" data-f="name" placeholder="Primary bedroom, stairwell, lobby..."></label>' +
      '<label>Level<select data-f="level"><option>Main level</option><option>Upper level</option><option>Basement</option><option>Second floor</option><option>Third floor</option><option>Whole unit</option></select></label>' +
      '<label>Length (ft)<input type="number" min="0" step="1" data-f="len" inputmode="decimal"></label>' +
      '<label>Width (ft)<input type="number" min="0" step="1" data-f="wid" inputmode="decimal"></label>' +
      '<label>Ceiling height (ft)<input type="number" min="0" step="1" data-f="hgt" value="8" inputmode="decimal"></label>' +
      '<label>Walls painted?<select data-f="walls"><option value="yes" selected>Yes</option><option value="no">No</option></select></label>' +
      '<label>Ceiling painted?<select data-f="ceiling"><option value="no">No</option><option value="yes">Yes</option></select></label>' +
      '<label>Baseboard &amp; trim (LF)<input type="number" min="0" step="5" data-f="trim" inputmode="numeric"></label>' +
      '<label>Doors + casing (count)<input type="number" min="0" step="1" data-f="doors" inputmode="numeric"></label>' +
      '<label>Interior windows + casing<input type="number" min="0" step="1" data-f="windows" inputmode="numeric"></label>' +
      '<label>Closets<input type="number" min="0" step="1" data-f="closets" inputmode="numeric"></label>' +
      '<label>Accent walls<input type="number" min="0" step="1" data-f="accent" inputmode="numeric"></label>' +
      '<label>Drywall repair (hours)<input type="number" min="0" step=".5" data-f="repair" inputmode="decimal"></label>' +
      '<label>Wall color<input type="text" list="es-colors" data-f="color" placeholder="New color"></label>' +
      '<label>Existing color<input type="text" data-f="was" placeholder="Current color"></label>' +
      '<label>Sheen<select data-f="sheen">' + SHEENS.map(function (s) { return '<option' + (s === 'Eggshell' ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
      '</div>' +
      '<label class="es-wide">Notes &amp; special instructions for this area<textarea rows="2" data-f="notes" placeholder="Move bookcase, patch anchor holes, do not paint built-ins..."></textarea></label>' +
      '<div class="es-line"><span>Area subtotal</span><b data-out="room">$0</b></div></div>';
  }

  /* ---------- read state from DOM ---------- */
  function read() {
    if (!$('#es-mode')) return;   /* viewer mode: state comes from the link */
    S.mode = $('#es-mode').value;
    S.zone = $('#es-zone').value;
    S.afterhours = $('#es-after').value === 'yes';
    ['name', 'email', 'phone', 'address', 'city', 'zip'].forEach(function (k) { S.client[k] = $('#cl-' + k).value.trim(); });
    ['ptype', 'levels', 'year', 'occupied', 'hoa', 'access'].forEach(function (k) { S.prop[k] = $('#pr-' + k) ? $('#pr-' + k).value : ''; });
    ['brand', 'coats', 'sheen_body', 'sheen_trim'].forEach(function (k) { S.paint[k] = $('#pt-' + k).value; });
    S.paint.body = $('#pt-body').value.trim(); S.paint.trim = $('#pt-trim').value.trim();
    S.paint.accent = $('#pt-accent').value.trim(); S.paint.existing = $('#pt-existing').value.trim();
    S.doExt = $('#es-ext-on').checked; S.doInt = $('#es-int-on').checked;
    S.sides = $$('#es-sides .es-card').map(function (c) {
      var o = { name: $('b', c).textContent.replace(' elevation', '') };
      $$('[data-f]', c).forEach(function (f) { o[f.dataset.f] = f.value; });
      return o;
    });
    S.rooms = $$('#es-rooms .es-card').map(function (c) {
      var o = {};
      $$('[data-f]', c).forEach(function (f) { o[f.dataset.f] = f.value; });
      return o;
    });
    ['deck', 'fence', 'stucco', 'carpentry', 'lead'].forEach(function (k) { S.extras[k] = $('#ex-' + k).value; });
    S.extras.notes = $('#ex-notes').value.trim();
    ['furniture', 'cover', 'floors', 'pets', 'notes'].forEach(function (k) { S.intGlobal[k] = $('#ig-' + k).value; });
    S.adj.discount = num($('#adj-disc').value);
    S.adj.extra = num($('#adj-extra').value);
    S.adj.note = $('#adj-note').value.trim();
    S.adj.start = $('#adj-start').value.trim();
    S.adj.days = $('#adj-days').value.trim();
  }

  function sideTotal(o) {
    var sq = num(o.sqft) || (num(o.len) * num(o.hgt));
    var t = sq * R.ext_wall;
    var sc = SCRAPE.filter(function (s) { return s[0] === o.scrape; })[0];
    if (sc) t += sq * sc[2];
    if (o.wash === 'yes') t += sq * R.ext_wash;
    if (o.prime === 'spot') t += sq * R.ext_prime * 0.4;
    if (o.prime === 'full') t += sq * R.ext_prime;
    t += num(o.windows) * R.ext_window;
    if (o.trim === 'yes') t += num(o.trimlf) * R.ext_wintrim;
    t += num(o.doors) * R.ext_door + num(o.garage) * R.ext_garage + num(o.soffit) * R.ext_soffit
      + num(o.shutters) * R.ext_shutter + num(o.rail) * R.ext_rail;
    return t;
  }
  function roomTotal(o) {
    var per = (num(o.len) + num(o.wid)) * 2 * num(o.hgt);
    var t = 0;
    if (o.walls !== 'no') t += per * R.int_wall;
    if (o.ceiling === 'yes') t += num(o.len) * num(o.wid) * R.int_ceiling;
    t += num(o.trim) * R.int_trim + num(o.doors) * R.int_door + num(o.windows) * R.int_window
      + num(o.closets) * R.int_closet + num(o.accent) * R.int_accent + num(o.repair) * R.int_repair;
    return t;
  }

  function price() {
    read();
    var ext = S.doExt ? S.sides.reduce(function (a, o) { return a + sideTotal(o); }, 0) : 0;
    var int = S.doInt ? S.rooms.reduce(function (a, o) { return a + roomTotal(o); }, 0) : 0;
    var extras = 0;
    extras += num(S.extras.deck) * R.ext_deck + num(S.extras.fence) * R.ext_fence;
    extras += num(S.extras.stucco) * 65 + num(S.extras.carpentry) * 85;
    if (S.extras.lead === 'yes') extras += (ext + int) * 0.08;
    if (S.doInt) {
      extras += num(S.intGlobal.furniture) * R.int_furniture;
    }
    var base = ext + int + extras;
    if (S.paint.coats === '3') base *= 1 + R.coat2;
    if (S.mode === 'commercial') base *= R.commercial;
    if (S.afterhours) base *= R.afterhours;
    base *= ZONE[S.zone] || 1;
    base += num(S.adj.extra);
    if (base && base < R.minimum) base = R.minimum;
    var disc = base * (S.adj.discount / 100);
    var total = base - disc;
    return { ext: ext, int: int, extras: extras, base: base, disc: disc, total: total,
             deposit: total * (CFG.depositPct / 100), balance: total - total * (CFG.depositPct / 100),
             marketLow: base * 1.22, marketHigh: base * 1.48 };
  }

  function refresh() {
    var p = price();
    $$('#es-sides .es-card').forEach(function (c, i) { $('[data-out="side"]', c).textContent = money(sideTotal(S.sides[i] || {})); });
    $$('#es-rooms .es-card').forEach(function (c, i) { $('[data-out="room"]', c).textContent = money(roomTotal(S.rooms[i] || {})); });
    $('#sum-ext').textContent = money(p.ext);
    $('#sum-int').textContent = money(p.int);
    $('#sum-extras').textContent = money(p.extras);
    $('#sum-base').textContent = money(p.base);
    $('#sum-disc').textContent = '-' + money(p.disc);
    $('#sum-total').textContent = money(p.total);
    $('#sum-dep').textContent = money(p.deposit);
    $('#sum-bal').textContent = money(p.balance);
    $('#sum-market').textContent = money(p.marketLow) + ' - ' + money(p.marketHigh);
    $('#sum-save').textContent = money(p.marketHigh - p.total);
  }

  /* ---------- scope of work language ---------- */
  function scopeList() {
    var L = [];
    if (S.doExt) {
      L.push(["Protect the property", "Plants, walkways, windows, lighting, roofing and hardscape covered or masked before any work starts."]);
      if (S.sides.some(function (s) { return s.wash === 'yes'; })) L.push(["Power wash", "Wash the surfaces in scope to remove dirt, chalk, pollen and mildew, then allow full dry time before coatings."]);
      if (S.sides.some(function (s) { return s.scrape && s.scrape !== 'none'; })) L.push(["Scrape and sand", "Remove loose and failing paint back to a sound edge, then feather and sand transitions so old paint lines do not telegraph through the finish."]);
      L.push(["Fill and caulk", "Fill nail holes and open joints, replace failed caulk, and seal gaps around windows, doors, trim and penetrations with exterior-rated flexible sealant."]);
      if (S.sides.some(function (s) { return s.prime && s.prime !== 'no'; })) L.push(["Prime", "Apply the correct primer to bare, stained or problem surfaces after the substrate is dry."]);
      L.push(["Paint the exterior", "Apply " + S.paint.coats + " coats of " + (S.paint.brand || "professional") + " coatings to siding, trim, window and door casings, soffit, fascia and the items itemized in this proposal."]);
    }
    if (S.doInt) {
      L.push(["Protect the interior", "Floors, furniture, fixtures and finished surfaces covered. " + (S.intGlobal.furniture > 0 ? "Furniture moved and replaced by our crew in " + S.intGlobal.furniture + " area(s)." : "Furniture covered in place.")]);
      L.push(["Prep the surfaces", "Patch nail holes, dings and cracks, sand smooth, caulk trim joints and spot-prime repairs and stains."]);
      L.push(["Paint the interior", "Apply " + S.paint.coats + " coats to the walls, ceilings, trim, baseboard, window and door casings listed in this proposal."]);
    }
    L.push(["Clean up", "Daily cleanup during the project and a full cleanup at completion. Debris removed, hardware reinstalled, the site left ready to use."]);
    L.push(["Final walkthrough", "We walk the finished work with you, correct anything you flag on the spot, and the project is not complete until you say it is."]);
    L.push(["Warranty", CFG.warranty + " in writing, plus the manufacturer warranty on the coatings specified."]);
    return L;
  }

  /* ---------- proposal document ---------- */
  function proposalHTML(forPrint) {
    var p = price(), d = new Date();
    var num2 = 'PH-' + d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(Math.floor(Math.random() * 900) + 100);
    S.ref = S.ref || num2;
    var rows = '';
    if (S.doExt) S.sides.forEach(function (o) {
      var sq = num(o.sqft) || (num(o.len) * num(o.hgt));
      var bits = [];
      if (sq) bits.push(sq + ' sq ft of ' + (o.siding || 'siding').toLowerCase());
      if (num(o.windows)) bits.push(num(o.windows) + ' windows');
      if (o.trim === 'yes' && num(o.trimlf)) bits.push(num(o.trimlf) + ' LF window and door trim');
      if (num(o.doors)) bits.push(num(o.doors) + ' entry doors');
      if (num(o.garage)) bits.push(num(o.garage) + ' garage doors');
      if (num(o.soffit)) bits.push(num(o.soffit) + ' LF soffit and fascia');
      if (num(o.shutters)) bits.push(num(o.shutters) + ' pairs of shutters');
      if (num(o.rail)) bits.push(num(o.rail) + ' LF railing');
      var sc = SCRAPE.filter(function (s) { return s[0] === o.scrape; })[0];
      if (sc && sc[2]) bits.push(sc[1].toLowerCase() + ' scraping');
      if (o.wash === 'yes') bits.push('power washing');
      if (o.prime && o.prime !== 'no') bits.push(o.prime === 'full' ? 'full priming' : 'spot priming');
      rows += '<tr><td><strong>' + esc(o.name) + ' elevation</strong>' + (o.notes ? '<br><span class="pq-note">' + esc(o.notes) + '</span>' : '') + (o.primenote ? '<br><span class="pq-note">Primer: ' + esc(o.primenote) + '</span>' : '') + '</td><td>' + esc(bits.join(', ')) + '</td></tr>';
    });
    if (S.doInt) S.rooms.forEach(function (o) {
      var bits = [];
      if (o.walls !== 'no') bits.push('walls');
      if (o.ceiling === 'yes') bits.push('ceiling');
      if (num(o.trim)) bits.push(num(o.trim) + ' LF baseboard and trim');
      if (num(o.doors)) bits.push(num(o.doors) + ' doors with casing');
      if (num(o.windows)) bits.push(num(o.windows) + ' windows with casing');
      if (num(o.closets)) bits.push(num(o.closets) + ' closets');
      if (num(o.accent)) bits.push(num(o.accent) + ' accent walls');
      if (num(o.repair)) bits.push(num(o.repair) + ' hours of drywall repair');
      if (o.color) bits.push('color: ' + o.color);
      if (o.sheen) bits.push(o.sheen.toLowerCase() + ' sheen');
      rows += '<tr><td><strong>' + esc(o.name || 'Interior area') + '</strong><br><span class="pq-note">' + esc(o.level || '') + '</span>' + (o.notes ? '<br><span class="pq-note">' + esc(o.notes) + '</span>' : '') + '</td><td>' + esc(bits.join(', ')) + '</td></tr>';
    });
    var steps = scopeList().map(function (s, i) { return '<li><b>' + esc(s[0]) + '.</b> ' + esc(s[1]) + '</li>'; }).join('');
    var colorRows = '';
    if (S.paint.existing) colorRows += '<tr><td>Existing color</td><td>' + esc(S.paint.existing) + '</td></tr>';
    if (S.paint.body) colorRows += '<tr><td>Body / walls</td><td>' + esc(S.paint.body) + ' &middot; ' + esc(S.paint.sheen_body) + '</td></tr>';
    if (S.paint.trim) colorRows += '<tr><td>Trim</td><td>' + esc(S.paint.trim) + ' &middot; ' + esc(S.paint.sheen_trim) + '</td></tr>';
    if (S.paint.accent) colorRows += '<tr><td>Accent / doors</td><td>' + esc(S.paint.accent) + '</td></tr>';
    colorRows += '<tr><td>Product</td><td>' + esc(S.paint.brand) + ', ' + esc(S.paint.coats) + ' coats</td></tr>';

    return '' +
      '<div class="pq" id="pq-doc">' +
      '<div class="pq-top"><img src="' + CFG.logo + '" alt="' + esc(CFG.company) + '" class="pq-logo"><div class="pq-id"><b>Painting proposal</b><span>Reference ' + esc(S.ref) + '</span><span>' + d.toLocaleDateString() + '</span></div></div>' +
      '<div class="pq-party"><div><h4>Prepared for</h4><p>' + esc(S.client.name || 'Client') + '<br>' + esc(S.client.address || '') + '<br>' + esc(S.client.city || '') + ' ' + esc(S.client.zip || '') + '<br>' + esc(S.client.phone || '') + ' ' + esc(S.client.email || '') + '</p></div>' +
      '<div><h4>Prepared by</h4><p>' + esc(CFG.company) + '<br>' + esc(CFG.legal) + '<br>' + esc(CFG.phone) + '<br>' + esc(CFG.email) + '</p></div></div>' +
      '<h3>What we are going to do</h3><ol class="pq-steps">' + steps + '</ol>' +
      '<h3>Scope by area</h3><table class="pq-tbl"><tbody>' + rows + '</tbody></table>' +
      (colorRows ? '<h3>Colors and products</h3><table class="pq-tbl"><tbody>' + colorRows + '</tbody></table>' : '') +
      (S.extras.notes || S.intGlobal.notes ? '<h3>Special instructions</h3><p>' + esc([S.extras.notes, S.intGlobal.notes].filter(Boolean).join(' ')) + '</p>' : '') +
      '<h3>Your investment</h3>' +
      '<table class="pq-tbl"><tbody>' +
      '<tr><td>Typical market pricing for this scope</td><td>' + money(p.marketLow) + ' - ' + money(p.marketHigh) + '</td></tr>' +
      '<tr><td>Project total before discount</td><td>' + money(p.base) + '</td></tr>' +
      '<tr><td>' + esc(CFG.promoLabel) + '</td><td>-' + money(p.disc) + '</td></tr>' +
      '<tr class="pq-big"><td>Your price</td><td>' + money(p.total) + '</td></tr>' +
      '<tr><td>Deposit to reserve your dates</td><td>' + money(p.deposit) + '</td></tr>' +
      '<tr><td>Balance on completion and walkthrough</td><td>' + money(p.balance) + '</td></tr>' +
      '</tbody></table>' +
      (S.adj.start || S.adj.days ? '<p><strong>Schedule:</strong> ' + esc(S.adj.start ? 'start ' + S.adj.start : '') + (S.adj.days ? ', approximately ' + esc(S.adj.days) + ' working days' : '') + '.</p>' : '') +
      (S.adj.note ? '<p>' + esc(S.adj.note) + '</p>' : '') +
      '<h3>Why this crew</h3><ul class="pq-why">' +
      '<li><b>Over 20 years</b> painting Colorado property, with crews that specialize by type of work rather than doing a little of everything.</li>' +
      '<li><b>Fully insured</b>, with a certificate of insurance available for your file.</li>' +
      '<li><b>A dedicated project manager</b> so you have one person to call, not a rotating phone tree.</li>' +
      '<li><b>' + esc(CFG.warranty) + '</b> in writing, because the preparation above is real.</li>' +
      '<li><b>Paying once.</b> A repaint that fails early costs the removal of the failed coating on top of the price of doing it correctly.</li>' +
      '</ul>' +
      '<div class="pq-terms"><p>This proposal is governed by the terms and conditions published at <a href="' + CFG.terms + '">' + esc(CFG.site + CFG.terms) + '</a>, which are incorporated by reference. ' + esc(CFG.legal) + '. Pricing is valid for 30 days from the date above. Work not listed in this proposal is not included. Signing below authorizes the scope and pricing described and the collection of the deposit shown.</p></div>' +
      '<div class="pq-sign">' +
      '<div><h4>Client acceptance</h4><div class="pq-pad"><canvas id="pq-canvas" width="600" height="180" aria-label="Signature area"></canvas><button type="button" id="pq-clear" class="pq-clear">Clear</button></div>' +
      '<div class="pq-names"><label>Printed name<input type="text" id="sg-name" value="' + esc(S.client.name || '') + '"></label><label>Date<input type="text" id="sg-date" value="' + d.toLocaleDateString() + '"></label></div></div>' +
      '<div><h4>' + esc(CFG.company) + '</h4><div class="pq-repbox"><label>Representative<input type="text" id="sg-rep"></label><label>Date<input type="text" id="sg-repdate" value="' + d.toLocaleDateString() + '"></label></div>' +
      '<p class="pq-note">Deposit: ' + money(p.deposit) + ' &middot; Balance: ' + money(p.balance) + '</p></div>' +
      '</div></div>';
  }

  /* ---------- signature pad ---------- */
  function initPad() {
    var c = $('#pq-canvas'); if (!c) return;
    var ctx = c.getContext('2d'), drawing = false, last = null, dirty = false;
    function pos(e) { var r = c.getBoundingClientRect(); var t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; }
    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) { if (!drawing) return; e.preventDefault(); var p = pos(e); ctx.strokeStyle = '#0b2545'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; dirty = true; }
    function end() { drawing = false; }
    ['pointerdown', 'touchstart', 'mousedown'].forEach(function (ev) { c.addEventListener(ev, start, { passive: false }); });
    ['pointermove', 'touchmove', 'mousemove'].forEach(function (ev) { c.addEventListener(ev, move, { passive: false }); });
    ['pointerup', 'pointerleave', 'touchend', 'mouseup', 'mouseleave'].forEach(function (ev) { c.addEventListener(ev, end); });
    $('#pq-clear').addEventListener('click', function () { ctx.clearRect(0, 0, c.width, c.height); dirty = false; });
    c._signed = function () { return dirty; };
  }

  /* ---------- PDF ---------- */
  function loadJsPDF() {
    return new Promise(function (res, rej) {
      if (window.jspdf && window.jspdf.jsPDF) return res(window.jspdf.jsPDF);
      var s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = function () { res(window.jspdf.jsPDF); };
      s.onerror = function () { rej(new Error('pdf library unavailable')); };
      document.head.appendChild(s);
    });
  }
  function imgData(src) {
    return new Promise(function (res) {
      var i = new Image(); i.crossOrigin = 'anonymous';
      i.onload = function () { var c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); try { res(c.toDataURL('image/jpeg', .9)); } catch (e) { res(null); } };
      i.onerror = function () { res(null); };
      i.src = src;
    });
  }
  function buildPDF() {
    var p = price();
    return Promise.all([loadJsPDF(), imgData(CFG.logo)]).then(function (r) {
      var JsPDF = r[0], logo = r[1];
      var doc = new JsPDF({ unit: 'pt', format: 'letter' });
      var W = 612, M = 48, y = 46;
      function line(t, size, style, color, gap) {
        doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size || 10);
        doc.setTextColor.apply(doc, color || [30, 41, 59]);
        var lines = doc.splitTextToSize(t, W - M * 2);
        lines.forEach(function (ln) { if (y > 730) { doc.addPage(); y = 56; } doc.text(ln, M, y); y += (size || 10) + 3; });
        y += gap || 0;
      }
      function rule() { doc.setDrawColor(222, 230, 240); doc.line(M, y, W - M, y); y += 12; }
      if (logo) doc.addImage(logo, 'JPEG', M, y - 14, 58, 58);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(11, 61, 145);
      doc.text(CFG.company, M + (logo ? 70 : 0), y + 8);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(90, 100, 115);
      doc.text('Painting proposal  ·  Ref ' + S.ref + '  ·  ' + new Date().toLocaleDateString(), M + (logo ? 70 : 0), y + 24);
      doc.text(CFG.phone + '  ·  ' + CFG.email, M + (logo ? 70 : 0), y + 38);
      y += 64; rule();
      line('PREPARED FOR', 9, 'bold', [11, 61, 145], 2);
      line([S.client.name, S.client.address, (S.client.city || '') + ' ' + (S.client.zip || ''), S.client.phone, S.client.email].filter(Boolean).join('   ·   '), 10, 'normal', null, 8);
      line('WHAT WE ARE GOING TO DO', 10, 'bold', [11, 61, 145], 4);
      scopeList().forEach(function (s) { line('•  ' + s[0] + '. ' + s[1], 9.5); });
      y += 6; rule();
      line('SCOPE BY AREA', 10, 'bold', [11, 61, 145], 4);
      if (S.doExt) S.sides.forEach(function (o) {
        var sq = num(o.sqft) || (num(o.len) * num(o.hgt));
        var sc = SCRAPE.filter(function (s) { return s[0] === o.scrape; })[0];
        var bits = [sq ? sq + ' sq ft ' + (o.siding || '') : '', num(o.windows) ? num(o.windows) + ' windows' : '',
        (o.trim === 'yes' && num(o.trimlf)) ? num(o.trimlf) + ' LF trim' : '', num(o.doors) ? num(o.doors) + ' doors' : '',
        num(o.garage) ? num(o.garage) + ' garage doors' : '', num(o.soffit) ? num(o.soffit) + ' LF soffit/fascia' : '',
        num(o.shutters) ? num(o.shutters) + ' shutter pairs' : '', num(o.rail) ? num(o.rail) + ' LF railing' : '',
        (sc && sc[2]) ? sc[1] + ' scraping' : '', o.wash === 'yes' ? 'power wash' : '', (o.prime && o.prime !== 'no') ? o.prime + ' prime' : ''].filter(Boolean).join(', ');
        line(o.name + ' elevation: ' + bits, 9.5, 'normal');
        if (o.notes) line('    Note: ' + o.notes, 9, 'italic', [90, 100, 115]);
        if (o.primenote) line('    Primer: ' + o.primenote, 9, 'italic', [90, 100, 115]);
      });
      if (S.doInt) S.rooms.forEach(function (o) {
        var bits = [o.walls !== 'no' ? 'walls' : '', o.ceiling === 'yes' ? 'ceiling' : '', num(o.trim) ? num(o.trim) + ' LF trim' : '',
        num(o.doors) ? num(o.doors) + ' doors/casing' : '', num(o.windows) ? num(o.windows) + ' windows/casing' : '',
        num(o.closets) ? num(o.closets) + ' closets' : '', num(o.accent) ? num(o.accent) + ' accent walls' : '',
        num(o.repair) ? num(o.repair) + ' hrs repair' : '', o.color ? 'color ' + o.color : '', o.sheen ? o.sheen : ''].filter(Boolean).join(', ');
        line((o.name || 'Interior area') + (o.level ? ' (' + o.level + ')' : '') + ': ' + bits, 9.5);
        if (o.notes) line('    Note: ' + o.notes, 9, 'italic', [90, 100, 115]);
      });
      y += 6; rule();
      line('YOUR INVESTMENT', 10, 'bold', [11, 61, 145], 4);
      line('Typical market pricing for this scope:  ' + money(p.marketLow) + ' - ' + money(p.marketHigh), 9.5);
      line('Project total before discount:  ' + money(p.base), 9.5);
      line(CFG.promoLabel + ':  -' + money(p.disc), 9.5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(11, 61, 145);
      if (y > 700) { doc.addPage(); y = 56; }
      doc.text('Your price:  ' + money(p.total), M, y + 6); y += 26;
      line('Deposit to reserve your dates: ' + money(p.deposit) + '     Balance at completion: ' + money(p.balance), 9.5, 'normal', null, 6);
      if (S.adj.start || S.adj.days) line('Schedule: ' + (S.adj.start ? 'start ' + S.adj.start : '') + (S.adj.days ? ', about ' + S.adj.days + ' working days' : ''), 9.5);
      if (S.adj.note) line(S.adj.note, 9.5);
      rule();
      line('WHY THIS CREW', 10, 'bold', [11, 61, 145], 4);
      ['Over 20 years painting Colorado property, with crews that specialize by type of work.',
       'Fully insured, with a certificate of insurance available for your file.',
       'A dedicated project manager, so you have one person to call.',
       CFG.warranty + ' in writing, because the preparation above is real.',
       'Paying once: a repaint that fails early costs removal of the failed coating on top of doing it right.'].forEach(function (t) { line('•  ' + t, 9.5); });
      y += 4; rule();
      line('This proposal is governed by the terms and conditions published at ' + CFG.site + CFG.terms + ', incorporated by reference. ' + CFG.legal + '. Pricing valid 30 days. Work not listed is not included.', 8.5, 'normal', [90, 100, 115], 10);
      if (y > 620) { doc.addPage(); y = 56; }
      line('ACCEPTANCE', 10, 'bold', [11, 61, 145], 6);
      var sig = S.sig.data;
      if (sig) { try { doc.addImage(sig, 'PNG', M, y, 210, 62); } catch (e) { } }
      doc.setDrawColor(150, 160, 175);
      doc.line(M, y + 70, M + 230, y + 70); doc.line(W - M - 230, y + 70, W - M, y + 70);
      doc.setFontSize(9); doc.setTextColor(90, 100, 115);
      doc.text('Client signature', M, y + 82);
      doc.text((S.sig.client_name || '') + '   ' + (S.sig.client_date || ''), M, y + 96);
      doc.text(CFG.company + ' representative', W - M - 230, y + 82);
      doc.text((S.sig.rep_name || '') + '   ' + (S.sig.rep_date || ''), W - M - 230, y + 96);
      return doc;
    });
  }

  /* ---------- share link ---------- */
  function encodeState() {
    var payload = JSON.stringify({ S: S, v: 1 });
    return btoa(unescape(encodeURIComponent(payload)));
  }
  function decodeState(h) {
    try { var o = JSON.parse(decodeURIComponent(escape(atob(h)))); return o && o.S; } catch (e) { return null; }
  }

  /* ---------- send ---------- */
  function sendProposal(btn, msgBox) {
    read();
    var c = $('#pq-canvas');
    S.sig.client_name = $('#sg-name') ? $('#sg-name').value.trim() : '';
    S.sig.client_date = $('#sg-date') ? $('#sg-date').value.trim() : '';
    S.sig.rep_name = $('#sg-rep') ? $('#sg-rep').value.trim() : '';
    S.sig.rep_date = $('#sg-repdate') ? $('#sg-repdate').value.trim() : '';
    if (c && c._signed && c._signed()) { try { S.sig.data = c.toDataURL('image/png'); } catch (e) { } }
    if (!S.client.name || !S.client.email) { msgBox.className = 'es-msg warn'; msgBox.textContent = 'Add the client name and email so copies can be sent.'; return; }
    btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending...';
    var p = price();
    buildPDF().then(function (doc) { return doc.output('blob'); }, function () { return null; }).then(function (blob) {
      var fd = new FormData();
      fd.append('source_site', CFG.site + ' estimator proposal');
      fd.append('user_name', S.client.name);
      fd.append('user_phone', S.client.phone || '');
      fd.append('user_email', S.client.email);
      fd.append('_cc', S.client.email);
      fd.append('property_address', [S.client.address, S.client.city, S.client.zip].filter(Boolean).join(', '));
      fd.append('proposal_ref', S.ref || '');
      fd.append('project_type', S.mode + (S.doExt ? ' exterior' : '') + (S.doInt ? ' interior' : ''));
      fd.append('price_before_discount', money(p.base));
      fd.append('discount', money(p.disc));
      fd.append('price_total', money(p.total));
      fd.append('deposit', money(p.deposit));
      fd.append('schedule', (S.adj.start || '') + ' ' + (S.adj.days || ''));
      fd.append('signed', S.sig.data ? 'YES, signed on page by ' + S.sig.client_name : 'Not signed yet');
      fd.append('scope_summary', S.sides.map(function (o) { return o.name + ': ' + (num(o.sqft) || num(o.len) * num(o.hgt)) + ' sq ft'; }).join(' | ') + ' || ' + S.rooms.map(function (o) { return (o.name || 'area'); }).join(' | '));
      fd.append('notes', [S.extras.notes, S.intGlobal.notes, S.adj.note].filter(Boolean).join(' / '));
      fd.append('proposal_link', location.origin + '/proposal/#' + encodeState());
      if (blob) fd.append('proposal_pdf', new File([blob], 'proposal-' + (S.ref || 'ph') + '.pdf', { type: 'application/pdf' }));
      fd.append('pdf_attached', blob ? 'yes' : 'no, use the proposal link');
      var api = API();
      return (api && api.send) ? api.send(fd, 'PROPOSAL ' + (S.sig.data ? 'SIGNED' : 'sent') + ' ' + (S.ref || '') + ': ' + S.client.name) : Promise.resolve('fail');
    }).then(function (state) {
      btn.disabled = false; btn.textContent = label;
      if (state === 'ok') { msgBox.className = 'es-msg ok'; msgBox.innerHTML = 'Sent. A copy went to the office and to ' + esc(S.client.email) + '. If the PDF could not be built on this device, the email still carries the full proposal and a link to it.'; }
      else if (state === 'fast' || state === 'blocked') { msgBox.className = 'es-msg warn'; msgBox.textContent = 'Give it one more second and press send again.'; }
      else { msgBox.className = 'es-msg warn'; msgBox.innerHTML = 'Could not confirm delivery. Download the PDF and send it manually, or call ' + esc(CFG.phone) + '.'; }
    }).catch(function () {
      btn.disabled = false; btn.textContent = label;
      msgBox.className = 'es-msg warn'; msgBox.textContent = 'Something blocked the PDF build. Use Download PDF, or try again.';
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    var host = $('#estimator'); if (!host) return;
    host.innerHTML = TOOL_HTML();
    SIDES.slice(0, 4).forEach(function (n, i) { $('#es-sides').appendChild(el(sideRow(i, n))); });
    $('#es-rooms').appendChild(el(roomRow(0)));
    bind();
    refresh();
  }

  function TOOL_HTML() {
    var colorOpts = COLORS.map(function (c) { return '<option value="' + c + '">'; }).join('');
    return '' +
      '<datalist id="es-colors">' + colorOpts + '</datalist>' +
      '<div class="es-bar"><div class="es-seg"><label class="es-lab">Project type</label>' +
      '<select id="es-mode"><option value="residential">Residential</option><option value="commercial">Commercial</option></select></div>' +
      '<div class="es-seg"><label class="es-lab">Region</label><select id="es-zone"><option value="metro">Denver metro</option><option value="north">North / Boulder County</option><option value="plains">Eastern plains</option><option value="mountain">Foothills / mountains</option></select></div>' +
      '<div class="es-seg"><label class="es-lab">After hours / phased</label><select id="es-after"><option value="no">No</option><option value="yes">Yes</option></select></div>' +
      '<div class="es-seg es-toggles"><label><input type="checkbox" id="es-ext-on" checked> Exterior</label><label><input type="checkbox" id="es-int-on"> Interior</label></div></div>' +

      '<section class="es-block"><h2>1. Client and property</h2><div class="es-grid">' +
      '<label>Client name<input type="text" id="cl-name" autocomplete="name"></label>' +
      '<label>Phone<input type="tel" id="cl-phone" inputmode="tel"></label>' +
      '<label>Email<input type="email" id="cl-email" inputmode="email"></label>' +
      '<label>Property address<input type="text" id="cl-address"></label>' +
      '<label>City<input type="text" id="cl-city"></label>' +
      '<label>ZIP<input type="text" id="cl-zip" inputmode="numeric"></label>' +
      '<label class="es-res">Property type<select id="pr-ptype"><option>Single story house / ranch</option><option>Two story house</option><option>Tri-level / split level</option><option>Bi-level</option><option>Walkout / three story rear</option><option>Townhouse</option><option>Condo</option><option>Apartment</option><option>Duplex</option><option>Mobile / manufactured</option><option>Cabin / log home</option></select></label>' +
      '<label class="es-res">Which levels are in scope<select id="pr-levels"><option>Whole house</option><option>Main level only</option><option>Upper level only</option><option>Basement only</option><option>Main and upper</option><option>Single unit</option></select></label>' +
      '<label class="es-com" hidden>Commercial property type<select id="pr-ctype"><option>Office / suite</option><option>Retail</option><option>Restaurant</option><option>Warehouse / industrial</option><option>Medical</option><option>HOA / multi-unit</option><option>School / institutional</option></select></label>' +
      '<label>Year built<input type="text" id="pr-year" inputmode="numeric" placeholder="Pre-1978 changes the prep"></label>' +
      '<label>Occupied during work<select id="pr-occupied"><option>Yes, occupied</option><option>Vacant</option><option>Business open during work</option></select></label>' +
      '<label>HOA approval needed<select id="pr-hoa"><option>No</option><option>Yes, palette approved</option><option>Yes, submission needed</option></select></label>' +
      '<label>Access notes<input type="text" id="pr-access" placeholder="Gate code, dogs, parking, lift needed"></label>' +
      '</div></section>' +

      '<section class="es-block"><h2>2. Colors and products</h2><div class="es-grid">' +
      '<label>Existing color<input type="text" id="pt-existing" list="es-colors" placeholder="What is on it now"></label>' +
      '<label>Body / wall color<input type="text" id="pt-body" list="es-colors"></label>' +
      '<label>Trim color<input type="text" id="pt-trim" list="es-colors"></label>' +
      '<label>Accent / door color<input type="text" id="pt-accent" list="es-colors"></label>' +
      '<label>Brand<select id="pt-brand"><option>Sherwin-Williams</option><option>PPG</option><option>Behr</option><option>Customer supplied</option></select></label>' +
      '<label>Coats<select id="pt-coats"><option>1</option><option selected>2</option><option>3</option></select></label>' +
      '<label>Body / wall sheen<select id="pt-sheen_body">' + SHEENS.map(function (s) { return '<option' + (s === 'Satin' ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
      '<label>Trim sheen<select id="pt-sheen_trim">' + SHEENS.map(function (s) { return '<option' + (s === 'Semi-gloss' ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
      '</div></section>' +

      '<section class="es-block" id="es-ext-block"><h2>3. Exterior, elevation by elevation</h2>' +
      '<p class="es-help">Walk the building. One card per side, each with its own notes so nothing gets lost between the driveway and the office.</p>' +
      '<div id="es-sides"></div>' +
      '<div class="es-addrow"><button type="button" class="es-add" data-add-side="North">+ North</button><button type="button" class="es-add" data-add-side="South">+ South</button><button type="button" class="es-add" data-add-side="East">+ East</button><button type="button" class="es-add" data-add-side="West">+ West</button><button type="button" class="es-add" data-add-side="Detached garage">+ Detached garage</button><button type="button" class="es-add" data-add-side="Other">+ Other area</button></div>' +
      '<h3>Exterior extras</h3><div class="es-grid">' +
      '<label>Deck surface (sq ft)<input type="number" min="0" step="10" id="ex-deck" inputmode="numeric"></label>' +
      '<label>Fence (LF)<input type="number" min="0" step="5" id="ex-fence" inputmode="numeric"></label>' +
      '<label>Stucco patching (hours)<input type="number" min="0" step=".5" id="ex-stucco" inputmode="decimal"></label>' +
      '<label>Carpentry / wood replacement (hours)<input type="number" min="0" step=".5" id="ex-carpentry" inputmode="decimal"></label>' +
      '<label>Lead-safe practices (pre-1978)<select id="ex-lead"><option value="no">Not required</option><option value="yes">Required</option></select></label>' +
      '</div><label class="es-wide">Exterior notes and exclusions<textarea id="ex-notes" rows="2" placeholder="Gutters not included, customer replacing shutters, roof work by others..."></textarea></label>' +
      '</section>' +

      '<section class="es-block" id="es-int-block" hidden><h2>4. Interior, area by area</h2>' +
      '<p class="es-help">One card per room or zone. Add as many as you need while you walk the house.</p>' +
      '<div id="es-rooms"></div>' +
      '<div class="es-addrow"><button type="button" class="es-add" id="es-addroom">+ Add another area</button></div>' +
      '<h3>Interior handling</h3><div class="es-grid">' +
      '<label>Areas where we move furniture<input type="number" min="0" step="1" id="ig-furniture" inputmode="numeric"></label>' +
      '<label>Furniture covered in place<select id="ig-cover"><option>Yes</option><option>No, customer clearing</option></select></label>' +
      '<label>Floor protection<select id="ig-floors"><option>Drop cloths and masking</option><option>Ram board / heavy protection</option><option>None needed, vacant</option></select></label>' +
      '<label>Pets or children on site<select id="ig-pets"><option>No</option><option>Yes, plan access</option></select></label>' +
      '</div><label class="es-wide">Interior notes and special instructions<textarea id="ig-notes" rows="2" placeholder="Do not paint built-ins, nursery first, low-VOC only, keys with neighbor..."></textarea></label>' +
      '</section>' +

      '<section class="es-block"><h2>5. Price, schedule and discount</h2><div class="es-grid">' +
      '<label>Discount applied (%)<input type="number" min="0" max="60" step="1" id="adj-disc" value="' + CFG.promoPct + '"></label>' +
      '<label>Manual adjustment ($)<input type="number" step="25" id="adj-extra" value="0"></label>' +
      '<label>Proposed start<input type="text" id="adj-start" placeholder="Wednesday the 15th"></label>' +
      '<label>Working days<input type="text" id="adj-days" placeholder="4"></label>' +
      '</div><label class="es-wide">Note shown on the proposal<textarea id="adj-note" rows="2" placeholder="Includes two colors on trim. Deck quoted separately."></textarea></label>' +
      '<div class="es-sum">' +
      '<div class="es-line"><span>Exterior</span><b id="sum-ext">$0</b></div>' +
      '<div class="es-line"><span>Interior</span><b id="sum-int">$0</b></div>' +
      '<div class="es-line"><span>Extras and handling</span><b id="sum-extras">$0</b></div>' +
      '<div class="es-line"><span>Total before discount</span><b id="sum-base">$0</b></div>' +
      '<div class="es-line"><span>Discount</span><b id="sum-disc">$0</b></div>' +
      '<div class="es-line big"><span>Client price</span><b id="sum-total">$0</b></div>' +
      '<div class="es-line"><span>Deposit (' + CFG.depositPct + '%)</span><b id="sum-dep">$0</b></div>' +
      '<div class="es-line"><span>Balance at completion</span><b id="sum-bal">$0</b></div>' +
      '<div class="es-line ctx"><span>Typical market pricing for this scope</span><b id="sum-market">$0</b></div>' +
      '<div class="es-line ctx"><span>Difference at the top of that range</span><b id="sum-save">$0</b></div>' +
      '</div>' +
      '<div class="es-actions"><button type="button" class="es-btn primary" id="es-build">Build the proposal</button>' +
      '<button type="button" class="es-btn" id="es-reset">Start over</button></div>' +
      '</section>' +

      '<section class="es-block" id="es-out" hidden><h2>6. Proposal</h2><div id="es-proposal"></div>' +
      '<div class="es-actions"><button type="button" class="es-btn primary" id="es-send">Email signed copies</button>' +
      '<button type="button" class="es-btn" id="es-pdf">Download PDF</button>' +
      '<button type="button" class="es-btn" id="es-print">Print</button>' +
      '<button type="button" class="es-btn" id="es-link">Copy client link</button></div>' +
      '<div class="es-msg" id="es-msg" role="status" aria-live="polite"></div></section>';
  }

  function bind() {
    document.addEventListener('input', function (e) { if (e.target.closest('#estimator')) refresh(); });
    document.addEventListener('change', function (e) {
      if (!e.target.closest('#estimator')) return;
      if (e.target.id === 'es-ext-on') $('#es-ext-block').hidden = !e.target.checked;
      if (e.target.id === 'es-int-on') $('#es-int-block').hidden = !e.target.checked;
      if (e.target.id === 'es-mode') {
        var com = e.target.value === 'commercial';
        $$('.es-res').forEach(function (n) { n.hidden = com; });
        $$('.es-com').forEach(function (n) { n.hidden = !com; });
      }
      refresh();
    });
    document.addEventListener('click', function (e) {
      var add = e.target.closest('[data-add-side]');
      if (add) { var i = $$('#es-sides .es-card').length; $('#es-sides').appendChild(el(sideRow(i, add.dataset.addSide))); refresh(); return; }
      if (e.target.id === 'es-addroom') { var n = $$('#es-rooms .es-card').length; $('#es-rooms').appendChild(el(roomRow(n))); refresh(); return; }
      var del = e.target.closest('[data-del]'); if (del) { del.closest('.es-card').remove(); refresh(); return; }
      var dr = e.target.closest('[data-delroom]'); if (dr) { dr.closest('.es-card').remove(); refresh(); return; }
      if (e.target.id === 'es-build') {
        read();
        $('#es-proposal').innerHTML = proposalHTML();
        $('#es-out').hidden = false;
        initPad();
        $('#es-out').scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (e.target.id === 'es-reset') { if (confirm('Clear this estimate and start over?')) location.reload(); return; }
      if (e.target.id === 'es-send') { sendProposal(e.target, $('#es-msg')); return; }
      if (e.target.id === 'es-pdf') {
        read();
        var c = $('#pq-canvas');
        S.sig.client_name = $('#sg-name') ? $('#sg-name').value : '';
        S.sig.client_date = $('#sg-date') ? $('#sg-date').value : '';
        S.sig.rep_name = $('#sg-rep') ? $('#sg-rep').value : '';
        S.sig.rep_date = $('#sg-repdate') ? $('#sg-repdate').value : '';
        if (c && c._signed && c._signed()) { try { S.sig.data = c.toDataURL('image/png'); } catch (x) { } }
        buildPDF().then(function (doc) { doc.save('proposal-' + (S.ref || 'painterhotline') + '.pdf'); })
          .catch(function () {
            var m = $('#es-msg'); m.className = 'es-msg warn';
            m.innerHTML = 'The PDF builder needs a connection. Opening the print dialog instead: choose "Save as PDF" as the destination.';
            setTimeout(function () { window.print(); }, 600);
          });
        return;
      }
      if (e.target.id === 'es-print') { window.print(); return; }
      if (e.target.id === 'es-link') {
        read();
        var url = location.origin + '/proposal/#' + encodeState();
        try { if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () { }); } catch (x) { }
        $('#es-msg').className = 'es-msg ok';
        $('#es-msg').innerHTML = 'Client link copied. <a href="' + url + '" target="_blank" rel="noopener">Open it</a>';
        return;
      }
    });
  }

  /* ---------- proposal viewer page ---------- */
  function viewer() {
    var host = $('#proposal-view'); if (!host) return;
    var h = location.hash.replace(/^#/, '');
    if (!h) { host.innerHTML = '<p class="es-help">This page shows a proposal prepared for you. Open the link your estimator sent, or call <a href="tel:' + CFG.tel + '">' + CFG.phone + '</a>.</p>'; return; }
    var got = decodeState(h);
    if (!got) { host.innerHTML = '<p class="es-help">That proposal link could not be read. Ask for a fresh link, or call <a href="tel:' + CFG.tel + '">' + CFG.phone + '</a>.</p>'; return; }
    Object.keys(got).forEach(function (k) { S[k] = got[k]; });
    host.innerHTML = proposalHTML();
    initPad();
    host.appendChild(el('<div class="es-actions"><button type="button" class="es-btn primary" id="es-send">Approve and send signed copies</button><button type="button" class="es-btn" id="es-pdf">Download PDF</button><button type="button" class="es-btn" id="es-print">Print</button></div><div class="es-msg" id="es-msg" role="status" aria-live="polite"></div>'));
    bind();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); viewer(); });
  else { boot(); viewer(); }
})();
