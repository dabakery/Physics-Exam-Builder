"""
Figure generator for APP2-THM-TRMS-080926 (Scaling of Kinetic Energy and RMS Speed).

Writes figure_folder/q-4.png and q-5.png, the exact names the YAML references.
Only the two distribution questions take a figure; q1, q2, q3 and q6 are pure
scaling arguments and are text only.

Run from the bank folder with the project venv:
    ../../../../.venv/bin/python Scripts/make_figures.py

Lives in Scripts/ because build_standalone_html.py's SKIP_DIRS excludes that
name, so the generator is version controlled but never bundled into the page.

Design rules, so later additions match:
  - Curves are drawn from the real Maxwell-Boltzmann speed distribution, not
    sketched. Writing it in terms of the most probable speed,
        f(v) = (4/sqrt(pi)) * (v^2 / v_p^3) * exp(-v^2 / v_p^2)
    which integrates to exactly 1 over v in [0, inf). Normalisation is the
    whole point: equal areas force the hotter (or lighter) gas to peak LOWER
    as well as further right. Drawing two curves at equal height is the usual
    textbook error and a sharp student will catch it.
  - Black line art, solid vs dashed to tell the curves apart, labelled directly
    on the curve. No colour, matching the UNIPRES bank in this topic folder, and
    so the curves survive greyscale printing.
  - The y axis carries no numbers. Absolute probability density is not part of
    any question and numbers there would invite arithmetic that is not being
    asked for. The x axis DOES carry numbers, because q4 requires reading a
    speed ratio off it.
  - Label only what the question needs. No temperature or mass values are shown,
    since in both questions identifying those is the task.
"""

import os

import numpy as np
import matplotlib
matplotlib.use("Agg")            # no display needed
import matplotlib.pyplot as plt

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "figure_folder")

INK = "#111111"
LW = 2.0
FS = 15                  # label font size
FS_TICK = 12
FIGSIZE = (6.0, 4.2)
DPI = 140


def maxwell(v, v_p):
    """Normalised Maxwell-Boltzmann speed distribution, parameterised by v_p."""
    return (4.0 / np.sqrt(np.pi)) * (v ** 2 / v_p ** 3) * np.exp(-(v ** 2) / v_p ** 2)


def new_axes(vmax):
    fig, ax = plt.subplots(figsize=FIGSIZE)
    ax.set_xlabel("molecular speed (m/s)", fontsize=FS, color=INK)
    ax.set_ylabel("relative number of molecules", fontsize=FS, color=INK)
    ax.set_xlim(0, vmax)
    ax.tick_params(axis="x", labelsize=FS_TICK, colors=INK)
    ax.set_yticks([])                      # density values are never asked for
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_linewidth(1.3)
        ax.spines[side].set_color(INK)
    return fig, ax


def save(fig, name):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, name)
    fig.savefig(path, dpi=DPI, bbox_inches="tight", pad_inches=0.15,
                facecolor="white")
    plt.close(fig)
    print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")


# ── q4: one gas, two temperatures. Peaks at 400 and 800 m/s, so T_B/T_A = 4 ──
def q4():
    vmax = 2000.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    peaks = [(400.0, "A", "solid"), (800.0, "B", (0, (6, 3)))]
    for v_p, label, style in peaks:
        y = maxwell(v, v_p)
        ax.plot(v, y, color=INK, lw=LW, ls=style)
        # drop line to the peak, so the speed can be read off the axis
        ax.plot([v_p, v_p], [0, maxwell(np.array([v_p]), v_p)[0]],
                color=INK, lw=1.0, ls=(0, (2, 3)))

    # curve labels placed on the falling side of each curve, clear of the other
    ax.annotate("A", xy=(470, maxwell(np.array([470.0]), 400.0)[0]),
                xytext=(300, maxwell(np.array([400.0]), 400.0)[0] * 1.06),
                fontsize=FS, color=INK, ha="center", va="bottom")
    ax.annotate("B", xy=(980, maxwell(np.array([980.0]), 800.0)[0]),
                xytext=(1120, maxwell(np.array([800.0]), 800.0)[0] * 1.10),
                fontsize=FS, color=INK, ha="center", va="bottom")

    ax.set_xticks([0, 400, 800, 1200, 1600, 2000])
    ax.set_ylim(0, maxwell(np.array([400.0]), 400.0)[0] * 1.28)
    save(fig, "q-4.png")


# ── q5: two gases, same temperature. Light gas v_p 1120, heavy gas v_p 354 ───
#     (helium and argon at room temperature, though the YAML never names them)
def q5():
    vmax = 2500.0
    v = np.linspace(0, vmax, 2000)
    fig, ax = new_axes(vmax)

    for v_p, label, style in [(354.0, "Y", "solid"), (1120.0, "X", (0, (6, 3)))]:
        ax.plot(v, maxwell(v, v_p), color=INK, lw=LW, ls=style)

    ax.annotate("X", xy=(1400, maxwell(np.array([1400.0]), 1120.0)[0]),
                xytext=(1560, maxwell(np.array([1120.0]), 1120.0)[0] * 1.22),
                fontsize=FS, color=INK, ha="center", va="bottom")
    ax.annotate("Y", xy=(430, maxwell(np.array([430.0]), 354.0)[0]),
                xytext=(620, maxwell(np.array([354.0]), 354.0)[0] * 0.92),
                fontsize=FS, color=INK, ha="center", va="bottom")

    ax.set_xticks([0, 500, 1000, 1500, 2000, 2500])
    ax.set_ylim(0, maxwell(np.array([354.0]), 354.0)[0] * 1.16)
    save(fig, "q-5.png")


if __name__ == "__main__":
    q4(); q5()
