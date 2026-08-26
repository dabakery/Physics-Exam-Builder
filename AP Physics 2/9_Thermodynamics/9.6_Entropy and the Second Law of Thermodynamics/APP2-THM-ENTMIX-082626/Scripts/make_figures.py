"""
Figure generator for APP2-THM-ENTMIX-082626 (Comparing Initial and Final Entropy
When Substances Are Mixed).

Writes figure_folder/q-2.png, q-3.png and q-4.png, the exact names the YAML
references. Only the three barrier questions take a figure; the file name carries
the question id rather than a running count, so adding a figure to another
question later does not renumber the ones already there.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Black line art on white, no colour, and the same hatched insulation ring and
    Before/After panel pair as APP2-THM-ENTSYS-082626 q-2. The two banks sit in
    one topic and a student should not have to learn a second convention.
  - All three figures come out of one function with the same container, the same
    particle counts and the same layout, because q3 and q4 are the same apparatus
    with only the identity of the gases changed. If they drift apart the pair
    stops teaching what it is there to teach.
  - Species are told apart by glyph, never by colour: gas 1 is a small filled
    dot, gas 2 is a larger open circle. Both survive greyscale printing, and the
    legend appears only when a figure actually holds two different gases.
  - Sixty particles in every panel of every figure. Before, thirty sit in each
    half; after, each species is spread over the whole container at half its
    original number density while the total density is unchanged. That is the
    physics of the mixing, so the counts are not decorative and must not be
    tuned for looks.
  - q3 is the one that has to look like nothing happened. Both halves hold the
    same gas at the same density before and after, so the two panels differ only
    in whether the barrier is drawn. The particle positions are drawn from
    different seeds rather than copied, since a reader matching dot for dot would
    be reading a claim about frozen atoms that the figure is not making.
  - No figure states a temperature after mixing, an entropy, or a direction of
    energy transfer. These show the apparatus, not the answer.

Figures are palette quantized to 16 colours before being written, the same as the
ENTSYS generator. These are flat line drawings, so the quantization is visually
lossless and cuts the file size by roughly two thirds.
"""

import io
import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Rectangle
from PIL import Image

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

DPI = 150
LW_WALL = 1.5
LW_THIN = 1.0
INSUL = 0.16                     # thickness of the hatched insulation ring

BOX = (0.5, 0.5, 5.0, 3.0)       # x, y, w, h of the container interior
PAD = 0.28                       # keep particles off the walls
N_HALF = 30                      # particles of each gas, so 60 in the container

# Glyph per species. Index 0 is the gas that starts on the left.
GLYPH = (
    dict(marker="o", ms=3.4, mfc="black", mec="black", mew=0.0),
    dict(marker="o", ms=5.2, mfc="white", mec="black", mew=0.9),
)


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


def insulated_box(ax, x, y, w, h):
    """A rigid insulated container: hatched ring outside, clear space inside."""
    ax.add_patch(Rectangle((x - INSUL, y - INSUL), w + 2 * INSUL,
                           h + 2 * INSUL, facecolor="white", edgecolor="0.35",
                           lw=LW_THIN, hatch="////", zorder=1))
    ax.add_patch(Rectangle((x, y), w, h, facecolor="white", edgecolor="black",
                           lw=LW_WALL, zorder=2))


def scatter(ax, seed, xlo, xhi, n, glyph, label=None):
    x, y, w, h = BOX
    rng = np.random.default_rng(seed)
    px = rng.uniform(xlo, xhi, n)
    py = rng.uniform(y + PAD, y + h - PAD, n)
    ax.plot(px, py, ls="none", zorder=5, label=label, **glyph)


def barrier_figure(name, left, right, condition, seed, species=None):
    """One Before/After pair.

    `left` and `right` are the captions under each half of the Before panel.
    `species` is the pair of bare gas names used in the legend, which must
    not carry a starting temperature: the legend also describes the After
    panel, where the two gases share one temperature.
    """
    species = species or (left, right)
    x, y, w, h = BOX
    mid = x + w / 2
    two_gases = species[0] != species[1]

    fig, axes = plt.subplots(1, 2, figsize=(6.8, 3.3), dpi=DPI)
    for k, (ax, title) in enumerate(zip(axes, ("Before", "After"))):
        after = k == 1
        ax.set_xlim(0.0, 6.0)
        ax.set_ylim(-0.75, 4.05)
        ax.set_aspect("equal")
        ax.axis("off")
        insulated_box(ax, x, y, w, h)

        # Particles. After mixing each gas fills the container at half the
        # number density it had, so the total density is unchanged.
        if after:
            scatter(ax, seed + 10, x + PAD, x + w - PAD, N_HALF, GLYPH[0])
            scatter(ax, seed + 11, x + PAD, x + w - PAD, N_HALF,
                    GLYPH[1] if two_gases else GLYPH[0])
        else:
            scatter(ax, seed, x + PAD, mid - PAD, N_HALF, GLYPH[0],
                    label=species[0] if two_gases else None)
            scatter(ax, seed + 1, mid + PAD, x + w - PAD, N_HALF,
                    GLYPH[1] if two_gases else GLYPH[0],
                    label=species[1] if two_gases else None)

        # Barrier, drawn solid while it is in place and dashed once removed.
        if after:
            ax.plot([mid, mid], [y, y + h], ls=(0, (3, 3)), lw=1.0,
                    color="0.6", zorder=4)
            ax.text(mid, y - 0.30, "barrier removed", fontsize=7.5,
                    ha="center", va="top", color="0.35")
        else:
            ax.plot([mid, mid], [y, y + h], lw=2.6, color="black", zorder=4)
            ax.text(x + w * 0.25, y - 0.30, left, fontsize=8.5, ha="center",
                    va="top")
            ax.text(x + w * 0.75, y - 0.30, right, fontsize=8.5, ha="center",
                    va="top")
            ax.text(mid, y - 0.72, condition, fontsize=7.5, ha="center",
                    va="top", color="0.35")

        ax.set_title(title, fontsize=10.5, loc="left", pad=2)

    if two_gases:
        handles, labels = axes[0].get_legend_handles_labels()
        fig.legend(handles, labels, loc="lower center", ncol=2, frameon=False,
                   fontsize=8, handletextpad=0.4, columnspacing=2.0,
                   bbox_to_anchor=(0.5, -0.02))

    fig.tight_layout(pad=0.5, w_pad=1.4)
    save(fig, name)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # q2  two different gases at two different temperatures.
    barrier_figure("q-2.png", "helium at $T_1$", "neon at $T_2$",
                   "insulating barrier", seed=21,
                   species=("helium", "neon"))

    # q3  the same gas on both sides, so the two panels differ only in the
    #     barrier. This is the figure that has to look like nothing happened.
    barrier_figure("q-3.png", "argon", "argon",
                   "same temperature and pressure on both sides", seed=31)

    # q4  two different gases already at the same temperature and pressure.
    barrier_figure("q-4.png", "helium", "argon",
                   "same temperature and pressure on both sides", seed=41)


if __name__ == "__main__":
    main()
