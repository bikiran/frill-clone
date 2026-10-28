/* Colvy — Back in stock. Vanilla JS; works with page caching (no nonce).

   Simple products: the server prints the form only when the product is sold
   out. Variable products: the server prints ONE hidden copy per product and
   this script shows it only while the chosen variation is sold out (with
   nothing chosen: only when every variation is), using WooCommerce's own
   variation data. Nothing here ever creates a form, so variation changes,
   bfcache restores or the script being included twice can't add a second. */
(function () {
  'use strict';
  // The theme or a cache plugin printed this script twice — the first copy runs.
  if (window.colvyBisLoaded) return;
  window.colvyBisLoaded = true;
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

  // What this device remembers signing up for: per product, and per option on variable products.
  function joinedKey(root) {
    var v = root.getAttribute('data-variation');
    return 'colvy_bis_joined_' + root.getAttribute('data-product') + (v ? '_' + v : '');
  }

  function showAsk(root) {
    root.querySelector('.colvy-bis__done').hidden = true;
    var ask = root.querySelector('.colvy-bis__ask'); ask.hidden = false; ask.classList.remove('out');
  }

  // Already on the list for what's showing? Show that; otherwise the form.
  function restore(root) {
    if (root.getAttribute('data-preview')) return;
    var j = null; try { j = JSON.parse(store(joinedKey(root)) || 'null'); } catch (e) {}
    if (!j) return showAsk(root);
    root.querySelector('.colvy-bis__ask').hidden = true;
    var d = root.querySelector('.colvy-bis__done');
    d.hidden = false;
    d.querySelector('.colvy-bis__mark').innerHTML = TICK;
    d.querySelector('.colvy-bis__done-t').textContent = "You're on the list";
    d.querySelector('.colvy-bis__done-s').textContent = (j.ch === 'email' ? "We'll email " : "We'll text ") + mask(j.v, j.ch) + " the moment it's back.";
  }

  function init(root) {
    if (root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    setCh(root, root.getAttribute('data-ch') || 'sms');
    if (!root.hasAttribute('data-variable')) place(root);
    ownLine(root);
    // Prefill: what they typed last time, else their WooCommerce account details.
    var last = {}; try { last = JSON.parse(store('colvy_bis_me') || '{}') || {}; } catch (e) {}
    var me = cfg.me || {};
    last = { phone: last.phone || me.phone || '', email: last.email || me.email || '', name: last.name || me.name || '' };
    if (!last.phone && last.email && root.querySelector('.colvy-bis__seg')) setCh(root, 'email');
    if (last.phone) { var p = root.querySelector('input[name=phone]'); if (p) p.value = last.phone; }
    if (last.email) { var m = root.querySelector('input[name=email]'); if (m) m.value = last.email; }
    if (last.name) { var n = root.querySelector('input[name=name]'); if (n) n.value = last.name; }
    if (root.hasAttribute('data-variable')) sync(root); else restore(root);
  }

  /* ── Variable products ─────────────────────────────────────────────────
     Which variation is chosen, and can it be bought? WooCommerce writes the
     chosen id into input.variation_id and passes the variation object with
     found_variation; the full list is in data-product_variations (or "false"
     when the theme loads variations by AJAX — then we use what the events
     gave us, and the server's data-all-out for the "nothing chosen" case). */
  var POPUP = '.mfp-content, .wd-popup, .quick-view, .quickview, .product-quick-view, [role="dialog"], .modal';
  var scopes = 0;
  function scopeOf(el) { return (el.closest && el.closest(POPUP)) || document; }
  function scopeKey(el) { var s = scopeOf(el); if (s === document) return 'doc'; if (!s._cbisScope) s._cbisScope = ++scopes; return 's' + s._cbisScope; }

  function formFor(root) {
    var sel = 'form.variations_form[data-product_id="' + root.getAttribute('data-product') + '"]', scope = scopeOf(root);
    return scope.querySelector(sel) || (scope === document ? null : document.querySelector(sel));
  }
  function variations(form) {
    var list = null; try { list = JSON.parse(form.getAttribute('data-product_variations')); } catch (e) {}
    return Array.isArray(list) ? list : null;
  }
  function lookup(form, id) {
    if (form._cbisSeen && form._cbisSeen[id]) return form._cbisSeen[id];
    var list = variations(form) || [];
    for (var i = 0; i < list.length; i++) if (String(list[i].variation_id) === String(id)) return list[i];
    return null;
  }
  // Backorders count as buyable: no form.
  function buyable(v) { return !!(v && (v.is_in_stock || v.backorders_allowed)); }
  function chosen(form) {
    var input = form.querySelector('input[name="variation_id"], input.variation_id');
    if (!input) return form._cbisCur || null;
    var id = parseInt(input.value, 10) || 0;
    if (!id) return null;
    return lookup(form, id) || (form._cbisCur && String(form._cbisCur.variation_id) === String(id) ? form._cbisCur : { variation_id: id, unknown: true });
  }
  function labelFor(form, v) {
    var parts = [], sels = form.querySelectorAll('.variations select, select[name^="attribute_"]');
    for (var i = 0; i < sels.length; i++) {
      var o = sels[i].options[sels[i].selectedIndex];
      if (sels[i].value && o) parts.push(o.text.trim());
    }
    if (!parts.length && v.attributes) for (var k in v.attributes) if (v.attributes[k]) parts.push(String(v.attributes[k]));
    return parts.join(', ');
  }
  // "Sold out — for now" → "2-3cm is sold out — for now".
  function titleFor(heading, label) {
    if (!label) return heading;
    if (/^(sold out|out of stock)/i.test(heading)) return label + ' is ' + heading.charAt(0).toLowerCase() + heading.slice(1);
    return label + ': ' + heading;
  }

  function sync(root) {
    if (!root.hasAttribute('data-variable') || !root.getAttribute('data-ready')) return;
    var form = formFor(root), v = form ? chosen(form) : null, show;
    if (v && v.unknown) show = false;            // an id we know nothing about yet — wait for found_variation
    else if (v) show = !buyable(v);
    else {
      var list = form && variations(form);
      if (list && list.length) { show = true; for (var i = 0; i < list.length; i++) if (buyable(list[i])) { show = false; break; } }
      else show = root.getAttribute('data-all-out') === '1';
    }
    if (!show) { root.hidden = true; return; }
    var vid = v ? String(v.variation_id) : '';
    var title = root.querySelector('.colvy-bis__ask .colvy-bis__title');
    if (title) title.textContent = titleFor(title.getAttribute('data-heading') || title.textContent, v && form ? labelFor(form, v) : '');
    var changed = root.hidden || root.getAttribute('data-variation') !== vid;
    root.setAttribute('data-variation', vid);
    root.hidden = false;
    if (changed) { err(root, ''); restore(root); }
  }

  function syncForm(form) {
    var all = document.querySelectorAll('.colvy-bis[data-variable][data-ready]');
    for (var i = 0; i < all.length; i++) if (!form || formFor(all[i]) === form) sync(all[i]);
  }
  // WooCommerce fires several events per change (and themes add more) — one sync after them all.
  function queue(form, wait) {
    if (form._cbisQ) return;
    form._cbisQ = setTimeout(function () { form._cbisQ = 0; syncForm(form); }, wait || 0);
  }

  // One form per product (per popup). A second copy — a theme printing the
  // add-to-cart area twice, or an old cached page — is removed, never shown.
  function dedupe() {
    var seen = {}, all = document.querySelectorAll('.colvy-bis:not([data-preview])');
    for (var i = 0; i < all.length; i++) {
      var k = all[i].getAttribute('data-product') + '|' + scopeKey(all[i]);
      if (seen[k]) { all[i].parentNode.removeChild(all[i]); continue; }
      seen[k] = 1;
      // Pages cached before 3.0.5 carry a copy inside each variation's stock
      // line; where the managed copy exists, those go.
      if (!all[i].hasAttribute('data-variable') && all[i].closest('.variations_form, .woocommerce-variation, .wd-single-stock-status')) {
        var f = all[i].closest('.variations_form'), pid = f && f.getAttribute('data-product_id');
        if (pid && scopeOf(all[i]).querySelector('.colvy-bis[data-variable][data-product="' + pid + '"]')) all[i].parentNode.removeChild(all[i]);
      }
    }
  }

  // Some themes print the stock line in a row beside the price (or in an
  // indented column). Give the form its own full-width line under that row,
  // lined up with the price. Variation forms stay put — Woo swaps those.
  // The price nearest the form in the page structure (a few levels up at
  // most) — not one from a header product-nav popup, sticky bar or related
  // products elsewhere on the page.
  function nearPrice(root) {
    var SKIP = '.wd-product-nav, .product-nav, header, .related, .upsells, .cross-sells, .wd-sticky-btn, .sticky-add-to-cart, .colvy-bis';
    var up = root.parentElement;
    for (var lvl = 0; up && lvl < 5; lvl++, up = up.parentElement) {
      var list = up.querySelectorAll('p.price, .price, .wp-block-woocommerce-product-price');
      for (var i = 0; i < list.length; i++) { if (!list[i].closest(SKIP) && list[i].offsetParent) return list[i]; }
    }
    return null;
  }

  function place(root) {
    if (root.getAttribute('data-preview') || root.closest('.woocommerce-variation, .single_variation_wrap, .woocommerce-variation-availability, .wd-single-stock-status, .variations_form')) return;
    var price = nearPrice(root);
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

  // Themes that print the stock line (and so the form) inside a box that sits
  // in a wrapping row beside the price (WoodMart, Elementor rows) size that
  // box to its contents: the form stayed under the price while its text was
  // long, then jumped up beside it when a shorter one showed ("Email me",
  // "You're on the list"). Give that box the row's whole width, always.
  function ownLine(root) {
    if (root.getAttribute('data-preview')) return;
    var price = nearPrice(root);
    if (!price) return;
    var common = root.parentElement;
    while (common && !common.contains(price)) common = common.parentElement;
    if (!common) return;
    var box = root;
    while (box.parentElement && box.parentElement !== common) box = box.parentElement;
    if (box === root) return; // the form is the row's own item: its CSS already takes a whole line
    var cs = getComputedStyle(common);
    if (cs.display.indexOf('flex') > -1 && cs.flexDirection.indexOf('row') === 0 && cs.flexWrap !== 'nowrap') {
      box.style.flexBasis = '100%';
      box.style.maxWidth = '100%';
    }
  }

  function initAll() { dedupe(); var all = document.querySelectorAll('.colvy-bis'); for (var i = 0; i < all.length; i++) init(all[i]); }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.colvy-bis__seg button');
    if (b) { var root = b.closest('.colvy-bis'); err(root, ''); setCh(root, b.getAttribute('data-ch'), true); return; }
    var a = e.target.closest && e.target.closest('.colvy-bis__again');
    if (a) {
      var r = a.closest('.colvy-bis');
      try { localStorage.removeItem(joinedKey(r)); } catch (x) {}
      morph(r, function () { showAsk(r); });
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
    var variation = root.getAttribute('data-variation') || '', key = joinedKey(root);

    var finish = function (already) {
      store('colvy_bis_me', JSON.stringify({ phone: ch === 'sms' ? v : (form.querySelector('input[name=phone]') || {}).value || '', email: ch === 'email' ? v : (form.querySelector('input[name=email]') || {}).value || '', name: name }));
      if (!root.getAttribute('data-preview')) store(key, JSON.stringify({ ch: ch, v: v }));
      root.querySelector('.colvy-bis__ask').classList.add('out');
      setTimeout(function () { root.classList.remove('is-busy'); showDone(root, ch, v, already); }, 200);
    };

    root.classList.add('is-busy');
    if (root.getAttribute('data-preview')) { setTimeout(function () { finish(false); }, 700); return; } // admin preview: no sign-up

    var body = new FormData();
    body.append('action', 'colvy_bis_join');
    body.append('product', root.getAttribute('data-product'));
    if (variation) body.append('variation_id', variation);
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

  // Variable products: follow WooCommerce's variation events (bubbling up from
  // each form). Repeats are harmless — sync only shows or hides the one copy.
  if (window.jQuery) {
    window.jQuery(document)
      .on('found_variation show_variation', '.variations_form', function (e, v) {
        if (v && v.variation_id) { this._cbisCur = v; (this._cbisSeen = this._cbisSeen || {})[v.variation_id] = v; }
        queue(this);
      })
      .on('reset_data hide_variation', '.variations_form', function () { this._cbisCur = null; queue(this); })
      .on('woocommerce_variation_has_changed check_variations', '.variations_form', function () { queue(this); });
  }
  // Without jQuery events (or a theme that swallows them): re-check after a pick or "Clear".
  document.addEventListener('change', function (e) {
    var f = e.target && e.target.closest && e.target.closest('.variations_form');
    if (f) queue(f, 60);
  }, true);
  document.addEventListener('click', function (e) {
    var f = e.target && e.target.closest && e.target.closest('.reset_variations') && e.target.closest('.variations_form');
    if (f) queue(f, 60);
  });
  // Back/forward (bfcache) restores the page as it was; re-check against the
  // options now selected. Still one copy — nothing is added here.
  window.addEventListener('pageshow', function () { initAll(); syncForm(null); });

  // Page builders / quick-view popups add forms later — catch those too (at most once a frame).
  var queued = false;
  if (window.MutationObserver) new MutationObserver(function () {
    if (queued) return; queued = true;
    requestAnimationFrame(function () { queued = false; if (document.querySelector('.colvy-bis:not([data-ready])')) initAll(); });
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
