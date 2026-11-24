/* SteadyView EPUB renderer — runs inside the reader WebView (epub.js + JSZip). */
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

  var FONTS = {
    serif: "Georgia, 'Iowan Old Style', 'Noto Serif', 'Times New Roman', serif",
    sans: "-apple-system, 'SF Pro Text', 'Helvetica Neue', Roboto, 'Noto Sans', Arial, sans-serif",
    rounded: "ui-rounded, 'SF Pro Rounded', 'Avenir Next', 'Nunito', Verdana, sans-serif",
  };

  var chunks = [];
  var book = null;
  var rendition = null;
  var settings = null;
  var spineToc = []; // [{label, spineIndex}]
  var lastLoc = null;
  var reflowTimer = null;

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function viewer() {
    return document.getElementById('viewer');
  }

  function applyFrame(s) {
    document.documentElement.style.transition = 'background-color 250ms ease';
    document.documentElement.style.background = s.bg;
    document.body.style.background = s.bg;
    var v = viewer();
    v.style.top = s.insetTop + 'px';
    v.style.bottom = s.insetBottom + 'px';
    v.style.left = s.margin + 'px';
    v.style.right = s.margin + 'px';
  }

  function cssFor(s) {
    var font = FONTS[s.fontFamily];
    return [
      'html{-webkit-text-size-adjust:100%;touch-action:none;}',
      'html,body{background:transparent !important;color:' + s.fg + ' !important;}',
      'body{font-size:' + s.fontSize + '% !important;' + (font ? 'font-family:' + font + ' !important;' : '') + '}',
      'body *{color:inherit !important;background-color:transparent !important;border-color:' + s.muted + ' !important;' +
        (font ? 'font-family:inherit !important;' : '') + '}',
      'p,li,blockquote,dd,dt,div,span,td{line-height:' + s.lineHeight + ' !important;}',
      'p{text-align:' + (s.justify ? 'justify' : 'start') + ' !important;-webkit-hyphens:auto;hyphens:auto;}',
      'a,a *{color:' + s.link + ' !important;text-decoration:none !important;}',
      'img,svg,video{max-width:100% !important;height:auto !important;' + (s.dark ? 'filter:brightness(.85);' : '') + '}',
      '::selection{background:' + s.link + '44;}',
    ].join('\n');
  }

  function styleContents(contents) {
    var doc = contents.document;
    var el = doc.getElementById('sv-style');
    if (!el) {
      el = doc.createElement('style');
      el.id = 'sv-style';
      doc.head.appendChild(el);
    }
    el.textContent = cssFor(settings);
  }

  /*
   * Taps and swipes are read by a transparent layer over the whole page, not by
   * the book iframes: epub.js sandboxes those without allow-scripts, and WebKit
   * then drops every listener on them, so taps on the text never arrived.
   */
  var TAP_SLOP = 10; // px a finger may wander and still count as a tap
  var TAP_MAX_MS = 500;
  var EDGE_ZONE = 0.22; // left/right share of the width that turns the page
  var SWIPE_MIN = 40;
  var FLICK_SPEED = 0.3; // px/ms
  var SLIDE = 0.18; // share of the width a page slides while turning
  var OUT_MS = 120;
  var IN_MS = 200;
  var EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var turning = false;
  var queuedTurns = 0; // net taps made during a turn (+forward / -back), so none are lost

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function setViewer(x, opacity, ms) {
    var v = viewer();
    v.style.transition = ms ? 'transform ' + ms + 'ms ' + EASE + ', opacity ' + ms + 'ms ' + EASE : 'none';
    v.style.transform = x ? 'translate3d(' + x + 'px,0,0)' : '';
    v.style.opacity = String(opacity);
  }

  function isAtEdge(dir) {
    if (!lastLoc) return false;
    return dir > 0 ? !!lastLoc.atEnd : !!lastLoc.atStart;
  }

  function moveRendition(dir) {
    var step = Promise.resolve(dir > 0 ? rendition.next() : rendition.prev());
    // Never let a stuck epub.js promise freeze page turning.
    return Promise.race([step, wait(1500)]);
  }

  function bounce(dir) {
    if (reduceMotion) return;
    setViewer(-dir * 24, 1, OUT_MS);
    wait(OUT_MS).then(function () {
      setViewer(0, 1, IN_MS);
    });
  }

  /** dir: 1 = forward, -1 = back. Slides the page out, turns, slides the new one in. */
  function turn(dir) {
    if (!rendition) return;
    if (turning) {
      queuedTurns += dir;
      return;
    }
    if (isAtEdge(dir)) {
      bounce(dir);
      return;
    }
    if (reduceMotion) {
      moveRendition(dir);
      return;
    }
    turning = true;
    var shift = window.innerWidth * SLIDE;
    setViewer(-dir * shift, 0, OUT_MS);
    wait(OUT_MS)
      .then(function () {
        // epub.js measures on-screen positions to report the page; a transform
        // still in place would make it save the wrong one. Turn while invisible
        // and at rest, and slide in only after the new page is reported.
        setViewer(0, 0, 0);
        var reported = nextRelocated();
        return moveRendition(dir).then(function () {
          return Promise.race([reported, wait(300)]);
        });
      })
      .then(function () {
        setViewer(dir * shift, 0, 0);
        void viewer().offsetWidth; // commit the start position before animating in
        setViewer(0, 1, IN_MS);
        return wait(IN_MS);
      })
      .catch(function (e) {
        post({ t: 'error', message: 'Page turn failed: ' + (e && e.message ? e.message : e) });
        setViewer(0, 1, 0);
      })
      .then(function () {
        turning = false;
        if (!queuedTurns) return;
        var step = queuedTurns > 0 ? 1 : -1;
        queuedTurns -= step;
        turn(step);
      });
  }

  function next() {
    turn(1);
  }
  function prev() {
    turn(-1);
  }

  /** The book link under a screen point, if any. */
  function linkAt(x, y) {
    var frames = viewer().getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      var r = frames[i].getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      var doc = frames[i].contentDocument;
      var el = doc && doc.elementFromPoint(x - r.left, y - r.top);
      var a = el && el.closest ? el.closest('a[href]') : null;
      if (a) return a;
    }
    return null;
  }

  /* epub.js gives internal links an onclick that jumps inside the book. Calling it
     directly sidesteps the sandbox. External links have none and are ignored. */
  function followLink(x, y) {
    var a = linkAt(x, y);
    if (!a || typeof a.onclick !== 'function') return false;
    a.onclick();
    return true;
  }

  function onTap(x, y) {
    if (followLink(x, y)) return;
    var f = x / window.innerWidth;
    if (f < EDGE_ZONE) prev();
    else if (f > 1 - EDGE_ZONE) next();
    else post({ t: 'tap' });
  }

  /** The page follows the finger; it resists at the first and last page. */
  function drag(dx) {
    var resisted = isAtEdge(dx < 0 ? 1 : -1) ? dx * 0.25 : dx;
    setViewer(resisted, 1 - Math.min(1, Math.abs(resisted) / window.innerWidth) * 0.6, 0);
  }

  function release(dx, dt) {
    var fast = Math.abs(dx) / Math.max(dt, 1) > FLICK_SPEED;
    var far = Math.abs(dx) > window.innerWidth * 0.25;
    var dir = dx < 0 ? 1 : -1;
    if (Math.abs(dx) > SWIPE_MIN && (fast || far) && !isAtEdge(dir) && !turning) {
      turn(dir);
      return;
    }
    setViewer(0, 1, IN_MS);
  }

  function createTouchLayer() {
    var layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;z-index:10;';
    document.body.appendChild(layer);

    var start = null;
    layer.addEventListener('pointerdown', function (e) {
      if (start) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), dragging: false };
    });
    layer.addEventListener('pointermove', function (e) {
      if (!start || e.pointerId !== start.id || turning) return;
      var dx = e.clientX - start.x;
      var dy = e.clientY - start.y;
      if (!start.dragging && Math.abs(dx) > TAP_SLOP && Math.abs(dx) > Math.abs(dy)) start.dragging = true;
      if (start.dragging && !reduceMotion) drag(dx);
    });
    layer.addEventListener('pointercancel', function () {
      if (start && start.dragging) setViewer(0, 1, IN_MS);
      start = null;
    });
    layer.addEventListener('pointerup', function (e) {
      var s = start;
      start = null;
      if (!s || e.pointerId !== s.id) return;
      var dx = e.clientX - s.x;
      var dy = e.clientY - s.y;
      var dt = Date.now() - s.t;
      if (s.dragging) {
        release(dx, dt);
        return;
      }
      if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP || dt > TAP_MAX_MS) return; // long press
      onTap(e.clientX, e.clientY);
    });
  }

  function flattenToc(items, depth, out) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var spineItem = book.spine.get(it.href);
      out.push({
        label: String(it.label || '').trim(),
        href: it.href,
        depth: depth,
        spineIndex: spineItem ? spineItem.index : -1,
      });
      if (it.subitems && it.subitems.length && depth < 2) flattenToc(it.subitems, depth + 1, out);
    }
    return out;
  }

  function chapterFor(index) {
    var label = '';
    for (var i = 0; i < spineToc.length; i++) {
      if (spineToc[i].spineIndex >= 0 && spineToc[i].spineIndex <= index) label = spineToc[i].label;
    }
    return label;
  }

  function percentFor(cfi) {
    try {
      if (book.locations && book.locations.length && book.locations.length() > 0) {
        return book.locations.percentageFromCfi(cfi);
      }
    } catch (e) {}
    return null;
  }

  var relocatedWaiters = [];

  function nextRelocated() {
    return new Promise(function (resolve) {
      relocatedWaiters.push(resolve);
    });
  }

  function reportLocation(loc) {
    if (!loc || !loc.start) return;
    var waiters = relocatedWaiters;
    relocatedWaiters = [];
    waiters.forEach(function (resolve) {
      resolve();
    });
    lastLoc = loc;
    var start = loc.start;
    var displayed = start.displayed || { page: 1, total: 1 };
    post({
      t: 'relocated',
      location: start.cfi,
      percent: percentFor(start.cfi),
      chapter: chapterFor(start.index),
      pageInChapter: displayed.page,
      pagesInChapter: displayed.total,
      atStart: !!loc.atStart,
      atEnd: !!loc.atEnd,
    });
  }

  // Only these change where text breaks; anything else (theme colours) restyles in place.
  var LAYOUT_KEYS = ['fontSize', 'fontFamily', 'lineHeight', 'justify', 'margin', 'insetTop', 'insetBottom'];

  function changesLayout(before, after) {
    if (!before) return true;
    for (var i = 0; i < LAYOUT_KEYS.length; i++) {
      if (before[LAYOUT_KEYS[i]] !== after[LAYOUT_KEYS[i]]) return true;
    }
    return false;
  }

  function restyle() {
    if (rendition) rendition.getContents().forEach(styleContents);
  }

  /** Re-paginates at the current spot, fading so the reader never sees a blank flash. */
  function reflow() {
    clearTimeout(reflowTimer);
    if (rendition && !reduceMotion) setViewer(0, 0, OUT_MS);
    reflowTimer = setTimeout(function () {
      if (!rendition) return;
      var cfi = lastLoc && lastLoc.start ? lastLoc.start.cfi : undefined;
      restyle();
      try {
        rendition.resize();
      } catch (e) {}
      if (rendition.manager && rendition.manager.clear) rendition.manager.clear();
      Promise.resolve(rendition.display(cfi))
        .catch(function (e) {
          post({ t: 'error', message: 'Could not re-layout the page: ' + (e && e.message ? e.message : e) });
        })
        .then(function () {
          setViewer(0, 1, reduceMotion ? 0 : IN_MS);
        });
    }, 120);
  }

  function coverDataUrl() {
    return book.coverUrl().then(function (url) {
      if (!url) return null;
      return fetch(url)
        .then(function (r) {
          return r.blob();
        })
        .then(function (blob) {
          return new Promise(function (resolve) {
            var fr = new FileReader();
            fr.onload = function () {
              resolve(fr.result);
            };
            fr.onerror = function () {
              resolve(null);
            };
            fr.readAsDataURL(blob);
          });
        });
    });
  }

  function open(msg) {
    settings = msg.settings;
    applyFrame(settings);
    var bytes = b64ToBytes(chunks.join(''));
    chunks = [];

    book = window.ePub(bytes.buffer);
    rendition = book.renderTo(viewer(), {
      width: '100%',
      height: '100%',
      flow: 'paginated',
      spread: 'none',
      manager: 'default',
      allowScriptedContent: false,
    });
    rendition.hooks.content.register(styleContents);
    rendition.on('relocated', reportLocation);
    rendition.on('displayError', function (e) {
      post({ t: 'error', message: 'Display error: ' + e });
    });

    book.ready
      .then(function () {
        return Promise.all([book.loaded.navigation, book.loaded.metadata]);
      })
      .then(function (res) {
        var nav = res[0];
        var meta = res[1] || {};
        spineToc = flattenToc((nav && nav.toc) || [], 0, []);
        post({
          t: 'loaded',
          kind: 'epub',
          toc: spineToc.map(function (x) {
            return { label: x.label, target: { href: x.href }, depth: x.depth, spineIndex: x.spineIndex };
          }),
          meta: { title: meta.title || null, author: meta.creator || null },
        });
        return rendition.display(msg.location || undefined).catch(function () {
          return rendition.display();
        });
      })
      .then(function () {
        if (msg.needCover) {
          coverDataUrl()
            .then(function (d) {
              if (d) post({ t: 'cover', dataUrl: d });
            })
            .catch(function () {});
        }
        if (msg.locations) {
          try {
            book.locations.load(msg.locations);
            if (lastLoc) reportLocation(lastLoc);
            return;
          } catch (e) {}
        }
        return book.locations.generate(1200).then(function () {
          post({ t: 'locations', data: book.locations.save() });
          if (lastLoc) reportLocation(lastLoc);
        });
      })
      .catch(function (e) {
        post({ t: 'error', message: 'Could not open this EPUB: ' + (e && e.message ? e.message : e) });
      });
  }

  function goto(target) {
    if (!rendition || !target) return;
    if (target.cfi || target.href) {
      rendition.display(target.cfi || target.href);
    } else if (typeof target.percent === 'number') {
      var p = Math.max(0, Math.min(1, target.percent));
      if (book.locations && book.locations.length && book.locations.length() > 0) {
        rendition.display(book.locations.cfiFromPercentage(p));
      } else {
        var idx = Math.min(book.spine.length - 1, Math.floor(p * book.spine.length));
        rendition.display(idx);
      }
    }
  }

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
          var before = settings;
          settings = msg.settings;
          applyFrame(settings);
          if (changesLayout(before, settings)) reflow();
          else restyle();
          break;
        }
        case 'goto':
          goto(msg.target);
          break;
        case 'next':
          next();
          break;
        case 'prev':
          prev();
          break;
      }
    },
  };

  window.addEventListener('resize', function () {
    if (rendition) reflow();
  });

  createTouchLayer();

  post({ t: 'ready' });
})();
