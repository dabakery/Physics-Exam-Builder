"""
Figure generator for APP2-THM-ENTPTH-082626 (Entropy Along Different
Thermodynamic Paths).

Writes figure_folder/q-1.png and q-7.png. Only three of the seven questions take
a figure, and q1 and q2 share q-1.png: they show the student the same three
paths and ask two different questions about them, which is the point of the
pair, so drawing it twice would risk the two copies drifting apart.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, copied deliberately from APP2-THM-WPATH-081826 so that a student
meeting a pressure volume diagram in unit 9 never has to learn a second
convention:
  - Labelled ticks in units of P_0 and V_0, a light grid, and the top and right
    spines dropped.
  - Straight segments carry a dot at every corner, so a two leg path cannot be
    mistaken for one bent line, and every process carries an arrow showing which
    way it runs.
  - Processes are NOT named on the figure. Identifying a constant pressure leg
    or an isotherm by its shape is expected knowledge, and the stems say in
    words what each process is.
  - Paths are numbered with Roman numerals, because the exam renderer letters
    the answer options itself and two sets of letters on one question is a
    reading trap.
  - Black line art on white, so the figures survive greyscale printing.

Physics that must not drift:
  - q-1: A is (V_0, 3P_0) and B is (3V_0, P_0), chosen so the two states have
    the same product of pressure and volume. That is what makes the isotherm
    through A pass through B, so path II is a real single process between the
    two states rather than a curve that misses. It also makes the internal
    energy change zero along every path, which is what lets q2 compare the
    energy transferred by heating without a temperature change confusing it.
    Any change to A or B has to preserve P_A V_A = P_B V_B or path II stops
    connecting them.
  - q-1 paths, with the energy transferred INTO the gas by heating printed in
    the run log: I is 6 P_0 V_0, II is about 3.30, III is 2. Those three
    different numbers are what q2 is built on, and the entropy change of the gas
    is identical along all three.
  - q-7: four processes from one state to four DIFFERENT states, which is what
    makes "they are all the same" the wrong answer there. The four must keep
    ending in four distinct places or the question collapses.
  - The adiabat uses gamma = 5/3, a monatomic ideal gas, matching the rest of
    the course.

Figures are palette quantized to 16 colours before being written, as in the
other two generators in this topic. Flat line art, so it is visually lossless.
"""

import io
import math
import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
from PIL import Image

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

DPI = 150
N = 240                          # samples per curve
GAMMA = 5.0 / 3.0                # monatomic ideal gas
XMAX = YMAX = 3.7
TICKS = [1, 2, 3]
XTICK_LABELS = [r"$V_0$", r"$2V_0$", r"$3V_0$"]
YTICK_LABELS = [r"$P_0$", r"$2P_0$", r"$3P_0$"]


