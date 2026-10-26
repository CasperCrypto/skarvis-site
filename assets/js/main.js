// SKARVIS site behaviour: header state, mobile menu, scroll reveals, lazy 3D
// scenes and the pilot-list form. No framework, no build step.
// Does NOT track visitors: no cookies, no analytics, no third-party pixels.

import { CONFIG } from './config.js';
import { STRINGS } from './strings.js';

const lang = document.documentElement.lang === 'en' ? 'en' : 'pl';
const T = STRINGS[lang];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

initHeader();
initMenu();
initReveal();
initHero();
initNode();
initForm();
initContact();

function initHeader() {
  const hdr = document.querySelector('[data-hdr]');
  const sentinel = document.querySelector('[data-hero-sentinel]');
  if (!hdr || !sentinel || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => {
    hdr.classList.toggle('is-scrolled', !e.isIntersecting);
  }).observe(sentinel);
}

function initMenu() {
  const btn = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (!btn || !menu) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      set(false);
      btn.focus();
    }
  });
  window.matchMedia('(min-width: 1024px)').addEventListener('change', (m) => { if (m.matches) set(false); });
}

function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  els.forEach((el) => io.observe(el));
}

function initHero() {
  const hero = document.querySelector('[data-hero]');
  if (!hero) return;
  import('./hero.js')
    .then((m) => m.initHero(hero, { reduceMotion, T: T.hero }))
    .catch((err) => {
      console.warn('Hero scene unavailable:', err);
      hero.classList.add('no-gl');
    });
}

function initNode() {
  const root = document.querySelector('[data-node]');
  if (!root) return;
  const stage = root.querySelector('[data-node-stage]');
  const start = () => import('./node3d.js')
    .then((m) => m.initNode(root, { reduceMotion, T: T.node }))
    .catch((err) => {
      console.warn('3D model unavailable:', err);
      stage.classList.add('no-gl');
    });
  if (!('IntersectionObserver' in window)) { start(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      io.disconnect();
      start();
    }
  }, { rootMargin: '700px 0px' });
  io.observe(stage);
}

/* ---------------- pilot-list form ---------------- */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function initForm() {
  const form = document.querySelector('[data-pilot-form]');
  if (!form) return;
  const body = document.querySelector('[data-form-body]');
  const msg = form.querySelector('[data-form-msg]');
  const submit = form.querySelector('[data-submit]');
  const el = form.elements;

  const rules = [
    { el: el.name, err: 'e-name', ok: () => el.name.value.trim().length >= 2, text: T.form.errName },
    { el: el.organization, err: 'e-org', ok: () => el.organization.value.trim().length >= 2, text: T.form.errOrg },
    { el: el.email, err: 'e-email', ok: () => EMAIL_RE.test(el.email.value.trim()), text: T.form.errEmail },
    { el: el.site_type, err: 'e-type', ok: () => el.site_type.value !== '', text: T.form.errType },
    { el: el.consent, err: 'e-consent', ok: () => el.consent.checked, text: T.form.errConsent }
  ];

  const setErr = (rule, text) => {
    document.getElementById(rule.err).textContent = text || '';
    rule.el.setAttribute('aria-invalid', text ? 'true' : 'false');
  };

  for (const rule of rules) {
    const evt = rule.el.type === 'checkbox' || rule.el.tagName === 'SELECT' ? 'change' : 'input';
    rule.el.addEventListener(evt, () => {
      if (rule.el.getAttribute('aria-invalid') === 'true' && rule.ok()) setErr(rule, '');
    });
  }

  const busy = (on) => {
    submit.setAttribute('aria-busy', String(on));
    submit.disabled = on;
    const icon = submit.querySelector('i');
    if (icon) icon.className = on ? 'ph-light ph-circle-notch' : 'ph-light ph-arrow-up-right';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';

    let first = null;
    for (const rule of rules) {
      const ok = rule.ok();
      setErr(rule, ok ? '' : rule.text);
      if (!ok && !first) first = rule.el;
    }
    if (first) {
      first.focus();
      return;
    }

    // Honeypot: real people never see this field.
    if (el.website.value) {
      showDone(body);
      return;
    }

    const opt = (v, max) => {
      const s = v.trim().slice(0, max);
      return s === '' ? null : s;
    };
    const payload = {
      lang,
      name: el.name.value.trim().slice(0, 120),
      organization: el.organization.value.trim().slice(0, 200),
      email: el.email.value.trim().slice(0, 254),
      phone: opt(el.phone.value, 40),
      site_type: el.site_type.value,
      town: opt(el.town.value, 120),
      message: opt(el.message.value, 4000),
      loi_interest: el.loi_interest.checked,
      consent: true
    };

    busy(true);
    try {
      await sendSignup(payload);
      showDone(body);
    } catch (err) {
      console.warn('Pilot form submission failed:', err);
      msg.textContent = T.form.errSend;
      if (CONFIG.contactEmail) {
        msg.append(' ' + T.form.orEmail + ' ');
        const a = document.createElement('a');
        a.href = 'mailto:' + CONFIG.contactEmail;
        a.textContent = CONFIG.contactEmail;
        msg.append(a, '.');
      }
      busy(false);
    }
  });
}

async function sendSignup(payload) {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) throw new Error('Form backend not configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.supabaseKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
  } finally {
    clearTimeout(timer);
  }
}

function showDone(body) {
  body.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'done';
  wrap.setAttribute('role', 'status');
  wrap.tabIndex = -1;
  const ic = document.createElement('div');
  ic.className = 'done-ic';
  ic.innerHTML = '<i class="ph-light ph-check" aria-hidden="true"></i>';
  const h = document.createElement('h3');
  h.className = 'h3';
  h.textContent = T.form.doneTitle;
  const p = document.createElement('p');
  p.textContent = T.form.doneText;
  wrap.append(ic, h, p);
  body.append(wrap);
  wrap.focus();
}

function initContact() {
  if (!CONFIG.contactEmail) return;
  document.querySelectorAll('[data-contact]').forEach((node) => {
    node.textContent = '';
    const a = document.createElement('a');
    a.href = 'mailto:' + CONFIG.contactEmail;
    a.textContent = CONFIG.contactEmail;
    node.append(a);
  });
}
