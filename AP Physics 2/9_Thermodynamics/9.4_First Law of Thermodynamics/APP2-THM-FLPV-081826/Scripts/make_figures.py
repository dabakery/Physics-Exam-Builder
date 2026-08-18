"""
Figure generator for APP2-THM-FLPV-081826 (First Law Quantities Read from a
Pressure Volume Diagram).

Writes figure_folder/q-1.png ... q-7.png, the exact names the YAML references.
Every question in this bank takes a figure; there are no text-only questions.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - One P-V panel per question, drawn in units of V_0 and P_0. Both axes carry
    labelled ticks at 1, 2 and 3 and the grid is drawn, because every question
    is answered by reading coordinates off the axes and computing an area. A
    sketched diagram with bare axes would make the bank unanswerable.
  - Straight segments only. AP Physics 2 is algebra based, so an area under a
    process has to be a rectangle or a trapezoid. No curves anywhere, including
    isotherms, which are also left off because q7 turns on noticing that a
    straight line can begin and end at the same PV product without being an
    isothermal process.
  - States are lettered in the order the gas visits them, and the arrowhead
    sits at the midpoint of each segment rather than at its end, so a
    multi-segment path shows its direction at every step and a closed cycle
    reads unambiguously.
  - Vertex labels are pushed away from the centroid of the path, which keeps
    them off the drawn segments for every shape in this bank including the
    rectangle in q6.
  - Black line art on white, matching PVGRPH and the rest of this unit, so the
    figures survive greyscale printing.
"""

import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

AXIS_MAX = 3.7                   # headroom so no state sits on the frame
TICKS = [1, 2, 3]
XTICK_LABELS = [r"$V_0$", r"$2V_0$", r"$3V_0$"]
YTICK_LABELS = [r"$P_0$", r"$2P_0$", r"$3P_0$"]

# Each question is a path: the states the gas visits, in order, in units of
# (V_0, P_0). A path whose last point repeats its first is a closed cycle and
# the repeat is not lettered again.
QUESTIONS = {
    # q1: straight line out to (3,3). Area under it is a trapezoid, 4 P0V0.
    "q-1": [(1, 1), (3, 3)],

    # q2: q1 run backwards, so the same area is work done on the gas.
    "q-2": [(3, 3), (1, 1)],

    # q3: isobaric expansion at P0. Area is a rectangle, 2 P0V0.
    "q-3": [(1, 1), (3, 1)],

    # q4: isochoric, so there is no area at all and no work.
    "q-4": [(1, 1), (1, 3)],

    # q5: same endpoints as q1 by way of a corner, so the area is larger.
    "q-5": [(1, 1), (1, 3), (3, 3)],

    # q6: closed rectangle run counterclockwise, so the enclosed 4 P0V0 is
    #     work done on the gas over the cycle.
    "q-6": [(1, 1), (3, 1), (3, 3), (1, 3), (1, 1)],

    # q7: straight line between two states of equal PV product, so the internal
    #     energy ends where it started without the process being isothermal.
    "q-7": [(1, 3), (3, 1)],
}


def draw(ax, path):
    ax.set_xlim(0, AXIS_MAX)
    ax.set_ylim(0, AXIS_MAX)
    ax.set_xticks(TICKS)
    ax.set_yticks(TICKS)
    ax.set_xticklabels(XTICK_LABELS, fontsize=10)
    ax.set_yticklabels(YTICK_LABELS, fontsize=10)
    ax.grid(True, which="major", color="0.85", linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.set_xlabel("Volume", fontsize=10)
    ax.set_ylabel("Pressure", fontsize=10)

    closed = path[0] == path[-1]
    vertices = path[:-1] if closed else path

    xs = [p[0] for p in path]
    ys = [p[1] for p in path]
    ax.plot(xs, ys, color="black", linewidth=1.8, zorder=3)
    ax.plot([p[0] for p in vertices], [p[1] for p in vertices], "o",
            color="black", markersize=5, zorder=4)

    # Arrowhead at the midpoint of every segment, drawn as a very short
    # annotation across the midpoint so the head lands on the line itself.
    for (x0, y0), (x1, y1) in zip(path, path[1:]):
        mx, my = 0.5 * (x0 + x1), 0.5 * (y0 + y1)
        dx, dy = x1 - x0, y1 - y0
        span = (dx * dx + dy * dy) ** 0.5 or 1.0
        ux, uy = dx / span, dy / span
        ax.annotate("", xy=(mx + 0.08 * ux, my + 0.08 * uy),
                    xytext=(mx - 0.08 * ux, my - 0.08 * uy),
                    arrowprops=dict(arrowstyle="-|>", color="black",
                                    linewidth=1.8, mutation_scale=16),
                    zorder=4)

    cx = sum(p[0] for p in vertices) / len(vertices)
    cy = sum(p[1] for p in vertices) / len(vertices)
    for i, (x, y) in enumerate(vertices):
        dx, dy = x - cx, y - cy
        span = (dx * dx + dy * dy) ** 0.5 or 1.0
        ax.annotate(chr(65 + i), (x, y), textcoords="offset points",
                    xytext=(16.0 * dx / span, 16.0 * dy / span),
                    ha="center", va="center", fontsize=12, fontweight="bold")


def build(name, path):
    fig, ax = plt.subplots(figsize=(4.4, 4.2))
    draw(ax, path)
    fig.tight_layout(pad=0.8)
    out = os.path.join(OUT_DIR, name + ".png")
    fig.savefig(out, dpi=150, facecolor="white")
    plt.close(fig)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, path in QUESTIONS.items():
        out = build(name, path)
        # Report the work done BY the gas, as the signed area under the path,
        # so a physics change shows up in the run log rather than only on screen.
        w = sum(0.5 * (p0[1] + p1[1]) * (p1[0] - p0[0])
                for p0, p1 in zip(path, path[1:]))
        du = 1.5 * (path[-1][0] * path[-1][1] - path[0][0] * path[0][1])
        print("%s  %6d bytes  states=%d  W_by=%+g P0V0  dU=%+g P0V0  Q=%+g P0V0"
              % (name, os.path.getsize(out), len(path), w, du, du + w))


if __name__ == "__main__":
    main()
