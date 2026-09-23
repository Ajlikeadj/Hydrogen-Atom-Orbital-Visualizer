/* ============================================================
   3D ISOSURFACE + PROBABILITY CLOUD
   Three.js with built-in camera controls, async chunked
   computation, and a cached marching-tetrahedra isosurface.
   ============================================================ */

/* ----- render state shared with the UI module ----- */
let pointCount = 20000;
let themeKey = 'plasma';
let lastCloudArgs = null;

// 3D view mode: 'surface' (phase-coloured isosurface) or 'density' (point cloud).
let viewMode = 'surface';
let isoFrac = 0.12;
const surfaceCache = new Map();

let scene = null;
let camera = null;
let renderer = null;
let cloudGroup = null;
let helperGroup = null;
let nucleusGroup = null;
let probSphereGroup = null;
let autoRotate = false;
let cloudGenToken = 0;

let cutawayMode = 'none'; // 'none' | 'half_x' | 'quarter_xz' | 'half_y'
let showProbSphere = false;
let probSphereRadius = 0;

function getClippingPlanes() {
  if (typeof THREE === 'undefined') return [];
  if (cutawayMode === 'half_x') {
    return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)];
  }
  if (cutawayMode === 'quarter_xz') {
    return [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
    ];
  }
  if (cutawayMode === 'half_y') {
    return [new THREE.Plane(new THREE.Vector3(0, -1, 0), 0)];
  }
  return [];
}

function applyClippingToMaterials() {
  if (!cloudGroup) return;
  const planes = getClippingPlanes();
  cloudGroup.traverse((obj) => {
    if (obj.material) {
      obj.material.clippingPlanes = planes;
      obj.material.clipShadows = true;
      obj.material.needsUpdate = true;
    }
  });
}

function setCutaway(mode) {
  cutawayMode = mode || 'none';
  applyClippingToMaterials();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function setCameraPreset(view) {
  if (!cameraState) return;
  if (view === 'iso') {
    cameraState.theta = Math.PI / 4;
    cameraState.phi = Math.PI / 3;
  } else if (view === 'top') {
    cameraState.theta = 0;
    cameraState.phi = 0.05;
  } else if (view === 'front') {
    cameraState.theta = 0;
    cameraState.phi = Math.PI / 2;
  } else if (view === 'side') {
    cameraState.theta = Math.PI / 2;
    cameraState.phi = Math.PI / 2;
  } else if (view === 'reset') {
    if (lastCloudArgs) {
      const extent = lastCloudArgs[3].extent;
      cameraState.radius = Math.max(extent * 2.1, 12);
    }
    cameraState.theta = Math.PI / 4;
    cameraState.phi = Math.PI / 3;
  }
  if (camera) updateCamera();
}

function updateProbSphere(radius, visible) {
  if (visible !== undefined) showProbSphere = !!visible;
  if (radius !== undefined && Number.isFinite(radius)) probSphereRadius = radius;

  if (!probSphereGroup || typeof THREE === 'undefined') return;
  clearGroup(probSphereGroup);

  if (showProbSphere && probSphereRadius > 0.05) {
    const geom = new THREE.SphereGeometry(probSphereRadius, 32, 20);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x4cc9f0,
      wireframe: true,
      transparent: true,
      opacity: 0.38
    });
    const fillMat = new THREE.MeshBasicMaterial({
      color: 0x4cc9f0,
      transparent: true,
      opacity: 0.07,
      depthWrite: false
    });
    probSphereGroup.add(new THREE.Mesh(geom, wireMat));
    probSphereGroup.add(new THREE.Mesh(geom, fillMat));
    probSphereGroup.visible = true;
  } else {
    probSphereGroup.visible = false;
  }
  if (renderer && scene && camera) renderer.render(scene, camera);
}

const cameraState = {
  theta: Math.PI / 4,
  phi: Math.PI / 3,
  radius: 35
};

function clearGroup(group) {
  while (group.children.length) {
    const obj = group.children[0];
    group.remove(obj);

    // Cached isosurface geometries are shared across renders — never dispose them.
    if (obj.geometry && !obj.geometry.userData.cached) obj.geometry.dispose();

    if (obj.material) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach(mat => mat.dispose());
      } else {
        obj.material.dispose();
      }
    }
  }
}

