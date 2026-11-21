/* Core: client, helpers, router, auth, nav/footer, notifications, theme */
(function () {
  'use strict';
  const C = window.PSF_CONFIG || {};
  const PSF = (window.PSF = { C, user: null, profile: null, routes: [], cleanup: null, favs: new Set(), notifs: [], rid: 0 });
  PSF.configured = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  PSF.sb = PSF.configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  PSF.$ = $; PSF.$$ = $$;
  PSF.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = PSF.esc;
  PSF.money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  PSF.fmt = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  PSF.fmtShort = (d) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  PSF.debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  PSF.haversine = (a, b) => {
    const R = 6371, r = (x) => (x * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  PSF.fmtDist = (km) => (km == null ? '—' : km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km');
  PSF.navLink = (l) => `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`;
  PSF.hours = (s, e) => Math.max(1, Math.ceil((new Date(e) - new Date(s)) / 3600000));
  PSF.errMsg = (e) => (e && (e.message || e.error_description || e.msg)) || 'Something went wrong';

  PSF.toast = (msg, type = 'info') => {
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.style.opacity = 0; t.style.transition = '.4s'; setTimeout(() => t.remove(), 400); }, 4200);
  };

  PSF.modal = (html, opts = {}) => {
    const root = $('#modal-root');
    const bd = document.createElement('div');
    bd.className = 'backdrop';
    bd.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="icon-btn x" aria-label="Close"><i class="bi bi-x-lg"></i></button>${html}</div>`;
    root.appendChild(bd);
    const close = () => { bd.remove(); if (opts.onClose) opts.onClose(); };
    $('.x', bd).onclick = close;
    bd.addEventListener('mousedown', (e) => { if (e.target === bd) close(); });
    return { el: bd.firstElementChild, close };
  };

  PSF.countdown = (el, target, onDone, prefix = '') => {
    const tick = () => {
      let ms = new Date(target) - Date.now();
      if (ms <= 0) { el.textContent = prefix + '00:00:00'; clearInterval(id); if (onDone) onDone(); return; }
      const s = Math.floor(ms / 1000), d = Math.floor(s / 86400);
      const h = String(Math.floor((s % 86400) / 3600)).padStart(2, '0'), m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0');
      el.textContent = prefix + (d ? d + 'd ' : '') + `${h}:${m}:${ss}`;
    };
    const id = setInterval(() => { if (!document.body.contains(el)) return clearInterval(id); tick(); }, 1000);
    tick();
    return () => clearInterval(id);
  };

  PSF.counter = (el, to, dur = 1000) => {
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN'); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  };

  PSF.qr = (el, text, size = 160) => { el.innerHTML = ''; if (window.QRCode) new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M }); };
  PSF.aos = () => { if (window.AOS) { AOS.init({ duration: 650, once: true, offset: 40 }); AOS.refreshHard(); } };

  PSF.setupNotice = (view) => {
    view.innerHTML = `<div class="container section page-enter"><div class="card" style="max-width:720px;margin:auto"><h2><i class="bi bi-gear-fill"></i> Backend not configured</h2>
      <p class="muted" style="margin:10px 0 14px">Open <code>js/config.js</code> and add your Supabase URL and anon key, then run <code>supabase/schema.sql</code> in the Supabase SQL editor. Full steps are in <code>README.md</code>.</p></div></div>`;
  };
  PSF.requireDb = (view) => { if (PSF.configured) return true; PSF.setupNotice(view); return false; };

  /* ---------- data helpers ---------- */
  PSF.loadBoard = async () => {
    await PSF.sb.rpc('expire_pending');
    const [l, s, h] = await Promise.all([
      PSF.sb.from('locations').select('*').eq('is_active', true).order('name'),
      PSF.sb.from('slots').select('*'),
      PSF.sb.from('slot_holds').select('*').gt('end_time', new Date().toISOString()),
    ]);
    for (const r of [l, s, h]) if (r.error) throw r.error;
    return { locations: l.data, slots: s.data, holds: h.data };
  };
  // available = free now & not starting within 2h; reserved = booked to start within 2h; occupied = in use now / marked occupied
  PSF.stats = (loc, slots, holds, now = Date.now()) => {
    const out = { total: 0, avail: 0, occ: 0, res: 0, maint: 0 };
    slots.filter((s) => s.location_id === loc.id).forEach((s) => {
      out.total++;
      if (s.status === 'maintenance') return void out.maint++;
      if (s.status === 'occupied') return void out.occ++;
      const hs = holds.filter((h) => h.slot_id === s.id);
      if (hs.some((h) => +new Date(h.start_time) <= now && +new Date(h.end_time) > now)) out.occ++;
      else if (hs.some((h) => { const st = +new Date(h.start_time); return st > now && st <= now + 2 * 3600e3; })) out.res++;
      else out.avail++;
    });
    return out;
  };
  PSF.locImg = (l) => `<div class="loc-img"><i class="bi bi-p-square-fill"></i>${l.image_url ? `<img src="${esc(l.image_url)}" alt="${esc(l.name)}" loading="lazy" onerror="this.remove()">` : ''}<span class="price">${PSF.money(l.price_per_hour)}/hr</span></div>`;
  PSF.cardHTML = (l, extra = {}) => {
    const pct = l.total ? Math.round((l.avail / l.total) * 100) : 0;
    const cls = pct > 40 ? '' : pct > 15 ? 'mid' : 'low';
    return `<article class="card loc-card hover" data-id="${l.id}">
      <button class="fav-btn ${PSF.favs.has(l.id) ? 'on' : ''}" data-fav="${l.id}" aria-label="Favourite"><i class="bi bi-heart${PSF.favs.has(l.id) ? '-fill' : ''}"></i></button>
      ${PSF.locImg(l)}
      <div class="loc-body">
        <h3>${esc(l.name)}</h3>
        <div class="muted small"><i class="bi bi-geo-alt"></i> ${esc(l.address)}</div>
        <div class="meta-row">${l.dist != null ? `<span><i class="bi bi-signpost-2"></i> ${PSF.fmtDist(l.dist)}</span>` : ''}${extra.compact ? '' : `<span><i class="bi bi-grid-3x3-gap"></i> Capacity ${l.total}</span>`}</div>
        ${extra.compact ? '' : `<div class="avail-bar ${cls}"><i style="width:${pct}%"></i></div>
        <div class="meta-row"><span><i class="dot ok"></i>${l.avail} available</span><span><i class="dot occ"></i>${l.occ} occupied</span><span><i class="dot res"></i>${l.res} reserved</span></div>`}
        <div style="display:flex;gap:8px;margin-top:auto;padding-top:6px">
          <a class="btn btn-primary btn-sm" style="flex:1" href="#/book/${l.id}">Book now</a>
          <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${PSF.navLink(l)}" title="Navigate"><i class="bi bi-cursor"></i></a>
        </div>
        ${extra.note || ''}
      </div></article>`;
  };
  PSF.toggleFav = async (id) => {
    if (!PSF.user) { PSF.toast('Log in to save favourites', 'error'); return PSF.go('/login?next=' + encodeURIComponent(location.hash.slice(1))); }
    const on = PSF.favs.has(id);
    const q = on ? PSF.sb.from('favourites').delete().eq('user_id', PSF.user.id).eq('location_id', id)
                 : PSF.sb.from('favourites').insert({ user_id: PSF.user.id, location_id: id });
    const { error } = await q;
    if (error) return PSF.toast(PSF.errMsg(error), 'error');
    on ? PSF.favs.delete(id) : PSF.favs.add(id);
    PSF.toast(on ? 'Removed from favourites' : 'Added to favourites', 'success');
    return true;
  };
  PSF.bindCards = (root, onFav) => {
    root.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-fav]');
      if (f) { e.preventDefault(); e.stopPropagation(); if (await PSF.toggleFav(f.dataset.fav)) { if (onFav) onFav(); else { f.classList.toggle('on'); f.innerHTML = `<i class="bi bi-heart${PSF.favs.has(f.dataset.fav) ? '-fill' : ''}"></i>`; } } return; }
      if (e.target.closest('a,button')) return;
      const c = e.target.closest('.loc-card');
      if (c && !c.closest('#find-list')) PSF.go('/book/' + c.dataset.id);
    });
  };
  PSF.live = (tables, fn) => {
    const ch = PSF.sb.channel('live-' + Math.random().toString(36).slice(2));
    let dead = false;
    const d = PSF.debounce(() => { if (!dead) fn(); }, 400);
    tables.forEach((t) => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, d));
    ch.subscribe();
    return () => { dead = true; PSF.sb.removeChannel(ch); };
  };
  PSF.feedbackForm = (root) => {
    root.innerHTML = `<form class="card" id="fbForm"><div class="row c2"><div class="field"><label>Name</label><input name="name" required maxlength="80" value="${esc(PSF.profile ? PSF.profile.full_name : '')}"></div>
      <div class="field"><label>Email</label><input type="email" name="email" required value="${esc(PSF.user ? PSF.user.email : '')}"></div></div>
      <div class="field"><label>Rating</label><select name="rating"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ Okay</option><option value="2">★★ Poor</option><option value="1">★ Bad</option></select></div>
      <div class="field"><label>Message</label><textarea name="message" rows="4" required minlength="3" maxlength="2000" placeholder="How can we help?"></textarea></div>
      <button class="btn btn-primary btn-block"><i class="bi bi-send"></i> Send message</button></form>`;
    $('#fbForm', root).onsubmit = async (e) => {
      e.preventDefault();
      if (!PSF.requireDb({ innerHTML: '' }) ) return PSF.toast('Backend not configured', 'error');
      const f = new FormData(e.target);
      const { error } = await PSF.sb.from('feedback').insert({ user_id: PSF.user ? PSF.user.id : null, name: f.get('name'), email: f.get('email'), rating: +f.get('rating'), message: f.get('message') });
      if (error) return PSF.toast(PSF.errMsg(error), 'error');
      PSF.toast('Thank you! Your message was sent.', 'success'); e.target.reset();
    };
  };

  /* ---------- router ---------- */
  PSF.route = (pattern, fn, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/?]+)'; }) + '$');
    PSF.routes.push({ re, keys, fn, opts });
  };
  PSF.token = () => { const r = PSF.rid; return () => r !== PSF.rid; }; // true once the page that created it has been replaced
  PSF.go = (h) => { if (location.hash === '#' + h) render(); else location.hash = h; };

  async function render() {
    const id = ++PSF.rid;
    if (PSF.cleanup) { try { PSF.cleanup(); } catch (e) { /* ignore */ } PSF.cleanup = null; }
    $$('#modal-root .backdrop').forEach((b) => b.remove());
    const raw = location.hash.slice(1) || '/';
    const [path, qs] = raw.split('?');
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const view = $('#view');
    document.getElementById('navLinks').classList.remove('open');
    window.scrollTo(0, 0);
    for (const r of PSF.routes) {
      const m = path.match(r.re);
      if (!m) continue;
      const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      if (r.opts.auth || r.opts.admin) {
        if (!PSF.configured) return PSF.setupNotice(view);
        if (!PSF.user) return PSF.go((r.opts.admin ? '/admin-login' : '/login') + '?next=' + encodeURIComponent(raw));
        if (r.opts.admin && (!PSF.profile || PSF.profile.role !== 'admin')) {
          view.innerHTML = `<div class="container section page-enter"><div class="card center"><h2>Access denied</h2><p class="muted" style="margin:8px 0 14px">This area is for administrators only.</p><a class="btn btn-primary" href="#/">Go home</a></div></div>`;
          return;
        }
      }
      view.className = ''; void view.offsetWidth; view.className = 'page-enter';
      view.innerHTML = '';
      try {
        const out = await r.fn({ params, query, view });
        if (id !== PSF.rid) { if (typeof out === 'function') out(); return; }
        if (typeof out === 'function') PSF.cleanup = out;
      } catch (e) {
        console.error(e);
        if (id !== PSF.rid) return; // an old page failing must not overwrite the current one
        view.innerHTML = `<div class="container section"><div class="notice err-box">Error: ${esc(PSF.errMsg(e))}</div></div>`;
      }
      PSF.aos(); highlightNav(path); return;
    }
    view.innerHTML = `<div class="container section center page-enter"><h1 class="grad-text" style="font-size:4rem">404</h1><p class="muted" style="margin:10px 0 20px">Page not found</p><a class="btn btn-primary" href="#/">Back to home</a></div>`;
  }
  function highlightNav(path) {
    $$('#navLinks a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + path || (path !== '/' && a.getAttribute('href') !== '#/' && ('#' + path).startsWith(a.getAttribute('href')))));
  }

  /* ---------- nav / footer / theme ---------- */
  PSF.renderNav = () => {
    const admin = PSF.profile && PSF.profile.role === 'admin';
    const unread = PSF.notifs.filter((n) => !n.is_read).length;
    $('#nav').innerHTML = `<div class="nav-inner">
      <a class="brand" href="#/"><span class="brand-logo">P</span><span class="t">Parking<b>Slot</b>Finder</span></a>
      <nav class="nav-links" id="navLinks">
        <a href="#/">Home</a><a href="#/find">Find Parking</a>
        ${PSF.user ? '<a href="#/dashboard">Dashboard</a>' : ''}${admin ? '<a href="#/admin">Admin</a>' : ''}
        <a href="#/page/contact">Contact</a>
      </nav>
      <div class="nav-actions">
        <button class="icon-btn" id="themeBtn" aria-label="Toggle theme"><i class="bi bi-${document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon-stars'}"></i></button>
        ${PSF.user ? `<div class="relative"><button class="icon-btn" id="bellBtn" aria-label="Notifications"><i class="bi bi-bell"></i>${unread ? `<span class="badge">${unread}</span>` : ''}</button></div>
          <a class="btn btn-outline btn-sm" href="#/dashboard"><i class="bi bi-person-circle"></i> ${esc((PSF.profile && PSF.profile.full_name || 'Account').split(' ')[0])}</a>
          <button class="btn btn-sm" id="logoutBtn"><i class="bi bi-box-arrow-right"></i></button>`
        : `<a class="btn btn-outline btn-sm" href="#/login">Log in</a><a class="btn btn-primary btn-sm" href="#/register">Sign up</a>`}
        <button class="icon-btn burger" id="burger" aria-label="Menu"><i class="bi bi-list"></i></button>
      </div></div>`;
    $('#themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; try { localStorage.setItem('psf-theme', t); } catch (e) { /* ignore */ } PSF.renderNav(); };
    $('#burger').onclick = () => $('#navLinks').classList.toggle('open');
    if (PSF.user) {
      $('#logoutBtn').onclick = async () => { await PSF.sb.auth.signOut(); PSF.toast('Logged out', 'success'); };
      $('#bellBtn').onclick = (e) => { e.stopPropagation(); bellMenu(); };
    }
    highlightNav((location.hash.slice(1) || '/').split('?')[0]);
  };
  function bellMenu() {
    const old = $('#bellDrop'); if (old) return old.remove();
    const d = document.createElement('div'); d.className = 'dropdown'; d.id = 'bellDrop';
    d.innerHTML = PSF.notifs.length ? PSF.notifs.map((n) => `<div class="item ${n.is_read ? '' : 'unread'}" data-id="${n.id}"><b>${esc(n.title)}</b><div class="muted small">${esc(n.body)}</div><div class="muted small">${PSF.fmtShort(n.created_at)}</div></div>`).join('') : '<div class="item muted">No notifications yet</div>';
    $('#bellBtn').parentElement.appendChild(d);
    const ids = PSF.notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (ids.length) PSF.sb.from('notifications').update({ is_read: true }).in('id', ids).then(() => { PSF.notifs.forEach((n) => (n.is_read = true)); const b = $('#bellBtn .badge'); if (b) b.remove(); });
    setTimeout(() => document.addEventListener('click', function h() { d.remove(); document.removeEventListener('click', h); }), 0);
  }
  PSF.renderFooter = () => {
    $('#footer').innerHTML = `<div class="container"><div class="foot-grid">
      <div><a class="brand" href="#/"><span class="brand-logo">P</span>Parking<b>Slot</b>Finder</a><p class="muted small" style="margin-top:12px;max-width:300px">Smart Parking, Stress-Free Driving. Find, book and pay for parking in real time.</p>
        <div class="socials"><a href="https://twitter.com" target="_blank" rel="noopener" aria-label="X"><i class="bi bi-twitter-x"></i></a><a href="https://facebook.com" target="_blank" rel="noopener" aria-label="Facebook"><i class="bi bi-facebook"></i></a><a href="https://instagram.com" target="_blank" rel="noopener" aria-label="Instagram"><i class="bi bi-instagram"></i></a><a href="https://linkedin.com" target="_blank" rel="noopener" aria-label="LinkedIn"><i class="bi bi-linkedin"></i></a><a href="https://github.com" target="_blank" rel="noopener" aria-label="GitHub"><i class="bi bi-github"></i></a></div></div>
      <div><h4>Product</h4><a href="#/find">Find Parking</a><a href="#/dashboard">My Bookings</a><a href="#/register">Create account</a></div>
      <div><h4>Company</h4><a href="#/page/about">About Us</a><a href="#/page/contact">Contact Us</a><a href="#/page/faq">FAQs</a></div>
      <div><h4>Legal</h4><a href="#/page/privacy">Privacy Policy</a><a href="#/page/terms">Terms &amp; Conditions</a><a href="#/admin-login">Admin login</a></div>
    </div><div class="copy">© ${new Date().getFullYear()} Parking Slot Finder. All rights reserved.</div></div>`;
  };

  /* ---------- auth + notifications ---------- */
  let notifCh = null;
  let userSeq = 0;
  async function setUser(u) {
    const seq = ++userSeq;
    const changed = (PSF.user && PSF.user.id) !== (u && u.id);
    PSF.user = u || null;
    if (notifCh) { PSF.sb.removeChannel(notifCh); notifCh = null; }
    if (!u) { PSF.profile = null; PSF.favs = new Set(); PSF.notifs = []; return changed; }
    const [p, f, n] = await Promise.all([
      PSF.sb.from('profiles').select('*').eq('id', u.id).maybeSingle(),
      PSF.sb.from('favourites').select('location_id').eq('user_id', u.id),
      PSF.sb.from('notifications').select('*').eq('user_id', u.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (seq !== userSeq) return changed; // a newer call took over
    PSF.profile = p.data; PSF.favs = new Set((f.data || []).map((x) => x.location_id)); PSF.notifs = n.data || [];
    notifCh = PSF.sb.channel('notif-' + u.id).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + u.id }, (pl) => {
      PSF.notifs.unshift(pl.new); PSF.renderNav(); PSF.toast(pl.new.title + ' — ' + pl.new.body, 'success');
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification(pl.new.title, { body: pl.new.body }); } catch (e) { /* ignore */ }
    }).subscribe();
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* ignore */ }
    return changed;
  }
  PSF.refreshProfile = async () => { await setUser(PSF.user); PSF.renderNav(); };

  PSF.boot = async () => {
    try { const t = localStorage.getItem('psf-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* ignore */ }
    PSF.renderFooter();
    if (PSF.configured) {
      try { const { data } = await PSF.sb.auth.getSession(); await setUser(data.session && data.session.user); } catch (e) { console.error(e); }
      PSF.sb.auth.onAuthStateChange((ev, s) => {
        if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(ev)) return;
        setTimeout(async () => {
          const changed = await setUser(s && s.user);
          PSF.renderNav();
          if (ev === 'SIGNED_OUT') { if (PSF.quietSignOut) PSF.quietSignOut = false; else PSF.go('/'); } else if (changed) {
            if (/^#\/admin-login/.test(location.hash)) return; // the admin login form decides where to go
            const next = new URLSearchParams((location.hash.split('?')[1]) || '').get('next');
            if (/^#\/(login|register)/.test(location.hash)) PSF.go(next ? decodeURIComponent(next) : '/dashboard'); else render();
          }
        }, 0);
      });
    }
    PSF.renderNav();
    window.addEventListener('hashchange', render);
    await render();
    setTimeout(() => $('#page-loader').classList.add('hide'), 250);
  };
})();
