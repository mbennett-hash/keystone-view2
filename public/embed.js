/**
 * Keystone View — embed runtime.
 *
 * This is the script a published chart's snippet points at, in the same
 * div+script+noscript pattern Flourish uses:
 *
 *   <div class="ki-chart" data-src="chart/<slug>">
 *     <script src="https://<this-app>/embed.js"></script>
 *     <noscript>...fallback text...</noscript>
 *   </div>
 *
 * On load it finds every `.ki-chart[data-src]` on the page, fetches that
 * chart's saved config from THIS app's own /api/charts/<slug> (not the
 * host page's origin — a HubSpot page embedding this has no such API),
 * and renders it with the same ChartLib.buildOption() the editor used to
 * preview it, so what a site visitor sees always matches what Mark saw.
 *
 * No build step, no bundler: everything it needs (its own origin,
 * echarts, chart-lib.js) it works out or loads itself at runtime, because
 * it has to run standing alone on someone else's page.
 */
(function () {
  // The URL this very script was loaded from tells us our own origin —
  // that's where /api/charts, echarts.min.js and chart-lib.js all live,
  // regardless of what site is embedding us.
  var thisScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  var ORIGIN = new URL(thisScript.src, window.location.href).origin;

  var loadedScripts = {};
  function loadScript(src) {
    if (loadedScripts[src]) return loadedScripts[src];
    loadedScripts[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
    return loadedScripts[src];
  }

  var CARD_CSS = '\
.ki-chart-card{font-family:Poppins,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fff;border-radius:4px;box-shadow:0 1px 3px rgba(20,20,30,.06),0 8px 24px rgba(20,20,30,.05);width:100%;max-width:860px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}\
.ki-chart-card *{box-sizing:border-box}\
.ki-cc-header{padding:24px 24px 0}\
.ki-cc-title{font-weight:700;font-size:18px;line-height:1.35;margin:0}\
.ki-cc-subtitle{font-weight:500;font-size:13px;margin:4px 0 0}\
.ki-cc-caption{font-weight:500;font-size:11px;letter-spacing:.02em;text-transform:uppercase;margin:10px 0 0}\
.ki-cc-body{padding:18px 22px 0;flex:1;min-height:280px}\
.ki-cc-legend{display:flex;flex-wrap:wrap;gap:6px 18px;padding:10px 22px 2px;justify-content:center}\
.ki-cc-legend-item{display:inline-flex;align-items:center;gap:6px;border:none;background:none;padding:2px 0;cursor:pointer;font-family:inherit;font-size:11px;line-height:1.3;opacity:1;transition:opacity .15s ease}\
.ki-cc-legend-item.is-off{opacity:.4}\
.ki-cc-legend-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}\
.ki-cc-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 24px 22px;border-top:1px solid #eef0f3;margin-top:10px}\
.ki-cc-source{font-size:11px;line-height:1.5}\
.ki-cc-source a{color:inherit;text-decoration:underline;text-underline-offset:2px}\
.ki-cc-source .note{display:block;opacity:.75;margin-top:2px}\
.ki-cc-logo{height:20px;max-width:130px;object-fit:contain;flex-shrink:0;display:block}\
.ki-chart-error{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;color:#8b8f99;padding:16px;border:1px dashed #d8dbe2;border-radius:8px}\
';

  function injectCssOnce() {
    if (document.getElementById('ki-chart-styles')) return;
    var style = document.createElement('style');
    style.id = 'ki-chart-styles';
    style.textContent = CARD_CSS;
    document.head.appendChild(style);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function slugFromDataSrc(dataSrc) {
    // data-src="chart/<slug>" — same shape the editor writes into the
    // embed snippet.
    var m = /^chart\/(.+)$/.exec(String(dataSrc || '').trim());
    return m ? m[1] : null;
  }

  function renderChart(container, state) {
    var t = window.ChartLib.THEMES[state.theme];
    var visIdx = window.ChartLib.visibleSeriesIndices(state);
    var colors = window.ChartLib.seriesColors(state);

    container.innerHTML =
      '<div class="ki-chart-card">' +
        '<div class="ki-cc-header">' +
          '<p class="ki-cc-title"></p>' +
          '<p class="ki-cc-subtitle"></p>' +
          '<p class="ki-cc-caption"></p>' +
        '</div>' +
        '<div class="ki-cc-body"></div>' +
        '<div class="ki-cc-legend"></div>' +
        '<div class="ki-cc-footer">' +
          '<div class="ki-cc-source"></div>' +
          '<div class="ki-cc-logo-wrap"></div>' +
        '</div>' +
      '</div>';

    var card = container.querySelector('.ki-chart-card');
    var titleEl = card.querySelector('.ki-cc-title');
    var subtitleEl = card.querySelector('.ki-cc-subtitle');
    var captionEl = card.querySelector('.ki-cc-caption');
    var bodyEl = card.querySelector('.ki-cc-body');
    var legendEl = card.querySelector('.ki-cc-legend');
    var sourceEl = card.querySelector('.ki-cc-source');
    var logoWrap = card.querySelector('.ki-cc-logo-wrap');

    titleEl.textContent = state.title;
    titleEl.style.color = t.textPrimary;
    titleEl.style.fontSize = state.fonts.title + 'px';
    titleEl.style.fontWeight = state.titleBold ? '700' : '500';

    subtitleEl.textContent = state.subtitle;
    subtitleEl.style.color = t.textSecondary;
    subtitleEl.style.fontSize = state.fonts.subtitle + 'px';

    if (state.chartType === 'treemap') {
      var valueIdx = visIdx[0] != null ? visIdx[0] : 0;
      captionEl.textContent = 'Sized by: ' + (state.seriesNames[valueIdx] || 'Value');
      captionEl.style.color = t.textSecondary;
      captionEl.style.display = '';
    } else {
      captionEl.textContent = '';
      captionEl.style.display = 'none';
    }

    var sourceHtml = state.sourceLabel
      ? (state.sourceUrl
          ? '<a href="' + escapeHtml(state.sourceUrl) + '" target="_blank" rel="noopener" style="color:' + t.textSecondary + '">' + escapeHtml(state.sourceLabel) + '</a>'
          : escapeHtml(state.sourceLabel))
      : '';
    if (state.sourceNote) sourceHtml += '<span class="note">' + escapeHtml(state.sourceNote) + '</span>';
    sourceEl.innerHTML = sourceHtml;
    sourceEl.style.color = t.textSecondary;
    sourceEl.style.fontSize = state.fonts.footer + 'px';

    logoWrap.innerHTML = '<img class="ki-cc-logo" src="' + ORIGIN + '/' + t.logo + '" alt="' + escapeHtml(t.logoAlt) + '">';

    // Viewer-facing legend click-to-hide state for THIS chart instance —
    // see the comment on ChartLib.buildOption for why this has to be
    // threaded back in on every render rather than left to echarts'
    // internal (and unreliable, across setOption(_, true) calls) tracking.
    var legendSelected = {};

    var chart = window.echarts.init(bodyEl, null, { renderer: 'svg' });
    chart.setOption(window.ChartLib.buildOption(state, legendSelected));

    // Legend: same HTML-flow-below-canvas approach as the editor, for the
    // same reason (an echarts-internal legend can't reserve the right
    // amount of space at every width a host page might squeeze this into).
    if (state.chartType === 'treemap') {
      var eligible = state.showLegend && state.categories.length > 1;
      if (eligible) {
        legendEl.innerHTML = state.categories.map(function (cat, ri) {
          return '<button type="button" class="ki-cc-legend-item" style="color:' + t.textSecondary + '">' +
            '<span class="ki-cc-legend-dot" style="background:' + t.series[ri % t.series.length] + '"></span>' + escapeHtml(cat) +
            '</button>';
        }).join('');
        Array.prototype.forEach.call(legendEl.querySelectorAll('.ki-cc-legend-item'), function (btn, ri) {
          btn.addEventListener('mouseenter', function () { chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: ri }); });
          btn.addEventListener('mouseleave', function () { chart.dispatchAction({ type: 'downplay', seriesIndex: 0, dataIndex: ri }); });
        });
      }
    } else if (state.showLegend && visIdx.length > 1) {
      legendEl.innerHTML = visIdx.map(function (i) {
        var name = state.seriesNames[i];
        var off = legendSelected[name] === false;
        return '<button type="button" class="ki-cc-legend-item' + (off ? ' is-off' : '') + '" data-series="' + i + '" style="color:' + t.textSecondary + '">' +
          '<span class="ki-cc-legend-dot" style="background:' + colors[i] + '"></span>' + escapeHtml(name) +
          '</button>';
      }).join('');
      Array.prototype.forEach.call(legendEl.querySelectorAll('.ki-cc-legend-item'), function (btn) {
        btn.addEventListener('click', function () {
          var name = state.seriesNames[+btn.dataset.series];
          legendSelected[name] = legendSelected[name] === false ? true : false;
          chart.setOption(window.ChartLib.buildOption(state, legendSelected), true);
          btn.classList.toggle('is-off', legendSelected[name] === false);
        });
      });
    }

    new ResizeObserver(function () { chart.resize(); }).observe(card);
  }

  function renderError(container, message) {
    container.innerHTML = '<div class="ki-chart-error">Keystone View: ' + escapeHtml(message) + '</div>';
  }

  function renderInto(container) {
    var slug = slugFromDataSrc(container.getAttribute('data-src'));
    if (!slug) return renderError(container, 'missing or malformed data-src');

    fetch(ORIGIN + '/api/charts/' + encodeURIComponent(slug), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error(res.status === 404 ? 'chart "' + slug + '" not found — has it been published?' : 'server responded ' + res.status);
        return res.json();
      })
      .then(function (state) {
        injectCssOnce();
        return Promise.all([
          loadScript(ORIGIN + '/echarts.min.js'),
          loadScript(ORIGIN + '/chart-lib.js'),
        ]).then(function () { renderChart(container, state); });
      })
      .catch(function (err) { renderError(container, err.message); });
  }

  function init() {
    var containers = document.querySelectorAll('.ki-chart[data-src]');
    Array.prototype.forEach.call(containers, renderInto);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
