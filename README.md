English | [简体中文](README.zh-CN.md)

![Effect Atlas](assets/banner.png)

# Effect Atlas

<!-- catalog-summary:start -->
50 web motion effects in plain JavaScript, written for your AI to build into your site.
<!-- catalog-summary:end -->

[Browse the website](https://effectatlas.com) · [Effect directory](effects/README.md) · [AI integration guide](docs/ai-integration.md)

## Pick an effect and give it to your AI

1. Find an effect on the [website](https://effectatlas.com) or in the [categorized directory](effects/README.md).
2. Copy its entire folder from `effects/`. Open its `index.html` to try it locally.
3. Give the folder to your AI together with your page and the change you want.

```text
Add the effect in effects/fluid-mask-hero/ to the hero section of my site.
Read the comment at the top of effect.js and inspect index.html first.
Adapt it to my existing content and layout, and keep the copyright notice.
```

Each folder runs on its own, including from disk. No package install or build step is needed to use an effect. [Integration details and troubleshooting →](docs/ai-integration.md)

## Find your way around

| Location | Purpose |
| --- | --- |
| [effects/](effects/README.md) | Categorized directory and self-contained effect folders. |
| [catalog.json](catalog.json) | Names, descriptions, categories, entry files, mount functions and dependencies for tools and AI. |
| [docs/ai-integration.md](docs/ai-integration.md) | How to hand off an effect, mount it safely and adapt it to a framework. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to report an issue and keep an effect self-contained. |
| [scripts/catalog.mjs](scripts/catalog.mjs) | Maintainer checks and generation of the two effect directories. |

## Inside an effect

```text
effects/<slug>/
  index.html    a working example, including the mount call
  effect.js     the implementation and its AI-facing instructions
  effect.css    the effect's styles
```

Curved Gallery, Disc Carousel and Hold to Burst also include `three.min.js` and its license. Keep any bundled assets and license files with the effect. Every folder's exact files and mount function are listed in [catalog.json](catalog.json).

## For maintainers

With Node.js 22 or newer, run `node scripts/catalog.mjs --check` to validate the catalog, local documentation links and generated directories. After editing catalog metadata, run `node scripts/catalog.mjs --write` and check again. These tools are optional for people using an effect.

## License

Source-available under the [Effect Atlas License 1.0](LICENSE), adapted from the MIT License and the Commons Clause. It is not the MIT License.

Every effect is free to use, in your own projects and in client work, and you're welcome to share them. What you can't do is sell them on their own.

- Keep the copyright comment at the top of the code. Credit to Effect Atlas is appreciated but not required.
- Don't mirror effectatlas.com or this repository, in whole or in substantial part. Forking it on GitHub is fine. Publishing a fork as a website or a package counts as mirroring.
- The code is provided as is, with no warranty.
- three.js stays under its own MIT License, in `three.LICENSE.txt` next to it. Annotated Menu embeds a subset of the Caveat font (SIL Open Font License 1.1, Copyright 2014 The Caveat Project Authors), license in `effects/annotated-menu/Caveat.LICENSE.txt`.

Full text: [LICENSE](LICENSE) or [effectatlas.com/license](https://effectatlas.com/license).

## Contact

[hello@effectatlas.com](mailto:hello@effectatlas.com)

Copyright (c) 2026 PROJECT Y/O

## Friends

- [LINUX DO](https://linux.do): thanks to the community for helping me learn AI.
