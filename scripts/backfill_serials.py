#!/usr/bin/env python3
"""
Backfill missing S.No (serial_no) from PDF card positions.

Strategy:
  1) OCR page for EPIC positions + any serial tokens
  2) Crop left-of-EPIC serial boxes for missing ones
  3) Infer remaining from 3-column grid order (median page-start)

Updates output/voters_all.xlsx and per-part excel files.
"""

from __future__ import annotations

import re
import time
from pathlib import Path

import pandas as pd
import pymupdf as fitz
from ocrmac import ocrmac
from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "voter_pdf" / "pdfs"
VOTERS = ROOT / "output" / "voters_all.xlsx"
EXCEL_DIR = ROOT / "output" / "excel"

EPIC_RE = re.compile(r"[A-Z]{3}\d{6,7}")
SERIAL_RE = re.compile(r"^\d{1,4}$")
PART_RE = re.compile(r"(?:ENG|TEL)-(\d+)-WI", re.I)


def page_image(doc, idx) -> Image.Image:
    page = doc[idx]
    imgs = page.get_images(full=True)
    if not imgs:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    pix = fitz.Pixmap(doc, imgs[0][0])
    if pix.n - pix.alpha >= 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def ocr_tokens(img: Image.Image, max_width: int = 1400):
    work = img
    if img.width > max_width:
        r = max_width / img.width
        work = img.resize((max_width, int(img.height * r)), Image.Resampling.BILINEAR)
    path = ROOT / "tmp_ocr" / "_serial_page.jpg"
    path.parent.mkdir(parents=True, exist_ok=True)
    work.convert("RGB").save(path, quality=90)
    raw = ocrmac.OCR(str(path), language_preference=["en-US"]).recognize()
    w, h = work.size
    scale_x = img.width / w
    scale_y = img.height / h
    out = []
    for text, _c, bbox in raw or []:
        text = re.sub(r"\s+", " ", str(text)).strip()
        if not text:
            continue
        x, y, bw, bh = bbox
        cx = (x + bw / 2) * w * scale_x
        cy = (1 - y - bh / 2) * h * scale_y
        out.append((text, cx, cy))
    return out


def ocr_serial_crop(img: Image.Image, left, top, right, bot) -> str:
    left, top = max(0, int(left)), max(0, int(top))
    right, bot = min(img.width, int(right)), min(img.height, int(bot))
    if right - left < 20 or bot - top < 16:
        return ""
    crop = img.crop((left, top, right, bot)).convert("L")
    crop = ImageOps.autocontrast(crop)
    crop = crop.resize((crop.width * 4, crop.height * 4), Image.Resampling.LANCZOS)
    crop = ImageEnhance.Contrast(crop).enhance(2.2)
    path = ROOT / "tmp_ocr" / "_serial_crop.jpg"
    crop.convert("RGB").save(path, quality=98)
    raw = ocrmac.OCR(str(path), language_preference=["en-US"]).recognize()
    texts = [str(t).strip() for t, _c, _b in (raw or [])]
    for t in texts:
        if SERIAL_RE.match(t):
            return t
    digits = "".join(re.findall(r"\d+", " ".join(texts)))
    if digits and len(digits) <= 4:
        return digits
    return ""


def grid_order(cards: list[tuple[float, float, str]]) -> list[tuple[float, float, str]]:
    """cards: (y, x, epic) -> reading order."""
    if not cards:
        return []
    ordered = sorted(cards, key=lambda c: (c[0], c[1]))
    rows: list[list[tuple[float, float, str]]] = []
    for item in ordered:
        if not rows or abs(item[0] - rows[-1][0][0]) > 90:
            rows.append([item])
        else:
            rows[-1].append(item)
    flat = []
    for row in rows:
        flat.extend(sorted(row, key=lambda c: c[1]))
    return flat


