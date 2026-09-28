/**
 * Keystone View — shared chart-rendering logic.
 *
 * Loaded by BOTH editor.html (the interactive tool) and embed.js (the
 * runtime that renders a published chart on an external page), so the
 * published chart is always built by the exact same code the editor
 * previewed it with — no drift between "what Mark saw" and "what a site
 * visitor sees". Everything here is a pure function of a `state` object
 * (the same shape the editor's data grid, brand toggle, and axis/legend
 * controls write into); nothing here reads or writes globals.
 *
 * Exposed as `window.ChartLib`.
 */
(function (global) {
  const THEMES = {
    keg: {
      name: 'KEG',
      font: 'Poppins',
      textPrimary: '#103B5F',
      textSecondary: '#4A6478',
      surface: '#ffffff',
      grid: '#E7ECF2',
      accent: '#6186FF',
      series: ['#01B979', '#6186FF', '#FF6181', '#5F36F5', '#FF6C4F'],
      logo: 'keg-logo.png',
      logoAlt: 'Keystone Education Group',
    },
    fau: {
      name: 'FAU',
      font: 'Poppins',
      textPrimary: '#2A1147',
      textSecondary: '#5B4A78',
      surface: '#ffffff',
      grid: '#ECE7F7',
      accent: '#7A3BFF',
      series: ['#7A3BFF', '#0AAA87', '#2E2EE0', '#B794FF', '#067A5E'],
      logo: 'fau-logo.png',
      logoAlt: 'Find A University, a Keystone company',
    },
  };

  function fmtNum(state, v) {
    const n = Number(v).toFixed(state.fmt.decimals);
    return `${state.fmt.prefix}${n}${state.fmt.suffix}`;
  }

  function seriesColor(state, i) {
    if (state.seriesColors[i]) return state.seriesColors[i];
    const t = THEMES[state.theme];
    return t.series[i % t.series.length];
  }

  function seriesColors(state) {
    return state.seriesNames.map((_, i) => seriesColor(state, i));
  }

  // Indices of series the user has left included (checkbox in the data
  // grid). Excluded series never reach echarts at all — a full removal,
  // distinct from the legend's own click-to-filter (which only hides an
  // already-included series on the *published* chart).
  function visibleSeriesIndices(state) {
    const idx = state.seriesNames.map((_, i) => i).filter(i => state.seriesVisible[i] !== false);
    return idx.length ? idx : state.seriesNames.map((_, i) => i); // never render zero series
  }

  // A blank min/max field means "let echarts pick" (its usual auto-scaled
  // range); a typed value pins that bound. Either can be set on its own.
  function yAxisRange(state) {
    const out = {};
    if (state.yAxisMin !== '' && state.yAxisMin != null && !isNaN(+state.yAxisMin)) out.min = +state.yAxisMin;
    if (state.yAxisMax !== '' && state.yAxisMax != null && !isNaN(+state.yAxisMax)) out.max = +state.yAxisMax;
    return out;
  }

  // Best-effort numeric X for scatter: parse a leading number out of the
  // category label (e.g. "18–24" -> 18); fall back to row position so a
  // non-numeric category still plots somewhere sensible.
  function parseXValue(cat, rowIndex) {
    const n = parseFloat(String(cat).replace(/[–—]/g, '-'));
    return isNaN(n) ? rowIndex : n;
  }

  // `legendSelected` is an optional { [seriesName]: boolean } map for the
  // viewer-facing legend click-to-hide toggle — distinct from
  // state.seriesVisible (the editor's own "exclude this series entirely"
  // control, which is baked into the published chart). It's runtime-only:
  // never saved, reset on page load. It's a parameter rather than part of
  // `state` specifically so re-rendering after a toggle (chart.setOption
  // with notMerge:true, which ECharts requires for most of this app's
  // other option changes) doesn't silently reset it — every caller must
  // pass its current selection back in on every render, which is what
  // keeps it from being lost.
  function buildOption(state, legendSelected) {
    const t = THEMES[state.theme];
    const colors = seriesColors(state);
    const visIdx = visibleSeriesIndices(state);
    const isStacked = state.chartType === 'column_stacked';
    const isLine = state.chartType === 'line';
    const isArea = state.chartType === 'area';
    const isScatter = state.chartType === 'scatter';
    const isTreemap = state.chartType === 'treemap';
    const isLineFamily = isLine || isArea;

    const axisFont = state.fonts.axis;
    const baseAxis = {
      axisLine: { lineStyle: { color: t.grid } },
      axisTick: { show: false },
      axisLabel: { color: t.textSecondary, fontFamily: t.font, fontSize: axisFont },
      splitLine: { lineStyle: { color: t.grid, width: 1, type: 'solid' } },
    };

    if (isTreemap) {
      // Treemap has no series concept in this data model — one box per
      // category, sized by the first INCLUDED series' value. Colour cycles
      // the theme's validated order per category, not per series.
      const valueIdx = visIdx[0] ?? 0;
      const data = state.categories.map((cat, ri) => ({
        name: cat,
        value: state.data[ri]?.[valueIdx] ?? 0,
        itemStyle: { color: t.series[ri % t.series.length] },
      }));
      return {
        backgroundColor: 'transparent',
        textStyle: { fontFamily: t.font },
        tooltip: {
          backgroundColor: '#fff', borderColor: t.grid,
          textStyle: { color: t.textPrimary, fontFamily: t.font, fontSize: 12 },
          formatter: p => `${p.name}: ${fmtNum(state, p.value)}`,
          extraCssText: 'box-shadow:0 4px 16px rgba(20,20,30,.12); border-radius:8px; padding:8px 10px;',
        },
        series: [{
          type: 'treemap',
          data,
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          upperLabel: { show: false },
          itemStyle: { borderColor: '#fff', borderWidth: 2, gapWidth: 2 },
          label: {
            color: '#fff', fontFamily: t.font, fontWeight: 600, fontSize: axisFont + 1,
            formatter: p => `${p.name}\n${fmtNum(state, p.value)}`,
          },
        }],
      };
    }

    let series, xAxisOpt, yAxisOpt;

    if (isScatter) {
      series = visIdx.map(i => ({
        name: state.seriesNames[i],
        type: 'scatter',
        data: state.categories.map((cat, ri) => [parseXValue(cat, ri), state.data[ri]?.[i] ?? 0]),
        symbolSize: 10,
        itemStyle: { color: colors[i], opacity: 0.85 },
        emphasis: { focus: 'series' },
      }));
      xAxisOpt = { type: 'value', ...baseAxis, show: state.showXAxis };
      yAxisOpt = { type: 'value', ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: v => fmtNum(state, v) }, show: state.showYAxis, splitLine: { show: state.showYAxis, lineStyle: baseAxis.splitLine.lineStyle }, ...yAxisRange(state) };
    } else {
      series = visIdx.map(i => {
        const name = state.seriesNames[i];
        if (isLineFamily) {
          const dotsOnly = state.seriesMode[i] === 'dots';
          return {
            name,
            type: 'line',
            data: state.data.map(row => row[i] ?? 0),
            symbol: 'circle',
            symbolSize: dotsOnly ? 9 : 8,
            showSymbol: true,
            lineStyle: dotsOnly ? { opacity: 0 } : { width: 2, color: colors[i] },
            itemStyle: { color: colors[i], borderColor: t.surface, borderWidth: 2 },
            areaStyle: isArea && !dotsOnly ? { color: colors[i], opacity: 0.12 } : undefined,
            emphasis: { focus: 'series' },
          };
        }
        return {
          name,
          type: 'bar',
          stack: isStacked ? 'total' : undefined,
          data: state.data.map(row => row[i] ?? 0),
          barMaxWidth: 24,
          itemStyle: { color: colors[i], borderRadius: isStacked ? [0, 0, 0, 0] : [4, 4, 0, 0] },
          emphasis: { focus: 'series' },
        };
      });
      // Rounded outer caps on stacked bars: top segment gets top radius.
      if (isStacked && series.length) {
        series.forEach(s => { s.itemStyle.borderRadius = [0, 0, 0, 0]; });
        series[series.length - 1].itemStyle.borderRadius = [4, 4, 0, 0];
      }
      xAxisOpt = {
        type: 'category',
        data: state.categories,
        ...baseAxis,
        splitLine: { show: false },
        boundaryGap: !isLineFamily,
        show: state.showXAxis,
      };
      yAxisOpt = {
        type: 'value',
        ...baseAxis,
        axisLabel: { ...baseAxis.axisLabel, formatter: v => fmtNum(state, v) },
        show: state.showYAxis,
        splitLine: { show: state.showYAxis, lineStyle: baseAxis.splitLine.lineStyle },
        ...yAxisRange(state),
      };
    }

    const visibleNames = visIdx.map(i => state.seriesNames[i]);

    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: t.font },
      color: visIdx.map(i => colors[i]),
      grid: { left: state.showYAxis ? 44 : 12, right: 16, top: 8, bottom: state.showXAxis ? 26 : 8, containLabel: true },
      // Registered but not drawn by echarts — kept so dispatchAction('legendToggleSelect')
      // from an HTML legend still filters series in/out.
      legend: visibleNames.length > 1
        ? { show: false, data: visibleNames, selectedMode: true, selected: legendSelected || {} }
        : { show: false },
      tooltip: {
        trigger: isLineFamily ? 'axis' : 'item',
        backgroundColor: '#fff',
        borderColor: t.grid,
        textStyle: { color: t.textPrimary, fontFamily: t.font, fontSize: 12 },
        valueFormatter: isScatter ? undefined : (v => fmtNum(state, v)),
        extraCssText: 'box-shadow:0 4px 16px rgba(20,20,30,.12); border-radius:8px; padding:8px 10px;',
      },
      xAxis: xAxisOpt,
      yAxis: yAxisOpt,
      series,
      barGap: isStacked ? undefined : '20%',
      barCategoryGap: '30%',
    };
  }

  global.ChartLib = { THEMES, fmtNum, seriesColor, seriesColors, visibleSeriesIndices, yAxisRange, parseXValue, buildOption };
})(window);
