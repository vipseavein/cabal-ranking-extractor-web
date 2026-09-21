# CABAL Ranking Extractor Web v1.0

A separate, static GitHub Pages version of CABAL Ranking Extractor. It does **not** connect to the existing CABAL Ranking website, Admin Portal, Cloudflare Pages project, or ranking repository.

## Architecture

- 100% browser-side static site.
- OCR uses Tesseract.js in the browser.
- Excel import/export uses SheetJS in the browser.
- Multi-class Legend Arena ZIP export uses JSZip in the browser.
- Screenshots are not uploaded by this app. Image processing and OCR are performed in the user's browser.
- No Python, EXE, database, API, server, Cloudflare Worker, or backend is required.

The first OCR use requires internet access so the browser can load the Tesseract.js OCR runtime/language data. The local application shell is cached by the service worker.

## Tabs

- Guild Weekly Ranking
- Legend Arena
- World/Dungeon
- Achievement Rank
- Guild Ranking
- Mission Festival
- GMF Contribution Ranking
- Guild Season

## Image input

Every screenshot tab supports:

- Add Images
- drag and drop
- Paste Image button
- Ctrl+V
- overlapping screenshots and automatic rank merge

### Legend Arena

The page includes 9 class buttons:

`WA / BL / WI / FA / FS / FB / GL / DM / FG`

Copy a screenshot to the clipboard and click the corresponding class icon to paste and tag the screenshot. Normal Add Images / Ctrl+V input can also auto-detect the class name from visible text.

Both full gameplay screenshots and tight table crops are supported through OCR header anchoring rather than fixed full-screen coordinates.

## Achievement Class

Achievement class icons are compared in-browser against `assets/class_icons_reference.png` using normalized grayscale template correlation. Results remain editable before Excel export.

## Guild Season

Upload weekly Excel files whose filenames end in `_W1`, `_W2`, `_W3`, etc. The browser reads `Character` and `Treasure Score`, merges all weeks, fills missing weeks with zero, sums Total Score and recalculates Ranking.

## GitHub Pages deployment

Recommended repository name:

`cabal-ranking-extractor-web`

1. Create a **new public GitHub repository** with that name.
2. Upload the contents of this folder to the root of the new repository.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`, then Save.
6. The expected URL for the current GitHub account is:

   `https://vipseavein.github.io/cabal-ranking-extractor-web/`

This repository is independent from `vipseavein/cabal-ranking`.

## Browser recommendation

Use a current Chrome or Microsoft Edge build. GitHub Pages serves over HTTPS, which is important for browser clipboard permissions.

## Notes

Browser OCR and desktop Tesseract/OpenCV do not have identical recognition behavior. The web port uses the same CABAL-specific concepts—header anchoring, column splitting, rank deduplication, class tagging and editable preview—but it is an independent browser implementation. Always review the preview before exporting critical data.


GitHub Pages deployment: this repository is fully static. OCR runs in the browser using Tesseract.js loaded from CDN; Excel export uses SheetJS; no backend is required.