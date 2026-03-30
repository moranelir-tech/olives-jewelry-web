document.addEventListener('DOMContentLoaded', function () {
  const btn = document.querySelector('.nav-toggle');
  const nav = document.getElementById('main-nav');
  if (!btn || !nav) return;

  btn.addEventListener('click', function () {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    if (nav.hasAttribute('hidden')) {
      nav.removeAttribute('hidden');
    } else {
      nav.setAttribute('hidden', '');
    }
  });

  document.addEventListener('click', function (e) {
    if (!nav.contains(e.target) && !btn.contains(e.target)) {
      nav.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
});