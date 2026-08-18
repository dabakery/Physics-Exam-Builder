"""
Figure generator for APP2-THM-PVGRPH-081726 (Identifying a P-V Graph from a
Described Change of State).

Writes figure_folder/q-1.png ... q-7.png, the exact names the YAML references.
Every question in this bank takes a figure; there are no text-only questions.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - One PNG per question holding FOUR panels in a 2x2 grid, labelled I, II, III,
    IV. The bank schema allows exactly one `figure:` per question and has no
    per-option image field, so graph-as-answer-choice questions have to ship the
    choices inside a single composite image. Roman numerals rather than A-D
    because the exam renderer letters the answer options itself, and two
    competing sets of letters on one question is a reading trap.
  - Panel order is the answer order. The YAML locks all four options
    (`lock: true`) so seededShuffle leaves them alone; if that lock is ever
    removed the options will shuffle out of step with the panels and the
    question breaks.
  - Both axes carry integer numbers, and the grid is drawn. This is not
    decoration: every question is answered by comparing the product P*V at the
    two endpoints, so the student has to be able to read coordinates off the
    axes. A sketched graph with bare axes would make the bank unanswerable.
  - Isotherms are deliberately NOT drawn. Recognising that a straight line can
    start and end on the same isotherm without being an isothermal process is
    the whole point of q5, and drawing the curves would hand that over.
  - Black line art, no colour, so the figures survive greyscale printing and
    match the UNIPRES and TRMS banks in this unit.
  - Identical axis limits and ticks on all four panels of a question, and the
    same state A in all four. The comparison a student makes is between the
    endpoints, so anything else that varies between panels is noise.

Units: pressure in 1e5 Pa, volume in litres. The product P*V is therefore in
units of 100 J, but no question asks for its value, only for a comparison, so
the figures carry no product labels.
"""

import math
import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

AXIS_MAX = 7.0                   # a little headroom so no point sits on the frame
TICKS = [1, 2, 3, 4, 5, 6]
PANEL_LABELS = ["I", "II", "III", "IV"]

# Each question is four panels; each panel is (A, B) as (volume, pressure).
# State A is the same in all four panels of a question by design.
QUESTIONS = {
    # q1: expands, temperature decreases. A=(2,4), PA*VA=8.
    #     24, 16, 8, 4  ->  only IV drops the product.
    "q-1": [((2, 4), (4, 6)),
            ((2, 4), (4, 4)),
            ((2, 4), (4, 2)),
            ((2, 4), (4, 1))],

    # q2: expands, pressure decreases, temperature increases. A=(2,6), PA*VA=12.
    #     12, 18, 6, 4  ->  only II raises the product.
    "q-2": [((2, 6), (6, 2)),
            ((2, 6), (6, 3)),
            ((2, 6), (6, 1)),
            ((2, 6), (4, 1))],

    # q3: compressed, temperature increases. A=(5,2), PA*VA=10.
    #     4, 10, 12, 2  ->  only III raises the product.
    "q-3": [((5, 2), (2, 2)),
            ((5, 2), (2, 5)),
            ((5, 2), (2, 6)),
            ((5, 2), (2, 1))],

    # q4: compressed, pressure increases, temperature decreases. A=(6,2), PA*VA=12.
    #     9, 12, 15, 16  ->  only I drops the product.
    "q-4": [((6, 2), (3, 3)),
            ((6, 2), (3, 4)),
            ((6, 2), (3, 5)),
            ((6, 2), (4, 4))],

    # q5: expands, same temperature at A and B. A=(1,6), PA*VA=6.
    #     12, 6, 4, 36  ->  only II holds the product.
    "q-5": [((1, 6), (6, 2)),
            ((1, 6), (6, 1)),
            ((1, 6), (4, 1)),
            ((1, 6), (6, 6))],

    # q6: expands, final temperature is half the initial. A=(2,6), PA*VA=12.
    #     6, 12, 18, 8  ->  only I halves the product.
    "q-6": [((2, 6), (6, 1)),
            ((2, 6), (6, 2)),
            ((2, 6), (6, 3)),
            ((2, 6), (4, 2))],

    # q7: compressed, final temperature is twice the initial. A=(6,1), PA*VA=6.
    #     6, 9, 10, 12  ->  only IV doubles the product.
    "q-7": [((6, 1), (3, 2)),
            ((6, 1), (3, 3)),
            ((6, 1), (2, 5)),
            ((6, 1), (3, 4))],
}


