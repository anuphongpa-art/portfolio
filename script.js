// Scroll progress bar + back to top visibility
const progressBar = document.getElementById('scroll-progress');
const backToTop = document.getElementById('back-to-top');
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY;
  const total = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) progressBar.style.width = (scrolled / total * 100) + '%';
  if (backToTop) backToTop.classList.toggle('visible', scrolled > 400);
}, { passive: true });

// Section peek toggle
function togglePeek(btn) {
  const peek = btn.previousElementSibling;
  const isOpen = peek.classList.contains('open');
  if (isOpen) {
    peek.style.maxHeight = '';
    peek.classList.remove('open');
    btn.classList.remove('open');
    btn.innerHTML = 'Show all <span class="arr">↓</span>';
    peek.closest('.sec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    peek.style.maxHeight = peek.scrollHeight + 'px';
    peek.classList.add('open');
    btn.classList.add('open');
    btn.innerHTML = 'Show less <span class="arr">↑</span>';
  }
}

// Scroll reveal
const io = new IntersectionObserver(es => {
  es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
}, { threshold: 0.06 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));

// Hamburger menu
const hamburger = document.getElementById('hamburger');
const drawer = document.getElementById('drawer');
if (hamburger && drawer) {
  hamburger.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
  });
  // Close drawer on link click
  drawer.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      drawer.classList.remove('open');
      hamburger.classList.remove('open');
    });
  });
}

// Copy email helper
function copyEmail(btn) {
  navigator.clipboard.writeText('anuphong3502@gmail.com').then(() => {
    const hint = btn.querySelector('.clink-copy-hint');
    hint.textContent = 'Copied!';
    hint.classList.add('copied');
    setTimeout(() => {
      hint.textContent = 'Copy';
      hint.classList.remove('copied');
    }, 2000);
  });
}
