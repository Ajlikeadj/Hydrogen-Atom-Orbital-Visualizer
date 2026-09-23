/* ============================================================
   UI STATE + PRESETS
   ============================================================ */
const presets = [
  ['1s', 1, 0, 0],
  ['2s', 2, 0, 0],
  ['2p_z', 2, 1, 0],
  ['2p_x', 2, 1, 1],
  ['3s', 3, 0, 0],
  ['3p_z', 3, 1, 0],
  ['3d_z²', 3, 2, 0],
  ['3d_xy', 3, 2, -2],
  ['4s', 4, 0, 0],
  ['4p_z', 4, 1, 0],
  ['4d_z²', 4, 2, 0],
  ['4f_z³', 4, 3, 0]
];

const presetsEl = $('presets');

let presetIndex = 0;

presets.forEach(([name, n, l, m], i) => {
  const b = document.createElement('button');
  b.className = 'preset';
  b.textContent = name;

  b.onclick = () => activatePreset(i);

  presetsEl.appendChild(b);
});

function activatePreset(i) {
  presetIndex = (i + presets.length) % presets.length;
  const [, n, l, m] = presets[presetIndex];
  setField('n', n);
  setField('l', l);
  setField('m', m);
  // Presets bypass the inputs, so refresh slider bounds too — otherwise the
  // l/m sliders can be left with stale max/min (e.g. stuck at 0 after 1s).
  clampQuantum();
  generate();
}

function updatePresetActive() {
  const n = parseInt($('n').value, 10);
  const l = parseInt($('l').value, 10);
  const m = parseInt($('m').value, 10);

  const idx = presets.findIndex(([, pn, pl, pm]) => pn === n && pl === l && pm === m);

  presetsEl.querySelectorAll('button').forEach((b, i) => {
    b.classList.toggle('active', i === idx);
  });
}

function setStatus(msg, good) {
  const el = $('status');
  el.textContent = msg;
  el.className = 'status show ' + (good ? 'good' : 'bad');
}

/* ----- browser-local recent orbital history ----- */
const RECENT_ORBITALS_KEY = 'hydrogen-orbital-recent-v1';

function readRecentOrbitals() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_ORBITALS_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(x => x && Number.isInteger(x.n) && Number.isInteger(x.l) && Number.isInteger(x.m)) : [];
  } catch (_) {
    return [];
  }
}

function renderRecentOrbitals() {
  const host = $('recentOrbitals');
  const clear = $('clearRecentBtn');
  if (!host) return;
  const items = readRecentOrbitals();
  if (clear) clear.hidden = items.length === 0;
  host.innerHTML = '';

  if (!items.length) {
    host.innerHTML = '<div class="recent-empty">Generate an orbital to keep a quick, private shortcut here. Nothing leaves this browser.</div>';
    return;
  }

  items.forEach(({ n, l, m }) => {
    const button = document.createElement('button');
    const label = QM.realOrbitalLabel(n, l, m);
    button.type = 'button';
    button.className = 'recent-orbital';
    button.setAttribute('aria-label', `Open recent orbital ${label}`);
    button.innerHTML = `<span class="recent-name">${label}</span><span class="recent-values">n=${n} · ℓ=${l} · mℓ=${m}</span><span class="recent-go" aria-hidden="true">→</span>`;
    button.onclick = () => {
      setField('n', n);
      setField('l', l);
      setField('m', m);
      clampQuantum();
      generate();
      toast(`Restored ${label}`, 'good');
    };
    host.appendChild(button);
  });
}

function saveRecentOrbital(n, l, m) {
  const next = [{ n, l, m }, ...readRecentOrbitals().filter(item => item.n !== n || item.l !== l || item.m !== m)].slice(0, 5);
  try { localStorage.setItem(RECENT_ORBITALS_KEY, JSON.stringify(next)); } catch (_) { /* storage may be disabled */ }
  renderRecentOrbitals();
}

const clearRecentBtn = $('clearRecentBtn');
if (clearRecentBtn) {
  clearRecentBtn.onclick = () => {
    try { localStorage.removeItem(RECENT_ORBITALS_KEY); } catch (_) { /* storage may be disabled */ }
    renderRecentOrbitals();
    toast('Recent orbital history cleared');
  };
}

