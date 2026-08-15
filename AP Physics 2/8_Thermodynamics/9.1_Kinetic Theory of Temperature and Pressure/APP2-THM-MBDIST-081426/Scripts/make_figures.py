"""
Figure generator for APP2-THM-MBDIST-081426 (Reading Maxwell-Boltzmann Speed
Distributions).

Writes figure_folder/q-1.png through q-7.png, the exact names the YAML
references. Every question in this bank is built around a figure, so unlike the
TRMS bank there is no text-only question here.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, carried over from APP2-THM-TRMS-080926/Scripts/make_figures.py so
the two banks look like they belong to the same course:
  - Curves are drawn from the real Maxwell-Boltzmann speed distribution, not
    sketched. Written in terms of the most probable speed,
        f(v) = (4/sqrt(pi)) * (v^2 / v_p^3) * exp(-v^2 / v_p^2)
    which integrates to exactly 1 over v in [0, inf). Normalisation is
    load-bearing in this bank, not cosmetic: q4 asks the student to explain the
    lower peak directly, and q1/q3 both carry a distractor that reasons from
    equal areas. Curves drawn at equal height would make those questions wrong.
  - Black line art, distinguished by dash pattern, labelled directly on the
    curve. No colour, so the curves survive greyscale printing.
  - The y axis carries no numbers. No question asks for a probability density,
    and numbers there would invite arithmetic that is not being asked for. The x
    axis DOES carry numbers, because q1, q5 and q6 require reading speeds off
    it.
  - Label only what the question needs. Temperatures and molar masses are never
    printed, since identifying those is the task in q1, q3 and q7.

Curve labels avoid A/B/C on purpose. The exporters letter the answer choices
A/B/C/D and then shuffle them (seededShuffle in exam-export.js), so a curve
labelled B collides with an option labelled B and the two are almost never the
same thing. Samples and gases are therefore X/Y/Z, and q3's process states are
numbered, so no curve label can be mistaken for an answer letter.

Speed choices, and why each matters:
  q1  peaks 500 / 300 / 800   labels X / Y / Z, deliberately out of order so the
                              answer cannot be found by picking the last curve.
                              Y is coldest AND tallest, which is the trap.
  q2  peaks 400 / 700         close enough that the tail of X clearly reaches
                              past the peak of Y. The visible overlap IS the
                              question.
  q3  peaks 350 / 600         same idea, one process rather than two samples.
  q4  peaks 400 / 900         spread wide so the drop in peak height is obvious.
  q5  peak 500, band 600-800   band sits on the falling side, well clear of the
                              peak, so it cannot be misread as "the peak".
  q6  peak 400                only the most probable speed is marked. The mean
                              is deliberately NOT drawn, because locating it
                              relative to the peak is the question.
  q7  peaks 350 / 550 / 1100  three gases at one temperature. X is heaviest and
                              tallest, so the tallest curve is the correct
                              answer here, which stops q1 from teaching
                              "tallest is always the wrong choice".
"""

import os

import numpy as np
import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "figure_folder")

INK = "#111111"
SHADE = "#c4c4c4"
LW = 2.0
FS = 15                  # curve label / axis label font size
FS_TICK = 12
FIGSIZE = (6.0, 4.2)
DPI = 140

SOLID = "solid"
DASHED = (0, (6, 3))
DOTDASH = (0, (1, 2, 5, 2))


def maxwell(v, v_p):
    """Normalised Maxwell-Boltzmann speed distribution, parameterised by v_p."""
    v = np.asarray(v, dtype=float)
    return (4.0 / np.sqrt(np.pi)) * (v ** 2 / v_p ** 3) * np.exp(-(v ** 2) / v_p ** 2)


def peak_height(v_p):
    return float(maxwell(v_p, v_p))


def new_axes(vmax):
    fig, ax = plt.subplots(figsize=FIGSIZE)
    ax.set_xlabel("molecular speed (m/s)", fontsize=FS, color=INK)
    ax.set_ylabel("relative number of molecules", fontsize=FS, color=INK)
    ax.set_xlim(0, vmax)
    ax.tick_params(axis="x", labelsize=FS_TICK, colors=INK)
    ax.set_yticks([])                      # density values are never asked for
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_linewidth(1.3)
        ax.spines[side].set_color(INK)
    return fig, ax


def draw(ax, v, v_p, style=SOLID):
    ax.plot(v, maxwell(v, v_p), color=INK, lw=LW, ls=style)


def label_curve(ax, text, x, y, ha="center", va="bottom"):
    ax.text(x, y, text, fontsize=FS, color=INK, ha=ha, va=va)


def drop_line(ax, v_p, frac=1.0):
    """Dotted vertical from the axis up to the curve, so a speed can be read."""
    ax.plot([v_p, v_p], [0, peak_height(v_p) * frac],
            color=INK, lw=1.0, ls=(0, (2, 3)))


