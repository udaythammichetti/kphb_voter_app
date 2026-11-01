# kphb_voter_app

Kukatpally **AC 46** draft electoral roll dashboard (SIR 2026) — React + Vite.

- EN | తెలుగు UI (labels + name transliteration)
- Voters / families / parts / consolidated views
- Print + CSV export (follows active language)
- Deployable on **Render** as a static site (`render.yaml`)

Repo: [udaythammichetti/kphb_voter_app](https://github.com/udaythammichetti/kphb_voter_app)

---

## Quick start (local)

```bash
cd web
npm ci
npm run dev
```

App: http://localhost:5173  
Data loaded from `web/public/data/voters_all.xlsx` (all **10** parts combined).

```bash
npm run build    # → web/dist
npm run preview  # smoke-test production build
```

---

## The 10 part Excel files

English extracts for parts **1–10** (used to build the combined roll):

| Part | File | Electors |
| ---: | --- | ---: |
| 1 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-1-WI.xlsx` | 855 |
| 2 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-2-WI.xlsx` | 769 |
| 3 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-3-WI.xlsx` | 811 |
| 4 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-4-WI.xlsx` | 829 |
| 5 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-5-WI.xlsx` | 820 |
| 6 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-6-WI.xlsx` | 825 |
| 7 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-7-WI.xlsx` | 902 |
| 8 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-8-WI.xlsx` | 647 |
| 9 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-9-WI.xlsx` | 646 |
| 10 | `2026-EROLLGEN-S29-46-SIR-DraftRoll-Revision1-ENG-10-WI.xlsx` | 786 |
| **All** | `voters_all.xlsx` | **7,890** |

Paths in repo:

- Per-part: [`web/public/data/excel/`](web/public/data/excel/)
- Combined: [`web/public/data/voters_all.xlsx`](web/public/data/voters_all.xlsx)
- Parts meta: [`web/public/data/parts_meta.xlsx`](web/public/data/parts_meta.xlsx)

---

## Deploy on Render

**Use a Static Site — not a Python Web Service.**  
If the build runs `pip install -r requirements.txt`, the service type/build command is wrong.

### Option A — Blueprint (recommended)

1. **New** → **Blueprint** → repo `udaythammichetti/kphb_voter_app` → branch `main`.
2. Apply `render.yaml` → service **`kphb-voter-app`**.

### Option B — Manual Static Site

1. **New** → **Static Site** (not Web Service).
2. Settings:

| Field | Value |
| --- | --- |
| Branch | `main` |
| Root Directory | `web` |
| Build Command | `npm ci --include=dev && npm run build` |
| Publish Directory | `dist` |

3. **Redirects/Rewrites** → add rewrite: Source `/*` → Destination `/index.html` → **Rewrite**.

### Fix a failed Python build

1. Open the service → **Settings**.
2. If it’s a Web Service with Python: delete it and create a **Static Site** (Option B).
3. Or change **Build Command** to:  
   `npm ci --include=dev && npm run build`  
   and set **Publish Directory** to `dist` (with Root Directory `web`).
4. **Manual Deploy** → clear build cache / deploy latest.

---

## App features (recheck)

| Area | Status |
| --- | --- |
| Dashboard KPIs, age/household mix, station chart | OK |
| Voters table + filters + detail modal | OK |
| Families / parts / section / consolidated | OK |
| EN \| తెలుగు toggle (labels + names) | OK |
| Print + Export CSV on Voters (locale-aware) | OK |
| Data: 10 ENG parts → 7,890 electors | OK |
| Render static Blueprint + SPA rewrite | OK |

**Note:** Telugu name export uses Google Input Tools (cached). Large uncached exports cap live fetches so the download stays responsive.

---

## Layout

```
web/                 Vite React app (deploy root)
  public/data/       voters_all.xlsx + excel/ (10 parts)
  src/               UI, locale, export/print
scripts/             PDF → Excel extract pipeline
render.yaml          Render static site Blueprint
scripts/requirements.txt  Python deps for extract scripts only
```

PDFs (`voter_pdf/`), venv, and OCR scratch are gitignored.

---

## Extract pipeline (optional)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/requirements.txt
# place PDFs under voter_pdf/pdfs/
./scripts/run_full_pipeline.sh
```

Then refresh `web/public/data/voters_all.xlsx` (pipeline copies it).
