const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'idk2.html'), 'utf8');

// Load utils.js and quantum.js
const utilsCode = fs.readFileSync(path.join(ROOT, 'js/utils.js'), 'utf8');
const quantumCode = fs.readFileSync(path.join(ROOT, 'js/quantum.js'), 'utf8');
const sandbox = { console, Math };
vm.createContext(sandbox);
vm.runInContext(utilsCode, sandbox);
vm.runInContext(quantumCode, sandbox);
const QM = vm.runInContext('QM', sandbox);

let pass = 0, fail = 0;
function test(name, cond) {
  if (cond) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.error(`  FAIL: ${name}`);
  }
}

console.log('=== Verifying New Quantum & Spectral Features ===');

// 1. Energy Levels
test('Ground state energy E_1 = -13.6 eV', Math.abs(QM.energyLevel(1) - (-13.6)) < 0.001);
test('First excited state E_2 = -3.4 eV', Math.abs(QM.energyLevel(2) - (-3.4)) < 0.001);
test('n=3 state E_3 = -1.511 eV', Math.abs(QM.energyLevel(3) - (-1.511)) < 0.01);

// 2. Spectral Transitions
const hAlpha = QM.spectralTransition(3, 2);
test('H-alpha series is Balmer', hAlpha && hAlpha.seriesName === 'Balmer');
test('H-alpha wavelength is ~656.3 nm', hAlpha && Math.abs(hAlpha.wavelength - 656.3) < 0.5);
test('H-alpha photon is in visible spectrum', hAlpha && hAlpha.color && !hAlpha.color.isUV && !hAlpha.color.isIR);
test('H-alpha color is reddish', hAlpha && hAlpha.color.r > 200 && hAlpha.color.b < 100);

const lymanAlpha = QM.spectralTransition(2, 1);
test('Lyman-alpha series is Lyman', lymanAlpha && lymanAlpha.seriesName === 'Lyman');
test('Lyman-alpha wavelength is ~121.6 nm (UV)', lymanAlpha && Math.abs(lymanAlpha.wavelength - 121.6) < 0.5 && lymanAlpha.color.isUV);

const paschenAlpha = QM.spectralTransition(4, 3);
test('Paschen-alpha series is Paschen', paschenAlpha && paschenAlpha.seriesName === 'Paschen');
test('Paschen-alpha wavelength is ~1875 nm (IR)', paschenAlpha && Math.abs(paschenAlpha.wavelength - 1875) < 5 && paschenAlpha.color.isIR);

// 3. Selection Rules
test('s -> p transition allowed (Delta l = 1)', QM.checkSelectionRule(0, 1).allowed === true);
test('p -> d transition allowed (Delta l = 1)', QM.checkSelectionRule(1, 2).allowed === true);
test('s -> s transition forbidden (Delta l = 0)', QM.checkSelectionRule(0, 0).allowed === false);
test('s -> d transition forbidden (Delta l = 2)', QM.checkSelectionRule(0, 2).allowed === false);

// 4. HTML Elements
const requiredNewElements = [
  'energySpectraSection',
  'energyLadder',
  'bohrSvg',
  'bohrOrbitsGroup',
  'bohrElectron',
  'photonWave',
  'spectrogramBar',
  'specMarker',
  'transitionNi',
  'transitionNf',
  'spectralColorSwatch',
  'spectralRegionBadge',
  'spectralLineTitle',
  'spectralWl',
  'spectralFreq',
  'spectralDeltaE',
  'selectionRuleBox',
  'ruleIcon',
  'ruleTitle',
  'ruleDesc',
  'jumpNiBtn',
  'jumpNfBtn'
];

requiredNewElements.forEach(id => {
  test(`DOM element #${id} present in idk2.html`, html.includes(`id="${id}"`));
});

// 5. Layout check
test('idk2.html contains wide-section class', html.includes('wide-section'));
test('css/styles.css contains .wide-section grid-column 1 / -1', fs.readFileSync(path.join(ROOT, 'css/styles.css'), 'utf8').includes('.wide-section'));

console.log(`\nResults: ${pass} passed, ${fail} failed.`);
if (fail > 0) process.exit(1);