function setupHelpDialog() {
  const dialog = $('helpDialog');
  const open = $('helpBtn');
  const close = $('closeHelpBtn');
  if (!dialog || !open) return;
  open.onclick = () => dialog.showModal();
  if (close) close.onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function resetViewSettings() {
  viewMode = 'surface';
  isoFrac = 0.12;
  pointCount = 20000;
  themeKey = 'plasma';
  crossState.plane = 'xz';
  crossState.mode = 'psi';
  rdfViewMode = 'prob';
  $('isoRange').value = '12';
  $('isoVal').textContent = '12%';
  $('showCDF').checked = false;
  $('autoRotate').checked = false;
  $('showHelpers').checked = true;
  $('showNucleus').checked = true;
  $('showProbSphereToggle').checked = false;
  ['autoRotate', 'showHelpers', 'showNucleus'].forEach(id => {
    $(id).dispatchEvent(new Event('change'));
  });
  selectSegment('viewSeg', 'mode', viewMode);
  selectSegment('pointSeg', 'points', pointCount);
  selectSegment('themeSeg', 'theme', themeKey);
  selectSegment('crossModeSeg', 'cross', crossState.mode);
  selectSegment('rdfModeSeg', 'rdf', rdfViewMode);
  syncPlaneButtons(crossState.plane);
  selectSegment('cutawaySeg', 'cut', 'none');
  if (typeof setCutaway === 'function') setCutaway('none');
  if (typeof setCameraPreset === 'function') setCameraPreset('reset');
  syncViewControls();
  updateProbeSphereUI();
  if (lastRDFArgs) plotRDF(...lastRDFArgs);
  replotCrossOnly();
  replotCloud();
  syncURL();
  toast('Display settings restored', 'good');
}

const resetSettingsBtn = $('resetSettingsBtn');
if (resetSettingsBtn) resetSettingsBtn.onclick = resetViewSettings;

/* ----- number input ↔ slider sync ----- */
function fillPct(el) {
  const min = parseFloat(el.min);
  const max = parseFloat(el.max);
  // Degenerate range (single possible value, e.g. l = 0 when n = 1):
  // avoid 0/0 → NaN, which would invalidate the slider track gradient.
  if (!(max > min)) return '50%';
  return (((parseFloat(el.value) - min) / (max - min)) * 100).toFixed(1) + '%';
}

function setField(id, val) {
  $(id).value = val;
  const range = $(id + 'Range');
  if (range) {
    range.value = val;
    range.style.setProperty('--fill', fillPct(range));
  }
}

// Clamp values to valid quantum-number ranges, keeping the UI consistent.
function clampQuantum() {
  const n = Math.max(1, Math.min(7, Math.round(Number($('n').value) || 1)));
  const l0 = Math.round(Number($('l').value) || 0);
  const m0 = Math.round(Number($('m').value) || 0);

  $('lRange').max = n - 1;
  const l = Math.max(0, Math.min(n - 1, l0));

  $('mRange').min = -l;
  $('mRange').max = l;
  const m = Math.max(-l, Math.min(l, m0));

  setField('n', n);
  setField('l', l);
  setField('m', m);
}

['n', 'l', 'm'].forEach(id => {
  const range = $(id + 'Range');

  range.addEventListener('input', () => {
    $(id).value = range.value;
    range.style.setProperty('--fill', fillPct(range));
  });

  range.addEventListener('change', () => {
    clampQuantum();
    generate();
  });

  $(id).addEventListener('change', () => {
    clampQuantum();
    generate();
  });

  $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clampQuantum();
      generate();
    }
  });
});

$('generateBtn').onclick = () => {
  clampQuantum();
  generate();
};

$('randomBtn').onclick = () => {
  const n = 1 + Math.floor(Math.random() * 6);       // 1 … 6
  const l = Math.floor(Math.random() * n);           // 0 … n−1
  const m = Math.floor(Math.random() * (2 * l + 1)) - l;

  setField('n', n);
  setField('l', l);
  setField('m', m);
  clampQuantum();
  generate();
  toast(`Random orbital: ${QM.realOrbitalLabel(n, l, m)}`, 'good');
};

// Keyboard: cycle presets with the arrow keys.
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

  if (e.key === 'ArrowLeft') {
    activatePreset(presetIndex - 1);
    e.preventDefault();
  } else if (e.key === 'ArrowRight') {
    activatePreset(presetIndex + 1);
    e.preventDefault();
  } else if ((e.key === 'r' || e.key === 'R') && !e.repeat) {
    // Held keys auto-repeat: without this guard, leaning on R would queue a
    // full regeneration (and a toast) for every repeat.
    $('randomBtn').click();
    e.preventDefault();
  } else if (e.key === '?' && !e.repeat) {
    const dialog = $('helpDialog');
    if (dialog && !dialog.open) {
      dialog.showModal();
      e.preventDefault();
    }
  }
});


/* ============================================================
   URL STATE
   The whole view is shareable: ?n=3&l=2&m=1&view=surface&iso=12
                              &theme=plasma&pts=20000&plane=xz
   ============================================================ */
function syncURL() {
  try {
    const url = new URL(window.location);
    const set = (key, value) => url.searchParams.set(key, value);

    set('n', $('n').value);
    set('l', $('l').value);
    set('m', $('m').value);
    set('view', viewMode);
    set('iso', Math.round(isoFrac * 100));
    set('theme', themeKey);
    set('pts', pointCount);
    set('plane', crossState.plane);
    set('cross', crossState.mode);
    set('cdf', $('showCDF').checked ? '1' : '0');

    history.replaceState(null, '', url);
  } catch (_) { /* ignore */ }
}

// Set when the incoming link named a cross-section plane: that choice is
// restored verbatim for the first render instead of being auto-picked.
let restorePlaneOnce = false;