def save(fig, name):
    """Render, quantize to a 16 colour palette, and write to figure_folder."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    buf.seek(0)
    img = Image.open(buf).convert("RGB")
    img = img.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE)
    path = os.path.join(OUT_DIR, name)
    img.save(path, format="PNG", optimize=True)
    print("wrote {}  ({:,} bytes)".format(name, os.path.getsize(path)))
    return path


def isotherm(start, vf):
    v0, p0 = start
    return [(v0 + (vf - v0) * i / (N - 1.0), None) for i in range(N)]


def curve(start, vf, exponent):
    """P V**exponent = constant, from `start` out to volume `vf`."""
    v0, p0 = start
    k = p0 * v0 ** exponent
    return [(v, k / v ** exponent)
            for v in (v0 + (vf - v0) * i / (N - 1.0) for i in range(N))]


def densify(corners):
    pts = []
    for (x0, y0), (x1, y1) in zip(corners, corners[1:]):
        pts += [(x0 + (x1 - x0) * i / 40.0, y0 + (y1 - y0) * i / 40.0)
                for i in range(41)]
    return pts


def points_of(proc):
    if proc["kind"] == "segments":
        return densify(proc["corners"])
    return curve(proc["start"], proc["vf"], proc["exponent"])


def work_by_gas(pts):
    """Signed area under the path, the work done BY the gas, in P_0 V_0."""
    return sum(0.5 * (a[1] + b[1]) * (b[0] - a[0]) for a, b in zip(pts, pts[1:]))


def axes(ax, label_size, title=None):
    ax.set_xlim(0, XMAX)
    ax.set_ylim(0, YMAX)
    ax.set_xticks(TICKS)
    ax.set_yticks(TICKS)
    ax.set_xticklabels(XTICK_LABELS, fontsize=label_size)
    ax.set_yticklabels(YTICK_LABELS, fontsize=label_size)
    ax.grid(True, which="major", color="0.85", linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.set_xlabel("Volume", fontsize=label_size)
    ax.set_ylabel("Pressure", fontsize=label_size)
    if title is not None:
        ax.set_title(title, fontsize=11.5, fontweight="bold", pad=6)


def draw(ax, proc):
    pts = points_of(proc)
    ax.plot([p[0] for p in pts], [p[1] for p in pts], color="black",
            linewidth=1.8, zorder=3)
    if proc["kind"] == "segments" and len(proc["corners"]) > 2:
        inner = proc["corners"][1:-1]
        ax.plot([c[0] for c in inner], [c[1] for c in inner], "o",
                color="black", markersize=4, zorder=4)
    for frac in proc.get("arrows", [0.5]):
        i = max(1, min(len(pts) - 2, int(frac * (len(pts) - 1))))
        ax.annotate("", xy=pts[i + 1], xytext=pts[i - 1],
                    arrowprops=dict(arrowstyle="-|>", color="black",
                                    linewidth=1.7, mutation_scale=15),
                    zorder=4)
    return pts


def state_dot(ax, xy, letter=None, offset=(0, 0), size=12):
    ax.plot([xy[0]], [xy[1]], "o", color="black", markersize=5, zorder=5)
    if letter:
        ax.annotate(letter, xy, textcoords="offset points", xytext=offset,
                    ha="center", va="center", fontsize=size, fontweight="bold")


# ------------------------------------------------------------------ q1 and q2

A = (1, 3)                       # (V_0, 3P_0)
B = (3, 1)                       # (3V_0, P_0), same PV product as A

PATHS = [
    ("I", dict(kind="segments", corners=[A, (3, 3), B],
               arrows=[0.25, 0.8])),
    ("II", dict(kind="curve", start=A, vf=3, exponent=1.0, arrows=[0.5])),
    ("III", dict(kind="segments", corners=[A, (1, 1), B],
                 arrows=[0.25, 0.8])),
]


def figure_paths():
    fig, axs = plt.subplots(1, 3, figsize=(9.6, 3.6), dpi=DPI)
    log = []
    for ax, (name, proc) in zip(axs, PATHS):
        axes(ax, 8.5, title=name)
        pts = draw(ax, proc)
        state_dot(ax, A, "A", (-16, 8))
        state_dot(ax, B, "B", (16, -10))
        # dU is zero between these two states, so Q into the gas equals the
        # work done by it.
        log.append("%s: Q_in = %+.2f P0V0" % (name, work_by_gas(pts)))
    fig.tight_layout(pad=0.9, w_pad=2.0)
    save(fig, "q-1.png")
    print("   " + ",  ".join(log))


# ------------------------------------------------------------------------- q7

# Four processes from one state to four different states. Entropy change of the
# gas, in units of nR, is in the comment beside each.
START = (1, 3)
FOUR = [
    # I: slow insulated expansion to 3V_0. On the adiabat, so dS = 0.
    ("I", dict(kind="curve", start=START, vf=3, exponent=GAMMA,
               arrows=[0.55]), (0.32, -0.04)),
    # II: expansion at constant temperature to 3V_0.        dS = +ln 3
    ("II", dict(kind="curve", start=START, vf=3, exponent=1.0,
                arrows=[0.55]), (0.30, 0.02)),
    # III: expansion at constant pressure to 3V_0.          dS = +2.5 ln 3
    ("III", dict(kind="segments", corners=[START, (3, 3)],
                 arrows=[0.55]), (0.30, 0.0)),
    # IV: cooling at constant volume to P_0.                dS = -1.5 ln 3
    ("IV", dict(kind="segments", corners=[START, (1, 1)],
                arrows=[0.55]), (-0.34, 0.0)),
]


def figure_four():
    fig, ax = plt.subplots(figsize=(5.2, 4.5), dpi=DPI)
    axes(ax, 10)
    ends = []
    for name, proc, off in FOUR:
        pts = draw(ax, proc)
        end = pts[-1]
        ends.append((name, end))
        state_dot(ax, end)
        ax.annotate(name, (end[0] + off[0], end[1] + off[1]), ha="center",
                    va="center", fontsize=11, fontweight="bold")
    state_dot(ax, START, "A", (-17, 7))
    fig.tight_layout(pad=0.6)
    save(fig, "q-7.png")
    print("   ends: " + ",  ".join("%s at (%.2f, %.2f)" % (n, e[0], e[1])
                                   for n, e in ends))
    assert len({(round(e[0], 3), round(e[1], 3)) for _, e in ends}) == 4, \
        "the four processes must end in four different states"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    figure_paths()
    figure_four()
    print("check: ln 3 = %.4f, so dS/nR is 0, %.2f, %.2f, %.2f for I-IV"
          % (math.log(3), math.log(3), 2.5 * math.log(3), -1.5 * math.log(3)))


if __name__ == "__main__":
    main()
