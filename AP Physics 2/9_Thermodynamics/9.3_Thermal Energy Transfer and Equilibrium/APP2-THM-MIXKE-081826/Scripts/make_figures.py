"""
Figure generator for APP2-THM-MIXKE-081826 (Average Kinetic Energy When Three
Gases Mix).

Writes figure_folder/q-1.png ... , the exact names the YAML references.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - One PNG per question showing the same apparatus: a rigid insulated box cut
    into three chambers by two dashed removable barriers, chambers labelled
    Gas A, Gas B, Gas C from left to right. The figure exists to carry the
    arrangement and the given data, not to be decoded. Nothing in it can be
    read off to answer the question.
  - Circle size shows relative atomic mass and NOTHING else. Where a question
    gives the amount of each gas, the number of circles is proportional to the
    number of moles and the caption says so. Where a question withholds the
    amounts, every chamber gets the same number of circles and the caption
    says the amounts are not shown, because the whole point of those questions
    is that the amounts are unknown and a figure must not imply otherwise.
  - Atom positions come from a per-chamber seeded jitter, so a rerun produces
    byte-comparable output and a question does not reshuffle between builds.
  - Black line art on white with grey circle fills, so the figures survive
    greyscale printing and match UNIPRES and TRMS in this unit.
  - No speed arrows or motion trails. Gas C is both the lightest and the
    hottest, so its atoms really are the fastest, and drawing that would hand
    over the reasoning the questions are asking for.
"""

import os
import random

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
from matplotlib.patches import Circle, Rectangle

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

# Drawing frame. Aspect is locked, so the figsize below has to match this ratio.
X0, X1 = 0.5, 11.5               # container walls
Y0, Y1 = 1.2, 4.7
XLIM, YLIM = 12.0, 5.6

# Radius by mass rank: 1 is the most massive of the three gases in the question.
RADIUS = {1: 0.30, 2: 0.22, 3: 0.15}


def atoms(ax, xa, xb, radius, count, seed):
    """Scatter `count` circles of `radius` inside one chamber, low in the box."""
    rng = random.Random(seed)
    pad = radius + 0.12
    lo_y, hi_y = Y0 + pad, Y0 + 1.75
    placed = []
    for _ in range(count):
        # Rejection sampling with a generous separation, so circles read as
        # separate atoms rather than as a blob. 200 tries is far more than the
        # densest chamber here needs.
        for _try in range(200):
            x = rng.uniform(xa + pad, xb - pad)
            y = rng.uniform(lo_y, hi_y)
            if all((x - px) ** 2 + (y - py) ** 2 > (radius + pr + 0.10) ** 2
                   for px, py, pr in placed):
                placed.append((x, y, radius))
                break
    for x, y, r in placed:
        ax.add_patch(Circle((x, y), r, facecolor="0.82", edgecolor="black",
                            linewidth=0.9, zorder=3))


def build(name, chambers, given, caption, barriers=None):
    """chambers: three dicts with keys label, lines, rank, count.

    `barriers` is None for the shared "removable barriers" label, or a pair of
    strings when a question removes the two barriers in a stated order and the
    figure has to say which is which.
    """
    fig, ax = plt.subplots(figsize=(7.2, 3.36))
    ax.set_xlim(0, XLIM)
    ax.set_ylim(0, YLIM)
    ax.set_aspect("equal")
    ax.axis("off")

    ax.add_patch(Rectangle((X0, Y0), X1 - X0, Y1 - Y0, fill=False,
                           edgecolor="black", linewidth=2.6, zorder=2))

    width = (X1 - X0) / 3.0
    cuts = [X0 + width, X0 + 2 * width]
    for cx in cuts:
        ax.plot([cx, cx], [Y0, Y1], color="black", linewidth=1.8,
                linestyle=(0, (5, 4)), zorder=2)

    if barriers is None:
        ax.text(6.0, Y1 + 0.62, "removable barriers", ha="center", va="bottom",
                fontsize=9, style="italic")
        for cx in cuts:
            ax.annotate("", xy=(cx, Y1 + 0.04), xytext=(6.0, Y1 + 0.55),
                        arrowprops=dict(arrowstyle="-|>", color="black",
                                        linewidth=0.9, mutation_scale=9))
    else:
        for cx, label in zip(cuts, barriers):
            ax.text(cx, Y1 + 0.62, label, ha="center", va="bottom",
                    fontsize=9, style="italic")
            ax.annotate("", xy=(cx, Y1 + 0.04), xytext=(cx, Y1 + 0.55),
                        arrowprops=dict(arrowstyle="-|>", color="black",
                                        linewidth=0.9, mutation_scale=9))

    for i, ch in enumerate(chambers):
        xa = X0 + i * width
        xb = xa + width
        mid = 0.5 * (xa + xb)
        ax.text(mid, Y1 - 0.42, ch["label"], ha="center", va="center",
                fontsize=12, fontweight="bold")
        for j, line in enumerate(ch["lines"]):
            ax.text(mid, Y1 - 0.95 - 0.42 * j, line, ha="center", va="center",
                    fontsize=10.5)
        atoms(ax, xa, xb, RADIUS[ch["rank"]], ch["count"], seed=1000 + i)

    if given:
        ax.text(6.0, Y0 - 0.45, given, ha="center", va="center", fontsize=10.5)
    ax.text(6.0, Y0 - 0.92, caption, ha="center", va="center", fontsize=9,
            style="italic")

    fig.tight_layout(pad=0.4)
    out = os.path.join(OUT_DIR, name + ".png")
    fig.savefig(out, dpi=150, facecolor="white")
    plt.close(fig)
    return out


