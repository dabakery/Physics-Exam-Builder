"""
Figure generator for APP2-THM-WPATH-081826 (Comparing the Work Done Along
Different Paths Between the Same Two States).

Writes figure_folder/q-1.png ... q-7.png, the exact names the YAML references.
Every question in this bank takes a figure; there are no text-only questions.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Every panel of a question runs between the SAME two states, A and B, drawn
    at the same place on identical axes. That is the whole point of the bank,
    so anything that varies between panels other than the path is noise.
  - Panels are titled "Process 1" / "Process 2", or "I" / "II" / "III" for the
    ranking questions. Roman numerals there because the exam renderer letters
    the answer options itself, and two sets of letters on one question is a
    reading trap. This copies APP2-THM-PVGRPH-081726.
  - Both axes carry labelled ticks and the grid is drawn. Every answer is an
    area read off the axes, so a sketch with bare axes would make the bank
    unanswerable.
  - Straight segments carry a dot at every corner, so a two-leg path cannot be
    mistaken for one bent line.
  - Isotherms are the only curves drawn, as PV = constant. A and B are chosen
    with the same PV product in q1 to q6, so the isotherm through them is a
    real process between them and the internal energy change is zero for every
    panel, which is what lets those questions compare heating and work in the
    same breath. q7 is the cycle built from two of the paths and needs no
    isotherm.
  - Processes are NOT named on the figure, matching APP2-THM-ISOAD-081826.
    Identifying a constant pressure leg or an isotherm by its shape is expected
    knowledge, and the stems say in words what each process is.
  - Black line art on white, so the figures survive greyscale printing.
"""

import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

N = 240                          # samples per curve
XMAX = YMAX = 3.7
TICKS = [1, 2, 3]
XTICK_LABELS = [r"$V_0$", r"$2V_0$", r"$3V_0$"]
YTICK_LABELS = [r"$P_0$", r"$2P_0$", r"$3P_0$"]

# The two states every panel connects, and where their letters sit.
STATE_A = ("A", (3, 1), (16, -10))
STATE_B = ("B", (1, 3), (-16, 8))
# q3 runs the other way, so its start is the upper left state and the letters
# swap to keep A the state the stem introduces first.
STATE_A_OUT = ("A", (1, 3), (-16, 8))
STATE_B_OUT = ("B", (3, 1), (16, -10))


def isotherm(start, vf):
    v0, p0 = start
    vs = [v0 + (vf - v0) * i / (N - 1.0) for i in range(N)]
    return [(v, p0 * v0 / v) for v in vs]


def densify(points):
    pts = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        pts += [(x0 + (x1 - x0) * i / 40.0, y0 + (y1 - y0) * i / 40.0)
                for i in range(41)]
    return pts


def work_on_gas(pts):
    """Signed area swept, positive when the gas is compressed.

    Printed in the run log so a physics change shows up there rather than only
    on screen. This is the work done ON the gas, in units of P_0 V_0.
    """
    return -sum(0.5 * (a[1] + b[1]) * (b[0] - a[0]) for a, b in zip(pts, pts[1:]))


def draw_panel(ax, panel, label_size):
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
    ax.set_title(panel["title"], fontsize=11.5, fontweight="bold", pad=6)

    for proc in panel["processes"]:
        if proc[0] == "isotherm":
            pts = isotherm(proc[1], proc[2])
            corners = []
        else:
            corners = proc[1]
            pts = densify(corners)
        ax.plot([p[0] for p in pts], [p[1] for p in pts], color="black",
                linewidth=1.8, zorder=3)
        # Corner dots, so a two-leg path reads as two legs.
        if len(corners) > 2:
            ax.plot([c[0] for c in corners[1:-1]], [c[1] for c in corners[1:-1]],
                    "o", color="black", markersize=4, zorder=4)
        for frac in proc[3] if len(proc) > 3 else [0.5]:
            i = max(1, min(len(pts) - 2, int(frac * (len(pts) - 1))))
            ax.annotate("", xy=pts[i + 1], xytext=pts[i - 1],
                        arrowprops=dict(arrowstyle="-|>", color="black",
                                        linewidth=1.7, mutation_scale=15),
                        zorder=4)

    for letter, (x, y), (dx, dy) in panel["states"]:
        ax.plot([x], [y], "o", color="black", markersize=5, zorder=5)
        ax.annotate(letter, (x, y), textcoords="offset points", xytext=(dx, dy),
                    ha="center", va="center", fontsize=12, fontweight="bold")


