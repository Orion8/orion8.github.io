# Character Lab

Browser viewer: https://orion8.github.io/character_lab/

This folder contains the verified Babylon.js, React, TypeScript, and Vite prototype.
The first release supports the Pip test character, Idle body playback, a smile
control, body/face cameras, speed, scrubbing, reset, and loading-error recovery.

Source: https://github.com/Orion8/character_lab/tree/feat/browser-prototype
Implementation PR: https://github.com/Orion8/character_lab/pull/2
Build verification: https://github.com/Orion8/character_lab/actions/runs/36777396974

Compiled application files live in assets/. Character GLB and manifest live in
characters/test/. The editable Blender master stays in the source repository.

For updates, build the source project with Vite base /character_lab/, verify it,
and copy apps/viewer/dist/ contents here. Limit deployment changes to this folder.
See build-info.json for this build's source commit and verification summary.