function readURLParams() {
  let params;

  try {
    params = new URLSearchParams(window.location.search);
  } catch (_) {
    return; // file:// URLs are fine to ignore
  }

  const intParam = (key) => {
    const raw = params.get(key);
    if (raw === null) return null;
    const val = parseInt(raw, 10);
    return Number.isFinite(val) ? val : null;
  };

  const n = intParam('n');
  const l = intParam('l');
  const m = intParam('m');
  if (n !== null) $('n').value = n;
  if (l !== null) $('l').value = l;
  if (m !== null) $('m').value = m;

  const view = params.get('view');
  if (view === 'density' || view === 'surface') {
    viewMode = view;
    selectSegment('viewSeg', 'mode', view);
  }

  const iso = intParam('iso');
  if (iso !== null && iso >= 2 && iso <= 60) {
    isoFrac = iso / 100;
    $('isoRange').value = iso;
    $('isoVal').textContent = iso + '%';
  }

  const theme = params.get('theme');
  if (theme && THEMES[theme]) {
    themeKey = theme;
    selectSegment('themeSeg', 'theme', theme);
  }

  const pts = intParam('pts');
  if (pts !== null && [5000, 20000, 60000].includes(pts)) {
    pointCount = pts;
    selectSegment('pointSeg', 'points', String(pts));
  }

  const plane = params.get('plane');
  if (plane === 'xz' || plane === 'xy' || plane === 'yz') {
    crossState.plane = plane;
    restorePlaneOnce = true;
    syncPlaneButtons(plane);
  }

  const cross = params.get('cross');
  if (cross === 'psi' || cross === 'density') {
    crossState.mode = cross;
    selectSegment('crossModeSeg', 'cross', cross);
  }

  if (params.get('cdf') === '1') $('showCDF').checked = true;
}

// Mark the button whose data attribute matches, in any segmented control.
function selectSegment(segId, dataKey, value) {
  const seg = $(segId);
  if (!seg) return;

  $$('button', seg).forEach(b => {
    b.classList.toggle('active', b.dataset[dataKey] === String(value));
  });
}


/* ============================================================
   RENDERING SETTINGS
   ============================================================ */

$('viewSeg').querySelectorAll('button').forEach(b => {
  b.onclick = () => {
    $('viewSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    viewMode = b.dataset.mode;
    syncViewControls();
    replotCloud();
    syncURL();
  };
});

$('isoRange').addEventListener('input', () => {
  isoFrac = parseInt($('isoRange').value, 10) / 100;
  $('isoVal').textContent = $('isoRange').value + '%';
});

$('isoRange').addEventListener('change', () => {
  if (viewMode === 'surface') replotCloud();
  syncURL();
});

function syncViewControls() {
  const surface = viewMode === 'surface';
  $('pointSeg').classList.toggle('disabled', surface);
  $('themeSeg').classList.toggle('disabled', surface);
  $('isoRow').classList.toggle('disabled', !surface);
}

$('pointSeg').querySelectorAll('button').forEach(b => {
  b.onclick = () => {
    $('pointSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    pointCount = parseInt(b.dataset.points, 10);
    replotCloud();
    syncURL();
  };
});

$('themeSeg').querySelectorAll('button').forEach(b => {
  b.onclick = () => {
    $('themeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    themeKey = b.dataset.theme;
    replotCloud();
    syncURL();
  };
});

$('planeSeg').querySelectorAll('button').forEach(b => {
  b.onclick = () => {
    crossState.plane = b.dataset.plane;
    syncPlaneButtons(crossState.plane);
    replotCrossOnly();
    syncURL();
  };
});

$('crossModeSeg').querySelectorAll('button').forEach(b => {
  b.onclick = () => {
    crossState.mode = b.dataset.cross;
    $('crossModeSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    replotCrossOnly();
    syncURL();
  };
});

$('showCDF').addEventListener('change', () => {
  if (lastRDFArgs) plotRDF(...lastRDFArgs);
  syncURL();
});

function replotCrossOnly() {
  if (!lastCrossArgs) return;
  plotCrossSection(lastCrossArgs[0], lastCrossArgs[1], lastCrossArgs[2], lastCrossArgs[3], {
    plane: crossState.plane,
    mode: crossState.mode
  });
}

/* ============================================================
   NEW FEATURES: RADIAL MODE, CUTAWAY, PROBE, SPECTRA & LADDER
   ============================================================ */

// 1. Radial Curve Mode (P(r), R(r), or Both)
const rdfModeEl = $('rdfModeSeg');
if (rdfModeEl) {
  rdfModeEl.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      rdfViewMode = b.dataset.rdf;
      rdfModeEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      if (lastRDFArgs) plotRDF(...lastRDFArgs);
      syncURL();
    };
  });
}

// 2. 3D Camera Angles & Reset
const camSegEl = $('cameraSeg');
if (camSegEl) {
  camSegEl.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      camSegEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      if (typeof setCameraPreset === 'function') setCameraPreset(b.dataset.cam);
    };
  });
}

