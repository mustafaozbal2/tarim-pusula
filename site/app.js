(function () {
  'use strict';
  var $ = function (s, r) {
    return (r || document).querySelector(s);
  };
  var $$ = function (s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  };

  // Ücretsiz sunucu 15 dk boşta kalınca uyur; site açılırken uyandır ki uygulama ilk açılışta beklemesin.
  try {
    fetch('https://tarim-pusula-api.onrender.com/health', { mode: 'no-cors', cache: 'no-store' });
  } catch (e) {
    /* önemsiz */
  }

  // Üst çubuk: kaydırınca dolgu
  var nav = $('#nav');
  var onScroll = function () {
    nav.classList.toggle('solid', window.scrollY > 40);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Mobil menü
  var burger = $('#burger'),
    links = $('#links');
  function menu(open) {
    links.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Menüyü kapat' : 'Menüyü aç');
    if (open) nav.classList.add('solid');
    else onScroll();
  }
  burger.addEventListener('click', function () {
    menu(!links.classList.contains('open'));
  });
  $$('a, button', links).forEach(function (el) {
    el.addEventListener('click', function () {
      menu(false);
    });
  });

  // Arka plan geçişi
  var slides = $$('.slide'),
    si = 0;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce && slides.length > 1) {
    setInterval(function () {
      slides[si].classList.remove('on');
      si = (si + 1) % slides.length;
      // animasyonu yeniden başlat
      slides[si].style.animation = 'none';
      void slides[si].offsetWidth;
      slides[si].style.animation = '';
      slides[si].classList.add('on');
    }, 6500);
  }

  // Görününce açılma + sayaç
  function count(el) {
    var to = Number(el.dataset.count),
      t0 = null,
      dur = 1400;
    if (reduce) {
      el.textContent = to.toLocaleString('tr-TR');
      return;
    }
    (function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1),
        e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(to * e).toLocaleString('tr-TR');
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          $$('[data-count]', e.target).forEach(count);
          io.unobserve(e.target);
        });
      },
      { threshold: 0.15 },
    );
    $$('.reveal').forEach(function (el) {
      io.observe(el);
    });
    var so = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) {
            $$('[data-count]', e.target).forEach(count);
            so.unobserve(e.target);
          }
        });
      },
      { threshold: 0.4 },
    );
    so.observe($('.stats'));
  } else {
    $$('.reveal').forEach(function (el) {
      el.classList.add('in');
    });
    $$('[data-count]').forEach(count);
  }

  // Cihaza göre indirme notu
  var ua = navigator.userAgent || '';
  var note = $('#cihaz-not');
  if (/iPhone|iPad|iPod/i.test(ua)) {
    note.textContent =
      'iPhone kullanıyorsunuz: mağaza uygulaması yalnız Android içindir. “Tarayıcıda dene” ile web sürümünü açabilirsiniz.';
    $('#ana-indir').removeAttribute('download');
    $('#ana-indir').setAttribute('href', 'https://tarim-pusula.onrender.com');
    $('#ana-indir').lastChild.textContent = ' Web sürümünü aç';
  } else if (!/Android/i.test(ua)) {
    note.textContent =
      'Bilgisayardasınız: APK dosyasını Android telefonunuza indirin ya da bu bağlantıyı telefonunuzda açın.';
  }

  // Geri bildirim kanalları (yalnız tanımlıysa)
  var fb = $('#fb-actions'),
    cfg = window.SITE || {};
  var text = encodeURIComponent('Tarım Pusula deneme sürümü geri bildirimi:\n');
  if (cfg.whatsapp) {
    fb.insertAdjacentHTML(
      'beforeend',
      '<a class="btn btn-dark" target="_blank" rel="noopener" href="https://wa.me/' +
        cfg.whatsapp +
        '?text=' +
        text +
        '">WhatsApp ile yaz</a>',
    );
  }
  if (cfg.eposta) {
    fb.insertAdjacentHTML(
      'beforeend',
      '<a class="btn btn-dark" href="mailto:' +
        cfg.eposta +
        '?subject=Tarım Pusula geri bildirim&body=' +
        text +
        '">E-posta ile yaz</a>',
    );
  }
  if (!fb.children.length)
    fb.innerHTML =
      '<p class="muted">Bu deneme sürümünü size gönderen kişiye doğrudan iletebilirsiniz.</p>';

  // Üstten açılan pencereler
  var drop = $('#drop'),
    body = $('#drop-body'),
    panel = $('.drop-panel', drop),
    lastFocus = null;
  function open(name) {
    var t = document.getElementById('t-' + name);
    if (!t) return;
    lastFocus = document.activeElement;
    body.innerHTML = '';
    body.appendChild(t.content.cloneNode(true));
    if (name === 'atif') fillAtif();
    drop.classList.add('open');
    drop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    panel.scrollTop = 0;
    setTimeout(function () {
      panel.focus();
    }, 60);
  }
  function close() {
    drop.classList.remove('open');
    drop.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (o) {
      e.preventDefault();
      open(o.getAttribute('data-open'));
      return;
    }
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drop.classList.contains('open')) close();
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fillAtif() {
    fetch('img/KAYNAKLAR.json')
      .then(function (r) {
        return r.json();
      })
      .then(function (k) {
        var ul = $('#atif-list');
        if (!ul) return;
        ul.innerHTML = k.gorseller
          .map(function (g) {
            var ad = g.eser.replace(/^File:/, '');
            return (
              '<li>' +
              esc(g.yazar || 'Yazar bilgisi sayfada') +
              ' — <a href="' +
              esc(g.sayfa) +
              '" target="_blank" rel="noopener">' +
              esc(ad) +
              '</a> (' +
              esc(g.lisans) +
              ')</li>'
            );
          })
          .join('');
      })
      .catch(function () {
        var ul = $('#atif-list');
        if (ul) ul.innerHTML = '<li>Liste yüklenemedi.</li>';
      });
  }
})();
