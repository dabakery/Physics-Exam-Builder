"""
Figure generator for APP2-THM-ISOAD-081826 (Comparing Isothermal and Adiabatic
Processes on a Pressure Volume Diagram).

Writes figure_folder/q-1.png ... q-7.png, the exact names the YAML references.
Every question in this bank takes a figure; there are no text-only questions.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Curves are drawn here, unlike APP2-THM-FLPV-081826 next door, which is
    straight segments only. That bank asks for the area under a path and AP
    Physics 2 is algebra based, so its areas have to be rectangles and
    trapezoids. Nothing in this bank asks for the value of an area. Every
    question is answered from the first law and from which curve lies above
    the other, so the real shapes are safe to draw and drawing them as straight lines would
    misrepresent both processes.
  - Isotherms are PV = constant. Adiabats are PV^(5/3) = constant, the
    monatomic ideal gas value, which every stem in this bank states.
  - Processes are NOT named on the figure. Telling an isotherm from an adiabat
    by its shape is expected knowledge at this level, and every stem says which
    process is which in words, so a label on the curve would only be reading
    practice. The drawing code has no path for one.
  - States are lettered in the order the stem introduces them, with an
    arrowhead partway along each path showing the direction of travel.
  - Label offsets are given per state in points, because the curves crowd
    each other differently in every question and a general rule put labels on
    top of the lines.
  - Black line art on white, matching the rest of this unit, so the figures
    survive greyscale printing.
"""

import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

GAMMA = 5.0 / 3.0                # monatomic ideal gas
N = 240                          # samples per curve

TICK_LABELS = {
    "V": {1: r"$V_0$", 2: r"$2V_0$", 3: r"$3V_0$"},
    "P": {1: r"$P_0$", 2: r"$2P_0$", 3: r"$3P_0$",
          4: r"$4P_0$", 5: r"$5P_0$", 6: r"$6P_0$"},
}


def curve_points(kind, start, vf):
    """Sampled (V, P) along one process from `start` out to volume `vf`."""
    v0, p0 = start
    vs = [v0 + (vf - v0) * i / (N - 1.0) for i in range(N)]
    if kind == "isotherm":
        ps = [p0 * v0 / v for v in vs]
    elif kind == "adiabat":
        ps = [p0 * (v0 / v) ** GAMMA for v in vs]
    elif kind == "isobar":
        ps = [p0 for _v in vs]
    else:
        raise ValueError(kind)
    return list(zip(vs, ps))


def draw(ax, spec):
    ax.set_xlim(0, spec["xmax"])
    ax.set_ylim(0, spec["ymax"])
    ax.set_xticks(spec["xticks"])
    ax.set_yticks(spec["yticks"])
    ax.set_xticklabels([TICK_LABELS["V"][t] for t in spec["xticks"]], fontsize=10)
    ax.set_yticklabels([TICK_LABELS["P"][t] for t in spec["yticks"]], fontsize=10)
    ax.grid(True, which="major", color="0.85", linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.set_xlabel("Volume", fontsize=10)
    ax.set_ylabel("Pressure", fontsize=10)

    for proc in spec["processes"]:
        if proc["kind"] == "segments":
            # Densified, so the arrowhead below can be placed partway along a
            # leg the same way it is on a curve.
            pts = []
            for (x0, y0), (x1, y1) in zip(proc["points"], proc["points"][1:]):
                pts += [(x0 + (x1 - x0) * i / 40.0, y0 + (y1 - y0) * i / 40.0)
                        for i in range(41)]
        else:
            pts = curve_points(proc["kind"], proc["start"], proc["vf"])
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color="black",
                linewidth=1.8, zorder=3)

        # Arrowhead partway along, drawn across a short span of the path so the
        # head sits on the line itself whatever its curvature.
        i = int(proc.get("arrow_at", 0.5) * (len(pts) - 1))
        i = max(1, min(len(pts) - 2, i))
        ax.annotate("", xy=pts[i + 1], xytext=pts[i - 1],
                    arrowprops=dict(arrowstyle="-|>", color="black",
                                    linewidth=1.8, mutation_scale=16),
                    zorder=4)

    for letter, (x, y), (dx, dy) in spec["states"]:
        ax.plot([x], [y], "o", color="black", markersize=5, zorder=4)
        ax.annotate(letter, (x, y), textcoords="offset points", xytext=(dx, dy),
                    ha="center", va="center", fontsize=12, fontweight="bold")