const resetCamBtn = $('resetCamBtn');
if (resetCamBtn) {
  resetCamBtn.onclick = () => {
    if (typeof setCameraPreset === 'function') setCameraPreset('reset');
    if (camSegEl) {
      camSegEl.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.cam === 'iso'));
    }
  };
}

// 3. 3D Cutaway Plane Mode
const cutawaySegEl = $('cutawaySeg');
if (cutawaySegEl) {
  cutawaySegEl.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      cutawaySegEl.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      if (typeof setCutaway === 'function') setCutaway(b.dataset.cut);
      syncURL();
    };
  });
}

// 4. Containment Sphere Probe
let currentCDFInstance = null;
let currentProbePct = 90;

function updateProbeSphereUI() {
  if (!currentCDFInstance) return;
  const r = currentCDFInstance.radius(currentProbePct / 100);
  const rNm = r * PHYS.BOHR_NM;

  const pVal = $('containProbVal');
  if (pVal) pVal.textContent = currentProbePct + '%';
  const pEcho = $('containPctEcho');
  if (pEcho) pEcho.textContent = currentProbePct + '%';
  const rBohr = $('containRadiusBohr');
  if (rBohr) rBohr.textContent = `${r.toFixed(2)} a₀`;
  const rNmEl = $('containRadiusNm');
  if (rNmEl) rNmEl.textContent = `${rNm.toFixed(3)} nm`;
  const rLabel = $('containRadiusLabel');
  if (rLabel) rLabel.textContent = `${r.toFixed(2)} a₀`;

  const toggle = $('showProbSphereToggle');
  const show = toggle && toggle.checked;
  if (typeof updateProbSphere === 'function') {
    updateProbSphere(r, show);
  }
}

const containRange = $('containRange');
if (containRange) {
  containRange.addEventListener('input', () => {
    currentProbePct = parseInt(containRange.value, 10);
    const presetSeg = $('containPresetSeg');
    if (presetSeg) {
      presetSeg.querySelectorAll('button').forEach(b => b.classList.toggle('active', parseInt(b.dataset.pct, 10) === currentProbePct));
    }
    updateProbeSphereUI();
  });
}

const containPresetSeg = $('containPresetSeg');
if (containPresetSeg) {
  containPresetSeg.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      currentProbePct = parseInt(b.dataset.pct, 10);
      containPresetSeg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      if (containRange) containRange.value = currentProbePct;
      updateProbeSphereUI();
    };
  });
}

const showProbSphereToggle = $('showProbSphereToggle');
if (showProbSphereToggle) {
  showProbSphereToggle.addEventListener('change', () => {
    updateProbeSphereUI();
  });
}

// 5. Energy Level Ladder, Bohr Orbit Schematic & Hydrogen Spectrogram
function renderEnergyLadder(activeN) {
  const ladder = $('energyLadder');
  if (!ladder) return;
  ladder.innerHTML = '';

  const subshells = {
    1: '1s',
    2: '2s, 2p',
    3: '3s, 3p, 3d',
    4: '4s, 4p, 4d, 4f',
    5: '5s, 5p, 5d, 5f...',
    6: '6s, 6p, 6d...',
    7: '7s, 7p...'
  };

  for (let n = 7; n >= 1; n--) {
    const energy = QM.energyLevel(n);
    const isActive = n === activeN;

    const row = document.createElement('div');
    row.className = 'energy-rung' + (isActive ? ' active' : '');
    row.title = `Click to view n = ${n} (${subshells[n] || ''})`;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-label', `View energy level n equals ${n}, ${energy.toFixed(2)} electron volts`);

    const pct = Math.max(8, 100 - (Math.abs(energy) / 13.6057) * 90);

    row.innerHTML = `
      <span class="rung-label">n = ${n}</span>
      <div class="rung-bar-track">
        <div class="rung-bar-fill" style="width:${pct.toFixed(1)}%;"></div>
      </div>
      ${isActive ? '<div class="rung-electron" title="Active orbital state"></div>' : ''}
      <span class="rung-energy">${energy.toFixed(2)} eV</span>
    `;

    const openLevel = () => {
      setField('n', n);
      clampQuantum();
      generate();
    };
    row.onclick = openLevel;
    row.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openLevel();
      }
    };

    ladder.appendChild(row);
  }

  const badge = $('energyActiveBadge');
  if (badge) {
    const actEnergy = QM.energyLevel(activeN);
    badge.textContent = `n = ${activeN} (${actEnergy.toFixed(2)} eV)`;
  }

  const ionEl = $('activeIonEnergy');
  if (ionEl) ionEl.textContent = `${(PHYS.RYDBERG_EV / (activeN * activeN)).toFixed(2)} eV`;

  const capEl = $('activeShellCap');
  if (capEl) capEl.textContent = `${2 * activeN * activeN} electrons (2n²)`;
}

// Bohr Model Radii: compressed for visual balance
const bohrOrbitRadius = (n) => 24 + (n - 1) * 18;

function createSvgEl(tag) {
  return typeof document.createElementNS === 'function'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
}

