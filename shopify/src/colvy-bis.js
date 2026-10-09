/* Colvy — Back in stock (Shopify theme app extension). Vanilla JS. Source of
   extensions/colvy-theme/assets/colvy-bis.js — run `npm run build` after editing.
   Follows the theme's variant picker: the form shows only while the chosen
   variant can't be bought, and signs the shopper up for that variant. Kept in
   step with wordpress/colvy/assets/bis.js. */
(function () {
  'use strict';
  var TICK = '<span class="cbis-halo"></span><span class="cbis-halo"></span>' +
    '<svg viewBox="0 0 88 88" width="60" height="60"><defs><linearGradient id="cbisG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4ade80"/><stop offset="1" stop-color="#16a34a"/></linearGradient></defs>' +
    '<circle class="cbis-ring" cx="44" cy="44" r="40" fill="none" stroke="#22c55e" stroke-width="3" pathLength="1"/>' +
    '<circle class="cbis-fill" cx="44" cy="44" r="40" fill="url(#cbisG)"/>' +
    '<path class="cbis-glyph" d="M27 45.5 L38.5 57 L61 33" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" pathLength="1"/></svg>';

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function forget(k) { try { localStorage.removeItem(k); } catch (e) {} }
  var preview = function (root) { return !!root.getAttribute('data-preview'); };

  // Animate the card's height across a content change (one property).
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

  function doneText(ch, v) { return (ch === 'email' ? "We'll email " : "We'll text ") + String(v).trim() + " the moment it's back."; }

  function showAsk(root) {
    root.querySelector('.colvy-bis__done').hidden = true;
    var ask = root.querySelector('.colvy-bis__ask'); ask.hidden = false; ask.classList.remove('out');
  }
  function showDone(root, j, already, animate) {
    var paint = function () {
      root.querySelector('.colvy-bis__ask').hidden = true;
      var d = root.querySelector('.colvy-bis__done');
      d.hidden = false;
      d.querySelector('.colvy-bis__mark').innerHTML = TICK;
      d.querySelector('.colvy-bis__done-t').textContent = already ? "You're already on the list" : "You're on the list";
      d.querySelector('.colvy-bis__done-s').textContent = doneText(j.ch, j.v);
    };
    if (animate) morph(root, paint); else paint();
  }

  function err(root, msg, input) {
    var e = root.querySelector('.colvy-bis__err');
    e.textContent = msg || '';
    e.classList.toggle('on', !!msg);
    var box = input && (input.closest('.colvy-bis__field') || input);
    if (box) { box.classList.remove('cbis-bad'); void box.offsetWidth; box.classList.add('cbis-bad'); input.focus(); }
  }

  // ── Which variant is chosen ────────────────────────────────────────────
  function variants(root) {
    if (!root._variants) { try { root._variants = JSON.parse(root.querySelector('[data-colvy-bis-variants]').textContent) || []; } catch (e) { root._variants = []; } }
    return root._variants;
  }
  function chosenId(root) {
    var list = variants(root), has = function (id) { for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return true; return false; };
    // The theme's product form (in this block's section first) holds the id…
    var scope = root.closest('.shopify-section') || document;
    var inputs = scope.querySelectorAll('form[action*="/cart/add"] [name="id"]');
    if (!inputs.length && scope !== document) inputs = document.querySelectorAll('form[action*="/cart/add"] [name="id"]');
    for (var i = 0; i < inputs.length; i++) if (inputs[i].value && has(inputs[i].value)) return inputs[i].value;
    // …and most themes mirror it in ?variant=.
    var q = new URLSearchParams(location.search).get('variant');
    if (q && has(q)) return q;
    return root.getAttribute('data-variant');
  }

  function sync(root) {
    var id = chosenId(root), list = variants(root), v = null;
    for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) v = list[i];
    var changed = root.getAttribute('data-variant') !== String(id);
    root.setAttribute('data-variant', id);
    var show = preview(root) || (v ? !v.a : false);
    if (show && root.hidden) { root.hidden = false; root.classList.remove('cbis-reveal'); void root.offsetWidth; root.classList.add('cbis-reveal'); }
    else if (!show && !root.hidden) root.hidden = true;
    if (!show || (!changed && root.getAttribute('data-synced'))) return;
    root.setAttribute('data-synced', '1');
    err(root, '');
    // Already signed up for this one on this device?
    var j = null; try { j = JSON.parse(store('colvy_bis_joined_' + id) || 'null'); } catch (e) {}
    if (j && !preview(root)) showDone(root, j, false, false); else showAsk(root);
  }

  function init(root) {
    if (root.getAttribute('data-ready')) return;
    root.setAttribute('data-ready', '1');
    setCh(root, root.getAttribute('data-ch') || 'sms');
    // Prefill: what they typed last time, else their customer account.
    var last = {}; try { last = JSON.parse(store('colvy_bis_me') || '{}') || {}; } catch (e) {}
    last = { phone: last.phone || root.getAttribute('data-me-phone') || '', email: last.email || root.getAttribute('data-me-email') || '', name: last.name || root.getAttribute('data-me-name') || '' };
    if (!last.phone && last.email && root.querySelector('.colvy-bis__seg')) setCh(root, 'email');
    if (last.phone) { var p = root.querySelector('input[name=phone]'); if (p) p.value = last.phone; }
    if (last.email) { var m = root.querySelector('input[name=email]'); if (m) m.value = last.email; }
    if (last.name) { var n = root.querySelector('input[name=name]'); if (n) n.value = last.name; }
    sync(root);
  }

  function all() { return document.querySelectorAll('[data-colvy-bis]'); }
  function initAll() { var a = all(); for (var i = 0; i < a.length; i++) init(a[i]); }
  var pending = false;
  function syncAll() {
    if (pending) return; pending = true;
    // After the theme has updated its form / URL for the new variant.
    setTimeout(function () { pending = false; var a = all(); for (var i = 0; i < a.length; i++) if (a[i].getAttribute('data-ready')) sync(a[i]); }, 60);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.colvy-bis__seg button');
    if (b) { var root = b.closest('.colvy-bis'); err(root, ''); setCh(root, b.getAttribute('data-ch'), true); return; }
    var a = e.target.closest && e.target.closest('.colvy-bis__again');
    if (a) {
      var r = a.closest('.colvy-bis');
      forget('colvy_bis_joined_' + r.getAttribute('data-variant'));
      morph(r, function () { showAsk(r); });
      var inp = r.querySelector(r.getAttribute('data-ch') === 'email' ? 'input[name=email]' : 'input[name=phone]');
      if (inp) { inp.select(); inp.focus(); }
      return;
    }
    var btn = e.target.closest && e.target.closest('.colvy-bis__btn');
    if (btn) { e.preventDefault(); join(btn.closest('.colvy-bis__form')); }
  });
  // A <div>, not a <form>: the block can sit inside the theme's product form.
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
    var variant = root.getAttribute('data-variant');

    var finish = function (already) {
      store('colvy_bis_me', JSON.stringify({ phone: ch === 'sms' ? v : (form.querySelector('input[name=phone]') || {}).value || '', email: ch === 'email' ? v : (form.querySelector('input[name=email]') || {}).value || '', name: name }));
      if (!preview(root)) store('colvy_bis_joined_' + variant, JSON.stringify({ ch: ch, v: v }));
      root.querySelector('.colvy-bis__ask').classList.add('out');
      setTimeout(function () { root.classList.remove('is-busy'); showDone(root, { ch: ch, v: v }, already, true); }, 200);
    };

    root.classList.add('is-busy');
    if (preview(root)) { setTimeout(function () { finish(false); }, 700); return; } // theme editor: no sign-up

    var body = { product_id: root.getAttribute('data-product'), variant_id: variant, ch: ch, name: name, website: (form.querySelector('input[name=website]') || {}).value || '' };
    body[ch === 'email' ? 'email' : 'phone'] = v;
    fetch(root.getAttribute('data-proxy') + '/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (d && d.ok) return finish(!!d.duplicate);
        root.classList.remove('is-busy');
        err(root, (d && d.error) || 'Something went wrong — please try again.');
      })
      .catch(function () { root.classList.remove('is-busy'); err(root, 'No connection — please try again.'); });
  }

  // Variant changes: the picker's inputs, themes' own events, and the URL
  // (?variant= via history.replaceState) — whichever the theme uses.
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.closest && (t.closest('form[action*="/cart/add"]') || t.closest('variant-selects, variant-radios, variant-picker, [data-variant-picker], .product-form__input'))) syncAll();
  }, true);
  ['variant:change', 'variant:changed', 'variantChange', 'on:variant:change', 'theme:variant:change'].forEach(function (n) { document.addEventListener(n, syncAll); });
  window.addEventListener('popstate', syncAll);
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== 'function' || orig._colvy) return;
    var wrapped = function () { var r = orig.apply(this, arguments); syncAll(); return r; };
    wrapped._colvy = true;
    history[m] = wrapped;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll); else initAll();
  // Theme editor: blocks are re-rendered in place when settings change.
  document.addEventListener('shopify:section:load', initAll);
  document.addEventListener('shopify:block:select', initAll);
})();