def save(fig, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    fig.savefig(path, dpi=DPI, bbox_inches="tight", pad_inches=0.15,
                facecolor="white")
    plt.close(fig)
    print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")


# ── q1: three containers, one gas, three temperatures ────────────────────────
def q1():
    vmax = 2000.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    for v_p, style in [(500.0, SOLID), (300.0, DASHED), (800.0, DOTDASH)]:
        draw(ax, v, v_p, style)

    label_curve(ax, "X", 620, float(maxwell(620, 500.0)) * 1.04)
    label_curve(ax, "Y", 300, peak_height(300.0) * 1.03)
    label_curve(ax, "Z", 1080, float(maxwell(1080, 800.0)) * 1.06)

    ax.set_xticks([0, 400, 800, 1200, 1600, 2000])
    ax.set_ylim(0, peak_height(300.0) * 1.18)
    save(fig, "q-1.png")


# ── q2: two samples of one gas, two temperatures. Overlap is the point ───────
def q2():
    vmax = 1800.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    draw(ax, v, 400.0, SOLID)
    draw(ax, v, 700.0, DASHED)

    label_curve(ax, "X", 400, peak_height(400.0) * 1.03)
    label_curve(ax, "Y", 940, float(maxwell(940, 700.0)) * 1.06)

    ax.set_xticks([0, 300, 600, 900, 1200, 1500, 1800])
    ax.set_ylim(0, peak_height(400.0) * 1.18)
    save(fig, "q-2.png")


# ── q3: one sample, state A to state B through some process ──────────────────
def q3():
    vmax = 1600.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    draw(ax, v, 350.0, SOLID)
    draw(ax, v, 600.0, DASHED)

    label_curve(ax, "state 1", 350, peak_height(350.0) * 1.03)
    # clear of the curve, not sitting on it: the label is two words wide here
    label_curve(ax, "state 2", 960, float(maxwell(830, 600.0)) * 1.30)

    ax.set_xticks([0, 400, 800, 1200, 1600])
    ax.set_ylim(0, peak_height(350.0) * 1.20)
    save(fig, "q-3.png")


# ── q4: one gas, two temperatures, spread wide so the lower peak is obvious ──
def q4():
    vmax = 2200.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    draw(ax, v, 400.0, SOLID)
    draw(ax, v, 900.0, DASHED)

    label_curve(ax, "X", 400, peak_height(400.0) * 1.03)
    label_curve(ax, "Y", 1220, float(maxwell(1220, 900.0)) * 1.08)

    ax.set_xticks([0, 400, 800, 1200, 1600, 2000])
    ax.set_ylim(0, peak_height(400.0) * 1.18)
    save(fig, "q-4.png")


# ── q5: one sample, a shaded speed band. The area is the question ────────────
def q5():
    vmax = 1600.0
    v_p = 500.0
    lo, hi = 600.0, 800.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    band = np.linspace(lo, hi, 400)
    ax.fill_between(band, 0, maxwell(band, v_p), color=SHADE, zorder=1)
    ax.plot([lo, lo], [0, float(maxwell(lo, v_p))], color=INK, lw=1.0, zorder=2)
    ax.plot([hi, hi], [0, float(maxwell(hi, v_p))], color=INK, lw=1.0, zorder=2)
    ax.plot(v, maxwell(v, v_p), color=INK, lw=LW, ls=SOLID, zorder=3)

    ax.set_xticks([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600])
    ax.set_ylim(0, peak_height(v_p) * 1.15)
    save(fig, "q-5.png")


# ── q6: one sample, only the most probable speed marked ──────────────────────
def q6():
    vmax = 1400.0
    v_p = 400.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    draw(ax, v, v_p, SOLID)
    drop_line(ax, v_p)
    label_curve(ax, "most probable speed", v_p + 40, peak_height(v_p) * 1.02,
                ha="left")

    ax.set_xticks([0, 200, 400, 600, 800, 1000, 1200, 1400])
    ax.set_ylim(0, peak_height(v_p) * 1.16)
    save(fig, "q-6.png")


# ── q7: three different gases, one temperature. Heaviest is slowest ──────────
def q7():
    vmax = 2500.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    for v_p, style in [(350.0, SOLID), (550.0, DASHED), (1100.0, DOTDASH)]:
        draw(ax, v, v_p, style)

    label_curve(ax, "X", 350, peak_height(350.0) * 1.03)
    label_curve(ax, "Y", 760, float(maxwell(760, 550.0)) * 1.06)
    label_curve(ax, "Z", 1480, float(maxwell(1480, 1100.0)) * 1.08)

    ax.set_xticks([0, 500, 1000, 1500, 2000, 2500])
    ax.set_ylim(0, peak_height(350.0) * 1.18)
    save(fig, "q-7.png")


if __name__ == "__main__":
    q1(); q2(); q3(); q4(); q5(); q6(); q7()