def panel(title, processes, states=(STATE_A, STATE_B)):
    return dict(title=title, processes=processes, states=list(states))


# Paths between A at (3V_0, P_0) and B at (V_0, 3P_0). Work done ON the gas, in
# units of P_0 V_0, is in the comment beside each.
LOW_CORNER = ("segments", [(3, 1), (1, 1), (1, 3)], None, [0.25, 0.8])   # 2
HIGH_CORNER = ("segments", [(3, 1), (3, 3), (1, 3)], None, [0.25, 0.8])  # 6
STRAIGHT = ("segments", [(3, 1), (1, 3)], None, [0.5])                   # 4
STAIRCASE = ("segments", [(3, 1), (2, 1), (2, 3), (1, 3)], None,
             [0.2, 0.5, 0.85])                                           # 4
ISOTHERM_IN = ("isotherm", (3, 1), 1, [0.5])                             # 3.30

# Expansions, B to A, for the question that runs the other way.
STRAIGHT_OUT = ("segments", [(1, 3), (3, 1)], None, [0.5])               # -4
ISOTHERM_OUT = ("isotherm", (1, 3), 3, [0.5])                            # -3.30

QUESTIONS = {
    # q1: the isotherm against the low corner. The isotherm lies above the
    #     constant pressure leg everywhere, so it takes more work.
    "q-1": [panel("Process 1", [ISOTHERM_IN]),
            panel("Process 2", [LOW_CORNER])],

    # q2: the two corner paths against each other, 2 against 6, so the ratio is
    #     exact and needs no curve.
    "q-2": [panel("Process 1", [LOW_CORNER]),
            panel("Process 2", [HIGH_CORNER])],

    # q3: the same comparison as q1 run as expansions, so the work is done BY
    #     the gas and the straight line beats the isotherm it sits above.
    "q-3": [panel("Process 1", [STRAIGHT_OUT], (STATE_A_OUT, STATE_B_OUT)),
            panel("Process 2", [ISOTHERM_OUT], (STATE_A_OUT, STATE_B_OUT))],

    # q4: ranking, 2 against 4 against 6, all exact.
    "q-4": [panel("I", [LOW_CORNER]),
            panel("II", [STRAIGHT]),
            panel("III", [HIGH_CORNER])],

    # q5: ranking with a tie. The staircase and the straight line both take 4.
    "q-5": [panel("I", [STAIRCASE]),
            panel("II", [STRAIGHT]),
            panel("III", [LOW_CORNER])],

    # q6: the q1 pair again, for the question that asks about heating rather
    #     than work.
    "q-6": [panel("Process 1", [ISOTHERM_IN]),
            panel("Process 2", [LOW_CORNER])],

    # q7: out along the low corner and back along the high corner, which closes
    #     the rectangle. Net work by the gas is the enclosed 4 P0V0.
    "q-7": [panel("", [("segments", [(3, 1), (1, 1), (1, 3), (3, 3), (3, 1)],
                        None, [0.12, 0.37, 0.62, 0.87])])],
}


def build(name, panels):
    n = len(panels)
    if n == 1:
        figsize, label_size = (4.4, 4.2), 10
    elif n == 2:
        figsize, label_size = (7.4, 3.9), 9
    else:
        figsize, label_size = (9.6, 3.6), 8.5
    fig, axes = plt.subplots(1, n, figsize=figsize)
    axes = [axes] if n == 1 else list(axes)
    for ax, p in zip(axes, panels):
        draw_panel(ax, p, label_size)
    fig.tight_layout(pad=0.9, w_pad=2.0)
    out = os.path.join(OUT_DIR, name + ".png")
    fig.savefig(out, dpi=150, facecolor="white")
    plt.close(fig)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, panels in QUESTIONS.items():
        out = build(name, panels)
        works = []
        for p in panels:
            total = 0.0
            for proc in p["processes"]:
                pts = (isotherm(proc[1], proc[2]) if proc[0] == "isotherm"
                       else densify(proc[1]))
                total += work_on_gas(pts)
            works.append("%+.2f" % total)
        print("%s  %6d bytes  %d panel(s)  W_on (P0V0): %s"
              % (name, os.path.getsize(out), len(panels), ", ".join(works)))


if __name__ == "__main__":
    main()