function updateCamera() {
  camera.position.setFromSphericalCoords(
    cameraState.radius,
    cameraState.phi,
    cameraState.theta
  );
  camera.lookAt(0, 0, 0);
}

function animate() {
  requestAnimationFrame(animate);
  if (renderer && scene && camera) {
    if (autoRotate && cloudGroup) cloudGroup.rotation.y += 0.004;
    renderer.render(scene, camera);
  }
}

function initThree() {
  if (typeof THREE === 'undefined') {
    throw new Error('Three.js failed to load. Check your internet connection.');
  }

  const container = $('cloud3d');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070f);

  const width = container.clientWidth || 800;
  const height = container.clientHeight || 520;

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 8000);

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
  } catch (e) {
    container.innerHTML =
      '<div style="padding:20px;color:#f87171">WebGL is not available in this browser.</div>';
    throw e;
  }

  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.domElement.style.touchAction = 'none';
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  cloudGroup = new THREE.Group();
  helperGroup = new THREE.Group();
  nucleusGroup = new THREE.Group();
  probSphereGroup = new THREE.Group();

  scene.add(cloudGroup);
  scene.add(helperGroup);
  scene.add(nucleusGroup);
  scene.add(probSphereGroup);

  // Lighting for the isosurface mesh (MeshPhongMaterial is unlit without it).
  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 0.55);
  sun.position.set(1, 1.5, 0.9);
  scene.add(sun);

  // Built-in orbit-like controls.
  const el = renderer.domElement;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
  });

  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;

    lastX = e.clientX;
    lastY = e.clientY;

    cameraState.theta -= dx * 0.005;
    cameraState.phi -= dy * 0.005;

    cameraState.phi = Math.max(0.05, Math.min(Math.PI - 0.05, cameraState.phi));

    updateCamera();
  });

  const stopDrag = () => { dragging = false; };
  el.addEventListener('pointerup', stopDrag);
  el.addEventListener('pointercancel', stopDrag);
  el.addEventListener('pointerleave', stopDrag);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraState.radius *= Math.exp(e.deltaY * 0.0012);
    cameraState.radius = Math.max(3, Math.min(3000, cameraState.radius));
    updateCamera();
  }, { passive: false });

  window.addEventListener('resize', () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;

    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  updateCamera();
  animate();
}

function showCloudOverlay(show, text) {
  const overlay = $('cloudOverlay');
  $('cloudProgress').textContent = text || '';
  overlay.hidden = !show;
}

function buildHelpers(extent) {
  clearGroup(helperGroup);
  clearGroup(nucleusGroup);

  // Axes, grid, nucleus.
  const axes = new THREE.AxesHelper(extent * 1.2);
  helperGroup.add(axes);

  const grid = new THREE.GridHelper(extent * 2.6, 24, 0x3355aa, 0x18204a);
  grid.material.transparent = true;
  grid.material.opacity = 0.22;
  helperGroup.add(grid);

  helperGroup.visible = $('showHelpers').checked;

  const nucleus = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(0.18, extent * 0.012), 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd166 })
  );
  nucleusGroup.add(nucleus);
  nucleusGroup.visible = $('showNucleus').checked;
}

function setCloudTitle(text) {
  const container = $('cloud3d');
  let title = container.querySelector('.cloud-title');

  if (!title) {
    title = document.createElement('div');
    title.className = 'cloud-title';
    title.style.cssText = `
      position: absolute;
      top: 10px;
      left: 14px;
      color: #4cc9f0;
      font-weight: 600;
      font-size: 14px;
      pointer-events: none;
      text-shadow: 0 0 6px #000;
      z-index: 5;
    `;
    container.appendChild(title);
  }

  title.textContent = text;
}

// Yield to the browser between sampling chunks. requestAnimationFrame is
// preferred, but it never fires in throttled or background tabs — race it
// against a timer so sampling always makes progress.
function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    requestAnimationFrame(finish);
    setTimeout(finish, 50);
  });
}

function replotCloud() {
  if (!lastCloudArgs) return;
  const [n, l, m, radial] = lastCloudArgs;
  plotCloud(n, l, m, radial, { resetCamera: false }).catch((e) => {
    console.error(e);
    setStatus('3D cloud failed: ' + e.message, false);
  });
}

