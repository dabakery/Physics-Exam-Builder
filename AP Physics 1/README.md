# AP Physics 1

Isomorphic problem banks for AP Physics 1 (algebra-based), authored by Michael Baker.

Unit folder numbers follow the College Board's AP Physics 1 unit numbering **shifted down by
one**, so the course is numbered from 0: AP Unit 1 (Kinematics) is folder `0_Kinematics`,
AP Unit 8 (Fluids) is folder `7_Fluids`. `../AP Physics 2/` picks up at folder 8 (AP Unit 9,
Thermodynamics) under the same convention, so the two courses form one unbroken 0–14
sequence.

| Folder | College Board unit |
|---|---|
| `0_Kinematics` | 1 |
| `1_Force and Translational Dynamics` | 2 |
| `2_Work, Energy, and Power` | 3 |
| `3_Linear Momentum` | 4 |
| `4_Torque and Rotational Dynamics` | 5 |
| `5_Energy and Momentum of Rotating Systems` | 6 |
| `6_Oscillations` | 7 |
| `7_Fluids` | 8 |

Note this numbering no longer lines up with `../PHY I Mechanics/`, which uses upstream's
university-course sequence. `Topics.csv` is the topic catalog for this course.

## Bank ID convention

    APP1-<UNIT>-<ABBREV>-<MMDDYY>

e.g. `APP1-KIN-PROJHT-032026` — kinematics, projectile max height, created 03-20-2026.
The bank folder, the `.yaml` inside it, and `bank_info.bank_id` all use this same string.

| Unit | Code | Unit | Code |
|---|---|---|---|
| 0 Kinematics | `KIN` | 4 Torque and Rotational Dynamics | `TOR` |
| 1 Force and Translational Dynamics | `FTD` | 5 Energy and Momentum of Rotating Systems | `ROT` |
| 2 Work, Energy, and Power | `WEP` | 6 Oscillations | `OSC` |
| 3 Linear Momentum | `MOM` | 7 Fluids | `FLU` |

## Adding a bank

1. `mkdir "<N_Unit Name>/APP1-<UNIT>-<ABBREV>-<MMDDYY>"`
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
