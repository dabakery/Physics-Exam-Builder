# AP Physics 2

Isomorphic problem banks for AP Physics 2 (algebra-based), authored by Michael Baker.

Unit folder numbers **are** the College Board's AP Physics 2 unit numbers: AP Unit 9
(Thermodynamics) is folder `9_Thermodynamics`, AP Unit 15 (Modern Physics) is folder
`15_Modern Physics`. The folder number is shown to students on the site, so it has to match
the number they see in the course description and on the equation sheet. It also has to match
the subtopic folders beneath it, which carry College Board section numbers such as
`9.1_Kinetic Theory of Temperature and Pressure`. Folders 1–8 belong to `../AP Physics 1/`
(AP Units 1–8) and intentionally do not exist here.

| Folder | College Board unit |
|---|---|
| `9_Thermodynamics` | Unit 9 |
| `10_Electric Force, Field, and Potential` | Unit 10 |
| `11_Electric Circuits` | Unit 11 |
| `12_Magnetism and Electromagnetism` | Unit 12 |
| `13_Geometric Optics` | Unit 13 |
| `14_Waves, Sound, and Physical Optics` | Unit 14 |
| `15_Modern Physics` | Unit 15 |

`Topics.csv` is the topic catalog for this course.

## Bank ID convention

    APP2-<UNIT>-<ABBREV>-<MMDDYY>

e.g. `APP2-CIR-RCPAR-032026` — electric circuits, resistors in parallel, created 03-20-2026.
The bank folder, the `.yaml` inside it, and `bank_info.bank_id` all use this same string.

| Unit | Code | Unit | Code |
|---|---|---|---|
| 9 Thermodynamics | `THM` | 13 Geometric Optics | `OPT` |
| 10 Electric Force, Field, and Potential | `EFP` | 14 Waves, Sound, and Physical Optics | `WAV` |
| 11 Electric Circuits | `CIR` | 15 Modern Physics | `MOD` |
| 12 Magnetism and Electromagnetism | `MAG` | | |

## Adding a bank

1. `mkdir -p "<N_Unit Name>/<CB subtopic>/APP2-<UNIT>-<ABBREV>-<MMDDYY>"` — the subtopic
   folder is what the site's third filter shows, e.g. `9.1_Kinetic Theory of Temperature and Pressure`.
   See `Topics.csv` for the College Board subtopic list for each unit.
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