function updateBohrOrbits(ni, nf, colorHex, isEmission) {
  const group = $('bohrOrbitsGroup');
  if (!group) return;
  group.innerHTML = '';

  for (let n = 1; n <= 7; n++) {
    const r = bohrOrbitRadius(n);
    const circle = createSvgEl('circle');
    circle.setAttribute('cx', '0');
    circle.setAttribute('cy', '0');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', 'none');

    if (n === ni) {
      circle.setAttribute('stroke', '#4cc9f0');
      circle.setAttribute('stroke-width', '1.8');
      circle.setAttribute('stroke-dasharray', '4 3');
      circle.setAttribute('opacity', '0.9');
    } else if (n === nf) {
      circle.setAttribute('stroke', colorHex || '#ffd166');
      circle.setAttribute('stroke-width', '2.2');
      circle.setAttribute('opacity', '1');
    } else {
      circle.setAttribute('stroke', 'rgba(255, 255, 255, 0.12)');
      circle.setAttribute('stroke-width', '1');
      circle.setAttribute('stroke-dasharray', '2 2');
    }

    const label = createSvgEl('text');
    label.setAttribute('x', '0');
    label.setAttribute('y', -r + 3.5);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', n === ni ? '#4cc9f0' : (n === nf ? (colorHex || '#ffd166') : '#525d88'));
    label.setAttribute('font-size', '8.5');
    label.setAttribute('font-weight', n === ni || n === nf ? 'bold' : 'normal');
    label.textContent = `n=${n}`;

    group.appendChild(circle);
    group.appendChild(label);
  }

  const electron = $('bohrElectron');
  if (electron) {
    const r = bohrOrbitRadius(ni);
    electron.setAttribute('cx', r);
    electron.setAttribute('cy', '0');
  }

  const transBadge = $('bohrTransitionBadge');
  if (transBadge) {
    transBadge.textContent = `${ni} → ${nf} (${isEmission ? 'Emission' : 'Absorption'})`;
    transBadge.style.color = colorHex || 'var(--accent)';
  }
}

let bohrAnimRunning = false;
function triggerBohrAnimation(ni, nf, colorHex, isEmission) {
  if (bohrAnimRunning) return;
  bohrAnimRunning = true;

  const electron = $('bohrElectron');
  const wave = $('photonWave');
  if (!electron || !wave) {
    bohrAnimRunning = false;
    return;
  }

  const rStart = bohrOrbitRadius(ni);
  const rEnd = bohrOrbitRadius(nf);
  const duration = 700;
  const startTime = performance.now();

  function step(time) {
    const elapsed = time - startTime;
    const progress = Math.min(1, elapsed / duration);
    const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;

    const curR = rStart + (rEnd - rStart) * ease;
    const angle = ease * Math.PI * 0.75;
    const x = curR * Math.cos(angle);
    const y = curR * Math.sin(angle);

    electron.setAttribute('cx', x);
    electron.setAttribute('cy', y);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      animatePhotonWave(x, y, colorHex, isEmission, () => {
        bohrAnimRunning = false;
      });
    }
  }

  requestAnimationFrame(step);
}

function animatePhotonWave(startX, startY, colorHex, isEmission, onDone) {
  const wave = $('photonWave');
  if (!wave) {
    if (onDone) onDone();
    return;
  }

  wave.setAttribute('stroke', colorHex || '#ff2e88');
  wave.setAttribute('opacity', '1');

  const waveStart = performance.now();
  const waveDuration = 850;

  function waveStep(now) {
    const t = (now - waveStart) / waveDuration;
    if (t >= 1) {
      wave.setAttribute('opacity', '0');
      wave.setAttribute('d', '');
      if (onDone) onDone();
      return;
    }

    const dist = t * 150;
    const alpha = 1 - t;
    wave.setAttribute('opacity', alpha.toFixed(2));

    let d = `M ${startX} ${startY}`;
    const segments = 12;
    for (let i = 1; i <= segments; i++) {
      const frac = i / segments;
      const px = startX + (dist + frac * 22);
      const py = startY + Math.sin(frac * Math.PI * 4 + t * 10) * 8;
      d += ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
    }
    wave.setAttribute('d', d);

    requestAnimationFrame(waveStep);
  }

  requestAnimationFrame(waveStep);
}

let refreshSpectralDisplay = null;

