/* CrossOver Football — the site's only script.
   Small on purpose: nothing here renders content, so the page is complete
   before this file runs (and complete for a crawler that never runs it). */
(function () {
  'use strict';

  var reduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- scroll reveal ---------------------------------------------------
     IntersectionObserver, never a scroll listener: no reflow per frame. */
  var targets = document.querySelectorAll('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    for (var i = 0; i < targets.length; i++) targets[i].classList.add('now');
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    );
    targets.forEach(function (el) {
      // Anything already on screen at load is shown outright, with no
      // transition: animating the hero headline in would make the browser
      // record LCP at the end of the fade instead of at first paint.
      var top = el.getBoundingClientRect().top;
      if (top < window.innerHeight * 0.95) el.classList.add('now');
      else io.observe(el);
    });
  }

  /* ---- mobile menu ----------------------------------------------------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('menu');
  if (burger && menu) {
    var setOpen = function (open) {
      document.body.classList.toggle('menu-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    burger.addEventListener('click', function () {
      setOpen(!document.body.classList.contains('menu-open'));
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
        setOpen(false);
        burger.focus();
      }
    });
  }

  /* ---- sticky download dock -------------------------------------------
     Appears once the hero call-to-action has scrolled away, so the offer is
     never more than a thumb away without covering it twice. */
  var dock = document.getElementById('dock');
  if (dock && 'IntersectionObserver' in window) {
    var anchor = document.querySelector('.hero .btn-row, .hero-grid .btn-row');
    if (anchor) {
      new IntersectionObserver(
        function (entries) {
          dock.classList.toggle('is-on', !entries[0].isIntersecting);
        },
        { threshold: 0 }
      ).observe(anchor);
    } else {
      dock.classList.add('is-on');
    }
  }

  /* ---- conversion events ----------------------------------------------
     Fires into whatever analytics the site has (gtag or a dataLayer) and
     stays silent when there is none. No third-party script is loaded here,
     and each element reports once. */
  function track(name, detail) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, detail);
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(Object.assign({ event: name }, detail));
    }
  }

  document.addEventListener(
    'click',
    function (e) {
      var el = e.target.closest('[data-ev]');
      if (!el || el.dataset.evSent) return;
      el.dataset.evSent = '1';
      track(el.dataset.ev, {
        link_url: el.getAttribute('href') || '',
        page_path: location.pathname,
      });
      var href = el.getAttribute('href') || '';
      var storeHost = href.match(/^https:\/\/(apps\.apple\.com|play\.google\.com)\//);
      if (storeHost) {
        track('outbound_store_click', {
          page_path: location.pathname,
          store: storeHost[1] === 'apps.apple.com' ? 'apple' : 'google',
          placement: el.dataset.ev,
          language: document.documentElement.lang,
        });
      }
    },
    { passive: true }
  );

  /* Scroll depth, reported once per threshold. */
  var marks = [25, 50, 75, 100];
  var sent = {};
  var ticking = false;
  function depth() {
    ticking = false;
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    if (max <= 0) return;
    var pct = Math.round(((h.scrollTop || window.pageYOffset) / max) * 100);
    for (var i = 0; i < marks.length; i++) {
      if (pct >= marks[i] && !sent[marks[i]]) {
        sent[marks[i]] = 1;
        track('scroll_depth', { percent: marks[i], page_path: location.pathname });
      }
    }
  }
  window.addEventListener(
    'scroll',
    function () {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(depth);
      }
    },
    { passive: true }
  );
})();
