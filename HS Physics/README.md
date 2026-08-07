# HS Physics

Isomorphic problem banks for regular (non-AP) high school physics, authored by Michael Baker.

Unit folders mirror the numbering in `../PHY I Mechanics/` so the two courses stay
cross-referenceable. `Topics.csv` is the topic *catalog* (0–17); unit folders exist only
for topics currently in use (0–12). Add a folder when you start authoring for that topic.

## Bank ID convention

    HSPHY-<UNIT>-<ABBREV>-<MMDDYY>

e.g. `HSPHY-2D-PROJHT-032026` — projectile motion, max height, created 03-20-2026.
The bank folder, the `.yaml` inside it, and `bank_info.bank_id` all use this same string.

| Unit | Code | Unit | Code |
|---|---|---|---|
| 0 Vector and Math | `VEC` | 7 Momentum and Impulse | `MOM` |
| 1 1D Motion | `1DM` | 8 Many-particle Systems | `MPS` |
| 2 2D Motion | `2D` | 9 Rotational Motion | `ROT` |
| 3 Forces | `F` | 10 Angular Momentum | `AM` |
| 4 Newton's Laws of Motion | `NL` | 11 Simple Harmonic Motion | `SHM` |
| 5 Kinetic Energy and Work | `KEW` | 12 Waves and Oscillation | `WAV` |
| 6 Conservation of ME | `CME` | | |

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
