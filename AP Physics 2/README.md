# AP Physics 2

Isomorphic problem banks for AP Physics 2 (algebra-based), authored by Michael Baker.

Unit folder numbers follow the College Board's AP Physics 2 unit numbering **shifted down by
one**, so that a course numbered from 0 lines up: AP Unit 9 (Thermodynamics) is folder
`8_Thermodynamics`, AP Unit 15 (Modern Physics) is folder `14_Modern Physics`. Folders 0–7
belong to `../AP Physics 1/` (AP Units 1–8) and intentionally do not exist here.

| Folder | College Board unit |
|---|---|
| `8_Thermodynamics` | Unit 9 |
| `9_Electric Force, Field, and Potential` | Unit 10 |
| `10_Electric Circuits` | Unit 11 |
| `11_Magnetism and Electromagnetism` | Unit 12 |
| `12_Geometric Optics` | Unit 13 |
| `13_Waves, Sound, and Physical Optics` | Unit 14 |
| `14_Modern Physics` | Unit 15 |

`Topics.csv` is the topic catalog for this course.

## Bank ID convention

    APP2-<UNIT>-<ABBREV>-<MMDDYY>

e.g. `APP2-CIR-RCPAR-032026` — electric circuits, resistors in parallel, created 03-20-2026.
The bank folder, the `.yaml` inside it, and `bank_info.bank_id` all use this same string.

| Unit | Code | Unit | Code |
|---|---|---|---|
| 8 Thermodynamics | `THM` | 12 Geometric Optics | `OPT` |
| 9 Electric Force, Field, and Potential | `EFP` | 13 Waves, Sound, and Physical Optics | `WAV` |
| 10 Electric Circuits | `CIR` | 14 Modern Physics | `MOD` |
| 11 Magnetism and Electromagnetism | `MAG` | | |

## Adding a bank

1. `mkdir "<N_Unit Name>/APP2-<UNIT>-<ABBREV>-<MMDDYY>"`
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