/* Dispatcher: isosurface (default) or density point cloud. */
async function plotCloud(n, l, m, radial, opts = {}) {
  if (viewMode === 'density') return plotDensityCloud(n, l, m, radial, opts);
  return plotSurface(n, l, m, radial, opts);
}

async function plotDensityCloud(n, l, m, radial, opts = {}) {
  if (!renderer) initThree();

  const token = ++cloudGenToken;
  showCloudOverlay(true, 'Sampling…');

  clearGroup(cloudGroup);
  clearGroup(helperGroup);
  clearGroup(nucleusGroup);

  const extent = radial.extent;

  buildHelpers(extent);

  const maxY2 = CloudSampler.angularMaxY2(l, m);
  const maxPsi2 = Math.max(1e-300, radial.maxR2 * maxY2);

  const N_POINTS = pointCount;
  const positions = new Float32Array(N_POINTS * 3);
  const colors = new Float32Array(N_POINTS * 3);

  const theme = THEMES[themeKey] || THEMES.plasma;
  const cLow = new THREE.Color(theme.low);
  const cHigh = new THREE.Color(theme.high);
  const tmp = new THREE.Color();

  let count = 0;
  let totalAngleAttempts = 0;
  const maxTotalAttempts = N_POINTS * 800;
  const CHUNK = 4096;

  // Sample in chunks so the UI never freezes, with live progress.
  while (count < N_POINTS && totalAngleAttempts < maxTotalAttempts) {
    const batchEnd = Math.min(count + CHUNK, N_POINTS);

    while (count < batchEnd && totalAngleAttempts < maxTotalAttempts) {
      const r = radial.sampleRadius();

      let theta = 0;
      let phi = 0;
      let y2 = 0;
      let accepted = false;

      // Angular rejection sampling from |Y_l^m|^2.
      for (let a = 0; a < 150; a++) {
        totalAngleAttempts++;

        const ct = Math.random() * 2 - 1;
        theta = Math.acos(Math.max(-1, Math.min(1, ct)));
        phi = Math.random() * 2 * Math.PI;

        const Y = QM.Y_lm_real(l, m, theta, phi);
        y2 = Y * Y;

        const acceptProb = Math.min(1, y2 / maxY2);

        if (Math.random() < acceptProb) {
          accepted = true;
          break;
        }
      }

      if (!accepted) continue;

      const sinT = Math.sin(theta);

      // Map quantum z-axis to visual vertical axis for readability.
      const x = r * sinT * Math.cos(phi);
      const y = r * Math.cos(theta);
      const z = r * sinT * Math.sin(phi);

      positions[3 * count] = x;
      positions[3 * count + 1] = y;
      positions[3 * count + 2] = z;

      const R = QM.R_nl(n, l, r);
      const p2 = R * R * y2;

      let t = p2 / maxPsi2;
      if (!isFinite(t)) t = 0;

      t = Math.max(0, Math.min(1, t));
      t = Math.pow(t, 0.4); // gamma boost for visibility

      tmp.copy(cLow).lerp(cHigh, t);

      colors[3 * count] = tmp.r;
      colors[3 * count + 1] = tmp.g;
      colors[3 * count + 2] = tmp.b;

      count++;
    }

    // Bail out if a newer generation superseded this one.
    if (token !== cloudGenToken) return;

    showCloudOverlay(true, `Sampling ${count.toLocaleString()} / ${N_POINTS.toLocaleString()} points…`);
    await nextFrame();
  }

  if (token !== cloudGenToken) return;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.setDrawRange(0, count);

  const pointSize = Math.max(0.14, extent / 170);

  const mat = new THREE.PointsMaterial({
    size: pointSize,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    clippingPlanes: getClippingPlanes()
  });

  const points = new THREE.Points(geom, mat);
  cloudGroup.add(points);

  // Only re-aim the camera when the orbital itself changes.
  if (opts.resetCamera) {
    cameraState.radius = Math.max(extent * 2.1, 12);
    cameraState.theta = Math.PI / 4;
    cameraState.phi = Math.PI / 3;
    updateCamera();
  }

  setCloudTitle(
    `${QM.orbitalName(n, l)} orbital · n=${n}, l=${l}, mₗ=${m} · ${count.toLocaleString()} sample points`
  );

  showCloudOverlay(false);
}