function initSpectralSimulator() {
  const niSelect = $('transitionNi');
  const nfSelect = $('transitionNf');
  if (!niSelect || !nfSelect) return;

  function populateSelects() {
    niSelect.innerHTML = '';
    nfSelect.innerHTML = '';

    for (let i = 2; i <= 7; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `n = ${i} (${QM.energyLevel(i).toFixed(2)} eV)`;
      niSelect.appendChild(opt);
    }
    for (let f = 1; f <= 6; f++) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = `n = ${f} (${QM.energyLevel(f).toFixed(2)} eV)`;
      nfSelect.appendChild(opt);
    }

    niSelect.value = '3';
    nfSelect.value = '2';
  }

  populateSelects();

  function updateSpectralDisplay() {
    let ni = parseInt(niSelect.value, 10);
    let nf = parseInt(nfSelect.value, 10);

    if (ni === nf) {
      if (ni < 7) { ni++; niSelect.value = ni; }
      else { nf--; nfSelect.value = nf; }
    }

    const t = QM.spectralTransition(ni, nf);
    if (!t) return;

    const swatch = $('spectralColorSwatch');
    if (swatch) {
      swatch.style.backgroundColor = t.color.hex;
      swatch.style.boxShadow = `0 0 16px ${t.color.hex}88`;
    }

    const regionBadge = $('spectralRegionBadge');
    if (regionBadge) {
      regionBadge.textContent = t.color.label;
      if (t.color.isUV) {
        regionBadge.style.color = '#c084fc';
        regionBadge.style.backgroundColor = 'rgba(168,85,247,0.18)';
      } else if (t.color.isIR) {
        regionBadge.style.color = '#f87171';
        regionBadge.style.backgroundColor = 'rgba(239,68,68,0.18)';
      } else {
        regionBadge.style.color = '#4ade80';
        regionBadge.style.backgroundColor = 'rgba(74,222,128,0.18)';
      }
    }

    const titleEl = $('spectralLineTitle');
    if (titleEl) titleEl.textContent = `${t.seriesName} · ${t.lineName}`;

    const wlEl = $('spectralWl');
    if (wlEl) wlEl.textContent = `${t.wavelength.toFixed(1)} nm`;

    const freqEl = $('spectralFreq');
    if (freqEl) freqEl.textContent = `${t.frequency.toFixed(1)} THz`;

    const deEl = $('spectralDeltaE');
    if (deEl) deEl.textContent = `${t.deltaE.toFixed(3)} eV`;

    const deAjEl = $('spectralDeltaEaJ');
    if (deAjEl) deAjEl.textContent = `${t.deltaE_aJ ? t.deltaE_aJ.toFixed(3) : (t.deltaE * 0.1602).toFixed(3)} aJ`;

    const angstromEl = $('photonAngstrom');
    if (angstromEl) angstromEl.textContent = `${(t.wavelength * 10).toFixed(1)} Å`;

    const wnEl = $('photonWavenumber');
    if (wnEl) wnEl.textContent = `${Math.round(1e7 / t.wavelength)} cm⁻¹`;

    const momEl = $('photonMomentum');
    if (momEl) {
      const p = (6.626e-34) / (t.wavelength * 1e-9);
      momEl.textContent = `${(p * 1e27).toFixed(2)}×10⁻²⁷ kg·m/s`;
    }

    const typeEl = $('photonTypeLabel');
    if (typeEl) {
      typeEl.textContent = t.isEmission ? 'Spontaneous Emission' : 'Resonant Absorption';
      typeEl.style.color = t.isEmission ? 'var(--good)' : '#ffd166';
    }

    const subNi = $('jumpNiSub');
    if (subNi) subNi.textContent = ni;
    const subNf = $('jumpNfSub');
    if (subNf) subNf.textContent = nf;

    // Update Spectrogram marker line
    const specMarker = $('specMarker');
    if (specMarker) {
      if (t.wavelength >= 380 && t.wavelength <= 750) {
        const pct = ((t.wavelength - 380) / (750 - 380)) * 100;
        specMarker.style.left = pct.toFixed(1) + '%';
        specMarker.style.display = 'block';
      } else {
        specMarker.style.display = 'none';
      }
    }

    // Check selection rule against active orbital
    const activeL = parseInt($('l').value, 10);
    const currentN = parseInt($('n').value, 10);
    const currentM = parseInt($('m').value, 10);
    const ruleBox = $('selectionRuleBox');
    const ruleIcon = $('ruleIcon');
    const ruleTitle = $('ruleTitle');
    const ruleDesc = $('ruleDesc');

    if (ruleBox && !isNaN(activeL)) {
      let allowed = false;
      for (let lf = 0; lf < nf; lf++) {
        if (Math.abs(activeL - lf) === 1) { allowed = true; break; }
      }

      if (allowed) {
        ruleBox.className = 'selection-rule-box allowed';
        if (ruleIcon) ruleIcon.textContent = '✔';
        if (ruleTitle) ruleTitle.textContent = `Allowed Dipole Transition (Δℓ = ±1)`;
        if (ruleDesc) {
          ruleDesc.textContent = `From ${QM.realOrbitalLabel(currentN, activeL, currentM)}, transitions to n=${nf} satisfy the electric dipole selection rule (Δℓ = ±1). Fast radiative rate.`;
        }
      } else {
        ruleBox.className = 'selection-rule-box forbidden';
        if (ruleIcon) ruleIcon.textContent = '⚠';
        if (ruleTitle) ruleTitle.textContent = `Forbidden Dipole Transition (Δℓ ≠ ±1)`;
        if (ruleDesc) {
          ruleDesc.textContent = `From ${QM.realOrbitalLabel(currentN, activeL, currentM)}, no subshell in n=${nf} satisfies Δℓ = ±1. Radiative decay is inhibited (metastable state).`;
        }
      }
    }

    // Update Bohr Model
    updateBohrOrbits(ni, nf, t.color.hex, t.isEmission);
  }

  niSelect.addEventListener('change', () => {
    if (parseInt(niSelect.value, 10) <= parseInt(nfSelect.value, 10)) {
      nfSelect.value = Math.max(1, parseInt(niSelect.value, 10) - 1);
    }
    updateSpectralDisplay();
  });

  nfSelect.addEventListener('change', () => {
    if (parseInt(niSelect.value, 10) <= parseInt(nfSelect.value, 10)) {
      niSelect.value = Math.min(7, parseInt(nfSelect.value, 10) + 1);
    }
    updateSpectralDisplay();
  });

  const seriesSeg = $('spectralSeriesSeg');
  if (seriesSeg) {
    seriesSeg.querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        seriesSeg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
        const nf = parseInt(b.dataset.series, 10);
        nfSelect.value = nf;
        niSelect.value = Math.min(7, nf + 1);
        updateSpectralDisplay();
      };
    });
  }

  // Spectrogram line clicks
  const specBar = $('spectrogramBar');
  if (specBar) {
    specBar.querySelectorAll('.spec-line').forEach(line => {
      line.onclick = (e) => {
        e.stopPropagation();
        const lineN = parseInt(line.dataset.line, 10);
        niSelect.value = lineN;
        nfSelect.value = 2;
        if (seriesSeg) {
          seriesSeg.querySelectorAll('button').forEach(x => x.classList.toggle('active', x.dataset.series === '2'));
        }
        updateSpectralDisplay();
        triggerBohrAnimation(lineN, 2, line.style.backgroundColor, true);
        toast(`Selected Balmer line H-${line.querySelector('.spec-tag').textContent} (${line.dataset.wl} nm)`, 'good');
      };
    });
  }

  const animBtn = $('animateBohrBtn');
  if (animBtn) {
    animBtn.onclick = () => {
      const ni = parseInt(niSelect.value, 10);
      const nf = parseInt(nfSelect.value, 10);
      const t = QM.spectralTransition(ni, nf);
      triggerBohrAnimation(ni, nf, t ? t.color.hex : '#ffd166', ni > nf);
    };
  }

  const jumpNiBtn = $('jumpNiBtn');
  if (jumpNiBtn) {
    jumpNiBtn.onclick = () => {
      const targetN = parseInt(niSelect.value, 10);
      setField('n', targetN);
      clampQuantum();
      generate();
      toast(`Jumped to upper state n = ${targetN}`, 'good');
    };
  }

  const jumpNfBtn = $('jumpNfBtn');
  if (jumpNfBtn) {
    jumpNfBtn.onclick = () => {
      const targetN = parseInt(nfSelect.value, 10);
      setField('n', targetN);
      clampQuantum();
      generate();
      toast(`Jumped to lower state n = ${targetN}`, 'good');
    };
  }

  refreshSpectralDisplay = updateSpectralDisplay;
  updateSpectralDisplay();
}


