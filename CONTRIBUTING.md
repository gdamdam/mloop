# Contributing to mloop

mloop is a companion to [mpump](https://mpump.live). Features generally flow from mpump → mloop, not the other way around. Please read `docs/BUILD.md` first.

## Dev loop
```
npm install
npm run dev
```

Before pushing:
```
npm run lint
npm run test
npm run build
```

All three must pass. CI runs the same commands on every PR.

## Code style
- TypeScript strict. No `any` without a comment explaining why.
- Follow the engine / hook / component split in `src/`. Don't grow `useLoopEngine.ts` — extract new hooks instead.
- Audio effects live in `src/engine/EffectsChain.ts` and mirror mpump's `AudioPort.ts` where possible.
- Constants go in `src/config.ts`, not scattered literals.

## Commit messages
Short, imperative, lowercase subject. Example: `port mpump 3-voice chorus into effects chain`.

## PRs
- One concern per PR.
- Reference the mpump source if you're porting an effect or behavior.
- No new dependencies without discussion.

## License
GPL-3.0-or-later. By contributing you agree your code ships under the same license.
