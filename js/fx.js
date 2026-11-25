/* Game feel: small, self-cleaning visual and haptic effects for the game loop
   (XP pops, combo banners, confetti, shakes, count-ups). Every effect is
   best-effort: it never throws, and it does nothing in environments without a
   real DOM (the Node tests) or when the learner prefers reduced motion. Game
   rules live in js/game.js; this file only decorates what APP already shows. */

const FX = (() => {
  const CONFETTI_COLORS = ['#5bd5b0', '#ffb74d', '#7986cb', '#ef5350', '#ffd54f', '#4fc3f7'];

  function hasDom() {
    return typeof document !== 'undefined'
      && typeof document.createElement === 'function'
      && document.body && typeof document.body.appendChild === 'function';
  }

  function reducedMotion() {
    try {
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function safe(fn) {
    return (...args) => {
      try {
        return fn(...args);
      } catch (_) {
        return undefined;
      }
    };
  }

  function layer() {
    let el = document.getElementById('fx-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fx-layer';
      el.className = 'fx-layer';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    return el;
  }

  function removeLater(el, ms) {
    setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, ms);
  }

  /* Short vibration on phones that support it. Patterns stay under 120 ms. */
  const haptic = safe(pattern => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern);
  });

  /* Restart a one-shot CSS animation class on an element. */
  const bump = safe((el, className, ms = 700) => {
    if (!el || !el.classList || reducedMotion()) return;
    el.classList.remove(className);
    void el.offsetWidth; // force a reflow so the animation restarts
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), ms);
  });

  /* Text that rises from an element and fades, such as "+40 XP". */
  const floatText = safe((anchor, text, variant = 'xp') => {
    if (!hasDom() || !anchor || typeof anchor.getBoundingClientRect !== 'function') return;
    const rect = anchor.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = `fx-float fx-float-${variant}`;
    el.textContent = text;
    el.style.left = `${Math.round(rect.left + rect.width / 2)}px`;
    el.style.top = `${Math.round(rect.top + Math.min(rect.height / 2, 28))}px`;
    if (reducedMotion()) el.classList.add('is-static');
    layer().appendChild(el);
    removeLater(el, 1300);
  });

  /* A short headline that pops in the middle of the screen. */
  const banner = safe((text, variant = 'combo') => {
    if (!hasDom()) return;
    // One banner at a time: a newer headline replaces the one on screen.
    const host = layer();
    host.querySelectorAll('.fx-banner').forEach(existing => existing.remove());
    const el = document.createElement('div');
    el.className = `fx-banner fx-banner-${variant}`;
    el.textContent = text;
    if (reducedMotion()) el.classList.add('is-static');
    host.appendChild(el);
    removeLater(el, 1500);
  });

  /* A burst of confetti from a point (defaults to the top centre). */
  const confetti = safe(({ count = 36, x = null, y = null } = {}) => {
    if (!hasDom() || reducedMotion()) return;
    const host = layer();
    const width = window.innerWidth || 360;
    const originX = x ?? width / 2;
    const originY = y ?? (window.innerHeight || 640) * 0.3;
    const total = Math.min(80, Math.max(6, count | 0));
    for (let i = 0; i < total; i++) {
      const piece = document.createElement('span');
      piece.className = 'fx-confetti';
      const angle = (Math.PI * 2 * i) / total + Math.random() * 0.5;
      const distance = 90 + Math.random() * 160;
      piece.style.left = `${originX}px`;
      piece.style.top = `${originY}px`;
      piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      piece.style.setProperty('--dx', `${Math.round(Math.cos(angle) * distance)}px`);
      piece.style.setProperty('--dy', `${Math.round(Math.sin(angle) * distance - 60)}px`);
      piece.style.setProperty('--spin', `${Math.round(Math.random() * 720 - 360)}deg`);
      piece.style.animationDelay = `${Math.round(Math.random() * 80)}ms`;
      host.appendChild(piece);
      removeLater(piece, 1500);
    }
  });

  /* Count an element's number up from 0 to a value. */
  const countUp = safe((el, to, { prefix = '', suffix = '', duration = 900 } = {}) => {
    if (!el) return;
    const target = Math.max(0, Math.round(Number(to) || 0));
    const finish = () => { el.textContent = `${prefix}${target}${suffix}`; };
    if (!hasDom() || reducedMotion() || target === 0 || typeof requestAnimationFrame !== 'function') return finish();
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
      else finish();
    };
    el.textContent = `${prefix}0${suffix}`;
    requestAnimationFrame(step);
  });

  /* Confetti from the centre of an element. */
  const burstFrom = safe((anchor, count = 24) => {
    if (!anchor || typeof anchor.getBoundingClientRect !== 'function') return confetti({ count });
    const rect = anchor.getBoundingClientRect();
    confetti({ count, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  });

  return { haptic, bump, floatText, banner, confetti, burstFrom, countUp, reducedMotion };
})();
