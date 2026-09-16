# Third-party notices

MarkBridge is licensed under GPL-3.0-or-later. This applies to the project as a whole; third-party components retain their original copyright and license notices.

## Adapted code

`plugin/source-sync.php` adapts the legacy `codeblock_restore()` behavior from **WP Editor.md 10.2.1**, by **LuRenJiasWorld**, licensed under **GPLv3 or later**. The upstream license is preserved at `plugin/licenses/wp-editormd-GPL-3.0.txt`.

Upstream release metadata: https://github.com/LuRenJiasWorld/WP-Editor.md/blob/master/readme.txt

## Dependencies and assets

| Component                                   | License                                                | Distribution                                                              |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| markdown-it and its dependencies            | MIT / BSD / Python-2.0 as individually declared        | Bundled kernel; notices in `plugin/licenses`                              |
| MathJax 4.1.3 and New Computer Modern fonts | Apache-2.0                                             | Copied from locked npm packages during build                              |
| Prism                                       | MIT                                                    | Original vendored files and LICENSE retained                              |
| clipboard.js                                | MIT                                                    | Original vendored file header retained; full license included             |
| emojilib 2.4.0                              | MIT                                                    | Unicode shortcode data bundled in `emoji.js`; full license included       |
| jsdom and its dependencies                  | Their respective licenses                              | Private runtime installed from lockfile; not shipped in plugin ZIP        |
| WordPress / Gutenberg                       | GPL-2.0-or-later and notices in WordPress distribution | Core script snapshot rebuilt by each installer; not shipped in plugin ZIP |

The copied legacy Prism/clipboard assets keep their original bytes and notices; their provenance is the former WP Editor.md dependency bundle. New asset versions require a separate review.

The previous site-specific emoji image pack is **not distributed**. Public builds use Unicode characters rendered by the reader's fonts.

## Development tools

Prettier, its PHP plugin, js-beautify, Black and esbuild retain their upstream licenses. They are development dependencies, not relicensed as MarkBridge source. Exact JavaScript versions and integrity values are recorded in `package-lock.json`; Black is pinned in `requirements-dev.txt`.

GPLv3-or-later matches the adapted code's license. Apache-2.0 compatibility with GPLv3 is documented by the Apache Software Foundation: https://www.apache.org/licenses/GPL-compatibility . WordPress plugin licensing guidance: https://developer.wordpress.org/plugins/plugin-basics/including-a-software-license/ .
