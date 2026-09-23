/* ============================================================
   QUANTUM MECHANICS MODULE
   Analytical hydrogen wavefunctions in atomic units: a0 = 1.
   ============================================================ */
const QM = (() => {
  const L_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i'];

  function fact(n) {
    if (n < 0) return NaN;
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function binom(n, k) {
    if (k < 0 || k > n) return 0;
    return fact(n) / (fact(k) * fact(n - k));
  }

  // Associated Laguerre polynomial L_p^k(x)
  function assocLaguerre(p, k, x) {
    let sum = 0;
    for (let i = 0; i <= p; i++) {
      const sign = (i % 2 === 0) ? 1 : -1;
      sum += sign * binom(p + k, p - i) * Math.pow(x, i) / fact(i);
    }
    return sum;
  }

  // Associated Legendre polynomial P_l^m(x), m >= 0
  function assocLegendre(l, m, x) {
    x = Math.max(-1, Math.min(1, x));
    if (m < 0 || m > l) return 0;

    let pmm = 1.0;
    if (m > 0) {
      const somx2 = Math.sqrt((1 - x) * (1 + x));
      let f = 1.0;
      for (let i = 1; i <= m; i++) {
        pmm *= -f * somx2;
        f += 2.0;
      }
    }

    if (l === m) return pmm;

    let pmm1 = x * (2 * m + 1) * pmm;
    if (l === m + 1) return pmm1;

    let pll = 0;
    for (let ll = m + 2; ll <= l; ll++) {
      pll = (x * (2 * ll - 1) * pmm1 - (ll + m - 1) * pmm) / (ll - m);
      pmm = pmm1;
      pmm1 = pll;
    }
    return pll;
  }

  // Radial wavefunction R_{nl}(r), a0 = 1
  function R_nl(n, l, r) {
    if (r < 0) r = 0;
    const rho = 2 * r / n;
    const norm = Math.sqrt(
      Math.pow(2 / n, 3) * fact(n - l - 1) /
      (2 * n * fact(n + l))
    );
    const L = assocLaguerre(n - l - 1, 2 * l + 1, rho);
    return norm * Math.exp(-rho / 2) * Math.pow(rho, l) * L;
  }

  // Radial distribution function P(r) = r^2 |R(r)|^2
  function P_r(n, l, r) {
    const R = R_nl(n, l, r);
    return r * r * R * R;
  }

  // Real spherical harmonics for familiar orbital shapes
  function Y_lm_real(l, m, theta, phi) {
    const cosT = Math.max(-1, Math.min(1, Math.cos(theta)));
    const absM = Math.abs(m);

    const norm = Math.sqrt(
      (2 * l + 1) / (4 * Math.PI) *
      fact(l - absM) / fact(l + absM)
    );

    const P = assocLegendre(l, absM, cosT);

    if (m > 0) return Math.SQRT2 * norm * P * Math.cos(m * phi);
    if (m < 0) return Math.SQRT2 * norm * P * Math.sin(absM * phi);
    return norm * P;
  }

  function psi(n, l, m, r, theta, phi) {
    return R_nl(n, l, r) * Y_lm_real(l, m, theta, phi);
  }

  // Global maximum of P(r)
  function mostProbableRadius(n, l, rLimit) {
    rLimit = rLimit || Math.max(40, 12 * n * n + 40);
    const N = 8000;

    let bestR = 0;
    let bestP = -Infinity;

    for (let i = 0; i <= N; i++) {
      const r = (i / N) * rLimit;
      const p = P_r(n, l, r);
      if (p > bestP) {
        bestP = p;
        bestR = r;
      }
    }

    // Golden-section refinement
    let a = Math.max(0, bestR - (rLimit / N) * 4);
    let b = Math.min(rLimit, bestR + (rLimit / N) * 4);
    const gr = (Math.sqrt(5) + 1) / 2;

    for (let it = 0; it < 80; it++) {
      const c = b - (b - a) / gr;
      const d = a + (b - a) / gr;
      if (P_r(n, l, c) > P_r(n, l, d)) b = d;
      else a = c;
    }

    const r = (a + b) / 2;
    return { r, P: P_r(n, l, r) };
  }

  // Roots of R(r), excluding r = 0
  function findRadialNodes(n, l, rLimit) {
    const expected = n - l - 1;
    if (expected <= 0) return [];

    rLimit = rLimit || Math.max(40, 12 * n * n + 40);
    const N = 8000;
    const nodes = [];

    let prevR = R_nl(n, l, 1e-8);

    for (let i = 1; i <= N; i++) {
      const r = (i / N) * rLimit;
      const curR = R_nl(n, l, r);

      if (prevR * curR < 0) {
        let a = ((i - 1) / N) * rLimit;
        let b = r;

        for (let it = 0; it < 70; it++) {
          const mid = (a + b) / 2;
          const Rm = R_nl(n, l, mid);

          if (Rm === 0) {
            a = b = mid;
            break;
          }

          if (R_nl(n, l, a) * Rm < 0) b = mid;
          else a = mid;
        }

        nodes.push((a + b) / 2);
      }

      prevR = curR;
    }

    // Remove duplicates and keep only the physically expected number.
    const unique = [];
    const tol = (rLimit / N) * 2;

    for (const r of nodes) {
      if (!unique.length || Math.abs(r - unique[unique.length - 1]) > tol) {
        unique.push(r);
      }
    }

    return unique.slice(0, expected);
  }

  function orbitalName(n, l) {
    return `${n}${L_LETTERS[l] || '?'}`;
  }

  // Conventional label for a REAL orbital (the convention used by the page,
  // where cos(m*phi) carries +m and sin(|m|*phi) carries -m).
  function realOrbitalLabel(n, l, m) {
    if (l === 0) return orbitalName(n, 0);
    if (l === 1) {
      if (m === 0) return `${n}p_z`;
      if (m > 0) return `${n}p_x`;
      return `${n}p_y`;
    }
    if (l === 2) {
      if (m === 0) return `${n}d_z²`;
      if (m === 1) return `${n}d_xz`;
      if (m === -1) return `${n}d_yz`;
      if (m === 2) return `${n}d_x²−y²`;
      return `${n}d_xy`;
    }
    return `${orbitalName(n, l)} (m=${m > 0 ? '+' : ''}${m})`;
  }

  // Cumulative radial probability C(r) = ∫_0^r P(r') dr'.
  // Returns an interpolating lookup plus its inverse, used for the
  // "probability inside a sphere" readouts.
  function radialCDF(n, l, rLimit) {
    rLimit = rLimit || Math.max(40, 12 * n * n + 40);
    const N = 6000;
    const dr = rLimit / N;
    const cdf = new Float64Array(N + 1);

    let prevP = P_r(n, l, 0);
    let integral = 0;

    for (let i = 1; i <= N; i++) {
      const r = i * dr;
      const p = P_r(n, l, r);
      integral += 0.5 * (prevP + p) * dr;
      cdf[i] = integral;
      prevP = p;
    }

    const total = integral > 0 ? integral : 1;
    for (let i = 0; i <= N; i++) cdf[i] /= total;

    function at(r) {
      if (!(r > 0)) return 0;
      if (r >= rLimit) return 1;
      const x = r / dr;
      const i = Math.floor(x);
      const f = x - i;
      const c0 = cdf[i];
      const c1 = cdf[Math.min(i + 1, N)];
      return c0 + f * (c1 - c0);
    }

    // Radius enclosing the given probability (inverse CDF).
    function radius(p) {
      if (!(p > 0)) return 0;
      if (p >= 1) return rLimit;

      let lo = 0;
      let hi = N;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cdf[mid] < p) lo = mid + 1;
        else hi = mid;
      }

      if (lo === 0) return 0;
      const c0 = cdf[lo - 1];
      const c1 = cdf[lo];
      const t = (c1 > c0) ? (p - c0) / (c1 - c0) : 0;
      return (lo - 1 + t) * dr;
    }

    return { at, radius };
  }

  // Energy of hydrogen state n: E_n = -13.6057 / n^2 eV
  function energyLevel(n) {
    if (!Number.isInteger(n) || n < 1) return NaN;
    return -PHYS.RYDBERG_EV / (n * n);
  }

  // Wavelength to RGB approximation (Dan Bruton algorithm)
  function wavelengthToRGB(wl) {
    if (wl < 380) return { r: 168, g: 85, b: 247, label: 'Ultraviolet (UV)', isUV: true, hex: '#a855f7' };
    if (wl > 750) return { r: 239, g: 68, b: 68, label: 'Infrared (IR)', isIR: true, hex: '#ef4444' };

    let r = 0, g = 0, b = 0;
    if (wl >= 380 && wl < 440) {
      r = -(wl - 440) / (440 - 380);
      b = 1.0;
    } else if (wl >= 440 && wl < 490) {
      g = (wl - 440) / (490 - 440);
      b = 1.0;
    } else if (wl >= 490 && wl < 510) {
      g = 1.0;
      b = -(wl - 510) / (510 - 490);
    } else if (wl >= 510 && wl < 580) {
      r = (wl - 510) / (580 - 510);
      g = 1.0;
    } else if (wl >= 580 && wl < 645) {
      r = 1.0;
      g = -(wl - 645) / (645 - 580);
    } else if (wl >= 645 && wl <= 750) {
      r = 1.0;
    }

    let factor = 1.0;
    if (wl >= 380 && wl < 420) factor = 0.3 + 0.7 * (wl - 380) / (420 - 380);
    else if (wl >= 700 && wl <= 750) factor = 0.3 + 0.7 * (750 - wl) / (750 - 700);

    const gamma = 0.8;
    const toByte = (c) => Math.max(0, Math.min(255, Math.round(Math.pow(c * factor, gamma) * 255)));
    const red = toByte(r);
    const green = toByte(g);
    const blue = toByte(b);
    const hex = '#' + [red, green, blue].map(x => x.toString(16).padStart(2, '0')).join('');

    return { r: red, g: green, b: blue, label: 'Visible Spectrum', isVisible: true, hex };
  }

  // Transition between two energy levels ni and nf
  function spectralTransition(ni, nf) {
    if (ni === nf) return null;
    const upper = Math.max(ni, nf);
    const lower = Math.min(ni, nf);

    const E_upper = energyLevel(upper);
    const E_lower = energyLevel(lower);
    const deltaE = E_upper - E_lower; // in eV

    const HC_EV_NM = 1239.841984; // hc in eV·nm
    const wavelength = HC_EV_NM / deltaE; // nm
    const frequency = (2.99792458e5) / wavelength; // THz

    let seriesName = 'Higher series';
    if (lower === 1) seriesName = 'Lyman series (UV)';
    else if (lower === 2) seriesName = 'Balmer series (Visible)';
    else if (lower === 3) seriesName = 'Paschen series (IR)';
    else if (lower === 4) seriesName = 'Brackett series (Far IR)';
    else if (lower === 5) seriesName = 'Pfund series (Far IR)';

    let lineName = `${upper} → ${lower}`;
    if (lower === 2) {
      if (upper === 3) lineName = 'H-alpha (Hα, 656.3 nm)';
      else if (upper === 4) lineName = 'H-beta (Hβ, 486.1 nm)';
      else if (upper === 5) lineName = 'H-gamma (Hγ, 434.0 nm)';
      else if (upper === 6) lineName = 'H-delta (Hδ, 410.2 nm)';
      else if (upper === 7) lineName = 'H-epsilon (Hε, 397.0 nm)';
    } else if (lower === 1) {
      if (upper === 2) lineName = 'Ly-alpha (Lyα, 121.6 nm)';
      else if (upper === 3) lineName = 'Ly-beta (Lyβ, 102.6 nm)';
      else if (upper === 4) lineName = 'Ly-gamma (Lyγ, 97.3 nm)';
    }

    const color = wavelengthToRGB(wavelength);
    const deltaE_aJ = deltaE * 0.1602176634; // 1 eV = 0.1602176634 aJ (attojoules = 10^-18 J)
    const wavenumber_cm = 1e7 / wavelength; // in cm^-1
    const momentum = (6.62607015e-34) / (wavelength * 1e-9); // in kg*m/s
    const wavelength_angstrom = wavelength * 10;

    return {
      upper,
      lower,
      deltaE,
      deltaE_aJ,
      wavelength,
      wavelength_angstrom,
      frequency,
      wavenumber_cm,
      momentum,
      seriesName,
      lineName,
      color,
      isEmission: ni > nf
    };
  }

  const BALMER_LINES = [
    { name: 'Hα', full: 'H-alpha', ni: 3, nf: 2, wl: 656.3, color: '#ff1744', desc: 'n=3 → n=2 (Deep Red)' },
    { name: 'Hβ', full: 'H-beta', ni: 4, nf: 2, wl: 486.1, color: '#00e5ff', desc: 'n=4 → n=2 (Aqua Cyan)' },
    { name: 'Hγ', full: 'H-gamma', ni: 5, nf: 2, wl: 434.0, color: '#651fff', desc: 'n=5 → n=2 (Violet-Blue)' },
    { name: 'Hδ', full: 'H-delta', ni: 6, nf: 2, wl: 410.2, color: '#7c4dff', desc: 'n=6 → n=2 (Violet)' },
    { name: 'Hε', full: 'H-epsilon', ni: 7, nf: 2, wl: 397.0, color: '#8c52ff', desc: 'n=7 → n=2 (Near UV Violet)' }
  ];

  function checkSelectionRule(l_i, l_f) {
    if (l_i === undefined || l_f === undefined || l_i === null || l_f === null) {
      return { allowed: true, text: 'Dipole selection rule: Δℓ = ±1' };
    }
    const deltaL = Math.abs(l_i - l_f);
    if (deltaL === 1) {
      return {
        allowed: true,
        text: `Electric dipole allowed (Δℓ = ${l_f - l_i > 0 ? '+1' : '−1'})`,
        detail: 'Fast electric dipole radiation (lifetime ~1.6 ns).'
      };
    } else {
      return {
        allowed: false,
        text: `Dipole forbidden (Δℓ = ${l_f - l_i})`,
        detail: 'Metastable state: requires two-photon emission or magnetic dipole radiation.'
      };
    }
  }

  const SPECTRAL_SERIES = [
    { name: 'Lyman', nf: 1, range: 'Ultraviolet (UV)', desc: 'Transitions to ground state n=1 (91–122 nm)' },
    { name: 'Balmer', nf: 2, range: 'Visible / Near UV', desc: 'Transitions to n=2 (365–656 nm visible lines)' },
    { name: 'Paschen', nf: 3, range: 'Infrared (IR)', desc: 'Transitions to n=3 (820–1875 nm)' },
    { name: 'Brackett', nf: 4, range: 'Far Infrared', desc: 'Transitions to n=4 (1458–4051 nm)' },
    { name: 'Pfund', nf: 5, range: 'Far Infrared', desc: 'Transitions to n=5 (2279–7460 nm)' }
  ];

  return {
    R_nl,
    P_r,
    Y_lm_real,
    psi,
    mostProbableRadius,
    findRadialNodes,
    orbitalName,
    realOrbitalLabel,
    radialCDF,
    L_LETTERS,
    energyLevel,
    wavelengthToRGB,
    spectralTransition,
    SPECTRAL_SERIES,
    BALMER_LINES,
    checkSelectionRule
  };
})();