/* ============================================================
   ISOSURFACE VIEW
   Signed wavefunction ψ evaluated on an adaptive grid; a
   marching-tetrahedra isosurface at isoFrac of max|ψ|, colored
   by the sign of ψ (blue +, pink −), with normals from the
   analytic field gradient. Cached per (n, l, m, iso) so
   revisits are instant.
   ============================================================ */
const TET_CORNERS = [
  [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6],
  [0, 7, 4, 6], [0, 4, 5, 6], [0, 5, 1, 6]
];
const CORNER_X = [0, 1, 1, 0, 0, 1, 1, 0];
const CORNER_Y = [0, 0, 1, 1, 0, 0, 1, 1];
const CORNER_Z = [0, 0, 0, 0, 1, 1, 1, 1];

// Farthest radius at which |ψ| can still reach the isosurface level.
// |ψ(r)| ≤ |R_nl(r)| · max_angles|Y|, so the outermost surface point lies at
// the largest r with |R_nl(r)| · maxAngY ≥ iso. Used to size the field box.
function surfaceReach(n, l, m, iso) {
  const maxAngY = Math.sqrt(CloudSampler.angularMaxY2(l, m) / 1.35);
  const rMax = Math.max(40, 12 * n * n + 40);
  const N = 6000;
  let reach = 0;
  for (let i = 0; i <= N; i++) {
    const r = (i / N) * rMax;
    if (Math.abs(QM.R_nl(n, l, r)) * maxAngY >= iso) reach = r;
  }
  return reach;
}

async function computeField(n, l, m, half, token) {
  const N = half > 30 ? 48 : 64;
  const N1 = N + 1;
  const h = (2 * half) / N;
  const sy = N1;
  const sz = N1 * N1;
  const values = new Float32Array(N1 * N1 * N1);
  let maxAbs = 0;

  for (let iz = 0; iz < N1; iz++) {
    const z = -half + iz * h;
    for (let iy = 0; iy < N1; iy++) {
      const y = -half + iy * h;
      const base = iz * sz + iy * sy;
      for (let ix = 0; ix < N1; ix++) {
        const x = -half + ix * h;
        const r = Math.sqrt(x * x + y * y + z * z);
        let v;
        if (r < 1e-9) {
          v = QM.R_nl(n, l, 0) * QM.Y_lm_real(l, m, 0, 0);
        } else {
          const theta = Math.acos(Math.max(-1, Math.min(1, z / r)));
          const phi = Math.atan2(y, x);
          v = QM.R_nl(n, l, r) * QM.Y_lm_real(l, m, theta, phi);
        }
        values[base + ix] = v;
        // Normalize against the chemically relevant lobes: for s orbitals the
        // central |ψ(0)| peak dwarfs the outer shells, so ignore r < 1.5 a₀.
        const a = Math.abs(v);
        if (a > maxAbs && r >= 1.5) maxAbs = a;
      }
    }
    if ((iz & 7) === 7) {
      if (token !== cloudGenToken) return null;
      showCloudOverlay(true, `Computing wavefunction field… ${Math.round(((iz + 1) / N1) * 100)}%`);
      await nextFrame();
    }
  }

  return { values, N, N1, h, half, maxAbs: Math.max(maxAbs, 1e-300) };
}

