# Character Lab

Browser viewer: https://orion8.github.io/character_lab/

Character Lab v0.7.0 loads Aster v3, the detailed silver-haired corset concept
character, by default. The model retains 795,484 triangles in five render primitives.
Use the Character menu to switch between Aster and the original Pip test character.
Both support Idle, Walk, Run, Jump, Wave, smile controls, and Studio/World modes
with root motion. This release prioritizes model detail and downloads a 32 MB Aster GLB.

Source: https://github.com/Orion8/character_lab/tree/feat/concept-character
Build verification: https://github.com/Orion8/character_lab/actions/runs/39947917009

This folder contains the exact verified Babylon.js, React, TypeScript and Vite
build from the CI artifact. Compiled application files live in assets/.
Runtime characters live in characters/aster/ and characters/test/.
Editable Blender sources remain in the source repository.

For updates, build the source project with Vite base /character_lab/, verify it,
and copy apps/viewer/dist/ contents here. Limit deployment changes to this folder.
Keep prior hashed assets available for visitors with cached HTML during rollout.
See build-info.json for this build's source commit and verification summary.
