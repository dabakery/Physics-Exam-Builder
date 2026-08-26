"""
Figure generator for APP2-THM-ENTSYS-082626 (Entropy Change of a System in Open
and Closed Situations).

Writes figure_folder/q-2.png, q-4.png and q-5.png, the exact names the YAML
references. Only three of the seven questions take a figure; the file name
carries the question id rather than a running count, so adding a figure to
another question later does not renumber the ones already there.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Black line art on white, no colour, so the figures survive greyscale
    printing and match the CONGRPH and COND banks in this course.
  - A figure here shows the apparatus and the boundary, never the answer. No
    arrow is labelled with an entropy, and nothing in a figure states which way
    an entropy goes. The particle counts in q-2 are equal before and after for
    the same reason: the picture must not settle the question by itself.
  - Insulated walls are drawn as a hatched ring around the container, made by
    laying a plain white rectangle over a slightly larger hatched one. This is
    the textbook convention and it reads at print size.
  - q-4 and q-5 are the same scene drawn twice by one function, with only the
    dashed system boundary moved. That is the entire point of the pair, so they
    must not drift apart. Change the scene once and both figures follow.
  - The freezer's cord leaves the kitchen in both, and in q-5 it visibly crosses
    the dashed boundary. Work carries energy across without carrying entropy,
    which is what lets the second law still apply to the combined system, and
    the figure would be telling a lie about a sealed kitchen otherwise.

Figures are palette quantized to 16 colours before being written. These are flat
line drawings with a handful of distinct greys, so the quantization is visually
lossless and cuts the file size by roughly two thirds. Page size is set by PNG
bytes, and PNG does not compress further in the bundle zip.
"""

import io
import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import FancyArrowPatch, Rectangle
from PIL import Image

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "figure_folder",
)

DPI = 150
LW_WALL = 1.5                    # container and appliance outlines
LW_THIN = 1.0
INSUL = 0.16                     # thickness of the hatched insulation ring


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


def blank_axes(ax, xlim, ylim):
    ax.set_xlim(*xlim)
    ax.set_ylim(*ylim)
    ax.set_aspect("equal")
    ax.axis("off")


def box(ax, x, y, w, h, lw=LW_WALL, ls="-", ec="black", fc="white", z=2,
        hatch=None):
    ax.add_patch(Rectangle((x, y), w, h, fill=True, facecolor=fc,
                           edgecolor=ec, lw=lw, ls=ls, zorder=z, hatch=hatch))


def insulated_box(ax, x, y, w, h):
    """A rigid insulated container: hatched ring outside, clear space inside."""
    box(ax, x - INSUL, y - INSUL, w + 2 * INSUL, h + 2 * INSUL,
        lw=LW_THIN, ec="0.35", hatch="////", z=1)
    box(ax, x, y, w, h, lw=LW_WALL, z=2)


def arrow(ax, p0, p1, lw=1.4, ls="-"):
    ax.add_patch(FancyArrowPatch(p0, p1, arrowstyle="-|>", mutation_scale=11,
                                 lw=lw, ls=ls, color="black", zorder=6,
                                 shrinkA=0, shrinkB=0))


# ---------------------------------------------------------------- q2