def resolve_page_serials(img: Image.Image, page_start_hint: int | None) -> dict[str, str]:
    tokens = ocr_tokens(img)
    W, H = img.size
    epics = []
    for t, x, y in tokens:
        if y < 50 or y > H - 60:
            continue
        m = EPIC_RE.search(t.replace(" ", "").upper())
        if m:
            epics.append((y, x, m.group(0)))
    if len(epics) < 3:
        return {}

    # unique epics (keep first)
    seen = set()
    uniq = []
    for y, x, e in sorted(epics, key=lambda z: (z[0], z[1])):
        if e in seen:
            continue
        seen.add(e)
        uniq.append((y, x, e))

    serial_map: dict[str, str] = {}
    # token serials near epic
    serial_toks = [(t, x, y) for t, x, y in tokens if SERIAL_RE.match(t) and 50 < y < H - 60]
    for y, x, epic in uniq:
        col_w = W / 3
        col = min(2, max(0, int(x // col_w)))
        best, best_score = "", 1e9
        for t, sx, sy in serial_toks:
            if abs(sy - y) > 45:
                continue
            if sx > x + 15:
                continue
            if int(sx // col_w) != col:
                continue
            score = abs(sy - y) * 3 + max(0, x - sx) * 0.05
            if score < best_score:
                best_score, best = score, t
        if best:
            serial_map[epic] = best

    # crop OCR for missing (limit cost: all missing on page)
    for y, x, epic in uniq:
        if epic in serial_map:
            continue
        col = min(2, max(0, int(x // (W / 3))))
        left = col * (W / 3) + 12
        right = x - 18
        top, bot = y - 38, y + 38
        s = ocr_serial_crop(img, left, top, right, bot)
        if s:
            serial_map[epic] = s

    ordered = grid_order(uniq)
    obs = []
    for i, (_y, _x, epic) in enumerate(ordered):
        if epic in serial_map and serial_map[epic].isdigit():
            obs.append(int(serial_map[epic]) - i)
    if obs:
        obs.sort()
        start = obs[len(obs) // 2]
    elif page_start_hint is not None:
        start = page_start_hint
    else:
        start = 1

    for i, (_y, _x, epic) in enumerate(ordered):
        expected = str(start + i)
        if epic not in serial_map:
            serial_map[epic] = expected
        else:
            # correct obvious OCR slips vs strong grid consensus
            try:
                cur = int(serial_map[epic])
                if abs(cur - (start + i)) > 2 and len(obs) >= 2:
                    serial_map[epic] = expected
            except Exception:
                serial_map[epic] = expected
    return serial_map


def main() -> int:
    df = pd.read_excel(VOTERS, dtype=str).fillna("")
    df["epic_key"] = df["epic_no"].astype(str).str.upper().str.strip()
    df["part_no"] = df["part_no"].astype(str).str.strip()

    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    updates = 0
    t0 = time.time()

    for pdf in pdfs:
        m = PART_RE.search(pdf.name)
        part = m.group(1) if m else ""
        doc = fitz.open(pdf)
        print(f"\n=== Part {part} {pdf.name} ({doc.page_count} pages) ===")
        next_start = 1
        # skip cover/map pages 0,1 and last summary-ish page
        for idx in range(2, max(2, doc.page_count - 1)):
            img = page_image(doc, idx)
            serial_map = resolve_page_serials(img, next_start)
            if not serial_map:
                print(f"  p{idx+1}: no voter cards")
                continue
            vals = [int(v) for v in serial_map.values() if str(v).isdigit()]
            page_max = max(vals) if vals else next_start - 1
            filled = 0
            for epic, sno in serial_map.items():
                mask = (df["part_no"] == part) & (df["epic_key"] == epic)
                if not mask.any():
                    continue
                cur = df.loc[mask, "serial_no"].iloc[0]
                if str(cur).strip() != str(sno):
                    df.loc[mask, "serial_no"] = str(sno)
                    updates += 1
                    filled += 1
            next_start = page_max + 1
            print(f"  p{idx+1}: {len(serial_map)} cards, wrote/fixed {filled}, next_start={next_start}")

    df = df.drop(columns=["epic_key"])
    # Key columns first so Excel export matches the roll card order
    front = [
        "part_no",
        "constituency",
        "section_no",
        "section_name",
        "section",
        "serial_no",
        "epic_no",
        "name",
        "relation_type",
        "relation_name",
        "house_number",
        "age",
        "gender",
        "page_no",
        "source_pdf",
    ]
    rest = [c for c in df.columns if c not in front]
    df = df[[c for c in front if c in df.columns] + rest]
    # stable sort
    df["_s"] = pd.to_numeric(df["serial_no"], errors="coerce").fillna(10**9)
    df["_p"] = pd.to_numeric(df["part_no"], errors="coerce").fillna(10**9)
    df = df.sort_values(["_p", "_s", "page_no"]).drop(columns=["_s", "_p"]).reset_index(drop=True)
    df.to_excel(VOTERS, index=False)

    miss = (df["serial_no"].astype(str).str.strip() == "").mean() * 100
    print(f"\n✓ Updated {VOTERS}")
    print(f"  serial changes≈{updates}, missing now {miss:.1f}%")
    print(f"  time {time.time() - t0:.1f}s")

    # sync per-part files
    for f in EXCEL_DIR.glob("*.xlsx"):
        m = PART_RE.search(f.name)
        if not m:
            continue
        part = m.group(1)
        sub = df[df["part_no"].astype(str) == part].copy()
        if sub.empty:
            continue
        sub.to_excel(f, index=False)
    print(f"✓ Synced {EXCEL_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
