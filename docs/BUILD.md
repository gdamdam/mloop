# Build

mloop is a Vite + React + TypeScript single-page app. No backend.

## Requirements
- Node.js 20+
- npm 10+

## Install
```
npm install
```

## Scripts
| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server with HMR. |
| `npm run build` | Typecheck (`tsc -b`) then produce a production bundle in `dist/`. |
| `npm run preview` | Serve the built bundle locally. |
| `npm run lint` | Run ESLint across the repo. |
| `npm run test` | Run Vitest once (CI mode). |
| `npm run deploy` | Build and publish `dist/` to the `gh-pages` branch. |

## Notes
- TypeScript strict mode is on; build fails on type errors.
- Audio worklets live under `public/` and are loaded at runtime.
- Bundle size target: < 150 KB gzipped.
