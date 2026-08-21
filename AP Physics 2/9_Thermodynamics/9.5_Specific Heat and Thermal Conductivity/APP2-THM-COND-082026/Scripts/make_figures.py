"""
Figure generator for APP2-THM-COND-082026 (Thermal Conduction Through a Rod).

Writes figure_folder/q-1.png, q-3.png, q-5.png and q-7.png, the exact names the
YAML references. q2, q4 and q6 are text only and take no figure.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Rods are drawn TO SCALE within a panel, at a single units-per-metre factor
    applied to both the length and the diameter. That is the whole reason these
    figures exist: q7 is answered by noticing that the short fat rod beats the
    long thin one despite having the lowest conductivity, and a schematic that
    drew every rod the same shape would hide exactly the thing being tested. A
    consequence is that the 4 m rod in q7 really is a hairline, which is honest.
  - The reservoirs are plain rectangles with a temperature label, hot on the
    left and cold on the right in every panel, so the direction of transfer is
    never what a question is secretly about.
  - Every rod carries k, L and d as text. A student must be able to answer from
    the numbers alone if the print quality is poor.
  - Black line art, no colour, so the figures survive greyscale printing and
    match the PVGRPH, UNIPRES and TRMS banks in this course.
  - q7's four panels are labelled I to IV rather than A to D, because the exam
    renderer letters the answer options itself and two competing sets of letters
    on one question is a reading trap. Panel order is answer order, and the YAML
    locks all four options so seededShuffle leaves them alone.

The specific heat that q1 quotes is deliberately absent from every figure. It
plays no part in a steady state conduction rate, and drawing it would suggest
otherwise.
"""

import math
import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyArrow

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

DPI = 150
BLOCK_W = 1.3                    # reservoir block width, panel units
LW = 1.2


def blank_axes(ax, xmax=10.0, ymax=4.0):
    ax.set_xlim(0, xmax)
    ax.set_ylim(0, ymax)
    ax.set_aspect("equal")
    ax.axis("off")


def reservoir(ax, x, y_mid, h, label):
    """One reservoir block, its left edge at x, centred vertically on y_mid."""
    ax.add_patch(Rectangle((x, y_mid - h / 2), BLOCK_W, h,
                           fill=False, ec="black", lw=LW))
    ax.text(x + BLOCK_W / 2, y_mid, label, ha="center", va="center",
            fontsize=7.5, rotation=90)


def rod(ax, x0, y_mid, length, thick, k=None, dims=None, arrow=True):
    """A rod drawn to scale, its left edge at x0. Returns its right edge."""
    ax.add_patch(Rectangle((x0, y_mid - thick / 2), length, thick,
                           fill=False, ec="black", lw=LW))
    if arrow:
        ax.add_patch(FancyArrow(x0 + length * 0.35, y_mid, length * 0.3, 0,
                                width=0.02, head_width=0.16,
                                head_length=min(0.28, length * 0.15),
                                length_includes_head=True, ec="black",
                                fc="black"))
    if k is not None:
        ax.text(x0 + length / 2, y_mid + thick / 2 + 0.22, k,
                ha="center", va="bottom", fontsize=8)
    if dims is not None:
        ax.text(x0 + length / 2, y_mid - thick / 2 - 0.22, dims,
                ha="center", va="top", fontsize=8)
    return x0 + length


def scene(ax, rods, scale, hot, cold, y_mid=2.0, x0=0.3, caption=None):
    """
    Hot block, one or more parallel rods spanning to the cold block, cold block.

    `rods` is a list of (length_m, diameter_m, k_label, dim_label). Every rod in
    a scene has the same length, since they all bridge the same two reservoirs.

    Labels tucked above and below the rod itself read best, but they overrun a
    short rod and collide with the reservoir blocks. Pass `caption` instead for
    any panel whose drawn rod is under about 4 units long, and leave the two
    per-rod label slots empty.
    """
    L_m = rods[0][0]
    length = L_m * scale
    thicks = [d * scale for (_, d, _, _) in rods]
    span = sum(thicks) + 0.55 * (len(rods) - 1)
    block_h = max(span + 1.0, 2.2)

    reservoir(ax, x0, y_mid, block_h, hot)
    top = y_mid + span / 2
    for i, (_, _, k_lab, dim_lab) in enumerate(rods):
        t = thicks[i]
        c = top - sum(thicks[:i]) - 0.55 * i - t / 2
        rod(ax, x0 + BLOCK_W, c, length, t,
            k=k_lab if i == 0 else None,
            dims=dim_lab if i == len(rods) - 1 else None,
            arrow=True)
    reservoir(ax, x0 + BLOCK_W + length, y_mid, block_h, cold)
    x_end = x0 + 2 * BLOCK_W + length
    if caption:
        ax.text((x0 + x_end) / 2, y_mid - block_h / 2 - 0.30,
                caption, ha="center", va="top", fontsize=8)
    return x_end


HOT = "hot, 300 K"
COLD = "cold, 50 K"


