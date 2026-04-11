(function () {
  function init() {
    var el = document.getElementById('recent-primes');
    if (!el) return;

    fetch('/data/primes.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var sorted = data
          .slice()
          .sort(function (a, b) { return b.added.localeCompare(a.added); })
          .slice(0, 7);
        render(el, sorted);
      });
  }

  function render(el, primes) {
    var ul = document.createElement('ul');
    ul.className = 'prime-list';

    primes.forEach(function (p) {
      var li = document.createElement('li');
      li.className = 'prime-list__item';

      var nameLink = document.createElement('a');
      nameLink.href = p.wiki;
      nameLink.className = 'prime-list__name';
      nameLink.textContent = p.name;
      nameLink.target = '_blank';
      nameLink.rel = 'noopener';

      var weapons = document.createElement('span');
      weapons.className = 'prime-list__weapons';
      weapons.textContent = p.weapons.map(function (w) { return w.name; }).join(' · ');

      li.appendChild(nameLink);
      li.appendChild(weapons);
      ul.appendChild(li);
    });

    el.appendChild(ul);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
