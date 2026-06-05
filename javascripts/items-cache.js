/* Shared WFCD items cache — loaded before prime-list.js and resurgence.js.
   Exposes window.WFItems.load(cb) with an in-flight queue so only one set
   of network requests ever runs at a time, even on a cold parallel load. */
(function () {
  var CACHE_KEY = 'wf_items_v2';
  var CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  var WFCD_BASE = 'https://raw.githubusercontent.com/WFCD/warframe-items/master/data/json/';

  var _callbacks = null; // null = idle, array = fetch in progress

  function load(cb) {
    // ── Cache hit ──────────────────────────────────────────────────────────────
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) {}
    if (cached && (Date.now() - cached.fetched) < CACHE_TTL) {
      return cb(null, cached);
    }

    // ── Already fetching — queue this callback ─────────────────────────────────
    if (_callbacks) {
      _callbacks.push(cb);
      return;
    }

    // ── Start fetch ────────────────────────────────────────────────────────────
    _callbacks = [cb];

    var cats    = ['Warframes', 'Primary', 'Secondary', 'Melee', 'Archwing', 'Sentinels'];
    var results = new Array(cats.length);
    var left    = cats.length;
    var errored = false;

    cats.forEach(function (cat, i) {
      fetch(WFCD_BASE + cat + '.json')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          results[i] = data;
          if (--left === 0) finish();
        })
        .catch(function (e) {
          if (!errored) {
            errored = true;
            var cbs = _callbacks;
            _callbacks = null;
            cbs.forEach(function (fn) { fn(e, null); });
          }
        });
    });

    function finish() {
      // Store only the three fields each script actually uses — keeps
      // localStorage lean instead of dumping full WFCD objects.
      var frames = results[0]
        .filter(function (f) { return f.isPrime; })
        .map(function (f) {
          return { name: f.name, imageName: f.imageName, introduced: f.introduced };
        });

      var weapons = [];
      results.slice(1).forEach(function (arr) {
        arr.forEach(function (w) {
          if (w.name && w.name.endsWith(' Prime')) {
            weapons.push({ name: w.name, introduced: w.introduced });
          }
        });
      });

      var payload = { frames: frames, weapons: weapons, fetched: Date.now() };
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch (e) {}

      var cbs = _callbacks;
      _callbacks = null;
      cbs.forEach(function (fn) { fn(null, payload); });
    }
  }

  window.WFItems = { load: load };
})();