def fig_q1():
    """The rod of q1: 1.5 m long, 0.5 m across, drawn true to scale (3:1)."""
    fig, ax = plt.subplots(figsize=(5.6, 2.4), dpi=DPI)
    blank_axes(ax, xmax=9.0, ymax=4.0)
    scene(ax, [(1.5, 0.5, "k = 500 W/(m·K)", "L = 1.5 m,  d = 0.5 m")],
          scale=3.0, hot=HOT, cold=COLD)
    fig.tight_layout(pad=0.1)
    fig.savefig(os.path.join(OUT_DIR, "q-1.png"), bbox_inches="tight")
    plt.close(fig)


def fig_q3():
    """Two rods bridging the same pair of reservoirs, compared side by side."""
    fig, axes = plt.subplots(1, 2, figsize=(8.4, 2.6), dpi=DPI)
    specs = [
        ("Rod A", 400, 2.0, 0.4),
        ("Rod B", 200, 1.0, 0.2),
    ]
    for ax, (name, k, L_m, d_m) in zip(axes, specs):
        blank_axes(ax, xmax=9.4, ymax=4.6)
        scene(ax, [(L_m, d_m, None, None)], scale=2.2,
              hot=HOT, cold=COLD, y_mid=2.6,
              caption="k = %d W/(m·K),  L = %.1f m,  d = %.1f m"
                      % (k, L_m, d_m))
        ax.text(0.3, 4.5, name, ha="left", va="top", fontsize=10)
    fig.tight_layout(pad=0.2)
    fig.savefig(os.path.join(OUT_DIR, "q-3.png"), bbox_inches="tight")
    plt.close(fig)


def fig_q5():
    """One rod of diameter d against two rods of diameter d/2, same length."""
    fig, axes = plt.subplots(1, 2, figsize=(8.4, 2.8), dpi=DPI)
    blank_axes(axes[0], xmax=9.0, ymax=4.6)
    scene(axes[0], [(1.5, 0.5, "k = 500 W/(m·K)", "one rod,  d = 0.5 m")],
          scale=3.0, hot=HOT, cold=COLD, y_mid=2.3)
    axes[0].text(0.3, 4.5, "Arrangement 1", ha="left", va="top", fontsize=10)

    blank_axes(axes[1], xmax=9.0, ymax=4.6)
    scene(axes[1], [(1.5, 0.25, "k = 500 W/(m·K)", ""),
                    (1.5, 0.25, "", "two rods,  d = 0.25 m each")],
          scale=3.0, hot=HOT, cold=COLD, y_mid=2.3)
    axes[1].text(0.3, 4.5, "Arrangement 2", ha="left", va="top", fontsize=10)

    fig.tight_layout(pad=0.2)
    fig.savefig(os.path.join(OUT_DIR, "q-5.png"), bbox_inches="tight")
    plt.close(fig)


def fig_q7():
    """
    Four rods between identical reservoirs, drawn to a common scale.

    I, II and IV trade conductivity against length in exactly compensating
    ways and are all equal. III wins on cross section alone, with the lowest
    conductivity of the four, which is the point of the question.

    The four panels hold rods of very different lengths, so a 2x2 grid of equal
    width columns leaves a gutter of dead space beside the two short rods. Each
    column is therefore given the width of its own widest scene, through
    gridspec width_ratios matched to the per column xlim, which keeps the
    units per inch identical in all four panels while closing the gutter. The
    column width has a floor because the caption under a short rod is wider than
    the rod itself, and a caption is drawn unclipped and would otherwise run into
    the neighbouring panel.
    """
    specs = [
        ("I", 200, 1.0, 0.2),
        ("II", 400, 2.0, 0.2),
        ("III", 100, 1.0, 0.4),
        ("IV", 800, 4.0, 0.2),
    ]
    scale = 1.8
    CAPTION_FLOOR = 5.4          # data units the widest caption needs
    PAD = 0.6                    # breathing room at each end of a scene

    width = lambda L_m: 2 * BLOCK_W + L_m * scale
    cols = [[specs[0], specs[2]], [specs[1], specs[3]]]
    col_xmax = [max(CAPTION_FLOOR, max(width(L) for (_, _, L, _) in c) + 2 * PAD)
                for c in cols]

    fig, axes = plt.subplots(
        2, 2, figsize=(sum(col_xmax) * 0.55, 4.6), dpi=DPI,
        gridspec_kw={"width_ratios": col_xmax, "wspace": 0.06, "hspace": 0.10},
    )
    for ax, (name, k, L_m, d_m) in zip(axes.ravel(), specs):
        col = axes.ravel().tolist().index(ax) % 2
        xmax = col_xmax[col]
        blank_axes(ax, xmax=xmax, ymax=3.8)
        scene(ax, [(L_m, d_m, None, None)],
              scale=scale, hot=HOT, cold=COLD, y_mid=2.2,
              x0=(xmax - width(L_m)) / 2,
              caption="k = %d W/(m·K),  L = %.1f m,  d = %.1f m"
                      % (k, L_m, d_m))
        ax.text(0.0, 3.7, name, ha="left", va="top", fontsize=11)
    fig.savefig(os.path.join(OUT_DIR, "q-7.png"), bbox_inches="tight")
    plt.close(fig)


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    fig_q1()
    fig_q3()
    fig_q5()
    fig_q7()
    print("wrote q-1.png, q-3.png, q-5.png, q-7.png to", OUT_DIR)