/* ============================================================
   CLOUD SAMPLING MODULE
   Samples r from P(r)dr and angles from |Y|^2 dOmega.
   ============================================================ */
const CloudSampler = (() => {
  const angularMaxCache = new Map();

  function radialData(n, l, mp) {
    const M = 8000;

    // Large enough to include almost all radial probability.
    const rTrial = Math.max(
      50,
      14 * n * n + 50,
      mp.r * 6
    );

    const rs = new Float64Array(M + 1);
    const cdf = new Float64Array(M + 1);

    let prevP = QM.P_r(n, l, 0);
    let integral = 0;
    let maxR2 = 0;

    for (let i = 0; i <= M; i++) {
      const r = (i / M) * rTrial;
      rs[i] = r;

      const R = QM.R_nl(n, l, r);
      const R2 = R * R;
      if (R2 > maxR2) maxR2 = R2;

      const p = r * r * R2;

      if (i > 0) {
        const dr = r - rs[i - 1];
        integral += 0.5 * (prevP + p) * dr;
      }

      cdf[i] = integral;
      prevP = p;
    }

    if (!(integral > 0) || !isFinite(integral)) integral = 1;

    for (let i = 0; i <= M; i++) {
      cdf[i] /= integral;
    }

    // Build inverse-CDF quantile table for fast radius sampling.
    const Q = 4096;
    const quantiles = new Float64Array(Q);
    let idx = 0;

    for (let q = 0; q < Q; q++) {
      const target = q / (Q - 1);

      while (idx < M && cdf[idx] < target) idx++;

      if (idx === 0) {
        quantiles[q] = rs[0];
      } else {
        const c0 = cdf[idx - 1];
        const c1 = cdf[idx];
        const t = (c1 > c0) ? (target - c0) / (c1 - c0) : 0;
        quantiles[q] = rs[idx - 1] + t * (rs[idx] - rs[idx - 1]);
      }
    }

    const r999 = quantiles[Math.floor(0.999 * (Q - 1))];

    const extent = Math.max(
      8,
      r999 * 1.15,
      mp.r * 1.8
    );

    const rMaxPlot = Math.max(
      extent * 1.08,
      mp.r * 1.35,
      8
    );

    function sampleRadius() {
      const u = Math.random() * (Q - 1);
      const i = Math.floor(u);
      const f = u - i;
      const i2 = Math.min(i + 1, Q - 1);
      return quantiles[i] * (1 - f) + quantiles[i2] * f;
    }

    return {
      sampleRadius,
      maxR2,
      extent,
      rMaxPlot,
      rTrial
    };
  }

  function angularMaxY2(l, m) {
    const key = `${l}:${m}`;
    if (angularMaxCache.has(key)) return angularMaxCache.get(key);

    let maxY2 = 0;

    // Deterministic angular grid scan.
    const Ntheta = 140;
    const Nphi = 280;

    for (let i = 0; i <= Ntheta; i++) {
      const ct = 1 - 2 * i / Ntheta;
      const theta = Math.acos(Math.max(-1, Math.min(1, ct)));

      for (let j = 0; j < Nphi; j++) {
        const phi = 2 * Math.PI * j / Nphi;
        const Y = QM.Y_lm_real(l, m, theta, phi);
        const y2 = Y * Y;
        if (y2 > maxY2) maxY2 = y2;
      }
    }

    // Random refinement to make the rejection bound safer.
    for (let s = 0; s < 8000; s++) {
      const ct = Math.random() * 2 - 1;
      const theta = Math.acos(Math.max(-1, Math.min(1, ct)));
      const phi = Math.random() * 2 * Math.PI;

      const Y = QM.Y_lm_real(l, m, theta, phi);
      const y2 = Y * Y;
      if (y2 > maxY2) maxY2 = y2;
    }

    if (!(maxY2 > 0) || !isFinite(maxY2)) {
      maxY2 = 1 / (4 * Math.PI);
    }

    // Safety factor for rejection sampling.
    maxY2 *= 1.35;

    angularMaxCache.set(key, maxY2);
    return maxY2;
  }

  return {
    radialData,
    angularMaxY2
  };
})();


/* ============================================================
   VALIDATION
   ============================================================ */
function validate(n, l, m) {
  if (!Number.isInteger(n) || n < 1) {
    return "n must be a positive integer: n ≥ 1.";
  }

  if (n > 7) {
    return "For smooth browser rendering, please use n ≤ 7.";
  }

  if (!Number.isInteger(l) || l < 0 || l > n - 1) {
    return `l must satisfy 0 ≤ l ≤ n−1. For n = ${n}, allowed l values are 0 to ${n - 1}.`;
  }

  if (!Number.isInteger(m) || m < -l || m > l) {
    return `mₗ must satisfy −l ≤ mₗ ≤ +l. For l = ${l}, allowed mₗ values are ${-l} to ${l}.`;
  }

  return null;
}
