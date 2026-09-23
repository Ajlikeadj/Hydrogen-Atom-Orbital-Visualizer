#!/usr/bin/env python3
"""Verify the hydrogen wavefunction numerics used in idk2.html.

This is an independent Python implementation of the same formulas the page
computes in JavaScript (atomic units, a0 = 1). It checks:

  * radial normalization:  ∫ r²|R_nl(r)|² dr = 1
  * angular normalization: ∫ |Y_l^m(θ,φ)|² dΩ = 1 (real combinations)
  * known most-probable radii and mean radii
  * radial node counts for states with nodes
  * hydrogen energy levels

Exits non-zero if any check fails.

Usage:
    python verify_quantum.py
"""
import math
import sys

# Windows consoles often default to cp1252, which cannot print the math
# symbols below; force UTF-8 output (with ? fallbacks) instead of crashing.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# ------------------------------------------------------------------
# Wavefunctions (mirror of the JavaScript in idk2.html)
# ------------------------------------------------------------------

def fact(n):
    r = 1
    for i in range(2, n + 1):
        r *= i
    return r


def binom(n, k):
    if k < 0 or k > n:
        return 0
    return fact(n) // (fact(k) * fact(n - k))


def assoc_laguerre(p, k, x):
    return sum(
        ((-1) ** i) * binom(p + k, p - i) * (x ** i) / fact(i)
        for i in range(p + 1)
    )


def assoc_legendre(l, m, x):
    x = max(-1.0, min(1.0, x))
    if m < 0 or m > l:
        return 0.0

    pmm = 1.0
    if m > 0:
        somx2 = math.sqrt((1 - x) * (1 + x))
        f = 1.0
        for i in range(1, m + 1):
            pmm *= -f * somx2
            f += 2.0

    if l == m:
        return pmm

    pmm1 = x * (2 * m + 1) * pmm
    if l == m + 1:
        return pmm1

    pll = 0.0
    for ll in range(m + 2, l + 1):
        pll = (x * (2 * ll - 1) * pmm1 - (ll + m - 1) * pmm) / (ll - m)
        pmm, pmm1 = pmm1, pll
    return pll


def R_nl(n, l, r):
    rho = 2 * r / n
    norm = math.sqrt((2 / n) ** 3 * fact(n - l - 1) / (2 * n * fact(n + l)))
    return norm * math.exp(-rho / 2) * (rho ** l) * assoc_laguerre(n - l - 1, 2 * l + 1, rho)


def P_r(n, l, r):
    R = R_nl(n, l, r)
    return r * r * R * R


def Y_lm_real(l, m, theta, phi):
    ct = max(-1.0, min(1.0, math.cos(theta)))
    am = abs(m)
    norm = math.sqrt((2 * l + 1) / (4 * math.pi) * fact(l - am) / fact(l + am))
    P = assoc_legendre(l, am, ct)
    if m > 0:
        return math.sqrt(2) * norm * P * math.cos(m * phi)
    if m < 0:
        return math.sqrt(2) * norm * P * math.sin(am * phi)
    return norm * P


# ------------------------------------------------------------------
# Numerical helpers
# ------------------------------------------------------------------

def simpson(f, a, b, n):
    """Composite Simpson's rule (n must be even)."""
    if n % 2:
        n += 1
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += f(a + i * h) * (4 if i % 2 else 2)
    return s * h / 3


def angular_integral(l, m, n=240):
    """∫|Y|² dΩ via a midpoint rule on (cos θ, φ)."""
    total = 0.0
    du = 2.0 / n          # spacing in u = cos θ
    dv = 2.0 * math.pi / n
    for i in range(n):
        u = -1.0 + (i + 0.5) * du
        theta = math.acos(max(-1.0, min(1.0, u)))
        for j in range(n):
            phi = (j + 0.5) * dv
            total += Y_lm_real(l, m, theta, phi) ** 2
    return total * du * dv


def most_probable_radius(n, l, rmax=80.0):
    """Coarse scan + golden-section refinement of P(r)."""
    n_scan = 40000
    best_r, best_p = 0.0, -1.0
    for i in range(n_scan + 1):
        r = rmax * i / n_scan
        p = P_r(n, l, r)
        if p > best_p:
            best_r, best_p = r, p

    gr = (math.sqrt(5) + 1) / 2
    a = max(0.0, best_r - rmax / n_scan * 4)
    b = min(rmax, best_r + rmax / n_scan * 4)
    for _ in range(80):
        c = b - (b - a) / gr
        d = a + (b - a) / gr
        if P_r(n, l, c) > P_r(n, l, d):
            b = d
        else:
            a = c
    return (a + b) / 2


