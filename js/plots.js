/* ============================================================
   PLOTLY PLOTS
   Radial distribution function P(r) (with an optional cumulative
   overlay) and a 2D |ψ| cross-section through a chosen plane.
   ============================================================ */

const AXIS_COLOR = '#8a94c2';
const GRID_COLOR = '#2a3366';

let lastRDFArgs = null;
let lastCrossArgs = null;

// Live cross-section view state (plane + quantity). Kept here so the resize
// handler always re-plots the plane the reader is actually looking at.
const crossState = { plane: 'xz', mode: 'psi' };

/* ----- colour scales -----
   The data stays linear; only the COLOUR mapping is compressed, so a region
   at 10% of the peak already reads clearly instead of vanishing into the dark.
   Without this, the faint outer shells of s orbitals are invisible next to the
   central peak (|ψ| in 2s falls to 13% of its maximum at the outer lobe) and
   the radial node that the cross-section exists to show cannot be seen at all.
   The density cloud applies the same idea with its t^0.4 brightness boost. */
const RAMP_GAMMA = 0.28;

const PSI_NEG = ['#0b1020', '#3d0d2c', '#a3175c', '#ff2d7a'];
const PSI_POS = ['#0b1020', '#0f3648', '#1f8ab4', '#4cc9f0'];
const DENSITY_RAMP = ['#0b1020', '#123c58', '#1e5f8a', '#35a7ff', '#8e5cff', '#ff2e88'];

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Colour at position t ∈ [0, 1] along a list of stops.
function sampleRamp(stops, t) {
  const last = stops.length - 1;
  const x = Math.max(0, Math.min(1, t)) * last;
  const i = Math.min(Math.floor(x), last - 1);
  const f = x - i;
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const mix = k => Math.round(a[k] + f * (b[k] - a[k]));
  return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
}

// Signed ψ scale: pink for ψ < 0, dark at ψ = 0, blue for ψ > 0.
const PSI_COLORSCALE = (() => {
  const out = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const strength = Math.pow(Math.abs(2 * u - 1), RAMP_GAMMA);
    out.push([u, u < 0.5 ? sampleRamp(PSI_NEG, strength) : sampleRamp(PSI_POS, strength)]);
  }
  return out;
})();

// |ψ|² scale: dark → cyan → violet → pink, boosted the same way.
const DENSITY_COLORSCALE = (() => {
  const out = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    out.push([u, sampleRamp(DENSITY_RAMP, Math.pow(u, RAMP_GAMMA))]);
  }
  return out;
})();

const PLANE_LABELS = {
  xz: { h: 'x / a₀', v: 'z / a₀', word: 'xz' },
  yz: { h: 'y / a₀', v: 'z / a₀', word: 'yz' },
  xy: { h: 'x / a₀', v: 'y / a₀', word: 'xy' }
};

const CROSS_N = 180;


let rdfViewMode = 'prob'; // 'prob' | 'wave' | 'both'

/* ============================================================
   RADIAL DISTRIBUTION FUNCTION & RADIAL WAVEFUNCTION
   ============================================================ */
