#!/usr/bin/env bash
# Unzip (if needed) → OCR extract all TEL PDFs → cover meta → serial backfill → dimension map → web data
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="$ROOT/.venv/bin/python"
LOG="$ROOT/output/full_extract_log.txt"
mkdir -p "$ROOT/output" "$ROOT/voter_pdf/pdfs" "$ROOT/web/public/data"

{
  echo "==== $(date) pipeline start ===="
  echo "PDFs: $(ls "$ROOT/voter_pdf/pdfs"/*.pdf 2>/dev/null | wc -l | tr -d ' ')"

  echo "---- extract_voters (hybrid Vision+EasyOCR crops / TEL) ----"
  "$PY" scripts/extract_voters.py \
    --pdf-dir "$ROOT/voter_pdf/pdfs" \
    --engine hybrid \
    --workers 1 \
    --max-width 1200 \
    --skip-existing \
    --combined "$ROOT/output/voters_all.xlsx"

  echo "---- extract_cover_meta ----"
  "$PY" scripts/extract_cover_meta.py --pdf-dir "$ROOT/voter_pdf/pdfs" --merge-voters

  echo "---- backfill_serials ----"
  "$PY" scripts/backfill_serials.py || true

  echo "---- dimension_map ----"
  "$PY" scripts/dimension_map.py \
    --in "$ROOT/output/voters_all.xlsx" \
    --out "$ROOT/output/voters_dimensional.xlsx" \
    --map-json "$ROOT/output/dimension_keys.json"

  echo "---- copy to web ----"
  cp -f "$ROOT/output/voters_all.xlsx" "$ROOT/web/public/data/voters_all.xlsx"
  cp -f "$ROOT/output/voters_dimensional.xlsx" "$ROOT/web/public/data/voters_dimensional.xlsx" 2>/dev/null || true

  echo "==== $(date) pipeline done ===="
} 2>&1 | tee -a "$LOG"
