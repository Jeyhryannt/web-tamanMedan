// Navbar scroll
window.addEventListener('scroll', () => {
  document.querySelector('.navbar')?.classList.toggle('scrolled', window.scrollY > 40);
});

// Mobile nav toggle
function toggleNav() {
  document.getElementById('navMobile')?.classList.toggle('open');
}

// Scroll reveal
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.opacity = '1';
      e.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.tcard,.tlist-item,.kat-card,.fitur-card,.astat').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity .4s ease, transform .4s ease';
  revealObserver.observe(el);
});

// Auto-submit sort/view selects
document.querySelector('.sort-group')?.addEventListener('click', e => {
  if (e.target.tagName === 'A') return;
});
