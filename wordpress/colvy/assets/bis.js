/* Colvy — Back in stock. Vanilla JS; works with page caching (no nonce) and
   with WooCommerce injecting a form per variation. */
(function () {
  'use strict';
  var cfg = window.colvyBis || {};
  var TICK = '<span class="cbis-halo"></span><span class="cbis-halo"></span>' +
    '<svg viewBox="0 0 88 88" width="60" height="60"><defs><linearGradient id="cbisG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs>' +
    '<circle class="cbis-ring" cx="44" cy="44" r="40" fill="none" stroke="#22c55e" stroke-width="3" pathLength="1"/>' +
    '<circle class="cbis-fill" cx="44" cy="44" r="40" fill="url(#cbisG)"/>' +
    '<path class="cbis-glyph" d="M27 45.5 L38.5 57 L61 33" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // Animate the card's height across a content change (transform-free, one property).
  function morph(root, change) {
    var from = root.offsetHeight;
    root.style.height = from + 'px';
    change();
    var to = root.querySelector('.colvy-bis__in').offsetHeight + 2;
    requestAnimationFrame(function () {
      root.style.height = to + 'px';
      setTimeout(function () { root.style.height = ''; }, 420);
    });
  }

  // Their own number, on their own screen — show it as they typed it.
  function mask(v) { return String(v).trim(); }

  function setCh(root, ch, focus) {
    root.setAttribute('data-ch', ch);
    var seg = root.querySelector('.colvy-bis__seg');
    if (seg) {
      var btns = seg.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-ch') === ch;
        btns[i].setAttribute('aria-checked', on ? 'true' : 'false');
        if (on) seg.querySelector('.colvy-bis__thumb').style.transform = 'translateX(' + (i * 100) + '%)';
      }
    }
    var again = root.querySelector('.colvy-bis__again');
    if (again) again.textContent = ch === 'email' ? 'Use a different email' : 'Use a different number';
    if (focus) { var inp = root.querySelector(ch === 'email' ? 'input[name=email]' : 'input[name=phone]'); if (inp) inp.focus(); }
  }

  function showDone(root, ch, value, already) {
    morph(root, function () {
      root.querySelector('.colvy-bis__ask').hidden = true;
      var done = root.querySelector('.colvy-bis__done');
      done.hidden = false;
      done.querySelector('.colvy-bis__mark').innerHTML = TICK;
      done.querySelector('.colvy-bis__done-t').textContent = already ? "You're already on the list" : "You're on the list";
      done.querySelector('.colvy-bis__done-s').textContent = (ch === 'email' ? "We'll email " : "We'll text ") + mask(value, ch) + " the moment it's back.";
    });
  }

  function err(root, msg, input) {
    var e = root.querySelector('.colvy-bis__err');
    e.textContent = msg || '';
    e.classList.toggle('on', !!msg);
    var box = input && (input.closest('.colvy-bis__field') || input);
    if (box) { box.classList.remove('cbis-bad'); void box.offsetWidth; box.classList.add('cbis-bad'); input.focus(); }
  }

  function init(root) {
    if (root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    setCh(root, root.getAttribute('data-ch') || 'sms');
    place(root);
    // Prefill: what they typed last time, else their WooCommerce account details.
    var last = {}; try { last = JSON.parse(store('colvy_bis_me') || '{}') || {}; } catch (e) {}
    var me = cfg.me || {};
    last = { phone: last.phone || me.phone || '', email: last.email || me.email || '', name: last.name || me.name || '' };
    if (!last.phone && last.email && root.querySelector('.colvy-bis__seg')) setCh(root, 'email');
    if (last.phone) { var p = root.querySelector('input[name=phone]'); if (p) p.value = last.phone; }
    if (last.email) { var m = root.querySelector('input[name=email]'); if (m) m.value = last.email; }
    if (last.name) { var n = root.querySelector('input[name=name]'); if (n) n.value = last.name; }
    var joined = store('colvy_bis_joined_' + root.getAttribute('data-product'));
    if (joined && !root.getAttribute('data-preview')) {
      try { var j = JSON.parse(joined); root.querySelector('.colvy-bis__ask').hidden = true; var d = root.querySelector('.colvy-bis__done'); d.hidden = false; d.querySelector('.colvy-bis__mark').innerHTML = TICK; d.querySelector('.colvy-bis__done-s').textContent = (j.ch === 'email' ? "We'll email " : "We'll text ") + mask(j.v, j.ch) + " the moment it's back."; } catch (e) {}
    }
  }

  // Some themes print the stock line in a row beside the price (or in an
  // indented column). Give the form its own full-width line under that row,
  // lined up with the price. Variation forms stay put — Woo swaps those.
  function place(root) {
    if (root.getAttribute('data-preview') || root.closest('.woocommerce-variation, .single_variation_wrap, .woocommerce-variation-availability')) return;
    // The price nearest the form in the page structure (a few levels up at
    // most) — not one from a header product-nav popup, sticky bar or related
    // products elsewhere on the page.
    var SKIP = '.wd-product-nav, .product-nav, header, .related, .upsells, .cross-sells, .wd-sticky-btn, .sticky-add-to-cart, .colvy-bis';
    var price = null, up = root.parentElement;
    for (var lvl = 0; up && lvl < 5 && !price; lvl++, up = up.parentElement) {
      var list = up.querySelectorAll('p.price, .price, .wp-block-woocommerce-product-price');
      for (var i = 0; i < list.length; i++) { if (!list[i].closest(SKIP) && list[i].offsetParent) { price = list[i]; break; } }
    }
    if (!price) return;
    var r = root.getBoundingClientRect(), p = price.getBoundingClientRect();
    var beside = r.top < p.bottom - 4 && r.left > p.right - 4;
    var indented = Math.abs(r.left - p.left) > 6;
    if (!beside && !indented) return;
    // Lowest ancestor holding both the price and the form…
    var common = root.parentElement;
    while (common && !common.contains(price)) common = common.parentElement;
    if (!common) return;
    // …then step out of any side-by-side row so the form gets the full width.
    var anchor = root;
    while (anchor.parentElement && anchor.parentElement !== common) anchor = anchor.parentElement;
    var host = common;
    var row = function (el) { var cs = getComputedStyle(el); return (cs.display.indexOf('flex') > -1 && cs.flexDirection.indexOf('row') === 0) || (cs.display.indexOf('grid') > -1 && cs.gridTemplateColumns.split(' ').length > 1); };
    // A wrapping row (Elementor/WoodMart widget rows) can give the form its own
    // full-width line right here; only a non-wrapping row needs stepping out of.
    while (host && host !== document.body && row(host) && getComputedStyle(host).flexWrap === 'nowrap' && host.parentElement) { anchor = host; host = host.parentElement; }
    if (anchor === root) return;
    var before = root.getBoundingClientRect().top, homeParent = root.parentNode, homeNext = root.nextSibling;
    anchor.parentNode.insertBefore(root, anchor.nextSibling);
    // Safety net: a move should only ever nudge the form under the price row.
    // If it jumped far (an unexpected layout), put it back where it was.
    if (Math.abs(root.getBoundingClientRect().top - before) > 400) homeParent.insertBefore(root, homeNext);
  }

  function initAll() { var all = document.querySelectorAll('.colvy-bis'); for (var i = 0; i < all.length; i++) init(all[i]); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.colvy-bis__seg button');
    if (b) { var root = b.closest('.colvy-bis'); err(root, ''); setCh(root, b.getAttribute('data-ch'), true); return; }
    var a = e.target.closest && e.target.closest('.colvy-bis__again');
    if (a) {
      var r = a.closest('.colvy-bis');
      try { localStorage.removeItem('colvy_bis_joined_' + r.getAttribute('data-product')); } catch (x) {}
      morph(r, function () { r.querySelector('.colvy-bis__done').hidden = true; var ask = r.querySelector('.colvy-bis__ask'); ask.hidden = false; ask.classList.remove('out'); });
      var inp = r.querySelector(r.getAttribute('data-ch') === 'email' ? 'input[name=email]' : 'input[name=phone]');
      if (inp) { inp.select(); inp.focus(); }
    }
  });

  // A <div>, not a <form>: on variable products Woo prints the stock line
  // inside its add-to-cart form, and a nested form would submit that instead.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('.colvy-bis__btn');
    if (btn) { e.preventDefault(); join(btn.closest('.colvy-bis__form')); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.closest) return;
    var form = e.target.closest('.colvy-bis__form');
    if (form && e.target.tagName === 'INPUT') { e.preventDefault(); join(form); }
  });

  function join(form) {
    var root = form.closest('.colvy-bis');
    if (root.classList.contains('is-busy')) return;
    var ch = root.getAttribute('data-ch') === 'email' ? 'email' : 'sms';
    var input = form.querySelector(ch === 'email' ? 'input[name=email]' : 'input[name=phone]');
    var v = (input.value || '').trim();
    if (ch === 'sms' && v.replace(/\D/g, '').length < 8) return err(root, 'Enter your mobile number.', input);
    if (ch === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return err(root, 'Enter a valid email address.', input);
    err(root, '');
    var nameEl = form.querySelector('input[name=name]');
    var name = nameEl ? nameEl.value.trim() : '';

    var finish = function (already) {
      store('colvy_bis_me', JSON.stringify({ phone: ch === 'sms' ? v : (form.querySelector('input[name=phone]') || {}).value || '', email: ch === 'email' ? v : (form.querySelector('input[name=email]') || {}).value || '', name: name }));
      if (!root.getAttribute('data-preview')) store('colvy_bis_joined_' + root.getAttribute('data-product'), JSON.stringify({ ch: ch, v: v }));
      root.querySelector('.colvy-bis__ask').classList.add('out');
      setTimeout(function () { root.classList.remove('is-busy'); showDone(root, ch, v, already); }, 200);
    };

    root.classList.add('is-busy');
    if (root.getAttribute('data-preview')) { setTimeout(function () { finish(false); }, 700); return; } // admin preview: no sign-up

    var body = new FormData();
    body.append('action', 'colvy_bis_join');
    body.append('product', root.getAttribute('data-product'));
    body.append('ch', ch);
    body.append(ch === 'email' ? 'email' : 'phone', v);
    if (name) body.append('name', name);
    body.append('website', (form.querySelector('input[name=website]') || {}).value || '');
    fetch(cfg.ajax || '/wp-admin/admin-ajax.php', { method: 'POST', body: body, credentials: 'same-origin' })
      .then(function (r) { return r.json().catch(function () { return { success: false }; }); })
      .then(function (d) {
        if (d && d.success) return finish(!!(d.data && d.data.duplicate));
        root.classList.remove('is-busy');
        err(root, (d && d.data && d.data.message) || 'Something went wrong — please try again.');
      })
      .catch(function () { root.classList.remove('is-busy'); err(root, 'No connection — please try again.'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll); else initAll();
  // Variable products: Woo swaps in each variation's stock line (and our form) when an option is picked.
  if (window.jQuery) window.jQuery(document).on('show_variation found_variation', function () { setTimeout(initAll, 0); });
  // Page builders / quick-view popups add forms later — catch those too (at most once a frame).
  var queued = false;
  if (window.MutationObserver) new MutationObserver(function () {
    if (queued) return; queued = true;
    requestAnimationFrame(function () { queued = false; if (document.querySelector('.colvy-bis:not([data-ready])')) initAll(); });
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
