"""
Figure generator for APP2-THM-CONGRPH-082026 (Graphs of the Thermal Conduction
Rate).

Writes figure_folder/q-1.png ... q-7.png, the exact names the YAML references.
Every question in this bank takes a figure.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Four panel questions are a 2x2 grid labelled I, II, III, IV. Roman numerals
    rather than A-D because the exam renderer letters the answer options itself,
    and two competing sets of letters on one question is a reading trap. Panel
    order is answer order, and the YAML locks all four options (`lock: true`) so
    seededShuffle leaves them alone. Remove the lock and the options shuffle out
    of step with the panels and the question breaks.
  - The correct panel is deliberately NOT always the same position across the
    bank: II, IV, III, I, IV for q1 to q5.
  - Both axes carry integer ticks and a dotted grid. q4 and q7 are answered by
    comparing one slope with another, so the grid is load bearing there; the
    shape-only questions carry it too, because a student should not have to
    learn a new axis convention halfway through a set.
  - Axes are labelled with the quantity and its unit but the numbers are small
    and generic. No question asks for a value read off a curve, only for a shape
    or a ratio of slopes, and inventing realistic wattages would suggest a
    precision the questions do not use.
  - On the two "how does the graph change" questions the original measurement is
    a dashed line repeated in all four panels and the candidate answer is the
    solid line, which is the convention the AP exam uses.
  - Black line art, no colour, so the figures survive greyscale printing and
    match the PVGRPH and COND banks in this course.

The relationship behind every panel is the steady conduction rate,
Q/dt = k*A*dT/L, so the shapes on offer are: proportional (area, temperature
difference, conductivity), inverse (length) and square (diameter).
"""

import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
import numpy as np

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

DPI = 150
AXMAX = 5.6                      # a little headroom so no curve ends on the frame
TICKS = [1, 2, 3, 4, 5]
PANEL_LABELS = ["I", "II", "III", "IV"]
RATE = "Q/Δt  (W)"


def graph_axes(ax, xlabel):
    ax.set_xlim(0, AXMAX)
    ax.set_ylim(0, AXMAX)
    ax.set_xticks(TICKS)
    ax.set_yticks(TICKS)
    ax.tick_params(labelsize=7, length=3)
    ax.grid(True, ls=":", lw=0.6, color="0.65")
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.set_xlabel(xlabel, fontsize=8.5)
    ax.set_ylabel(RATE, fontsize=8.5)


def curve(ax, fn, x0=0.0, x1=5.2, dashed=False, cap=5.2):
    """Plot fn over [x0, x1], dropping any part that leaves the frame."""
    x = np.linspace(max(x0, 1e-3), x1, 400)
    y = fn(x)
    keep = y <= cap
    style = dict(color="black", lw=1.4)
    if dashed:
        style.update(lw=1.1, ls=(0, (5, 4)))
    ax.plot(x[keep], y[keep], **style)


def panels(name, xlabel, fns, refs=None):
    """A 2x2 grid of four candidate graphs, optionally over a dashed original."""
    fig, axes = plt.subplots(2, 2, figsize=(6.6, 5.4), dpi=DPI)
    for ax, label, fn in zip(axes.ravel(), PANEL_LABELS, fns):
        graph_axes(ax, xlabel)
        if refs is not None:
            curve(ax, refs, dashed=True)
        curve(ax, fn[0], x0=fn[1])
        ax.set_title(label, fontsize=11, loc="left", pad=4)
    fig.tight_layout(pad=0.6, w_pad=1.6, h_pad=1.2)
    fig.savefig(os.path.join(OUT_DIR, name), bbox_inches="tight")
    plt.close(fig)


def single(name, xlabel, plots, legend_at=None):
    """One graph, used by the linearisation and slope reading questions."""
    fig, ax = plt.subplots(figsize=(3.9, 3.2), dpi=DPI)
    graph_axes(ax, xlabel)
    for fn, x0, label in plots:
        curve(ax, fn, x0=x0)
        if label:
            ax.text(*legend_at[label], label, fontsize=8.5, ha="left",
                    va="center")
    fig.tight_layout(pad=0.4)
    fig.savefig(os.path.join(OUT_DIR, name), bbox_inches="tight")
    plt.close(fig)


# Shapes reused across questions. Each is (function, starting x).
PROPORTIONAL = (lambda x: x, 0.0)                    # straight, through origin
OFFSET_LINE = (lambda x: 1.6 + 0.7 * x, 0.0)         # straight, y intercept
FALLING_LINE = (lambda x: 5.0 - x, 0.0)              # straight, falling to zero
SQUARE = (lambda x: 0.2 * x ** 2, 0.0)               # concave up, through origin
ROOT = (lambda x: 2.3 * np.sqrt(x), 0.0)             # concave down, through origin
INVERSE = (lambda x: 3.0 / x, 0.6)                   # falling hyperbola


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # q1  rate against cross sectional area, everything else fixed.
    #     Proportional. Correct panel: II.
    panels("q-1.png", "A  (m²)",
           [SQUARE, PROPORTIONAL, OFFSET_LINE, INVERSE])

    # q2  rate against length, everything else fixed.
    #     Inverse. Correct panel: IV.
    panels("q-2.png", "L  (m)",
           [FALLING_LINE, PROPORTIONAL, SQUARE, INVERSE])

    # q3  rate against temperature difference, then the length is doubled.
    #     Still proportional, half the slope. Correct panel: III.
    panels("q-3.png", "ΔT  (K)",
           [(lambda x: 2.0 * x, 0.0),
            (lambda x: x - 2.0, 2.0),
            (lambda x: 0.5 * x, 0.0),
            (lambda x: 5.0 * (1 - np.exp(-0.45 * x)), 0.0)],
           refs=lambda x: x)

    # q4  rate against temperature difference, then the diameter is doubled.
    #     Still proportional, four times the slope. Correct panel: I.
    panels("q-4.png", "ΔT  (K)",
           [(lambda x: 2.0 * x, 0.0),
            (lambda x: 1.0 * x, 0.0),
            (lambda x: 0.125 * x, 0.0),
            (lambda x: 0.25 * x, 0.0)],
           refs=lambda x: 0.5 * x)

    # q5  rate against diameter, everything else fixed.
    #     Square. Correct panel: IV.
    panels("q-5.png", "d  (m)",
           [PROPORTIONAL, INVERSE, ROOT, SQUARE])

    # q6  the measured curve, to be straightened by choosing a new x axis.
    single("q-6.png", "L  (m)", [(lambda x: 3.0 / x, 0.6, None)])

    # q7  two rods of the same metal and the same length, slopes 4 to 1.
    single("q-7.png", "ΔT  (K)",
           [(lambda x: x, 0.0, "Rod X"),
            (lambda x: 0.25 * x, 0.0, "Rod Y")],
           legend_at={"Rod X": (4.0, 4.6), "Rod Y": (4.0, 1.5)})

    print("wrote q-1.png ... q-7.png to", OUT_DIR)


if __name__ == "__main__":
    main()
