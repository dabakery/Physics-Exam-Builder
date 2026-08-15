# AP Physics 1

Isomorphic problem banks for AP Physics 1 (algebra-based), authored by Michael Baker.

Unit folder numbers **are** the College Board's AP Physics 1 unit numbers: AP Unit 1
(Kinematics) is folder `1_Kinematics`, AP Unit 8 (Fluids) is folder `8_Fluids`. The folder
number is shown to students on the site, so it has to match the number they see in the
course description and on the equation sheet. `../AP Physics 2/` picks up at folder 9 (AP
Unit 9, Thermodynamics) under the same rule, so the two courses form one unbroken 1–15
sequence.

| Folder | College Board unit |
|---|---|
| `1_Kinematics` | 1 |
| `2_Force and Translational Dynamics` | 2 |
| `3_Work, Energy, and Power` | 3 |
| `4_Linear Momentum` | 4 |
| `5_Torque and Rotational Dynamics` | 5 |
| `6_Energy and Momentum of Rotating Systems` | 6 |
| `7_Oscillations` | 7 |
| `8_Fluids` | 8 |

Note this numbering does not line up with `../PHY I Mechanics/`, which uses upstream's
university-course sequence and starts at 0. `Topics.csv` is the topic catalog for this
course.

## Bank ID convention

    APP1-<UNIT>-<ABBREV>-<MMDDYY>

e.g. `APP1-KIN-PROJHT-032026` — kinematics, projectile max height, created 03-20-2026.
The bank folder, the `.yaml` inside it, and `bank_info.bank_id` all use this same string.

| Unit | Code | Unit | Code |
|---|---|---|---|
| 1 Kinematics | `KIN` | 5 Torque and Rotational Dynamics | `TOR` |
| 2 Force and Translational Dynamics | `FTD` | 6 Energy and Momentum of Rotating Systems | `ROT` |
| 3 Work, Energy, and Power | `WEP` | 7 Oscillations | `OSC` |
| 4 Linear Momentum | `MOM` | 8 Fluids | `FLU` |

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
