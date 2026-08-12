# Question Accuracy Review

Working notes from 2026-08-12. Nothing here has been built or fixed yet, apart from
`PHY1-F-IFBDF-091725` and `...091625` - being set to `draft`. This file exists so the review can be picked up
later without redoing the analysis.


## What started this

A review of `PHY I Mechanics/3_Forces/PHY1-F-IFBDF-091725/` found that the answer key omits
required forces in several questions. Checking the rest of the bank showed the same failure
in about a third of it.

## Findings in PHY1-F-IFBDF-091725

Eight of 25 questions have clear defects.

| Q | Scenario | Problem |
|---|---|---|
| 1 | Boat at constant velocity | Drag is keyed with no forward thrust, so the boat decelerates |
| 4 | Hot air balloon accelerating up | "Thrust force from the burner on the balloon" is not a real force. The burner heats the air, density drops, and buoyancy increases |
| 5 | Book sliding at constant velocity, hand pressing down | All three keyed forces are vertical. This only works on a frictionless table, which makes the hand pressing down pointless |
| 6 | Box pushed at constant velocity | The text says the box is being pushed, then the applied force is left out of the key |
| 8 | Apple falling with air resistance | "The force of the wind on the apple" is keyed correct, but the scenario never mentions wind. Q22 is the same scenario keyed differently |
| 9 | Sled pulled at constant velocity across snow | Tension is keyed with no friction, so the sled accelerates. This is Q6 in mirror image |
| 20 | Toy boat pushed across a bathtub | Gravity is missing from the key entirely. This is the worst error in the bank |
| 21 | Crate pulled up a rough ramp | The normal force is missing from the key |

Softer items that are defensible but worth a second look: Q2 (see below), Q13 (no friction on
a pushed log), Q14 and Q25 (both say "kinetic friction" where a rolling body calls for
static), Q19 (buoyancy omitted for a fish leaving the water), and Q22 (keys the buoyancy of
air on an apple, which is real but negligible, and contradicts Q8).

### Q2 is ambiguous rather than wrong

The puck is keyed with gravity, normal force, and kinetic friction. That describes a puck
decelerating on slightly rough ice, and it is internally consistent. The text never claims
constant velocity, so there is no contradiction to point at. The argument for removing
friction is that "on ice" conventionally implies a frictionless surface, which is a
reasonable teaching standard but not a physics error. The fix belongs in the wording of the
question.


### Wording note for the Q1 fix

The missing force in Q1 must be a force acting **on the boat**. A phrase such as "the force
exerted by the boat's engine on the water" describes a force on the water, so by this bank's
own rule it belongs among the distractors, not the correct answers. It would make a good
fourth distractor, because it is the third law partner of the real force.

Suggested correct option: **"The forward thrust exerted by the water on the boat's
propeller."**

The underlying Physics is not trivial. The propeller throws water backward, and the pressure
difference across the blades pushes the boat forward. At the introductory level it is enough
to call this thrust and treat it as an applied force.

## Root cause

The generation prompt stored in the bank specifies "an inanimate object acted on by exactly
three non negligible external forces," then asks for three correct answers and two
distractors. The template fixes the number of correct answers before the scenario is chosen.
When a situation needs four forces the model dropped one, and when it only supports two the
model invented one.

The prompt also describes "a boat is floating at rest on a lake," while Q1 says "at a
constant velocity." That drift from prompt to question is what created the contradiction.

**This is the signature to look for in other banks.** Any bank whose recorded prompt fixes
the count of correct answers inherits the same risk. One other bank currently matches that
signature: `PHY1-F-INTLP-091625`.

## Scale of a full review

The corpus is 688 questions across 31 banks with `status: ready`, plus 4 draft banks. By
type: 331 numerical, 162 multiple choice, 112 multiple answers, 83 categorization.

Count live questions by restricting to banks whose `status:` is `ready` or `deployed` and
excluding `SKIP_DIRS`. Counting raw YAML gives about 910, which wrongly includes drafts and
`Old files/` copies.

Reviewed by hand at 2 to 4 minutes for a conceptual question, and 5 to 10 minutes for a
numerical one where the value is recomputed and the tolerance checked, a linear sweep is
roughly **40 to 80 hours**. That is the reason to triage rather than sweep.

## Recommended plan

1. **Take a stratified sample first.** Three questions from each of the 31 banks is about 93
   questions and 4 to 6 hours. This produces a per bank error rate and shows which banks need
   a full pass and which need only spot checks. The one bank measured so far ran at 32%, so
   expect wide variance driven by prompt style.
2. **Build automated recomputation for the numerical half.** This is the largest available
   win, because 331 questions are objectively checkable and many banks carry the worked
   solution in `feedback.general`. A pass that recomputes from the stated quantities and
   flags disagreement with `answer.value` reduces half the corpus to a short review queue.
   **Not yet built.**
3. **Triage by prompt pattern.** Flag every bank whose recorded prompt fixes the number of
   correct answers, starting with `PHY1-F-INTLP-091625`.
4. **Detect duplicate scenarios across banks.** Two questions describing the same situation
   with different keys is a reliable sign that at least one is wrong. This is what catches
   the Q8 and Q22 contradiction.
5. **Use quiz mode as the review harness.** Working through a bank as a student surfaces a
   bad key faster than reading YAML, and it is now the quickest way to review conceptual
   questions.

## Structural detectors

Three checks were written and tested during the analysis. They are not saved as a script yet.

- Equilibrium wording ("constant velocity", "at rest", "constant speed") combined with a
  resistive force in the key and no driving force.
- A free body diagram question with no gravity among the correct answers.
- A free body diagram question that names a supporting surface but has no normal force among
  the correct answers.

Tested against `PHY1-F-IFBDF-091725`, they correctly flagged Q1, Q6, Q20 and Q21, produced
two false positives (Q15 and Q18 are both fine), and missed Q9 because its defect is the
inverse pattern.
