/**
 * Phase 7 polish:
 *  - First-visit intro loader (runs once per session, skippable, reduced-motion
 *    aware) that wipes away to reveal the hero.
 *  - A branded GSAP wipe layered on Astro View Transitions for page-to-page
 *    navigation (skipped under reduced-motion — the View Transition still runs).
 */
import { gsap } from 'gsap';

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* -------------------------------------------------------------- Intro loader */
function runIntro() {
  const intro = document.getElementById('intro');
  if (!intro) return;

  // Only on the very first visit of the session. sessionStorage can throw in
  // locked-down browsers — treat that as "seen" so nobody gets trapped.
  let seen = true;
  try {
    seen = !!sessionStorage.getItem('introSeen');
    if (!seen) sessionStorage.setItem('introSeen', '1');
  } catch { /* storage unavailable → skip the intro */ }
  if (seen || reduced()) {
    intro.remove();
    return;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(failsafe);
    intro.removeEventListener('click', finish);
    document.removeEventListener('keydown', onKey);
    try {
      gsap.to(intro, {
        yPercent: -100,
        duration: 0.9,
        ease: 'expo.inOut',
        onComplete: () => intro.remove(),
      });
    } catch {
      intro.remove();
    }
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish();
  };

  // The splash must never be able to trap the visitor: bind the dismiss
  // handlers FIRST, and hard-stop it after 3.5s whatever the animation does.
  intro.addEventListener('click', finish);
  document.addEventListener('keydown', onKey);
  const failsafe = setTimeout(finish, 3500);

  try {
    const label = intro.querySelector('.intro__label');
    gsap
      .timeline()
      .fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'expo.out' })
      .to(intro.querySelector('.intro__bar'), { scaleX: 1, duration: 0.9, ease: 'power2.inOut' }, 0.1)
      .add(finish, '+=0.35');
  } catch {
    finish();
  }
}

/* ---------------------------------------------------- Page navigation wipe */
function getWipe() {
  let wipe = document.getElementById('page-wipe');
  if (!wipe) {
    wipe = document.createElement('div');
    wipe.id = 'page-wipe';
    wipe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wipe);
  }
  return wipe;
}

function setupNavWipe() {
  document.addEventListener('astro:after-swap', () => {
    if (reduced()) return;
    const wipe = getWipe();
    gsap.set(wipe, { yPercent: 0, opacity: 1 });
    gsap.to(wipe, {
      yPercent: -100,
      duration: 0.7,
      ease: 'expo.inOut',
      onComplete: () => gsap.set(wipe, { opacity: 0, yPercent: 100 }),
    });
  });
}

// Intro runs on first paint; wipe listener registered once.
document.addEventListener('astro:page-load', runIntro);
setupNavWipe();
