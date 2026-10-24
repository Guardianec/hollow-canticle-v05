# Separate v0.5 repository and deployment

The user requested that v0.5 be published from a new repository to preserve the
existing alpha. The source retains its Git history, including the accepted alpha
and local visual-review checkpoints.

| Version                | Repository                                                                          | Game                                                           |
| ---------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Preserved alpha / v0.4 | [Guardianec/hollow-canticle](https://github.com/Guardianec/hollow-canticle)         | [Play alpha](https://guardianec.github.io/hollow-canticle/)    |
| v0.5 preview           | [Guardianec/hollow-canticle-v05](https://github.com/Guardianec/hollow-canticle-v05) | [Play v0.5](https://guardianec.github.io/hollow-canticle-v05/) |

The alpha's `main` commit at publication preparation was
`8c83c8c4baa3476aaa9caa7b37bb9debfe13efd4`. The v0.5 polish checkpoint is
`802701893b9012e7905f006d8ea1d80dc29daf15`. Publication does not push, rename,
archive, or change settings in the alpha repository.

The new repository publishes its `main` branch through GitHub Actions and Pages.
Both CI and deployment run lint/TypeScript, asset validation, all tests and the
production build. The Pages artifact contains only `dist/`; Blender tools, source
bakes, reference sheets and review captures are not part of the live site.
Vite uses relative URLs, including the asset loader's `BASE_URL`, so GLBs, textures,
fonts and chunks work beneath the new repository path.

The local `origin` remains the alpha repository; the new publishing remote is `v05`.
The local alpha `main` is also preserved. To publish future approved v0.5 changes
from the development branch, use the explicit destination:

```sh
git push v05 HEAD:main
```

The preview retains the [documented polish-review limits](POLISH-v0.5.md).
Historical review documents describe their local checkpoints; this publication
document records the later authorization to publish and deploy.

## Independent browser progress

The two Pages paths share a browser origin. The preview therefore writes progress
to `hollow-canticle:v05` and run history to `hollow-canticle:local-runs:v05`.
On first use it copies legacy progress once, preserving existing unlocks and
settings, then keeps subsequent play separate. The alpha's `hollow-canticle:v1`
and `hollow-canticle:local-runs:v1` values are never written or removed by v0.5.
Resetting the preview persists an empty preview save, so reloading does not
reimport alpha progress. Run history begins independently in the preview.

Publication validation includes 105 tests in nine files, with regression coverage
for migration, independent progress/history, reset persistence and blocked storage.
