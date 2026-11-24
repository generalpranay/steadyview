/* SteadyView PDF renderer — runs inside the reader WebView (pdf.js 3.x). */
(function () {
  'use strict';

  var RN = window.ReactNativeWebView;
  function post(msg) {
    if (RN) RN.postMessage(JSON.stringify(msg));
    else if (window.__svOutbox) window.__svOutbox.push(msg);
  }
  window.onerror = function (m) {
    post({ t: 'error', message: String(m) });
  };

  // pdf.worker is loaded as a normal script, which defines window.pdfjsWorker;
  // pdf.js then parses on the main thread. Real Web Workers from blob: URLs
  // are blocked in some WebView origins (e.g. Android html sources).
  var pdfjsLib = window.pdfjsLib;
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'about:blank';

  var MAX_RENDERED = 10;
  var GAP = 12;
  var chunks = [];
  var pdf = null;
  var settings = null;
  var pages = []; // {el, canvas, rendered, task, aspect}
  var renderedOrder = [];
  var observer = null;
  var current = 1;
  var lastScrollAt = 0;
  var reportTimer = null;

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function container() {
    return document.getElementById('pages');
  }

  function pageWidth() {
    return Math.max(100, window.innerWidth - 2 * settings.pdfMargin);
  }

  function applySettings(s) {
    document.documentElement.style.background = s.bg;
    document.body.style.background = s.bg;
    var c = container();
    c.style.paddingTop = s.insetTop + 'px';
    c.style.paddingBottom = s.insetBottom + 'px';
    var style = document.getElementById('sv-style');
    style.textContent =
      '.page{width:' + pageWidth() + 'px;margin:0 auto ' + GAP + 'px;}' +
      '.page canvas{filter:' + (s.pdfFilter || 'none') + ';}' +
      '.page{background:' + (s.dark ? '#1b1b1b' : '#fff') + ';}';
    for (var i = 0; i < pages.length; i++) {
      pages[i].el.style.height = Math.round(pageWidth() * pages[i].aspect) + 'px';
    }
  }

  function release(p) {
    if (p.task) {
      try {
        p.task.cancel();
      } catch (e) {}
      p.task = null;
    }
    if (p.canvas) {
      p.canvas.width = 0;
      p.canvas.height = 0;
      p.canvas.remove();
      p.canvas = null;
    }
    p.rendered = false;
  }

  function renderPage(i) {
    var p = pages[i];
    if (!p || p.rendered) return;
    p.rendered = true;
    renderedOrder.push(i);
    while (renderedOrder.length > MAX_RENDERED) {
      // Release the rendered page farthest from the current one.
      var far = 0;
      for (var k = 1; k < renderedOrder.length; k++) {
        if (Math.abs(renderedOrder[k] - (current - 1)) > Math.abs(renderedOrder[far] - (current - 1))) far = k;
      }
      var idx = renderedOrder.splice(far, 1)[0];
      release(pages[idx]);
    }
    pdf.getPage(i + 1).then(function (page) {
      if (!p.rendered) return;
      var base = page.getViewport({ scale: 1 });
      p.aspect = base.height / base.width;
      var w = pageWidth();
      p.el.style.height = Math.round(w * p.aspect) + 'px';
      var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      var vp = page.getViewport({ scale: (w / base.width) * dpr });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      p.canvas = canvas;
      p.el.appendChild(canvas);
      p.task = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
      p.task.promise.then(
        function () {
          p.task = null;
        },
        function () {}
      );
    });
  }

  function buildPages(aspect) {
    var c = container();
    c.innerHTML = '';
    pages = [];
    for (var i = 0; i < pdf.numPages; i++) {
      var el = document.createElement('div');
      el.className = 'page';
      el.setAttribute('data-index', String(i));
      el.style.height = Math.round(pageWidth() * aspect) + 'px';
      c.appendChild(el);
      pages.push({ el: el, canvas: null, rendered: false, task: null, aspect: aspect });
    }
    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) renderPage(Number(en.target.getAttribute('data-index')));
        });
      },
      { rootMargin: '150% 0px 150% 0px' }
    );
    pages.forEach(function (p) {
      observer.observe(p.el);
    });
  }

  function currentPage() {
    var mid = window.scrollY + window.innerHeight * 0.4;
    var lo = 0;
    var hi = pages.length - 1;
    while (lo < hi) {
      var m = (lo + hi + 1) >> 1;
      if (pages[m].el.offsetTop <= mid) lo = m;
      else hi = m - 1;
    }
    return lo + 1;
  }

  function report() {
    if (!pdf) return;
    current = currentPage();
    var total = pdf.numPages;
    post({
      t: 'relocated',
      location: String(current),
      page: current,
      totalPages: total,
      percent: total > 1 ? (current - 1) / (total - 1) : 1,
      atEnd: current === total,
    });
  }

  function gotoPage(n) {
    var i = Math.max(1, Math.min(pdf.numPages, n)) - 1;
    var top = pages[i].el.offsetTop - settings.insetTop;
    window.scrollTo(0, Math.max(0, top));
    report();
  }

  function resolveOutline(items, depth, out) {
    var jobs = [];
    (items || []).forEach(function (it) {
      var entry = { label: String(it.title || '').trim(), target: { page: 1 }, depth: depth };
      out.push(entry);
      var dest = it.dest;
      var job = (typeof dest === 'string' ? pdf.getDestination(dest) : Promise.resolve(dest))
        .then(function (d) {
          if (!d || !d[0]) return;
          return pdf.getPageIndex(d[0]).then(function (idx) {
            entry.target = { page: idx + 1 };
          });
        })
        .catch(function () {});
      jobs.push(job);
      if (it.items && it.items.length && depth < 2) jobs.push(resolveOutline(it.items, depth + 1, out));
    });
    return Promise.all(jobs).then(function () {
      return out;
    });
  }

  function makeCover() {
    return pdf.getPage(1).then(function (page) {
      var base = page.getViewport({ scale: 1 });
      var vp = page.getViewport({ scale: 420 / base.width });
      var canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
        return canvas.toDataURL('image/jpeg', 0.82);
      });
    });
  }

  function open(msg) {
    settings = msg.settings;
    applySettings(settings);
    var bytes = b64ToBytes(chunks.join(''));
    chunks = [];
    pdfjsLib
      .getDocument({ data: bytes, isEvalSupported: false })
      .promise.then(function (doc) {
        pdf = doc;
        return pdf.getPage(1);
      })
      .then(function (p1) {
        var base = p1.getViewport({ scale: 1 });
        buildPages(base.height / base.width);
        applySettings(settings);
        var start = parseInt(msg.location || '1', 10) || 1;
        gotoPage(start);
        return Promise.all([
          pdf.getMetadata().catch(function () {
            return null;
          }),
          pdf.getOutline().catch(function () {
            return null;
          }),
        ]);
      })
      .then(function (res) {
        var info = (res[0] && res[0].info) || {};
        return resolveOutline(res[1] || [], 0, []).then(function (toc) {
          post({
            t: 'loaded',
            kind: 'pdf',
            toc: toc,
            totalPages: pdf.numPages,
            meta: { title: info.Title || null, author: info.Author || null },
          });
          report();
          if (msg.needCover) {
            makeCover()
              .then(function (d) {
                post({ t: 'cover', dataUrl: d });
              })
              .catch(function () {});
          }
        });
      })
      .catch(function (e) {
        post({ t: 'error', message: 'Could not open this PDF: ' + (e && e.message ? e.message : e) });
      });
  }

  window.addEventListener(
    'scroll',
    function () {
      lastScrollAt = Date.now();
      clearTimeout(reportTimer);
      reportTimer = setTimeout(report, 120);
    },
    { passive: true }
  );

  document.addEventListener('click', function () {
    if (Date.now() - lastScrollAt > 250) post({ t: 'tap' });
  });

  window.addEventListener('resize', function () {
    if (!pdf || !settings) return;
    var keep = current;
    applySettings(settings);
    pages.forEach(release);
    renderedOrder = [];
    gotoPage(keep);
  });

  window.SV = {
    receive: function (msg) {
      switch (msg.t) {
        case 'chunk':
          chunks.push(msg.data);
          break;
        case 'open':
          open(msg);
          break;
        case 'settings': {
          var keep = current;
          settings = msg.settings;
          applySettings(settings);
          if (pdf) gotoPage(keep);
          break;
        }
        case 'goto':
          if (pdf && msg.target) {
            if (typeof msg.target.page === 'number') gotoPage(msg.target.page);
            else if (typeof msg.target.percent === 'number')
              gotoPage(Math.round(msg.target.percent * (pdf.numPages - 1)) + 1);
          }
          break;
        case 'next':
          if (pdf) gotoPage(current + 1);
          break;
        case 'prev':
          if (pdf) gotoPage(current - 1);
          break;
      }
    },
  };

  post({ t: 'ready' });
})();