# Each entry is (chambers, given, caption) with an optional fourth item naming
# the two barriers. Ranks are by atomic mass, 1 = heaviest.
MASS_NOTE = ("Circle size shows relative atomic mass. "
             "The amount of each gas is not shown.")
MOLE_NOTE = ("Circle size shows relative atomic mass. "
             "The number of circles is proportional to the number of moles.")


def symbolic(temps):
    """The three chambers of a question that gives orderings rather than values."""
    return [dict(label="Gas %s" % g,
                 lines=[r"mass $m_%s$" % g, r"temperature $T_%s$" % g],
                 rank=r, count=6)
            for g, r in zip("ABC", (1, 2, 3))]


def numeric(rows):
    """rows: three (moles, kelvin, circle count) triples, gas A first."""
    return [dict(label="Gas %s" % g,
                 lines=["%s mol" % n, "%d K" % t],
                 rank=r, count=c)
            for g, r, (n, t, c) in zip("ABC", (1, 2, 3), rows)]


QUESTIONS = {
    # q1: symbolic. Mass falls left to right, temperature rises left to right,
    #     and the amounts are deliberately withheld, so every chamber shows the
    #     same number of circles.
    "q-1": (symbolic(None), r"$m_A > m_B > m_C$          $T_C > T_B > T_A$",
            MASS_NOTE),

    # q2: q1 with the temperature ordering reversed, so the heaviest gas is now
    #     the hottest. Same figure otherwise; the answer flips.
    "q-2": (symbolic(None), r"$m_A > m_B > m_C$          $T_A > T_B > T_C$",
            MASS_NOTE),

    # q3: equal amounts, T_f = 400 K, so gas B warms. Two circles per mole.
    "q-3": (numeric([("2.0", 200, 4), ("2.0", 300, 4), ("2.0", 700, 4)]),
            "", MOLE_NOTE),

    # q4: three times as much of the cold gas, T_f = 370 K, so gas B cools even
    #     though it started between the other two. One circle per mole.
    "q-4": (numeric([("6.0", 250, 6), ("2.0", 400, 2), ("2.0", 700, 2)]),
            "", MOLE_NOTE),

    # q5: equal amounts chosen so T_f = 400 K lands exactly on gas B, which
    #     therefore does not change at all. Two circles per mole.
    "q-5": (numeric([("3.0", 250, 6), ("3.0", 400, 6), ("3.0", 550, 6)]),
            "", MOLE_NOTE),

    # q6: named gases, so the speed ranking can be worked with real masses.
    #     Amounts withheld again; the question is only about the final state.
    "q-6": ([dict(label="Gas A", lines=["argon, 40 g/mol", "250 K"],
                  rank=1, count=6),
             dict(label="Gas B", lines=["neon, 20 g/mol", "350 K"],
                  rank=2, count=6),
             dict(label="Gas C", lines=["helium, 4 g/mol", "500 K"],
                  rank=3, count=6)],
            "", MASS_NOTE),

    # q7: the barriers come out one at a time, so they are labelled by order of
    #     removal. Equal amounts; B and C reach 650 K on their own, and the
    #     whole container still ends at 500 K, the same as removing both at once.
    "q-7": (numeric([("2.0", 200, 4), ("2.0", 400, 4), ("2.0", 900, 4)]),
            "", MOLE_NOTE, ("removed second", "removed first")),
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, spec in QUESTIONS.items():
        chambers, given, caption = spec[0], spec[1], spec[2]
        barriers = spec[3] if len(spec) > 3 else None
        path = build(name, chambers, given, caption, barriers)
        print("%s  %6d bytes  ranks=%s counts=%s"
              % (name, os.path.getsize(path),
                 [c["rank"] for c in chambers], [c["count"] for c in chambers]))


if __name__ == "__main__":
    main()