async function extractSurface(field, token) {
  const { values, N, N1, h, half, maxAbs } = field;
  const iso = isoFrac * maxAbs;
  const sy = N1;
  const sz = N1 * N1;

  const positions = [];
  const normals = [];
  const colors = [];
  let triCount = 0;

  function gradAt(ix, iy, iz) {
    const i = ix + iy * sy + iz * sz;
    const gx = ix === 0 ? (values[i + 1] - values[i]) / h
      : ix === N1 - 1 ? (values[i] - values[i - 1]) / h
      : (values[i + 1] - values[i - 1]) / (2 * h);
    const gy = iy === 0 ? (values[i + sy] - values[i]) / h
      : iy === N1 - 1 ? (values[i] - values[i - sy]) / h
      : (values[i + sy] - values[i - sy]) / (2 * h);
    const gz = iz === 0 ? (values[i + sz] - values[i]) / h
      : iz === N1 - 1 ? (values[i] - values[i - sz]) / h
      : (values[i + sz] - values[i - sz]) / (2 * h);
    return [gx, gy, gz];
  }

  // One isosurface vertex on edge (from → to) of the current tet.
  function emitVertex(ax, ay, az, vA, bx, by, bz, vB, t) {
    const px = (ax + t * (bx - ax)) * h - half;
    const py = (ay + t * (by - ay)) * h - half;
    const pz = (az + t * (bz - az)) * h - half;
    const gA = gradAt(ax, ay, az);
    const gB = gradAt(bx, by, bz);
    let nx = gA[0] + t * (gB[0] - gA[0]);
    let ny = gA[1] + t * (gB[1] - gA[1]);
    let nz = gA[2] + t * (gB[2] - gA[2]);
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl > 1e-12) { nx /= nl; ny /= nl; nz /= nl; } else { nx = 0; ny = 0; nz = 1; }
    // Keep normals facing away from the nucleus so both lobes light consistently.
    if (nx * px + ny * py + nz * pz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const b = Math.max(0.3, 1 - 0.35 * (Math.sqrt(px * px + py * py + pz * pz) / (half * 1.01)));
    // Quantum frame (x, y, z) → visual (x, z, y): same mapping as the density sampler.
    positions.push(px, pz, py);
    normals.push(nx, nz, ny);
    // vA is the above-corner value (|vA| > iso > 0), so its sign is the lobe's sign.
    if (vA >= 0) colors.push(0.30 * b, 0.79 * b, 0.94 * b);
    else colors.push(0.97 * b, 0.15 * b, 0.52 * b);
  }

  // Drop the last emitted triangle if it is degenerate (zero area).
  function trimDegenerate(start) {
    const p = positions;
    const ux = p[start + 3] - p[start], uy = p[start + 4] - p[start + 1], uz = p[start + 5] - p[start + 2];
    const vx = p[start + 6] - p[start], vy = p[start + 7] - p[start + 1], vz = p[start + 8] - p[start + 2];
    const cxr = uy * vz - uz * vy, cyr = uz * vx - ux * vz, czr = ux * vy - uy * vx;
    if (cxr * cxr + cyr * cyr + czr * czr < 1e-18) {
      positions.length = start;
      normals.length = start;
      colors.length = start;
      return;
    }
    triCount++;
  }

  // Marching tetrahedra: a cube splits into 6 tets sharing the main diagonal.
  // Corners are classified by |ψ| against iso, so BOTH lobes (ψ = +iso and
  // ψ = −iso) are extracted; the interpolated crossing uses the sign of the
  // above-corner so each sheet lands on its own side of the node plane.
  // A tet splits as k = 0/4 (skip), 1/3 (one triangle from the lone corner),
  // or 2/2 (a quad = two triangles across the mixed edges).
  function processCell(cx, cy, cz) {
    for (const T of TET_CORNERS) {
      const coords = T.map(k => [cx + CORNER_X[k], cy + CORNER_Y[k], cz + CORNER_Z[k]]);
      const v = coords.map(c => values[c[0] + c[1] * sy + c[2] * sz]);

      const above = [];
      for (let k = 0; k < 4; k++) if (Math.abs(v[k]) > iso) above.push(k);
      const kc = above.length;
      if (kc === 0 || kc === 4) continue;

      const lerp = (kFrom, kTo) => {
        const [ax, ay, az] = coords[kFrom];
        const [bx, by, bz] = coords[kTo];
        const target = v[kFrom] >= 0 ? iso : -iso;
        let t = (target - v[kFrom]) / (v[kTo] - v[kFrom]);
        if (!(t > 0)) t = 0;
        else if (t > 1) t = 1;
        emitVertex(ax, ay, az, v[kFrom], bx, by, bz, v[kTo], t);
      };

      if (kc === 1 || kc === 3) {
        const a = kc === 1 ? above[0] : [0, 1, 2, 3].find(k => !above.includes(k));
        const others = [0, 1, 2, 3].filter(k => k !== a);
        const start = positions.length;
        lerp(a, others[0]);
        lerp(a, others[1]);
        lerp(a, others[2]);
        trimDegenerate(start);
      } else {
        const [a, b] = above;
        const rest = [0, 1, 2, 3].filter(k => k !== a && k !== b);
        const c = rest[0], d = rest[1];
        let start = positions.length;
        lerp(a, c); lerp(b, c); lerp(b, d);
        trimDegenerate(start);
        start = positions.length;
        lerp(a, c); lerp(b, d); lerp(a, d);
        trimDegenerate(start);
      }
    }
  }

  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < N; ix++) {
        processCell(ix, iy, iz);
      }
    }
    if ((iz & 7) === 7) {
      if (token !== cloudGenToken) return null;
      showCloudOverlay(true, `Extracting isosurface… ${Math.round(((iz + 1) / N) * 100)}%`);
      await nextFrame();
    }
  }

  if (triCount === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.computeBoundingSphere();
  geometry.userData.cached = true; // owned by surfaceCache — never dispose
  geometry.triCount = triCount;
  return geometry;
}