def free_expansion():
    """Gas in one half of a rigid insulated container, then filling both."""
    fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.9), dpi=DPI)
    x0, y0, w, h = 0.5, 0.5, 5.0, 3.0
    mid = x0 + w / 2
    pad = 0.28                   # keep particles off the walls
    n = 46

    for ax, title, after in zip(axes, ("Before", "After"), (False, True)):
        blank_axes(ax, (0.0, 6.0), (0.0, 4.05))
        insulated_box(ax, x0, y0, w, h)

        rng = np.random.default_rng(4 if after else 3)
        xlo = x0 + pad
        xhi = (x0 + w - pad) if after else (mid - pad)
        px = rng.uniform(xlo, xhi, n)
        py = rng.uniform(y0 + pad, y0 + h - pad, n)
        ax.plot(px, py, "o", ms=3.4, color="black", zorder=5)

        if after:
            ax.plot([mid, mid], [y0, y0 + h], ls=(0, (3, 3)), lw=1.0,
                    color="0.6", zorder=4)
            ax.text(mid, y0 - 0.42, "partition removed", fontsize=7.5,
                    ha="center", va="top", color="0.35")
        else:
            ax.plot([mid, mid], [y0, y0 + h], lw=2.6, color="black", zorder=4)
            ax.text(mid + w / 4, y0 + h / 2, "vacuum", fontsize=9.5,
                    ha="center", va="center", style="italic")
            ax.text(mid, y0 - 0.42, "partition", fontsize=7.5,
                    ha="center", va="top", color="0.35")
            ax.annotate("rigid, insulated wall",
                        xy=(x0 + w * 0.78, y0 + h + INSUL / 2),
                        xytext=(x0 + w * 0.62, y0 + h + 0.62),
                        fontsize=7.5, color="0.35", ha="center",
                        arrowprops=dict(arrowstyle="-", lw=0.8, color="0.5"))

        ax.set_title(title, fontsize=10.5, loc="left", pad=2)

    fig.tight_layout(pad=0.5, w_pad=1.4)
    save(fig, "q-2.png")


# ---------------------------------------------------------------- q4 and q5

def freezer_scene(name, boundary):
    """The same kitchen twice. `boundary` is 'water' or 'kitchen'."""
    fig, ax = plt.subplots(figsize=(5.6, 3.7), dpi=DPI)
    blank_axes(ax, (0.0, 10.7), (0.35, 6.35))

    # kitchen
    kx, ky, kw, kh = 0.5, 0.7, 8.0, 5.0
    box(ax, kx, ky, kw, kh, lw=LW_THIN)
    ax.text(kx + 0.22, ky + kh - 0.28, "kitchen", fontsize=9, ha="left",
            va="top")

    # freezer, with the tray of water inside it
    fx, fy, fw, fh = 1.1, 1.3, 3.1, 3.3
    box(ax, fx, fy, fw, fh, lw=LW_WALL)
    ax.text(fx + fw / 2, fy + fh - 0.26, "freezer", fontsize=9, ha="center",
            va="top")
    tx, ty, tw, th = 1.6, 2.3, 1.7, 1.1
    box(ax, tx, ty, tw, th, lw=LW_THIN, z=3)
    ax.text(tx + tw / 2, ty + th / 2, "water", fontsize=8.5, ha="center",
            va="center", zorder=4)

    # energy taken out of the water and released into the kitchen air
    arrow(ax, (tx + tw + 0.15, ty + th / 2), (6.45, ty + th / 2))
    ax.text(5.75, ty + th / 2 + 0.5, "energy from the water"
            "\nends up in the kitchen air", fontsize=7.5,
            ha="center", va="bottom", linespacing=1.4)

    # power cord, leaving the kitchen on the right
    cy = 1.75
    ax.plot([fx + fw, 9.35], [cy, cy], lw=1.1, color="black", zorder=5)
    box(ax, 9.35, cy - 0.2, 0.42, 0.4, lw=LW_THIN, fc="0.85", z=5)
    ax.text(9.56, cy - 0.42, "electrical\nenergy in", fontsize=7.5,
            ha="center", va="top", linespacing=1.35)

    # the one thing that differs between the two figures
    dash = (0, (5, 3))
    if boundary == "water":
        bx, by, bw, bh = tx - 0.28, ty - 0.28, tw + 0.56, th + 0.56
        lx, ly, va, ha = bx + bw / 2, by - 0.14, "top", "center"
    else:
        bx, by, bw, bh = kx - 0.28, ky - 0.28, kw + 0.56, kh + 0.56
        lx, ly, va, ha = bx, by + bh + 0.14, "bottom", "left"
    box(ax, bx, by, bw, bh, lw=1.9, ls=dash, fc="none", z=7)
    ax.text(lx, ly, "system boundary", fontsize=8.5, ha=ha, va=va,
            zorder=7)

    fig.tight_layout(pad=0.4)
    save(fig, name)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    free_expansion()
    freezer_scene("q-4.png", boundary="water")
    freezer_scene("q-5.png", boundary="kitchen")


if __name__ == "__main__":
    main()
