"""
Figure generator for APP2-THM-UNIPRES-080926 (Uniform Gas Pressure on Container Walls).

Writes figure_folder/q-1.png … q-4.png, the exact names the YAML references.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.
Keep it: regenerating from source is how the bank's figures stay uniform when
new isomorphs are added.

Design rules, so later additions match:
  - Line art only, black outline on a pale gas fill. No colour coding, because
    colour would imply a distinction between walls and the whole point is that
    the walls are alike.
  - Label only what the question states (radii, heights, areas). The figure must
    not hint at which answer is correct, so no pressure or force arrows.
  - Same stroke width, font size and figure size across all four.
"""

import math
import os

import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon, Circle, Ellipse, FancyArrowPatch

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "figure_folder")

INK = "#111111"
GAS = "#e3ebf2"          # pale fill = "there is gas in here"
GAS_DARK = "#d2dee8"     # shaded faces, for depth only
LW = 1.8
FS = 15                  # label font size
FIGSIZE = (4.6, 4.6)
DPI = 140


def new_axes():
    fig, ax = plt.subplots(figsize=FIGSIZE)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def save(fig, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    fig.savefig(path, dpi=DPI, bbox_inches="tight", pad_inches=0.15,
                facecolor="white")
    plt.close(fig)
    print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")


def dim_arrow(ax, p0, p1, label, offset=(0, 0), fontsize=FS):
    """Double-headed dimension arrow with a label at its midpoint."""
    ax.add_patch(FancyArrowPatch(p0, p1, arrowstyle="<|-|>", mutation_scale=12,
                                 lw=1.3, color=INK, shrinkA=0, shrinkB=0))
    mx, my = (p0[0] + p1[0]) / 2 + offset[0], (p0[1] + p1[1]) / 2 + offset[1]
    ax.text(mx, my, label, fontsize=fontsize, color=INK,
            ha="center", va="center",
            bbox=dict(boxstyle="round,pad=0.15", fc="white", ec="none"))


def leader(ax, xy, xytext, label, fontsize=FS, ha="center"):
    """Callout label with a thin arrow pointing at a face."""
    ax.annotate(label, xy=xy, xytext=xytext, fontsize=fontsize, color=INK,
                ha=ha, va="center",
                arrowprops=dict(arrowstyle="->", lw=1.2, color=INK,
                                shrinkA=0, shrinkB=2))


def draw_box(ax, w, h, d, ox=0.0, oy=0.0, skew=(0.42, 0.30)):
    """Oblique projection of a rectangular box. Returns key points for labelling."""
    dx, dy = d * skew[0], d * skew[1]
    front = [(ox, oy), (ox + w, oy), (ox + w, oy + h), (ox, oy + h)]
    top = [(ox, oy + h), (ox + w, oy + h), (ox + w + dx, oy + h + dy), (ox + dx, oy + h + dy)]
    side = [(ox + w, oy), (ox + w + dx, oy + dy), (ox + w + dx, oy + h + dy), (ox + w, oy + h)]

    for poly, fc in ((top, GAS_DARK), (side, GAS_DARK), (front, GAS)):
        ax.add_patch(Polygon(poly, closed=True, fc=fc, ec=INK, lw=LW,
                             joinstyle="round"))
    # hidden back-bottom edges, dashed so the solid reads as closed
    ax.plot([ox, ox + dx], [oy, oy + dy], ls=(0, (4, 3)), lw=1.1, color=INK)
    ax.plot([ox + dx, ox + w + dx], [oy + dy, oy + dy], ls=(0, (4, 3)), lw=1.1, color=INK)
    ax.plot([ox + dx, ox + dx], [oy + dy, oy + h + dy], ls=(0, (4, 3)), lw=1.1, color=INK)
    return dict(front=front, top=top, side=side, dx=dx, dy=dy)


# ── q1: closed cylinder, top radius r, side height 2r ────────────────────────
def q1():
    fig, ax = new_axes()
    r, h = 1.0, 2.0
    ry = 0.30                      # ellipse squash for the perspective
    xl, xr = -r, r

    # body
    ax.add_patch(Polygon([(xl, 0), (xr, 0), (xr, h), (xl, h)],
                         closed=True, fc=GAS, ec="none"))
    ax.plot([xl, xl], [0, h], color=INK, lw=LW)
    ax.plot([xr, xr], [0, h], color=INK, lw=LW)
    # bottom: solid front arc, dashed back arc
    ax.add_patch(Ellipse((0, 0), 2 * r, 2 * ry, fc=GAS, ec="none"))
    ax.add_patch(matplotlib.patches.Arc((0, 0), 2 * r, 2 * ry, theta1=180, theta2=360,
                                        lw=LW, color=INK))
    ax.add_patch(matplotlib.patches.Arc((0, 0), 2 * r, 2 * ry, theta1=0, theta2=180,
                                        lw=1.1, color=INK, ls=(0, (4, 3))))
    # top
    ax.add_patch(Ellipse((0, h), 2 * r, 2 * ry, fc=GAS_DARK, ec=INK, lw=LW))

    # radius of the top surface
    ax.plot([0], [h], marker="o", ms=3.5, color=INK)
    # Label breaks the dimension line rather than the object, which is the usual
    # drafting convention. On the ellipse centre line it clears both the near rim
    # (h - 0.26 at this x) and the far rim (h + 0.26).
    dim_arrow(ax, (0, h), (r, h), "$r$", offset=(0, 0))
    # height of the cylindrical side
    dim_arrow(ax, (xr + 0.42, 0), (xr + 0.42, h), "$2r$", offset=(0.0, 0))
    ax.plot([xr, xr + 0.5], [0, 0], lw=0.9, color=INK)
    ax.plot([xr, xr + 0.5], [h, h], lw=0.9, color=INK)

    leader(ax, (-r * 0.45, h * 0.45), (-r - 1.05, h * 0.45), "gas", ha="right")

    ax.set_xlim(-r - 1.5, r + 1.15)
    ax.set_ylim(-ry - 0.5, h + ry + 0.5)
    save(fig, "q-1.png")


# ── q2: sealed box, bottom face A, side face 3A ──────────────────────────────
def q2():
    fig, ax = new_axes()
    w, d = 1.0, 1.0            # square base: w * d = A
    h = 3.0                    # front face: w * h = 3A
    g = draw_box(ax, w, h, d)

    leader(ax, (w * 0.5, h * 0.55), (w + g["dx"] + 1.25, h * 0.68),
           "side face\narea $3A$", ha="left")
    leader(ax, (w * 0.5, 0.02), (w + g["dx"] + 1.25, -0.62),
           "bottom face\narea $A$", ha="left")

    ax.set_xlim(-0.55, w + g["dx"] + 2.9)
    ax.set_ylim(-1.15, h + g["dy"] + 0.5)
    save(fig, "q-2.png")


# ── q3: sealed flask, bulb wall 5A, neck wall A ──────────────────────────────
def q3():
    fig, ax = new_axes()
    R = 1.0                                  # bulb
    nw, nh = 0.30, 1.25                      # neck half-width, height
    cy = 0.0
    # neck meets the bulb where the circle reaches x = nw
    y_join = cy + math.sqrt(max(R ** 2 - nw ** 2, 0.0))

    ax.add_patch(Polygon([(-nw, y_join - 0.05), (nw, y_join - 0.05),
                          (nw, cy + y_join + nh), (-nw, cy + y_join + nh)],
                         closed=True, fc=GAS, ec="none"))
    ax.add_patch(Circle((0, cy), R, fc=GAS, ec=INK, lw=LW, zorder=2))
    # neck walls drawn over the bulb outline, then the join is cleaned up
    ax.plot([-nw, -nw], [y_join - 0.12, y_join + nh], color=INK, lw=LW, zorder=3)
    ax.plot([nw, nw], [y_join - 0.12, y_join + nh], color=INK, lw=LW, zorder=3)
    ax.plot([-nw, nw], [y_join + nh, y_join + nh], color=INK, lw=LW, zorder=3)  # sealed top
    ax.add_patch(Polygon([(-nw + 0.02, y_join - 0.10), (nw - 0.02, y_join - 0.10),
                          (nw - 0.02, y_join + 0.22), (-nw + 0.02, y_join + 0.22)],
                         closed=True, fc=GAS, ec="none", zorder=2.5))

    # ha="right" anchors the text's right edge clear of the bulb; anchoring left
    # ran the label straight through the circle. Limits are generous because
    # bbox_inches="tight" crops the empty margin away anyway.
    leader(ax, (-R * 0.60, cy - R * 0.42), (-R - 0.40, cy - R - 0.55),
           "bulb inner wall\narea $5A$", ha="right")
    leader(ax, (nw, y_join + nh * 0.62), (nw + 1.15, y_join + nh * 0.78),
           "neck inner wall\narea $A$", ha="left")

    ax.set_xlim(-R - 3.8, R + 2.8)
    ax.set_ylim(cy - R - 1.35, y_join + nh + 0.5)
    save(fig, "q-3.png")


# ── q4: container with faces A and 4A ────────────────────────────────────────
def q4():
    fig, ax = new_axes()
    s = 1.0
    w, h, d = 4 * s, s, s      # front face 4s^2 = 4A, right end face s^2 = A
    g = draw_box(ax, w, h, d)

    leader(ax, (w * 0.42, h * 0.5), (w * 0.42, -1.0), "area $4A$")
    leader(ax, (w + g["dx"] * 0.5, h * 0.5 + g["dy"] * 0.5),
           (w + g["dx"] + 1.15, h * 0.5 + g["dy"] + 0.75), "area $A$", ha="left")

    ax.set_xlim(-0.4, w + g["dx"] + 2.3)
    ax.set_ylim(-1.5, h + g["dy"] + 1.15)
    save(fig, "q-4.png")


if __name__ == "__main__":
    q1(); q2(); q3(); q4()