# Volume 3V_0 reached adiabatically from (V_0, 3P_0) lands at 3 / 3^(5/3).
ADIA_END = 3.0 / 3.0 ** GAMMA            # 0.4807 P_0
# Volume V_0 reached adiabatically from (3V_0, P_0) lands at 3^(5/3).
ADIA_UP = 3.0 ** GAMMA                   # 6.240 P_0

SMALL = dict(xmax=3.7, ymax=3.7, xticks=[1, 2, 3], yticks=[1, 2, 3])
TALL = dict(xmax=3.7, ymax=7.0, xticks=[1, 2, 3], yticks=[1, 2, 3, 4, 5, 6])


def expansion_pair():
    """The picture q1, q2 and q5 share: one start, two expansions to 3V_0."""
    return dict(SMALL, processes=[
        dict(kind="isotherm", start=(1, 3), vf=3, arrow_at=0.3),
        dict(kind="adiabat", start=(1, 3), vf=3, arrow_at=0.3),
    ], states=[("A", (1, 3), (-16, 8)), ("B", (3, 1), (16, 8)),
               ("C", (3, ADIA_END), (16, -8))])


QUESTIONS = {
    # q1, q2, q5: same start, both expand to 3V_0. The isotherm ends at P_0 and
    # the adiabat below it, which is what makes the work comparison in q2 and
    # the heating comparison in q5 readable off the same picture.
    "q-1": expansion_pair(),
    "q-2": expansion_pair(),
    "q-5": expansion_pair(),

    # q3: the mirror image, both processes compressing from 3V_0 back to V_0.
    #     The adiabat climbs to 6.24 P_0, so this one needs the taller axis.
    "q-3": dict(TALL, processes=[
        dict(kind="isotherm", start=(3, 1), vf=1, arrow_at=0.3),
        dict(kind="adiabat", start=(3, 1), vf=1, arrow_at=0.6),
    ], states=[("A", (3, 1), (16, -8)), ("B", (1, 3), (-16, 6)),
               ("C", (1, ADIA_UP), (-16, 6))]),

    # q4: two paths between the SAME two states, so the internal energy change
    #     has to match. The two-leg path is drawn straight because it is an
    #     isobaric leg followed by an isochoric one.
    "q-4": dict(SMALL, processes=[
        dict(kind="isotherm", start=(1, 3), vf=3),
        dict(kind="segments", points=[(1, 3), (3, 3)], arrow_at=0.5),
        dict(kind="segments", points=[(3, 3), (3, 1)], arrow_at=0.5),
    ], states=[("A", (1, 3), (-16, 8)), ("D", (3, 3), (16, 8)),
               ("B", (3, 1), (16, -10))]),

    # q6: isobaric against adiabatic, same start and same final volume, so the
    #     internal energy change is large and positive against small and
    #     negative.
    "q-6": dict(SMALL, processes=[
        dict(kind="isobar", start=(1, 3), vf=3),
        dict(kind="adiabat", start=(1, 3), vf=3, arrow_at=0.3),
    ], states=[("A", (1, 3), (-16, 8)), ("B", (3, 3), (16, 8)),
               ("C", (3, ADIA_END), (16, -8))]),

    # q7: the adiabatic expansion on its own, for the question that relates its
    #     work to its internal energy change without a second process to
    #     compare against.
    "q-7": dict(SMALL, processes=[
        dict(kind="adiabat", start=(1, 3), vf=3, arrow_at=0.3),
    ], states=[("A", (1, 3), (-16, 8)), ("B", (3, ADIA_END), (16, -8))]),
}


def build(name, spec):
    fig, ax = plt.subplots(figsize=(4.4, 4.2))
    draw(ax, spec)
    fig.tight_layout(pad=0.8)
    out = os.path.join(OUT_DIR, name + ".png")
    fig.savefig(out, dpi=150, facecolor="white")
    plt.close(fig)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print("adiabatic 3x expansion ends at %.3f P0, so PV goes 3 -> %.3f"
          % (ADIA_END, 3 * ADIA_END))
    print("adiabatic 3x compression ends at %.3f P0, so PV goes 3 -> %.3f"
          % (ADIA_UP, ADIA_UP))
    for name, spec in QUESTIONS.items():
        out = build(name, spec)
        print("%s  %6d bytes  %d process(es)"
              % (name, os.path.getsize(out), len(spec["processes"])))


if __name__ == "__main__":
    main()
