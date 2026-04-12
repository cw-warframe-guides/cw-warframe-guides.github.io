(function () {
  var CACHE_KEY_RESURGENCE = 'wf_resurgence';
  var CDN_BASE             = 'https://cdn.warframestat.us/img/';
  var VAULT_TRADER_URL     = 'https://api.warframestat.us/pc/vaultTrader/';

  var WEAPON_EXCLUSIONS = { 'Sagek Prime': true, 'Galariak Prime': true, 'Akbronco Prime': true };

  // Per-frame hardcoded additions for items WFCD can't match by date
  // (null introduced date, Arch-Gun category not fetched, or WFCD date mismatch)
  var FRAME_EXTRA_WEAPONS = {
    'Frost Prime':   [{ name: 'Latron Prime',         wiki: 'https://wiki.warframe.com/w/Latron_Prime' },
                      { name: 'Reaper Prime',          wiki: 'https://wiki.warframe.com/w/Reaper_Prime' }],
    'Loki Prime':    [{ name: 'Wyrm Prime',            wiki: 'https://wiki.warframe.com/w/Wyrm_Prime' }],
    'Garuda Prime':  [{ name: 'Corvas Prime',          wiki: 'https://wiki.warframe.com/w/Corvas_Prime' }],
    'Hildryn Prime': [{ name: 'Larkspur Prime',        wiki: 'https://wiki.warframe.com/w/Larkspur_Prime' }],
    'Trinity Prime': [{ name: 'Kavasa Prime Collar',  wiki: 'https://wiki.warframe.com/w/Kavasa_Prime_Collar' }],
    'Xaku Prime':    [{ name: 'Quassus Prime',         wiki: 'https://wiki.warframe.com/w/Quassus_Prime' }]
  };

  // ── Wiki URL helpers ────────────────────────────────────────────────────────
  function frameWikiUrl(name) {
    var base = name.replace(/ Prime$/, '').replace(/\s+/g, '_');
    return 'https://wiki.warframe.com/w/' + base + '/Prime';
  }

  function weaponWikiUrl(name) {
    return 'https://wiki.warframe.com/w/' + name.split(' ').map(encodeURIComponent).join('_');
  }

  // ── WFCD field accessor ─────────────────────────────────────────────────────
  function introDate(item) {
    return (item.introduced && item.introduced.date) || '';
  }

  // ── Weapon list for a frame ─────────────────────────────────────────────────
  function buildWeaponList(frame, weapons) {
    var date = introDate(frame);
    var list = [];
    if (date) {
      weapons.forEach(function (w) {
        if (introDate(w) === date && !WEAPON_EXCLUSIONS[w.name]) {
          list.push({ name: w.name, wiki: weaponWikiUrl(w.name) });
        }
      });
    }
    var extras = FRAME_EXTRA_WEAPONS[frame.name] || [];
    extras.forEach(function (e) { list.push(e); });
    return list;
  }

  // ── Fetch vaultTrader and extract frame names + expiry ──────────────────────
  // Filters inventory to warframe suits only (uniqueName contains /Powersuits/
  // but not /Packages/, which are the bundle packs).
  function fetchVaultTrader(cb) {
    fetch(VAULT_TRADER_URL)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var frames = data.inventory
          .filter(function (item) {
            return item.uniqueName.indexOf('/Powersuits/') !== -1 &&
                   item.uniqueName.indexOf('/Packages/')   === -1;
          })
          .map(function (item) { return item.item; });

        cb(null, { frames: frames, expiry: data.expiry });
      })
      .catch(function (e) { cb(e, null); });
  }

  // ── Entry point ─────────────────────────────────────────────────────────────
  function init() {
    var el = document.getElementById('resurgence-frames');
    if (!el) return;

    // ── Check resurgence cache ──────────────────────────────────────────────
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(CACHE_KEY_RESURGENCE)); } catch (e) {}

    if (cached && new Date() < new Date(cached.expiry)) {
      scheduleExpiryNotice(el, cached.expiry);
      renderWithItems(el, cached.frames, cached.expiry);
      return;
    }

    // ── Fetch fresh from vaultTrader API ────────────────────────────────────
    fetchVaultTrader(function (err, result) {
      if (err || !result) {
        el.textContent = 'Could not load resurgence data. Please try again later.';
        return;
      }

      if (new Date() >= new Date(result.expiry)) {
        showRotationEndedNotice(el);
        return;
      }

      try {
        localStorage.setItem(CACHE_KEY_RESURGENCE, JSON.stringify(result));
      } catch (e) {}

      scheduleExpiryNotice(el, result.expiry);
      renderWithItems(el, result.frames, result.expiry);
    });
  }

  // ── Cross-reference frame names against WFCD items ──────────────────────────
  function renderWithItems(el, frameNames, expiry) {
    window.WFItems.load(function (err, data) {
      if (err || !data) {
        el.textContent = 'Could not load prime data. Please try again later.';
        return;
      }

      var lookup = {};
      data.frames.forEach(function (f) { lookup[f.name] = f; });

      var matched = frameNames
        .map(function (name) {
          var frame = lookup[name];
          if (!frame) return null;
          return {
            name:    frame.name,
            image:   CDN_BASE + (frame.imageName || ''),
            wiki:    frameWikiUrl(frame.name),
            weapons: buildWeaponList(frame, data.weapons)
          };
        })
        .filter(Boolean);

      render(el, matched, expiry);
    });
  }

  // ── Set a timer to swap in the rotation-ended notice at expiry ───────────────
  function scheduleExpiryNotice(el, expiry) {
    var msLeft = new Date(expiry) - Date.now();
    if (msLeft <= 0) return;
    setTimeout(function () {
      try { localStorage.removeItem(CACHE_KEY_RESURGENCE); } catch (e) {}
      el.innerHTML = '';
      showRotationEndedNotice(el);
    }, msLeft);
  }

  // ── Rotation-ended notice with a refresh button and 10s cooldown ─────────────
  function showRotationEndedNotice(el) {
    var notice = document.createElement('div');
    notice.className = 'resurgence-updating';

    var msg = document.createElement('p');
    msg.textContent = 'This Resurgence rotation has ended — new data is on its way from DE. Check back in a few hours.';
    notice.appendChild(msg);

    var btn = document.createElement('button');
    btn.className = 'resurgence-refresh-btn';
    btn.textContent = 'Check for updated data';

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Checking\u2026';

      fetchVaultTrader(function (err, result) {
        if (!err && result && new Date() < new Date(result.expiry)) {
          // New rotation is live — cache and render
          try {
            localStorage.setItem(CACHE_KEY_RESURGENCE, JSON.stringify(result));
          } catch (e) {}
          el.innerHTML = '';
          scheduleExpiryNotice(el, result.expiry);
          renderWithItems(el, result.frames, result.expiry);
          return;
        }

        // Still expired — 10s cooldown before allowing another try
        var secs = 10;
        btn.textContent = 'Try again in ' + secs + 's';
        var interval = setInterval(function () {
          secs--;
          if (secs <= 0) {
            clearInterval(interval);
            btn.disabled = false;
            btn.textContent = 'Check for updated data';
          } else {
            btn.textContent = 'Try again in ' + secs + 's';
          }
        }, 1000);
      });
    });

    notice.appendChild(btn);
    el.appendChild(notice);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function daysRemaining(expiresStr) {
    var diff = new Date(expiresStr) - new Date();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function formatDate(expiresStr) {
    return new Date(expiresStr).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  function formatTime(expiresStr) {
    return new Date(expiresStr).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    });
  }

  // ── Card renderer ───────────────────────────────────────────────────────────
  function render(el, primes, expires) {
    var wrap = document.createElement('div');
    wrap.className = 'resurgence-wrap';

    // ── Expiry line ─────────────────────────────────
    var days   = daysRemaining(expires);
    var expiry = document.createElement('p');
    expiry.className = 'resurgence-expiry';

    if (days > 0) {
      expiry.innerHTML =
        'Available until <span class="resurgence-expiry__date">' + formatDate(expires) + '</span>' +
        ' at <span class="resurgence-expiry__time">' + formatTime(expires) + '</span>' +
        ' \u2013 <span class="resurgence-expiry__days">' + days + ' day' + (days === 1 ? '' : 's') + ' remaining</span>';
    } else {
      expiry.innerHTML = '<span class="resurgence-expiry__days">This Resurgence has ended.</span>';
    }
    wrap.appendChild(expiry);

    // ── Card grid ───────────────────────────────────
    var grid = document.createElement('div');
    grid.className = 'prime-grid';

    primes.forEach(function (p) {
      var cardWrap = document.createElement('div');
      cardWrap.className = 'prime-card-wrap';

      var card = document.createElement('div');
      card.className = 'prime-card';

      // Front
      var front = document.createElement('div');
      front.className = 'prime-card__front';

      var dogEar = document.createElement('span');
      dogEar.className = 'prime-card__dog-ear';
      dogEar.setAttribute('aria-hidden', 'true');
      front.appendChild(dogEar);

      var imgWrap = document.createElement('div');
      imgWrap.className = 'prime-card__img-wrap';

      var img = document.createElement('img');
      img.className = 'prime-card__img';
      img.src = p.image;
      img.alt = p.name;
      imgWrap.appendChild(img);

      var badge = document.createElement('span');
      badge.className = 'prime-card__badge prime-card__badge--resurgence';
      badge.textContent = 'Resurgence';
      imgWrap.appendChild(badge);

      var frontName = document.createElement('div');
      frontName.className = 'prime-card__name';
      frontName.textContent = p.name;

      front.appendChild(imgWrap);
      front.appendChild(frontName);

      // Back
      var back = document.createElement('div');
      back.className = 'prime-card__back';

      var nameWrap = document.createElement('div');
      nameWrap.className = 'prime-card__back-name-wrap';

      var backName = document.createElement('a');
      backName.href = p.wiki;
      backName.target = '_blank';
      backName.rel = 'noopener';
      backName.className = 'prime-card__back-name';
      backName.textContent = p.name;
      backName.addEventListener('click', function (e) { e.stopPropagation(); });
      nameWrap.appendChild(backName);
      back.appendChild(nameWrap);

      var sep = document.createElement('div');
      sep.className = 'prime-card__back-sep';
      back.appendChild(sep);

      var weaponList = document.createElement('ul');
      weaponList.className = 'prime-card__weapon-list';
      p.weapons.forEach(function (w) {
        var li = document.createElement('li');
        var a  = document.createElement('a');
        a.href = w.wiki;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'prime-card__weapon-link';
        a.textContent = w.name;
        a.addEventListener('click', function (e) { e.stopPropagation(); });
        li.appendChild(a);
        weaponList.appendChild(li);
      });
      back.appendChild(weaponList);

      // Assemble
      card.appendChild(front);
      card.appendChild(back);

      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        card.classList.toggle('is-flipped');
      });

      cardWrap.appendChild(card);
      grid.appendChild(cardWrap);
    });

    // Center 2 tiles in the 4-column grid with invisible spacers
    if (primes.length === 2) {
      var spacerBefore = document.createElement('div');
      spacerBefore.className = 'resurgence-spacer';
      grid.insertBefore(spacerBefore, grid.firstChild);
      var spacerAfter = document.createElement('div');
      spacerAfter.className = 'resurgence-spacer';
      grid.appendChild(spacerAfter);
    }

    wrap.appendChild(grid);
    el.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
