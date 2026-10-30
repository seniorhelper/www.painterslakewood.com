/* Painter Hotline field estimator: pricing engine (v2).
   Pure functions, no DOM. Every rate comes from prices.json (Price Book v1.0); nothing is priced here.
   Works in the browser (window.PHEngine) and in Node (require) for the test suite.

   Item model (prices.json "items"): price[base, signature] = sell price per unit,
   hrs = productive labor hours per unit, mat[base, signature] = material cost per unit.
   Labor share of a price = (hrs x loaded rate) / (hrs x loaded rate + material cost), as in the pricing model. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PHEngine = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var TIERS = ["good", "better", "best"];
  var MAX_DIM = 1000, MAX_AREA = 100000, MAX_COUNT = 2000, MAX_LF = 20000, MAX_HRS = 2000;

  function c2(n) { return Math.round(n * 100) / 100; }

  /* Clean a numeric input: blanks, text, NaN, Infinity and negatives become 0; values over the cap are clamped and reported. */
  function num(v, cap, warn, label) {
    var n = typeof v === "number" ? v : parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-eE]/g, ""));
    if (!isFinite(n) || n <= 0) {
      if (isFinite(n) && n < 0 && warn) warn.push(label + " was negative and was treated as 0.");
      return 0;
    }
    if (cap && n > cap) { if (warn) warn.push(label + " was capped at " + cap.toLocaleString("en-US") + "."); return cap; }
    return n;
  }
  function pick(map, key, fallbackKey) {
    if (map && Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    return map ? map[fallbackKey] : undefined;
  }
  function mul(a, b) { return { lab: a.lab * b.lab, mat: a.mat * b.mat, hrs: a.hrs * b.hrs, mc: a.mc * b.mc }; }
  var ONE = { lab: 1, mat: 1, hrs: 1, mc: 1 };
  function laborMod(f) { return { lab: f, mat: 1, hrs: f, mc: 1 }; }

  /* Interior room geometry, in sq ft / LF. */
  function roomGeometry(a, P, warn, nm) {
    warn = warn || []; nm = nm || "Room";
    var g = P.geometry, out = {};
    var doors = num(a.doors, MAX_COUNT, warn, nm + " door openings");
    var windows = num(a.windows, MAX_COUNT, warn, nm + " window openings");
    if (a.mode === "sqft") {
      out.wall = num(a.wallSqft, MAX_AREA, warn, nm + " wall sq ft");
      out.ceiling = num(a.ceilSqft, MAX_AREA, warn, nm + " ceiling sq ft");
      out.base = num(a.trimLF, MAX_LF, warn, nm + " baseboard LF");
      out.height = num(a.H, MAX_DIM, warn, nm + " height");
    } else {
      var L = num(a.L, MAX_DIM, warn, nm + " length"), W = num(a.W, MAX_DIM, warn, nm + " width"), H = num(a.H, MAX_DIM, warn, nm + " height");
      var perim = 2 * (L + W);
      out.wall = Math.max(0, perim * H - doors * g.doorOpeningSqft - windows * g.windowOpeningSqft);
      out.ceiling = L * W;
      var ov = num(a.trimLF, MAX_LF, warn, nm + " baseboard LF");
      out.base = ov > 0 ? ov : Math.max(0, perim - doors * g.doorWidthFt);
      out.height = H;
      if ((L > 0 || W > 0) && H === 0) warn.push(nm + ": add a wall height so the walls can be priced.");
    }
    out.doors = doors; out.windows = windows;
    return out;
  }

  /* Unpriced line list for one area: {key, qty, mod, scopeNote}. Tier pricing happens in compute(). */
  function areaLines(a, P, warn, est) {
    var I = P.items, C = P.conditions, lines = [], nm = a.name || a.type;
    function add(key, qty, mod, note) {
      if (!I[key]) { warn.push("Price book has no item '" + key + "'."); return; }
      if (!(qty > 0)) return;
      lines.push({ key: key, qty: c2(qty), mod: mod || ONE, scopeNote: note || "" });
    }
    var prep = laborMod(pick(C.prep, a.prep || "standard", "standard") || 1);
    var t = a.type;
    var N = function (f, cap, label) { return num(a[f], cap, warn, nm + " " + label); };

    if (t === "room") {
      var occ = laborMod(pick(C.furniture, a.furniture || "light", "light") || 1);
      var base = mul(prep, occ);
      if (a.mode === "flat") {
        var fk = a.flatKey && I[a.flatKey] ? a.flatKey : null;
        var fq = num(a.flatQty === "" || a.flatQty == null ? 1 : a.flatQty, MAX_COUNT, warn, nm + " count");
        if (fk) add(fk, fq, base);
        if (a.colorChange && fk) add("int_color_change", fq * (I[fk].wallSqft || 0), base, "extra coat");
      } else {
        var geo = roomGeometry(a, P, warn, nm);
        var reachF = 1;
        var high = a.highCeiling === true || geo.height > P.geometry.highCeilingFt;
        if (high) reachF = Math.max(reachF, C.highWalls);
        if (a.stairwell) reachF = Math.max(reachF, C.stairwell);
        var reach = mul(base, laborMod(reachF));
        var inc = a.include || {};
        var on = function (k) { return inc[k] !== false; };
        if (on("walls")) add("int_walls", geo.wall, reach);
        if (on("ceiling")) add(high || a.stairwell ? "int_ceiling_high" : "int_ceiling", geo.ceiling, base);
        if (on("baseboard")) add("int_baseboard", geo.base, base);
        if (a.colorChange && on("walls")) add("int_color_change", geo.wall, reach, "dark to light");
      }
      add("int_door_flat", N("doorsFlat", MAX_COUNT, "flat doors"), base);
      add("int_door_panel", N("doorsPanel", MAX_COUNT, "panel doors"), base);
      add("int_door_frame", N("doorFrames", MAX_COUNT, "door frames"), base);
      add("int_door_french", N("doorsFrench", MAX_COUNT, "French door sides"), base);
      add("int_window", N("windowTrim", MAX_COUNT, "windows"), base);
      add("int_casing_lf", N("casingLF", MAX_LF, "casing LF"), base);
      add("int_crown", N("crownLF", MAX_LF, "crown LF"), base);
      add("int_chair_rail", N("chairLF", MAX_LF, "chair rail LF"), base);
      add("int_closet", N("closets", MAX_COUNT, "closets"), base);
      add("int_closet_walkin", N("walkins", MAX_COUNT, "walk-in closets"), base);
      add("int_accent", N("accentWalls", MAX_COUNT, "accent walls"), base);
      add("int_stain_block", N("primeSqft", MAX_AREA, "primer sq ft"), base);
      add("drywall_small", N("repairSmall", MAX_COUNT, "small patches"));
      add("drywall_medium", N("repairMedium", MAX_COUNT, "medium patches"));
      add("drywall_large", N("repairLarge", MAX_COUNT, "large patches"));
      add("texture_match", N("textureMatch", MAX_COUNT, "texture matches"));
      add("wallpaper_removal", N("wallpaperSqft", MAX_AREA, "wallpaper sq ft"));
      add("skim_coat", N("skimSqft", MAX_AREA, "skim coat sq ft"));
      add("popcorn_paint", N("popcornPaintSqft", MAX_AREA, "popcorn paint sq ft"), base);
      var pop = N("popcornSqft", MAX_AREA, "popcorn removal sq ft");
      add("popcorn_removal", pop);
      if (pop > P.rules.asbestosTriggerSqft) {
        var yb = num(est && est.customer && est.customer.yearBuilt, 3000);
        if (!yb || yb < P.rules.asbestosExemptYear) warn.push(nm + ": popcorn removal over " + P.rules.asbestosTriggerSqft + " sq ft. Colorado requires an asbestos inspection by a state-certified inspector before it is disturbed (CDPHE). Removal only after a negative test.");
      }
      if (a.furnitureMove) add("furniture_move", 1);
    } else if (t === "cabinets") {
      var cc = a.colorChange ? { lab: C.colorChangeOther.labor, mat: C.colorChangeOther.mat, hrs: C.colorChangeOther.labor, mc: C.colorChangeOther.mat } : ONE;
      var mcab = mul(prep, cc);
      add("cab_door", N("doors", MAX_COUNT, "cabinet doors"), mcab);
      add("cab_drawer", N("drawers", MAX_COUNT, "drawer fronts"), mcab);
      add("cab_box_lf", N("boxLF", MAX_LF, "box LF"), mcab);
      add("cab_island", N("islands", MAX_COUNT, "islands"), mcab);
      add("cab_interior", N("interiorBoxes", MAX_COUNT, "interior boxes"), mcab);
      add("cab_hardware_install", N("hardwareInstall", MAX_COUNT, "hardware pieces"));
      add("cab_hardware_fill", N("hardwareFill", MAX_COUNT, "holes to fill"));
      add("cab_clear_refinish", N("clearPieces", MAX_COUNT, "clear-coat pieces"), prep);
    } else if (t === "exterior") {
      var sid = pick(P.siding, a.siding || "lap_wood", "lap_wood");
      var ccx = a.colorChange ? { lab: C.colorChangeOther.labor, mat: C.colorChangeOther.mat, hrs: C.colorChangeOther.labor, mc: C.colorChangeOther.mat } : ONE;
      var mx = mul(prep, ccx);
      var maxStory = "1";
      (Array.isArray(a.sides) ? a.sides : []).forEach(function (s, k) {
        var sn = nm + " side " + (s.label || k + 1);
        var stories = String(Math.min(3, Math.max(1, Math.round(num(s.stories, 3, warn, sn + " stories") || 1))));
        if (+stories > +maxStory) maxStory = stories;
        var sq = num(s.sqft, MAX_AREA, warn, sn + " sq ft");
        if (!(sq > 0)) sq = num(s.length, MAX_DIM, warn, sn + " length") * +stories * P.geometry.storyHeightFt + num(s.gableSqft, MAX_AREA, warn, sn + " gable sq ft");
        var h = C.stories[stories];
        add(sid.item, sq, mul(mx, { lab: h.price, mat: h.price, hrs: h.hrs, mc: 1 }), (s.label || "Side " + (k + 1)) + ", " + stories + "-story, " + sid.label);
      });
      var hm = C.stories[maxStory];
      var tall = mul(mx, { lab: hm.price, mat: hm.price, hrs: hm.hrs, mc: 1 });
      add("ext_fascia", N("fasciaLF", MAX_LF, "fascia LF"), tall);
      add("ext_soffit", N("soffitLF", MAX_LF, "soffit LF"), tall);
      add("ext_gutter", N("gutterLF", MAX_LF, "gutter LF"), tall);
      add("ext_window", N("windows", MAX_COUNT, "windows"), tall);
      add("ext_door", N("entryDoors", MAX_COUNT, "entry doors"), mx);
      add("ext_garage_1", N("garageSingle", MAX_COUNT, "1-car garage doors"), mx);
      add("ext_garage_2", N("garageDouble", MAX_COUNT, "2-car garage doors"), mx);
      add("ext_shutters", N("shutters", MAX_COUNT, "shutter pairs"), mx);
      add("ext_caulk", N("caulkLF", MAX_LF, "caulk LF"), tall);
      add("carpentry_hr", N("carpentryHrs", MAX_HRS, "carpentry hours"));
    } else if (t === "deck") {
      add("deck_floor", N("floorSqft", MAX_AREA, "deck sq ft"), prep);
      add("deck_railing", N("railingLF", MAX_LF, "railing LF"), prep);
      add("deck_stairs", N("stairs", MAX_COUNT, "steps"), prep);
    } else if (t === "fence") {
      var lf = N("lengthLF", MAX_LF, "fence LF");
      var sides = String(a.fenceSides) === "2" ? 2 : 1;
      var fkey = a.fenceStyle === "picket" ? "fence_picket" : "fence_privacy";
      add(fkey, lf * sides, prep, lf + " LF, " + (sides === 2 ? "both sides" : "one side"));
    }
    return lines;
  }

  function promoActive(P, est, today) {
    var pr = P.promo;
    if (!pr || !est.project || !est.project.promo) return false;
    var now = today ? new Date(today) : new Date();
    return now.getTime() <= new Date(pr.endsISO + "T23:59:59-07:00").getTime();
  }

  /* Split small drywall patches into "first" and "each additional" across the whole job. */
  function splitPatches(base) {
    var out = [], first = false;
    base.forEach(function (b) {
      if (b.key !== "drywall_small") { out.push(b); return; }
      var n = b.qty;
      if (!first) { first = true; out.push(Object.assign({}, b, { key: "drywall_small_first", qty: 1 })); n -= 1; }
      if (n > 0) out.push(Object.assign({}, b, { key: "drywall_small_add", qty: c2(n) }));
    });
    return out;
  }

  /* Price one estimate. opts.today (ISO date) pins the promo date for tests. */
  function compute(est, P, opts) {
    opts = opts || {};
    var warn = [];
    est = est || {};
    var areas = Array.isArray(est.areas) ? est.areas : [];
    var proj = est.project || {};
    var I = P.items, LPH = P.costModel.loadedLaborPerHour;
    var base = [], interiorAreas = 0, hasExterior = false;
    areas.forEach(function (a) {
      if (!a || a.enabled === false) return;
      var ls = areaLines(a, P, warn, est);
      if (ls.length) {
        if (a.type === "room" || a.type === "cabinets") interiorAreas++;
        if (a.type === "exterior" || a.type === "deck" || a.type === "fence") hasExterior = true;
      }
      ls.forEach(function (l) { l.areaId = a.id; l.areaName = a.name || a.type; l.areaType = a.type; });
      base = base.concat(ls);
    });
    base = splitPatches(base);

    var promoOn = promoActive(P, est, opts.today);
    if (proj.promo && !promoOn && P.promo) warn.push("The promo ended " + P.promo.endsISO + " and was not applied.");
    var zone = pick(P.zones, proj.zone || "metro", "metro") || {};
    var courtesy = num(proj.courtesy, 1e7, warn, "Courtesy discount");
    var cm = P.costModel;

    var chosen = [];
    var ad = proj.addons || {};
    (P.addons || []).forEach(function (def) {
      var v = ad[def.id];
      if (!v) return;
      var qty = def.unit === "flat" ? 1 : num(v === true ? 0 : v, MAX_AREA, warn, def.label);
      if (!(qty > 0)) { if (def.unit !== "flat") warn.push(def.label + ": enter a quantity."); return; }
      chosen.push({ def: def, qty: qty });
    });

    function unit(item, idx, mod, extraLabor) {
      var price = item.price[Math.min(idx, item.price.length - 1)];
      var mc = item.mat[Math.min(idx, item.mat.length - 1)] || 0;
      var lc = item.hrs * LPH;
      var share = lc + mc > 0 ? lc / (lc + mc) : 1;
      var lab = price * share * mod.lab * (1 + extraLabor);
      var mat = price * (1 - share) * mod.mat;
      var hrs = item.hrs * mod.hrs * (1 + extraLabor);
      return { lab: lab, mat: mat, hrs: hrs, mc: mc * mod.mc };
    }

    var results = {};
    TIERS.forEach(function (tk) {
      var T = P.tiers[tk], idx = T.priceIndex, xl = T.extraLabor || 0;
      var lines = [], laborBase = 0, matBase = 0, hours = 0, matCost = 0, areaTotals = {};
      base.forEach(function (b) {
        var it = I[b.key], u = unit(it, idx, b.mod, it.noTierExtra ? 0 : xl);
        var lab = c2(b.qty * u.lab), mat = c2(b.qty * u.mat);
        laborBase += lab; matBase += mat; hours += b.qty * u.hrs; matCost += b.qty * u.mc;
        areaTotals[b.areaId] = c2((areaTotals[b.areaId] || 0) + lab + mat);
        lines.push({ areaId: b.areaId, areaName: b.areaName, key: b.key, label: it.label, unit: it.unit, qty: b.qty, labor: lab, mat: mat, total: c2(lab + mat), scopeNote: b.scopeNote || "" });
      });
      laborBase = c2(laborBase); matBase = c2(matBase);
      var workBefore = laborBase + matBase;
      var addonLabor = 0, addonMat = 0, addonLines = [];
      chosen.forEach(function (c) {
        var it = I[c.def.item], u = unit(it, 0, ONE, 0);
        var credited = c.def.creditOverJob && workBefore > c.def.creditOverJob;
        var lab = credited ? 0 : c2(c.qty * u.lab), mat = credited ? 0 : c2(c.qty * u.mat);
        addonLabor += lab; addonMat += mat; hours += c.qty * u.hrs; matCost += c.qty * u.mc;
        addonLines.push({ id: c.def.id, label: c.def.label, qty: c.qty, unit: c.def.unit, total: c2(lab + mat), credited: !!credited });
      });
      addonLabor = c2(addonLabor); addonMat = c2(addonMat);
      var discountableLabor = c2(laborBase + addonLabor);

      /* Lead-safe RRP: per interior work area, plus a share of exterior labor with a minimum. */
      var lead = 0;
      if (proj.leadSafe) {
        var L = P.leadSafe, li = I[L.interiorItem];
        if (interiorAreas > 0) {
          var lu = unit(li, 0, ONE, 0);
          lead += interiorAreas * (lu.lab + lu.mat); hours += interiorAreas * lu.hrs; matCost += interiorAreas * lu.mc;
        }
        var extLabor = 0;
        lines.forEach(function (l) { if (I[l.key].ext) extLabor += l.labor; });
        if (extLabor > 0) { var el = Math.max(L.exteriorMin, extLabor * L.exteriorPctLabor); lead += el; hours += el / P.costModel.laborBillingRate; }
        lead = c2(lead);
      }
      var rush = proj.rush ? c2(discountableLabor * P.surcharges.rushPctLabor) : 0;
      var afterHours = proj.afterHours ? c2(discountableLabor * P.surcharges.afterHoursPctLabor) : 0;
      /* Rush / after-hours are premium pay, not extra hours: part of the surcharge is cost. */
      var premiumCost = (rush + afterHours) * P.surcharges.premiumCostShare;

      var work = c2(laborBase + matBase + addonLabor + addonMat + lead + rush + afterHours);
      var crewDays = hours > 0 ? Math.ceil(hours / P.costModel.crewHoursPerDay) : 0;
      var travel = 0;
      if (work > 0) travel = c2(work * (zone.pctJob || 0) + discountableLabor * (zone.pctLabor || 0) + crewDays * (zone.perCrewDay || 0));
      var travelCost = travel * P.surcharges.travelCostShare;

      var original = c2(work + travel);
      var empty = !(laborBase + matBase + addonLabor + addonMat > 0);
      var promoDiscount = promoOn && !empty ? c2(discountableLabor * P.promo.pctLabor) : 0;
      var courtesyUsed = Math.min(courtesy, Math.max(0, original - promoDiscount));
      var afterAll = c2(original - promoDiscount - courtesyUsed);
      var regularRaw = c2(original - courtesyUsed);
      var minimum = hasExterior ? P.minimums.exterior : P.minimums.interior;
      var total = empty ? 0 : Math.round(Math.max(minimum, afterAll));
      var regular = empty ? 0 : Math.round(Math.max(minimum, regularRaw));
      var minimumApplied = !empty && afterAll < minimum;
      var laborCost = hours * LPH + premiumCost + travelCost;
      var cost = c2(laborCost + matCost);
      var margin = total > 0 ? (total - cost) / total : 0;
      var floorPrice = cost > 0 ? Math.ceil(cost / (1 - cm.floorMargin)) : 0;
      var targetPrice = cost > 0 ? Math.ceil(cost / (1 - cm.targetMargin)) : 0;
      var guard = empty ? "empty" : (total < floorPrice ? "below-floor" : (margin < cm.targetMargin - 1e-9 ? "below-target" : "ok"));
      var sched = [], left = total;
      (P.payments || []).forEach(function (p, i, arr) {
        var amt = i === arr.length - 1 ? left : Math.round(total * p.pct);
        left -= amt;
        sched.push({ label: p.label, pct: p.pct, amount: amt });
      });
      var savings = Math.max(0, regular - total);
      results[tk] = {
        tier: tk, label: T.label, name: T.name, products: T.products, summary: T.summary,
        lines: lines, addonLines: addonLines, areaTotals: areaTotals,
        laborBase: laborBase, matBase: matBase, addonLabor: addonLabor, addonMat: addonMat, discountableLabor: discountableLabor,
        lead: lead, rush: rush, afterHours: afterHours, travel: travel, crewDays: crewDays, hours: c2(hours),
        original: original, promoDiscount: promoDiscount, courtesy: c2(courtesyUsed),
        regular: regular, total: total, savings: savings, savingsPct: regular > 0 ? savings / regular : 0,
        minimum: minimum, minimumApplied: minimumApplied, empty: empty,
        schedule: sched, deposit: sched.length ? sched[0].amount : total,
        cost: { labor: c2(laborCost), mat: c2(matCost), total: cost }, margin: margin,
        floorPrice: floorPrice, targetPrice: targetPrice, guard: guard
      };
    });
    var uniq = [];
    warn.forEach(function (w) { if (uniq.indexOf(w) < 0) uniq.push(w); });
    return { tiers: results, promoOn: promoOn, leadOn: !!proj.leadSafe, zone: zone, warnings: uniq, lineCount: base.length, interiorAreas: interiorAreas, hasExterior: hasExterior };
  }

  /* Plain-English scope line for the proposal. */
  function scopeText(line) {
    var q = line.qty, u = line.unit;
    var qty = /^(each|room|door|side|window|pair|step|piece|box|drawer|stairwell|hour|area)$/.test(u) ? (q + " x ") : (Math.round(q).toLocaleString("en-US") + " " + u + " ");
    return qty + line.label + (line.scopeNote ? " (" + line.scopeNote + ")" : "");
  }

  return { compute: compute, areaLines: areaLines, roomGeometry: roomGeometry, num: num, scopeText: scopeText, TIERS: TIERS,
    LIMITS: { MAX_DIM: MAX_DIM, MAX_AREA: MAX_AREA, MAX_COUNT: MAX_COUNT, MAX_LF: MAX_LF, MAX_HRS: MAX_HRS } };
});
