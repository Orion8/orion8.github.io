# Character Lab hosting directory

This directory is the deployment destination for the Character Lab browser viewer.

- Website: https://orion8.github.io/character_lab/
- Source project: https://github.com/Orion8/character_lab
- Stack: Babylon.js, React, TypeScript, and Vite.

The viewer has not been built or deployed yet. This file establishes the hosting
directory; it does not provide a runnable viewer.

## Deploying the viewer

Configure Vite with base: "/character_lab/". Resolve character data using Vite's
import.meta.env.BASE_URL so URLs remain under this folder.

After building the viewer, copy the contents of apps/viewer/dist/ from the source
project into this directory. The expected deployed layout is:

    character_lab/
      index.html
      assets/                 Compiled JavaScript, CSS, and bundled assets
      characters/test/        GLB, manifest, and any separate textures
      README.md               These deployment notes

Keep editable Blender sources and development files in the source project.
Deployment changes are limited to character_lab/; preserve other hosted projects
and the existing root .nojekyll file.
