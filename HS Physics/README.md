# HS Physics

Isomorphic problem banks for regular (non-AP) high school physics, authored by Michael Baker.

Unit folders follow this course's own teaching sequence, numbered 1–14. The folder number is
the unit number students see on the site, so it starts at 1. These numbers do **not** line up
with `../PHY I Mechanics/`, which is upstream's university sequence and starts at 0 because
its unit 0 is a math review that precedes the course proper. Check the target course's README
before assuming a folder number means the same thing elsewhere.

`Topics.csv` is the topic catalog for this course.

## Bank ID convention

    HSPHY-<UNIT>-<ABBREV>-<MMDDYY>

e.g. `HSPHY-PRJ-PROJHT-032026` — projectiles, max height, created 03-20-2026.
The bank folder, the `.yaml` inside it, and `bank_info.bank_id` all use this same string.

| Unit | Code | Unit | Code |
|---|---|---|---|
| 1 1D Motion | `1DM` | 8 Voltage | `VLT` |
| 2 Graphing | `GRA` | 9 Circuits | `CIR` |
| 3 Projectiles | `PRJ` | 10 Magnetism and Induction | `MAG` |
| 4 Forces | `FOR` | 11 EMF | `EMF` |
| 5 Energy | `ENE` | 12 Optics | `OPT` |
| 6 Momentum | `MOM` | 13 Light and Waves | `LGW` |
| 7 Electrostatics | `EST` | 14 Astronomy | `AST` |

## Adding a bank

1. `mkdir "<N_Unit Name>/HSPHY-<UNIT>-<ABBREV>-<MMDDYY>"`
2. Copy `../Templates/Problem-bank-template.yaml` into it, rename to match the folder.
3. Fill in `bank_info` (title, bank_id, learning objectives, authors, generation prompts).
4. Write questions per `../Templates/YAML_problem_types.md`. Math uses `<latex>...</latex>`.
5. Leave `status: draft` while working — **draft banks are invisible to the exam builder**.
   Flip to `ready` when the bank is done.
6. Images: put them beside the YAML or in a flat zip with no subfolders; filenames must
   match the YAML references exactly.

Folders named `Old`, `Archive`, `Drafts`, `Figure Creation`, etc. are skipped by the
bundler — safe places to park work in progress.

## Building

This course is only bundled if it is passed explicitly:

```bash
python3 ../scripts/build_standalone_html.py \
  --courses "HS Physics" "AP Physics 1" "AP Physics 2" "PHY I Mechanics"
```