/* ============================================================
   SHARE LINK
   ============================================================ */
// Legacy copy path, used when the async Clipboard API is missing or denied
// (embedded frames, non-secure origins, permission prompts).
function copyViaTextarea(text) {
  const tmp = document.createElement('textarea');
  tmp.value = text;
  tmp.setAttribute('readonly', '');
  tmp.style.position = 'fixed';
  tmp.style.opacity = '0';
  document.body.appendChild(tmp);

  let ok = false;
  try {
    tmp.select();
    ok = document.execCommand('copy');
  } catch (_) {
    ok = false;
  }

  tmp.remove();
  return ok;
}

$('copyLink').onclick = async () => {
  syncURL();
  const link = window.location.href;
  let copied = false;

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
      copied = true;
    }
  } catch (e) {
    // A denied clipboard must not skip the fallback that can still succeed.
    console.warn('Clipboard API refused, trying the legacy copy path:', e && e.message);
  }

  if (!copied) copied = copyViaTextarea(link);

  if (copied) toast('Shareable link copied', 'good');
  else toast('Could not copy — the URL is already up to date in the address bar.', 'bad');
};


/* ============================================================
   MAIN GENERATION
   ============================================================ */
function generate() {
  const n = parseInt($('n').value, 10);
  const l = parseInt($('l').value, 10);
  const m = parseInt($('m').value, 10);

  const err = validate(n, l, m);
  if (err) {
    setStatus('⚠ ' + err, false);
    return;
  }

  const name = QM.orbitalName(n, l);
  const label = QM.realOrbitalLabel(n, l, m);
  setStatus(`✓ Valid orbital: ${label}  (n=${n}, l=${l}, mₗ=${m})`, true);
  saveRecentOrbital(n, l, m);
  updatePresetActive();

  const radialNodes = n - l - 1;
  const angularNodes = l;
  const totalNodes = n - 1;

  const mp = QM.mostProbableRadius(n, l);
  const radial = CloudSampler.radialData(n, l, mp);

  const energy = -PHYS.RYDBERG_EV / (n * n);
  const degeneracy = n * n;
  const rAvg = (3 * n * n - l * (l + 1)) / 2;

  // Cumulative radial probability: containment radii and ⟨1/r⟩ = 1/n² (exact).
  const cdf = QM.radialCDF(n, l, radial.rTrial);
  const r50 = cdf.radius(0.50);
  const r90 = cdf.radius(0.90);
  const r95 = cdf.radius(0.95);
  const invR = 1 / (n * n);
  const lMom = Math.sqrt(l * (l + 1));

  $('orbitalBadge').textContent = label;
  $('infoName').textContent = name;
  $('infoLabel').textContent = label;
  $('infoN').textContent = n;
  $('infoL').textContent = l;
  $('infoM').textContent = m;
  $('infoLmom').textContent = `${lMom.toFixed(3)} ħ`;
  $('infoRadial').textContent = radialNodes;
  $('infoAngular').textContent = angularNodes;
  $('infoTotal').textContent = totalNodes;
  $('infoEnergy').textContent = energy.toFixed(2) + ' eV';
  $('infoDegeneracy').textContent = `${degeneracy} states`;
  $('infoRavg').textContent = rAvg.toFixed(3) + ' a₀';
  $('infoRmax').textContent = mp.r.toFixed(3) + ' a₀';
  $('infoR90').textContent = r90.toFixed(2) + ' a₀';
  $('infoInvR').textContent = invR.toFixed(4) + ' a₀⁻¹';
  $('infoPmax').textContent = mp.P.toExponential(3);

  $('infoExplanation').innerHTML = `
    The <b>${label}</b> orbital (n=${n}, l=${l}, mₗ=${m}) is a stationary state of the hydrogen atom.
    Its probability density is
    |ψ(r,θ,φ)|² = |R<sub>${n}${l}</sub>(r)|² · |Y<sub>${l}</sub><sup>${m}</sup>(θ,φ)|².
    It has <b>${radialNodes}</b> radial node(s), <b>${angularNodes}</b> angular node(s),
    and <b>${totalNodes}</b> total node(s).
    The energy is <b>${energy.toFixed(2)} eV</b> (Eₙ = −13.6 eV / n²), one of
    <b>${degeneracy}</b> degenerate states, and the mean electron–nucleus distance is
    <b>${rAvg.toFixed(3)} a₀</b> ≈ <b>${(rAvg * PHYS.BOHR_NM).toFixed(3)} nm</b>.
    The most probable distance is <b>${mp.r.toFixed(3)} a₀</b> ≈
    <b>${(mp.r * PHYS.BOHR_NM).toFixed(3)} nm</b>.
    Half the probability lies inside <b>${r50.toFixed(2)} a₀</b>,
    <b>90%</b> inside <b>${r90.toFixed(2)} a₀</b> and <b>95%</b> inside
    <b>${r95.toFixed(2)} a₀</b> — turn on the cumulative curve on the P(r) plot to see this directly.
    The 3D cloud is a probability-density sampling, not a literal electron trajectory.
  `;

  renderEnergyLadder(n);
  if (refreshSpectralDisplay) refreshSpectralDisplay();
  currentCDFInstance = cdf;
  updateProbeSphereUI();

  if (typeof Plotly !== 'undefined') {
    lastRDFArgs = [n, l, m, radial, mp];
    plotRDF(n, l, m, radial, mp);
  } else {
    $('plotRDF').innerHTML =
      '<div style="padding:20px;color:#f87171">Plotly failed to load. Check your internet connection.</div>';
  }

  // Keep the plane the reader chose. Only switch away when it would render
  // blank for this orbital (a nodal plane), and never override a plane that an
  // incoming share link asked for explicitly — that link may be showing the
  // nodal plane on purpose.
  if (!restorePlaneOnce) {
    const half = Math.max(4, radial.rMaxPlot / 2);
    if (isNodalPlane(n, l, m, crossState.plane, half)) {
      crossState.plane = bestPlane(n, l, m, half);
      syncPlaneButtons(crossState.plane);
    }
  }
  restorePlaneOnce = false;

  plotCrossSectionFor(n, l, m, radial);

  // Keep the URL in sync (after the cross-section has resolved its plane) so
  // the view can be shared or bookmarked exactly as displayed.
  syncURL();

  lastCloudArgs = [n, l, m, radial];
  plotCloud(n, l, m, radial, { resetCamera: true }).catch((e) => {
    console.error(e);
    setStatus('3D cloud failed: ' + e.message, false);
  });
}

// Re-plot the cross-section for the current orbital using crossState.
function plotCrossSectionFor(n, l, m, radial) {
  lastCrossArgs = [n, l, m, radial];
  plotCrossSection(n, l, m, radial, {
    plane: crossState.plane,
    mode: crossState.mode
  });
}

readURLParams();
clampQuantum();
// Restoring a link can change the 3D view mode, so the dependent controls
// must be refreshed *after* the URL has been read.
syncViewControls();
initSpectralSimulator();
renderEnergyLadder(parseInt($('n').value, 10));
renderRecentOrbitals();
setupHelpDialog();

window.addEventListener('load', generate);