function plotRDF(n, l, m, radial, mp) {
  const rMax = radial.rMaxPlot;
  const N = 2000;

  const rs = [];
  const ps = [];
  const rwaves = [];

  let minR = 0;
  let maxR = 0;

  for (let i = 0; i <= N; i++) {
    const r = (i / N) * rMax;
    rs.push(r);
    const pVal = QM.P_r(n, l, r);
    const rVal = QM.R_nl(n, l, r);
    ps.push(pVal);
    rwaves.push(rVal);
    if (rVal < minR) minR = rVal;
    if (rVal > maxR) maxR = rVal;
  }

  const nodes = QM.findRadialNodes(n, l, radial.rTrial);
  const name = QM.orbitalName(n, l);

  let mainTrace;
  let extraWaveTrace = null;

  if (rdfViewMode === 'wave') {
    mainTrace = {
      x: rs,
      y: rwaves,
      mode: 'lines',
      type: 'scatter',
      line: { color: '#2dffb0', width: 2.5 },
      name: 'R_{nℓ}(r)',
      hovertemplate: 'r = %{x:.3f} a₀<br>R(r) = %{y:.4e} a₀⁻³/²<extra></extra>'
    };
  } else {
    mainTrace = {
      x: rs,
      y: ps,
      mode: 'lines',
      type: 'scatter',
      line: { color: '#4cc9f0', width: 2.5 },
      name: 'P(r) = r²|R(r)|²',
      fill: 'tozeroy',
      fillcolor: 'rgba(76,201,240,0.12)',
      hovertemplate: 'r = %{x:.3f} a₀<br>P(r) = %{y:.4e}<extra></extra>'
    };

    if (rdfViewMode === 'both') {
      extraWaveTrace = {
        x: rs,
        y: rwaves,
        mode: 'lines',
        type: 'scatter',
        yaxis: 'y2',
        line: { color: '#2dffb0', width: 2, dash: 'dot' },
        name: 'R_{nℓ}(r)',
        hovertemplate: 'r = %{x:.3f} a₀<br>R(r) = %{y:.4e}<extra></extra>'
      };
    }
  }

  const nodeYMax = rdfViewMode === 'wave' ? Math.max(Math.abs(minR), Math.abs(maxR)) * 1.15 : mp.P * 1.12;
  const nodeYMin = rdfViewMode === 'wave' ? -nodeYMax : 0;

  const nodeTraces = nodes.map((rn, i) => ({
    x: [rn, rn],
    y: [nodeYMin, nodeYMax],
    mode: 'lines',
    type: 'scatter',
    line: { color: '#f72585', width: 2, dash: 'dash' },
    name: i === 0 ? 'Radial nodes (P=0, R=0)' : undefined,
    showlegend: i === 0,
    hovertemplate: 'Radial node at r = %{x:.3f} a₀<extra></extra>'
  }));

  const maxTrace = {
    x: [mp.r],
    y: [rdfViewMode === 'wave' ? QM.R_nl(n, l, mp.r) : mp.P],
    mode: 'markers+text',
    type: 'scatter',
    marker: {
      color: '#ff006e',
      size: 14,
      symbol: 'star',
      line: { color: 'white', width: 1.5 }
    },
    text: [`r_max = ${mp.r.toFixed(3)} a₀`],
    textposition: 'top center',
    textfont: { color: '#ff006e', size: 13 },
    name: 'Most probable radius',
    showlegend: true,
    hovertemplate: 'r_max = %{x:.3f} a₀<extra></extra>'
  };

  // Optional cumulative overlay: C(r) = ∫₀^r P(r')dr' on a right-hand axis.
  const cdfToggle = $('showCDF');
  const showCDF = !!(cdfToggle && cdfToggle.checked);
  const cdfTraces = [];

  if (showCDF) {
    const cdf = QM.radialCDF(n, l, radial.rTrial);
    const cr = [];
    const cy = [];

    for (let i = 0; i <= N; i++) {
      const r = (i / N) * rMax;
      cr.push(r);
      cy.push(cdf.at(r));
    }

    cdfTraces.push({
      x: cr,
      y: cy,
      mode: 'lines',
      type: 'scatter',
      yaxis: 'y2',
      line: { color: '#ffd166', width: 2, dash: 'dot' },
      name: 'Cumulative P(r ≤ R)',
      hovertemplate: 'r = %{x:.3f} a₀<br>P(r ≤ R) = %{y:.4f}<extra></extra>'
    });
  }

  const plotTitle = rdfViewMode === 'wave'
    ? `Radial Wavefunction R_{nℓ}(r) — ${name} Orbital (n=${n}, l=${l}, mₗ=${m})`
    : rdfViewMode === 'both'
      ? `P(r) & R_{nℓ}(r) — ${name} Orbital (n=${n}, l=${l}, mₗ=${m})`
      : `Radial Distribution Function — ${name} Orbital (n=${n}, l=${l}, mₗ=${m})`;

  const yAxisTitle = rdfViewMode === 'wave' ? 'R_{nℓ}(r) / a₀⁻³/²' : 'P(r) = r² |R_{nℓ}(r)|²';
  const yAxisRange = rdfViewMode === 'wave'
    ? [Math.min(0, minR * 1.18), Math.max(0.01, maxR * 1.18)]
    : [0, mp.P * 1.18];

  const layout = {
    title: {
      text: plotTitle,
      font: { color: '#e6ecff', size: 16 }
    },
    xaxis: {
      title: { text: 'Radius r / a₀', font: { color: AXIS_COLOR } },
      gridcolor: GRID_COLOR,
      zerolinecolor: GRID_COLOR,
      color: AXIS_COLOR,
      range: [0, rMax * 1.02]
    },
    yaxis: {
      title: { text: yAxisTitle, font: { color: AXIS_COLOR } },
      gridcolor: GRID_COLOR,
      zerolinecolor: GRID_COLOR,
      color: AXIS_COLOR,
      range: yAxisRange
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(10,14,32,0.6)',
    font: { color: '#e6ecff' },
    legend: {
      bgcolor: 'rgba(0,0,0,0)',
      font: { color: '#e6ecff' }
    },
    margin: { l: 70, r: (showCDF || extraWaveTrace) ? 78 : 30, t: 60, b: 60 },
    annotations: rdfViewMode === 'wave' ? [] : [{
      x: mp.r,
      y: mp.P,
      xref: 'x',
      yref: 'y',
      text: `r_max = ${mp.r.toFixed(3)} a₀`,
      showarrow: true,
      arrowhead: 2,
      ax: 45,
      ay: -40,
      font: { color: '#ff006e', size: 12 },
      arrowcolor: '#ff006e'
    }]
  };

  if (extraWaveTrace && !showCDF) {
    layout.yaxis2 = {
      title: { text: 'R_{nℓ}(r) / a₀⁻³/²', font: { color: '#2dffb0' } },
      overlaying: 'y',
      side: 'right',
      color: '#2dffb0',
      gridcolor: 'transparent',
      zeroline: false
    };
  }

  if (showCDF) {
    layout.yaxis2 = {
      title: { text: 'Cumulative probability', font: { color: '#ffd166' } },
      overlaying: 'y',
      side: 'right',
      range: [0, 1.05],
      tickformat: '.0%',
      color: '#ffd166',
      gridcolor: 'transparent',
      zeroline: false
    };
  }

  if (window.innerWidth < 760) {
    mainTrace.name = 'P(r)';
    mainTrace.line.width = 2;

    maxTrace.name = 'Max';
    maxTrace.text = [`${mp.r.toFixed(2)} a₀`];
    maxTrace.textfont = { size: 10, color: '#ff006e' };
    maxTrace.marker.size = 11;

    nodeTraces.forEach((tr, i) => {
      tr.name = i === 0 ? 'Nodes' : undefined;
      tr.showlegend = i === 0;
      tr.line.width = 1.5;
    });

    layout.title.text = `${name} RDF`;
    layout.title.font.size = 14;
    layout.title.x = 0.02;
    layout.title.xanchor = 'left';

    layout.xaxis.title.text = 'r / a₀';
    layout.yaxis.title.text = 'P(r)';
    layout.xaxis.title.font = { size: 12, color: AXIS_COLOR };
    layout.yaxis.title.font = { size: 12, color: AXIS_COLOR };
    layout.xaxis.tickfont = { size: 10, color: AXIS_COLOR };
    layout.yaxis.tickfont = { size: 10, color: AXIS_COLOR };

    layout.margin = { l: 54, r: showCDF ? 46 : 16, t: 48, b: 68 };
    layout.yaxis.range = [0, mp.P * 1.35];
    layout.annotations = [];

    layout.legend = {
      orientation: 'h',
      x: 0,
      y: -0.18,
      font: { size: 10, color: '#e6ecff' },
      bgcolor: 'rgba(0,0,0,0)'
    };

    if (showCDF) {
      layout.yaxis2.title.text = 'Cumulative';
      layout.yaxis2.tickfont = { size: 10, color: '#ffd166' };
      layout.yaxis2.title.font = { size: 11, color: '#ffd166' };
    }
  }

  const allTraces = [mainTrace];
  if (extraWaveTrace) allTraces.push(extraWaveTrace);
  allTraces.push(...nodeTraces, ...cdfTraces, maxTrace);

  Plotly.react(
    'plotRDF',
    allTraces,
    layout,
    { responsive: true, displayModeBar: false }
  );
}

$('exportPng').onclick = () => {
  if (typeof Plotly === 'undefined') return;

  const n = parseInt($('n').value, 10);
  const l = parseInt($('l').value, 10);
  const name = QM.orbitalName(n, l);

  Plotly.downloadImage('plotRDF', {
    format: 'png',
    width: 1000,
    height: 620,
    filename: `hydrogen-${name}-rdf`
  });
};


/* ============================================================
   CROSS-SECTION VIEW
   ψ evaluated on a Cartesian grid in one of three coordinate
   planes. The caller (the UI module) decides which plane to show;
   it steers away from planes that are purely nodal for the orbital
   — e.g. xz for mₗ = −2 — which would render as a blank square,
   and flags them when the reader picks one on purpose.
   ============================================================ */

// ψ(x, y, z) for a point on the chosen plane, in atomic units.
function psiAtPoint(n, l, m, px, py, pz) {
  const r = Math.sqrt(px * px + py * py + pz * pz);
  if (r < 1e-9) return QM.R_nl(n, l, 0) * QM.Y_lm_real(l, m, 0, 0);
  const theta = Math.acos(Math.max(-1, Math.min(1, pz / r)));
  const phi = Math.atan2(py, px);
  return QM.R_nl(n, l, r) * QM.Y_lm_real(l, m, theta, phi);
}

// Plane point (u, v) → 3D point.
function planePointToXYZ(plane, u, v, out) {
  if (plane === 'xz') { out[0] = u; out[1] = 0; out[2] = v; }
  else if (plane === 'yz') { out[0] = 0; out[1] = u; out[2] = v; }
  else { out[0] = u; out[1] = v; out[2] = 0; }
  return out;
}

// Grid of ψ values plus the peak magnitude found on it.
function crossSectionData(n, l, m, plane, half, N) {
  const step = (2 * half) / N;
  const u = [];
  const v = [];
  const p = [0, 0, 0];

  for (let i = 0; i <= N; i++) {
    u.push(-half + i * step);
    v.push(-half + i * step);
  }

  const z = [];
  let maxAbs = 0;

  for (let j = 0; j <= N; j++) {
    const row = new Array(N + 1);
    for (let i = 0; i <= N; i++) {
      planePointToXYZ(plane, u[i], v[j], p);
      const val = psiAtPoint(n, l, m, p[0], p[1], p[2]);
      row[i] = val;
      const a = Math.abs(val);
      if (a > maxAbs) maxAbs = a;
    }
    z.push(row);
  }

  return { u, v, z, maxAbs: maxAbs > 0 ? maxAbs : 1e-300 };
}

// Peak |ψ| on a plane, cheaply — used to pick a non-degenerate plane.
function planePeak(n, l, m, plane, half) {
  return crossSectionData(n, l, m, plane, half, 40).maxAbs;
}

function bestPlane(n, l, m, half) {
  const order = ['xz', 'xy', 'yz'];
  let best = order[0];
  let bestPeak = -1;

  for (const plane of order) {
    const peak = planePeak(n, l, m, plane, half);
    if (peak > bestPeak) {
      bestPeak = peak;
      best = plane;
    }
  }

  return best;
}

// Returns true when the chosen plane is (numerically) a nodal plane.
function isNodalPlane(n, l, m, plane, half) {
  const peak = planePeak(n, l, m, plane, half);
  return peak < 1e-9;
}

function plotCrossSection(n, l, m, radial, opts = {}) {
  const container = $('plotCross');
  if (!container) return;

  if (typeof Plotly === 'undefined') {
    container.innerHTML =
      '<div style="padding:20px;color:#f87171">Plotly failed to load. Check your internet connection.</div>';
    return;
  }

  const half = Math.max(4, radial.rMaxPlot / 2);
  const plane = opts.plane || crossState.plane;
  const densityMode = (opts.mode || 'psi') === 'density';

  // Record what is actually on screen, so a later resize re-plots the same view.
  crossState.plane = plane;
  crossState.mode = densityMode ? 'density' : 'psi';
  const data = crossSectionData(n, l, m, plane, half, CROSS_N);

  const zVals = densityMode
    ? data.z.map(row => row.map(val => val * val))
    : data.z;

  const peak = densityMode ? data.maxAbs * data.maxAbs : data.maxAbs;

  const labels = PLANE_LABELS[plane] || PLANE_LABELS.xz;
  const label = QM.realOrbitalLabel(n, l, m);

  const heatTrace = {
    type: 'heatmap',
    x: data.u,
    y: data.v,
    z: zVals,
    zmin: densityMode ? 0 : -peak,
    zmax: peak,
    zmid: densityMode ? undefined : 0,
    colorscale: densityMode ? DENSITY_COLORSCALE : PSI_COLORSCALE,
    hoverongaps: false,
    hovertemplate: densityMode
      ? `${labels.h.replace(' / a₀', '')} = %{x:.2f} a₀<br>${labels.v.replace(' / a₀', '')} = %{y:.2f} a₀<br>|ψ|² = %{z:.3e} a₀⁻³<extra></extra>`
      : `${labels.h.replace(' / a₀', '')} = %{x:.2f} a₀<br>${labels.v.replace(' / a₀', '')} = %{y:.2f} a₀<br>ψ = %{z:.4f} a₀⁻³ᐟ²<extra></extra>`,
    colorbar: {
      title: {
        text: densityMode ? '|ψ|²' : 'ψ',
        side: 'right',
        font: { color: AXIS_COLOR, size: 12 }
      },
      thickness: 12,
      len: 0.82,
      tickfont: { color: AXIS_COLOR, size: 10 },
      outlinewidth: 0,
      // |ψ|² peaks around 1e-3–1e-4, which a fixed decimal format would render
      // as a column of "0.000"; fall back to exponential when the scale is tiny.
      tickformat: peak >= 0.01 ? '.3f' : '.1e'
    }
  };

  // Nucleus marker at the origin.
  const nucleusTrace = {
    x: [0],
    y: [0],
    type: 'scatter',
    mode: 'markers',
    marker: { color: '#ffd166', size: 7, line: { color: '#05070f', width: 1 } },
    name: 'Nucleus',
    showlegend: false,
    hoverinfo: 'skip'
  };

  const nodal = isNodalPlane(n, l, m, plane, half);

  const layout = {
    title: {
      text: `${label} — ${densityMode ? '|ψ|²' : 'ψ'} cross-section in the ${labels.word} plane`,
      font: { color: '#e6ecff', size: 15 }
    },
    xaxis: {
      title: { text: labels.h, font: { color: AXIS_COLOR } },
      range: [-half, half],
      color: AXIS_COLOR,
      gridcolor: GRID_COLOR,
      zeroline: false,
      constraindomains: true
    },
    yaxis: {
      title: { text: labels.v, font: { color: AXIS_COLOR } },
      range: [-half, half],
      color: AXIS_COLOR,
      gridcolor: GRID_COLOR,
      zeroline: false,
      scaleanchor: 'x',
      scaleratio: 1
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(10,14,32,0.6)',
    font: { color: '#e6ecff' },
    margin: { l: 64, r: 12, t: 48, b: 54 },
    annotations: nodal ? [{
      x: 0.5,
      y: 0.5,
      xref: 'paper',
      yref: 'paper',
      text: 'This plane is a nodal plane: ψ ≡ 0 here',
      showarrow: false,
      font: { color: '#ffd166', size: 13 },
      bgcolor: 'rgba(11,16,32,0.85)',
      bordercolor: '#2a3366',
      borderwidth: 1,
      borderpad: 6
    }] : []
  };

  if (window.innerWidth < 760) {
    layout.title.text = `${label} — ${densityMode ? '|ψ|²' : 'ψ'} (${labels.word})`;
    layout.title.font.size = 13;
    layout.title.x = 0.02;
    layout.title.xanchor = 'left';
    layout.margin = { l: 48, r: 8, t: 42, b: 48 };
    heatTrace.colorbar.thickness = 10;
    heatTrace.colorbar.len = 0.7;
    heatTrace.colorbar.title.text = '';
  }

  Plotly.react(
    'plotCross',
    [heatTrace, nucleusTrace],
    layout,
    { responsive: true, displayModeBar: false }
  );
}

function syncPlaneButtons(plane) {
  const seg = $('planeSeg');
  if (!seg) return;
  $$('button', seg).forEach(b => {
    b.classList.toggle('active', b.dataset.plane === plane);
  });
}


/* ============================================================
   RESPONSIVE RE-PLOT
   ============================================================ */  const replotOnResize = debounce(() => {
  if (typeof Plotly === 'undefined') return;

  if (lastRDFArgs) plotRDF(...lastRDFArgs);
  if (lastCrossArgs) {
    plotCrossSection(lastCrossArgs[0], lastCrossArgs[1], lastCrossArgs[2], lastCrossArgs[3], {
      plane: crossState.plane,
      mode: crossState.mode
    });
  }
}, 250);

window.addEventListener('resize', replotOnResize);
