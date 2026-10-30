/* Offline support for /estimator/ only. Pages and the price book: network first, cached copy when offline.
   Code, styles, logo and the PDF library: cache first (the version below changes on every release). */
var V = "phest-v2.0.0";
var CORE = ["./", "app.js?v=2.0.0", "engine.js?v=2.0.0", "proposal.js?v=2.0.0", "estimator.css?v=2.0.0", "prices.json", "logo.png", "logo-pdf.jpg", "vendor/pdf-lib.min.js", "manifest.webmanifest"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("phest-") === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method !== "GET") return;
  var u = new URL(r.url);
  var mine = u.origin === location.origin && u.pathname.indexOf("/estimator/") === 0;
  var priceBook = /\/estimator\/prices\.json$/.test(u.pathname);
  if (!mine && !priceBook) return;
  var networkFirst = r.mode === "navigate" || priceBook;
  if (networkFirst) {
    e.respondWith(fetch(r).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(r, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || (r.mode === "navigate" ? caches.match("./") : Response.error()); });
    }));
    return;
  }
  e.respondWith(caches.match(r).then(function (m) {
    return m || fetch(r).then(function (res) { if (res && res.ok) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(r, copy); }); } return res; });
  }));
});
