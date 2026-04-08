# Deploy

mloop is hosted on GitHub Pages at <https://mloop.mpump.live/>.

## Release flow
1. Bump `version` in `package.json` (`-pre.N` during pre-release).
2. `npm run lint && npm run test && npm run build` — must all pass.
3. `npm run deploy` — publishes `dist/` to `gh-pages` via `gh-pages -d dist --dotfiles`.
4. Tag the commit: `git tag vX.Y.Z && git push --tags`.

## Custom domain
`CNAME` in the deployed branch points to `mloop.mpump.live`. Do not remove it from `public/` if present.

## Rollback
`git checkout gh-pages`, find the previous commit, `git push --force origin <sha>:gh-pages`. Coordinate with anyone actively deploying.