def draw_panel(ax, label, state_a, state_b):
    """One P-V panel: numbered axes, a light grid, and a straight arrow A to B."""
    va, pa = state_a
    vb, pb = state_b

    ax.set_xlim(0, AXIS_MAX)
    ax.set_ylim(0, AXIS_MAX)
    ax.set_xticks(TICKS)
    ax.set_yticks(TICKS)
    ax.tick_params(labelsize=8)
    ax.grid(True, which="major", color="0.85", linewidth=0.6, zorder=0)
    ax.set_axisbelow(True)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)

    # The process. annotate rather than plot+arrow so the head sits exactly on B.
    ax.annotate(
        "", xy=(vb, pb), xytext=(va, pa),
        arrowprops=dict(arrowstyle="-|>", color="black",
                        linewidth=1.6, mutation_scale=14),
        zorder=3,
    )
    ax.plot([va, vb], [pa, pb], "o", color="black", markersize=5, zorder=4)

    # Endpoint labels, offset ALONG the line and outward past their own endpoint.
    # Fixed offsets do not survive here, because the panels differ in both slope
    # and direction: a constant "left of A, right of B" lands squarely on the
    # arrow whenever the process runs down-left, which is what q-3 panel IV and
    # the horizontal q-3 panel I were doing. Pushing each label out along the
    # line, away from the other endpoint, is off the drawn segment for every
    # direction a panel can take, including vertical and horizontal ones.
    #
    # Direction is taken in DATA space, which is honest here because both axes
    # share the same 0..AXIS_MAX range. The axes box is not exactly square, so
    # this is a few degrees off the true visual direction, and that does not
    # matter: the label clears the segment for any angular error under 90.
    dv, dp = vb - va, pb - pa
    span = math.hypot(dv, dp) or 1.0
    ux, uy = dv / span, dp / span
    # B sits a little further out than A to clear the arrowhead (mutation_scale=14).
    ax.annotate("A", (va, pa), textcoords="offset points",
                xytext=(-15.0 * ux, -15.0 * uy),
                ha="center", va="center", fontsize=10, fontweight="bold")
    ax.annotate("B", (vb, pb), textcoords="offset points",
                xytext=(17.0 * ux, 17.0 * uy),
                ha="center", va="center", fontsize=10, fontweight="bold")

    ax.set_title(label, fontsize=12, fontweight="bold", pad=6)
    ax.set_xlabel("Volume (L)", fontsize=8.5)
    ax.set_ylabel("Pressure (x $10^5$ Pa)", fontsize=8.5)


def build(name, panels):
    fig, axes = plt.subplots(2, 2, figsize=(7.2, 6.6))
    for ax, label, (state_a, state_b) in zip(axes.ravel(), PANEL_LABELS, panels):
        draw_panel(ax, label, state_a, state_b)
    fig.tight_layout(pad=1.4, h_pad=2.0, w_pad=2.0)
    out = os.path.join(OUT_DIR, name + ".png")
    fig.savefig(out, dpi=150, facecolor="white")
    plt.close(fig)
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, panels in QUESTIONS.items():
        path = build(name, panels)
        size = os.path.getsize(path)
        # Report the P*V products so a physics change is visible in the run log.
        products = ["%g" % (b[0] * b[1]) for _a, b in panels]
        start = panels[0][0]
        print("%s  %6d bytes  A=(%g,%g) PV=%g  ->  panels PV: %s"
              % (name, size, start[0], start[1], start[0] * start[1],
                 ", ".join(products)))


if __name__ == "__main__":
    main()