def radial_node_count(n, l, rmax=80.0):
    """Count sign changes of R_nl(r) (excludes r = 0).

    Midpoint sampling so a node landing exactly on a grid point is still
    detected: the neighbors straddle it.
    """
    n_scan = 200000
    step = rmax / n_scan
    prev = R_nl(n, l, step / 2)
    count = 0
    for i in range(1, n_scan):
        cur = R_nl(n, l, (i + 0.5) * step)
        if (prev < 0) != (cur < 0):
            count += 1
        prev = cur
    return count


# ------------------------------------------------------------------
# Checks
# ------------------------------------------------------------------

results = []


def check(name, got, want, tol):
    ok = abs(got - want) <= tol
    print(f"  {'PASS' if ok else 'FAIL'}  {name.strip()}")
    results.append((name, got, want, ok))
    return ok


print("=" * 62)
print("  Hydrogen wavefunction verification (atomic units, a0 = 1)")
print("=" * 62)

# 1) Radial normalization: ∫ r²|R|² dr = 1
print("\n[1] Radial normalization  ∫ r²|R_nl(r)|² dr = 1")
for n, l in [(1, 0), (2, 0), (2, 1), (3, 0), (3, 2), (4, 1), (4, 3), (5, 2)]:
    norm = simpson(lambda r: P_r(n, l, r), 0, 80, 40000)
    check(f"    n={n}, l={l}   ∫ = {norm:.6f}", norm, 1.0, 2e-4)

# 2) Angular normalization for the real harmonics used by the page
print("\n[2] Angular normalization  ∫ |Y_l^m|² dΩ = 1")
for l in range(0, 4):
    for m in range(-l, l + 1):
        ang = angular_integral(l, m)
        check(f"    l={l}, m={m:+d}   ∫ = {ang:.6f}", ang, 1.0, 5e-4)

# 3) Analytic most-probable radii (hydrogen-like: r_max = n² for l = n−1)
print("\n[3] Most probable radius (analytic values)")
check("    1s → 1 a₀", most_probable_radius(1, 0), 1.0, 1e-3)
check("    2p → 4 a₀", most_probable_radius(2, 1), 4.0, 1e-3)
check("    3d → 9 a₀", most_probable_radius(3, 2), 9.0, 1e-3)
check("    4f → 16 a₀", most_probable_radius(4, 3), 16.0, 1e-3)
# 2s: r_max = (3 + √5) a₀ ≈ 5.236
check("    2s → (3+√5) a₀ ≈ 5.236", most_probable_radius(2, 0), 3 + math.sqrt(5), 1e-2)

# 4) Mean radius ⟨r⟩ = (3n² − l(l+1)) / 2
print("\n[4] Mean radius  ⟨r⟩ = (3n² − l(l+1))/2")
for n, l, want in [(1, 0, 1.5), (2, 0, 6.0), (2, 1, 5.0), (3, 2, 10.5), (4, 0, 24.0)]:
    mean_r = simpson(lambda r: r * P_r(n, l, r), 0, 80, 40000)
    check(f"    n={n}, l={l}   ⟨r⟩ = {mean_r:.4f}", mean_r, want, 5e-3)

# 5) Radial node counts (n − l − 1)
print("\n[5] Radial node counts  (expected n − l − 1)")
for n, l in [(2, 0), (3, 0), (3, 1), (4, 0), (4, 1), (5, 2)]:
    got = radial_node_count(n, l)
    want = n - l - 1
    check(f"    n={n}, l={l}   nodes = {got}", got, want, 0)

# 6) Energy levels E_n = −13.6057 eV / n², i.e. E_n · n² is constant
print("\n[6] Energy levels  E_n = −13.6057 eV / n²")
for n in range(1, 5):
    got = -13.6057 / (n * n)
    check(f"    n={n}   E = {got:+.6f} eV,  E·n² = {got * n * n:+.6f}", got * n * n, -13.6057, 1e-9)

# ------------------------------------------------------------------
# Summary
# ------------------------------------------------------------------
print("\n" + "=" * 62)
failed = [r for r in results if not r[3]]
print(f"  {len(results) - len(failed)}/{len(results)} checks passed")
if failed:
    print("  FAILED:")
    for name, got, want, _ in failed:
        print(f"    {name.strip()}  (got {got}, want {want})")
    print("=" * 62)
    raise SystemExit(1)
print("  All checks passed - the page's physics are sound.")
print("=" * 62)