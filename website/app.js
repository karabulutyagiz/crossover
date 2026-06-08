// Shared behaviour for every page.

// 1) Scroll reveal
const io = new IntersectionObserver((es) => {
  es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

// 2) Hero phone parallax tilt (only on pages that have it)
const hp = document.getElementById('heroPhone');
if (hp) {
  const stage = hp.closest('.stage');
  stage.addEventListener('mousemove', (ev) => {
    const r = stage.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width - 0.5;
    const y = (ev.clientY - r.top) / r.height - 0.5;
    hp.style.animation = 'none';
    hp.style.transform = `rotateY(${-16 + x * 22}deg) rotateX(${6 - y * 18}deg) translateY(${y * -10}px)`;
  });
  stage.addEventListener('mouseleave', () => { hp.style.animation = ''; hp.style.transform = ''; });
}

// 3) Club logo marquee (real api-sports logos, duplicated for a seamless loop)
const track = document.getElementById('track');
if (track) {
  const set = [194, 505, 645, 541, 49, 81, 529, 157, 40, 548, 9595, 84, 33, 42, 489, 496];
  const make = () => set.map((id) => `<img src="https://media.api-sports.io/football/teams/${id}.png" alt="" loading="lazy">`).join('');
  track.innerHTML = make() + make();
}

// 4) Mobile menu toggle
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.getElementById('navLinks');
if (menuBtn && navLinks) {
  menuBtn.addEventListener('click', () => navLinks.classList.toggle('open'));
  navLinks.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => navLinks.classList.remove('open')));
}

// 5) Highlight the active nav link by path
const path = location.pathname.replace(/index\.html$/, '');
document.querySelectorAll('.nav-links a').forEach((a) => {
  const href = a.getAttribute('href');
  if (href && href !== '/' && path.startsWith(href)) a.classList.add('active');
});
