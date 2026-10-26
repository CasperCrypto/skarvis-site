# SKARVIS public site

Static site, Polish first (`index.html`), English second (`en/index.html`).
No build step and no framework: plain HTML, one CSS file, ES modules.

| Path | What it is |
|---|---|
| `index.html`, `en/index.html` | The landing page in Polish and English |
| `polityka-prywatnosci.html`, `en/privacy.html` | RODO/GDPR notice for the pilot form |
| `assets/css/site.css` | All styles. Design tokens at the top |
| `assets/js/main.js` | Header, menu, reveals, lazy 3D, pilot form |
| `assets/js/hero.js` | Hero scene: point-cloud terrain, site, drone track, HUD |
| `assets/js/node3d.js` | Interactive 3D HERMES node (ID and ID + DF) |
| `assets/js/config.js` | Supabase URL + publishable key, public contact email |
| `assets/js/strings.js` | Text written by the scripts, PL and EN |
| `../supabase/001_pilot_signups.sql` | The table the form writes to |

## Run it locally

ES modules do not load from `file://`, so the folder has to be served.
On Windows, double-click `web/preview-site.bat`: it serves the site on
this computer only and opens http://localhost:8000. Or from a terminal:

```bash
python -m http.server 8765 --directory web/site
```

Then open http://localhost:8765. Nothing is public: the server only
listens on this machine. (The pilot form still writes to the real
Supabase table, so delete test rows there.)

## Pilot form

Submissions go to the `pilot_signups` table in the Supabase project
**skarvis** (EU, Frankfurt). The site holds only the publishable key, which
can insert rows and cannot read them. Read and update submissions in the
Supabase dashboard (Table editor, `pilot_signups`; set `status` as you work
through them).

Free Supabase projects pause after a week without activity. Open the
dashboard now and then, or move to a paid plan before launch.

## Before it goes public

- [ ] Fill the data controller and contact email in both privacy pages
      (marked `[UZUPEŁNIĆ]` / `[TO FILL IN]`).
- [ ] Confirm the 12-month retention period in the privacy pages.
- [ ] Set `contactEmail` in `assets/js/config.js` once a domain mailbox exists.
- [ ] Optional for RODO: self-host the fonts, icons and Three.js instead of
      loading them from Google Fonts, unpkg and jsDelivr.
- [ ] Choose hosting. GitHub Pages works for a static site, but on a private
      repository it needs a paid GitHub plan.

## Honesty rules (from `CLAUDE.md`)

- Every spec on the page is labelled as a target until `hardware/results.md`
  has a measured number. When a test passes, change its tag from "Cel" /
  "Target" to the measured value.
- Pilot list and non-binding letters of intent only. No prices.
- The hero scene and its HUD are an illustration and say so on screen.
- CASPER (interceptor research) is not on the public site.

## Design

Light tactical HUD style (point-cloud terrain, mono labels, "+" corner marks,
hatched separators) on the SKARVIS mark. Fonts: Inter Tight and IBM Plex Mono.
One accent, `--accent: #ff5a1f`. The original brand board amber (`#E9A23B`)
is one token change away; see the comment at the top of `site.css`.