async function plotSurface(n, l, m, radial, opts = {}) {
  if (!renderer) initThree();

  const token = ++cloudGenToken;
  showCloudOverlay(true, 'Isosurface…');

  clearGroup(cloudGroup);
  clearGroup(helperGroup);
  clearGroup(nucleusGroup);

  const extent = radial.extent;

  buildHelpers(extent);

  const isoPct = Math.round(isoFrac * 100);
  const key = `${n}:${l}:${m}:${isoPct}`;
  let geometry = surfaceCache.get(key);

  if (!geometry) {
    // First pass uses the density-derived box; if the isosurface would poke
    // out of it (e.g. s-orbital outer shells), enlarge and recompute so lobes
    // are never clipped.
    let half = extent / 2;
    let field = await computeField(n, l, m, half, token);
    if (!field || token !== cloudGenToken) return;
    const iso = isoFrac * field.maxAbs;
    const reach = surfaceReach(n, l, m, iso);
    if (reach * 1.08 + 0.3 > half) {
      half = reach * 1.08 + 0.3;
      field = await computeField(n, l, m, half, token);
      if (!field || token !== cloudGenToken) return;
    }
    geometry = await extractSurface(field, token);
    if (!geometry || token !== cloudGenToken) return;
    surfaceCache.set(key, geometry);
  }

  const mat = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 16,
    specular: 0x222244,
    clippingPlanes: getClippingPlanes(),
    clipShadows: true
  });
  cloudGroup.add(new THREE.Mesh(geometry, mat));

  // Only re-aim the camera when the orbital itself changes.
  if (opts.resetCamera) {
    cameraState.radius = Math.max(extent * 2.1, 12);
    cameraState.theta = Math.PI / 4;
    cameraState.phi = Math.PI / 3;
    updateCamera();
  }

  setCloudTitle(
    `${QM.orbitalName(n, l)} isosurface · iso ${isoPct}% · ${geometry.triCount.toLocaleString()} triangles`
  );

  showCloudOverlay(false);
}


/* ============================================================
   UI HOOKS
   ============================================================ */
$('autoRotate').addEventListener('change', (e) => {
  autoRotate = e.target.checked;
});

$('showHelpers').addEventListener('change', (e) => {
  if (helperGroup) helperGroup.visible = e.target.checked;
});

$('showNucleus').addEventListener('change', (e) => {
  if (nucleusGroup) nucleusGroup.visible = e.target.checked;
});

/* Export the current 3D frame as a PNG. Rendering synchronously right before
   reading the canvas means we don't need preserveDrawingBuffer (which would
   cost performance on every frame). */
$('export3d').onclick = () => {
  if (!renderer || !scene || !camera) {
    toast('Nothing to export yet — generate an orbital first.', 'bad');
    return;
  }

  try {
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');

    const n = parseInt($('n').value, 10);
    const l = parseInt($('l').value, 10);
    const m = parseInt($('m').value, 10);

    const a = document.createElement('a');
    a.href = url;
    a.download = `hydrogen-${QM.orbitalName(n, l)}-m${m}-${viewMode}.png`;
    a.click();

    toast('Saved 3D view as PNG', 'good');
  } catch (e) {
    console.error(e);
    toast('Could not export the 3D view.', 'bad');
  }
};
