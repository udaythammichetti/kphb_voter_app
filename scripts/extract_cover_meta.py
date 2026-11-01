#!/usr/bin/env python3
"""
Extract key columns from electoral-roll PDF page 1 (cover) and merge into Excel.

Fields (from cover page):
  assembly_constituency, parliamentary_constituency, part_no,
  year_of_revision, qualifying_date, type_of_revision, date_of_publication,
  roll_identification, sections_in_part, main_town_village, post_office,
  police_station, tehsil_mandal, subdivision, district, pin_code,
  polling_station_name, polling_station_address, polling_station_type,
  net_male, net_female, net_total

Usage:
  .venv/bin/python scripts/extract_cover_meta.py
  .venv/bin/python scripts/extract_cover_meta.py --merge-voters
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import pandas as pd
import pymupdf as fitz
from ocrmac import ocrmac
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "voter_pdf" / "pdfs"
OUT_META = ROOT / "output" / "parts_meta.xlsx"
VOTERS_ALL = ROOT / "output" / "voters_all.xlsx"
EXCEL_DIR = ROOT / "output" / "excel"

PART_FROM_FILE = re.compile(r"(?:ENG|TEL)-(\d+)-WI", re.I)
DATE_RE = re.compile(r"\b\d{2}-\d{2}-\d{4}\b")
PIN_RE = re.compile(r"\b\d{6}\b")


def page1_tokens(pdf: Path, max_width: int = 1600) -> list[tuple[str, float, float]]:
    doc = fitz.open(pdf)
    page = doc[0]
    images = page.get_images(full=True)
    if images:
        pix = fitz.Pixmap(doc, images[0][0])
        if pix.n - pix.alpha >= 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    else:
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    if img.width > max_width:
        r = max_width / float(img.width)
        img = img.resize((max_width, int(img.height * r)), Image.Resampling.BILINEAR)

    tmp = ROOT / "tmp_ocr" / f"cover_{pdf.stem}.jpg"
    tmp.parent.mkdir(parents=True, exist_ok=True)
    img.save(tmp, quality=92)
    raw = ocrmac.OCR(str(tmp), language_preference=["en-US"]).recognize()
    w, h = img.size
    out = []
    for text, _c, bbox in raw or []:
        text = re.sub(r"\s+", " ", str(text)).strip()
        if not text:
            continue
        x, y, bw, bh = bbox
        cx = (x + bw / 2) * w
        cy = (1 - y - bh / 2) * h
        out.append((text, cx, cy))
    return out


def clean_geo(val: str) -> str:
    v = val.strip(" :")
    v = v.replace("MALKA/GIRI", "MALKAJGIRI").replace("KUKATPALLI", "KUKATPALLY")
    v = re.sub(r"[^\w\s,./-]", "", v)
    return v.strip(" :")


def value_after_label(tokens: list[tuple[str, float, float]], label_pat: str, max_dy: float = 28) -> str:
    lab = re.compile(label_pat, re.I)
    cands = [(t, x, y) for t, x, y in tokens if lab.search(t)]
    if not cands:
        return ""
    # prefer shortest/leftmost label match
    label_tok = sorted(cands, key=lambda z: (z[2], z[1]))[0]
    ly = label_tok[2]
    lx = label_tok[1]
    # same-line values to the right (often start with ':')
    rights = [
        (t, x, y)
        for t, x, y in tokens
        if abs(y - ly) <= max_dy and x > lx + 40
    ]
    rights.sort(key=lambda z: z[1])
    for t, _x, _y in rights:
        if re.fullmatch(r"[:\-]+", t):
            continue
        return clean_geo(t)
    # inline "Label: value"
    m = re.search(rf"{label_pat}\s*:?\s*(.+)$", label_tok[0], re.I)
    if m and m.group(1).strip():
        return clean_geo(m.group(1))
    return ""


def nearest_value_beside(
    tokens: list[tuple[str, float, float]],
    label_pat: str,
    *,
    prefer_date: bool = False,
    prefer_year: bool = False,
    prefer_text: bool = False,
) -> str:
    """Pick value near a label (same row to the right, or slightly below)."""
    lab = re.compile(label_pat, re.I)
    labels = [(t, x, y) for t, x, y in tokens if lab.search(t)]
    if not labels:
        return ""
    lt, lx, ly = sorted(labels, key=lambda z: z[2])[0]

    # inline "Label: value"
    m = re.search(rf"{label_pat}\s*:?\s*(.+)$", lt, re.I)
    if m and m.group(1).strip() and not lab.fullmatch(m.group(1).strip()):
        val = m.group(1).strip()
        if prefer_date and DATE_RE.search(val):
            return DATE_RE.search(val).group(0)
        if prefer_year and re.search(r"\b20\d{2}\b", val):
            return re.search(r"\b20\d{2}\b", val).group(0)
        if prefer_text or (not prefer_date and not prefer_year):
            return clean_geo(val)

    # same-row / nearby values (allow slight y jitter above/below)
    pool = [
        (t, x, y)
        for t, x, y in tokens
        if abs(y - ly) <= 28 and x >= lx - 10 and not lab.search(t)
    ]
    pool.sort(key=lambda z: (abs(z[2] - ly), z[1]))

    for t, _x, _y in pool:
        if prefer_date:
            m = DATE_RE.search(t)
            if m:
                return m.group(0)
            continue
        if prefer_year:
            m = re.search(r"\b20\d{2}\b", t)
            if m and not DATE_RE.search(t):
                return m.group(0)
            continue
        if prefer_text:
            # skip pure years/dates when looking for revision type text
            if DATE_RE.fullmatch(t) or re.fullmatch(r"20\d{2}", t):
                continue
            if t.lower().startswith(("year", "qualifying", "type", "date", "roll", "draft")):
                continue
            if len(t) >= 6:
                return clean_geo(t)
            continue
        if t.lower().startswith(("year", "qualifying", "type", "date", "roll")):
            continue
        return clean_geo(t)
    return ""


# backward-compatible alias used elsewhere
def nearest_value_below_or_right(
    tokens: list[tuple[str, float, float]], label_pat: str, prefer_date=False, prefer_year=False
) -> str:
    return nearest_value_beside(
        tokens, label_pat, prefer_date=prefer_date, prefer_year=prefer_year
    )


def extract_sections(tokens: list[tuple[str, float, float]]) -> str:
    # lines like "1-Dayarguda ..." under "No. and name of sections"
    sec_lines = []
    for t, x, y in tokens:
        if re.match(r"^\d+\s*[-–].+", t) and y > 700 and y < 1200 and x < 600:
            sec_lines.append((y, t))
    sec_lines.sort()
    # unique preserve order
    out = []
    for _, t in sec_lines:
        if t not in out:
            out.append(t)
    return " | ".join(out)


def extract_cover(pdf: Path) -> dict:
    tokens = page1_tokens(pdf)
    texts = [t for t, _, _ in tokens]

    part = ""
    for t, _, _ in tokens:
        m = re.search(r"Part\s*No\.?\s*:?\s*(\d+)", t, re.I)
        if m:
            part = m.group(1)
            break
    if not part:
        m = PART_FROM_FILE.search(pdf.name)
        part = m.group(1) if m else ""

    assembly = ""
    parl = ""
    for t in texts:
        m = re.search(r"Assembly Constituency:\s*(.+)$", t, re.I)
        if m:
            assembly = clean_geo(m.group(1))
        m = re.search(r"Parliamentary Constituency:\s*(.+)$", t, re.I)
        if m:
            parl = clean_geo(m.group(1)).replace("MALKA/GIRI", "MALKAJGIRI")

    roll_title = next((t for t in texts if "ELECTORAL ROLL" in t.upper()), "")

    # polling station name: line after "No. and Name of Polling Station"
    ps_name = ""
    ps_addr = ""
    for i, (t, x, y) in enumerate(sorted(tokens, key=lambda z: z[2])):
        if re.search(r"No\.?\s*and\s*Name\s*of\s*Polling\s*Station", t, re.I):
            # next content-ish lines below
            below = [
                (tt, xx, yy)
                for tt, xx, yy in tokens
                if 5 < (yy - y) < 90 and xx < 900 and not re.search(r"Type of Polling|Address of", tt, re.I)
            ]
            below.sort(key=lambda z: z[2])
            if below:
                ps_name = clean_geo(below[0][0])
        if re.search(r"Address of Polling Station", t, re.I):
            below = [
                (tt, xx, yy)
                for tt, xx, yy in tokens
                if 5 < (yy - y) < 80 and xx < 900 and not re.search(r"NUMBER OF ELECTORS", tt, re.I)
            ]
            below.sort(key=lambda z: z[2])
            if below:
                ps_addr = clean_geo(below[0][0])

    # net electors: look near Male/Female/Total labels at bottom table
    net_male = net_female = net_total = ""
    # find numeric row under Male/Female/Total
    male_x = female_x = total_x = None
    male_y = None
    for t, x, y in tokens:
        if re.fullmatch(r"Male", t, re.I):
            male_x, male_y = x, y
        elif re.fullmatch(r"Female", t, re.I):
            female_x = x
        elif re.fullmatch(r"Total", t, re.I) and y > 1500:
            total_x = x
    if male_x and male_y:
        nums = [(t, x, y) for t, x, y in tokens if re.fullmatch(r"\d{2,5}", t) and y > male_y]
        def nearest(tx):
            if tx is None:
                return ""
            best = min(nums, key=lambda z: abs(z[1] - tx) + abs(z[2] - (male_y + 60)) * 0.2, default=None)
            return best[0] if best else ""
        net_male = nearest(male_x)
        net_female = nearest(female_x)
        net_total = nearest(total_x)

    pin = value_after_label(tokens, r"^Pin\s*code$|^Pin code$")
    if pin:
        m = PIN_RE.search(pin)
        pin = m.group(0) if m else re.sub(r"\D", "", pin)[:6]
    if not pin:
        # fallback any 6-digit near pin label
        for t, x, y in tokens:
            if re.search(r"Pin\s*code", t, re.I):
                for tt, xx, yy in tokens:
                    if abs(yy - y) < 30 and xx > x:
                        m = PIN_RE.search(tt)
                        if m:
                            pin = m.group(0)
                            break

    year = nearest_value_beside(tokens, r"Year of Revision", prefer_year=True) or "2026"
    qualifying = nearest_value_beside(tokens, r"Qualifying Date", prefer_date=True)
    publication = nearest_value_beside(tokens, r"Date of Publication", prefer_date=True)
    rev_type = nearest_value_beside(tokens, r"Type of revision", prefer_text=True)

    # Fallbacks from known SIR draft roll footer/header when OCR misses alignment
    if not qualifying:
        dates = [DATE_RE.search(t).group(0) for t, _, _ in tokens if DATE_RE.search(t)]
        qualifying = next((d for d in dates if d.startswith("01-")), dates[0] if dates else "01-10-2026")
    if not publication:
        dates = [DATE_RE.search(t).group(0) for t, _, _ in tokens if DATE_RE.search(t)]
        publication = next((d for d in dates if d.startswith("17-")), dates[-1] if dates else "17-08-2026")
    if not rev_type or rev_type in {"2026", year}:
        rev_type = next(
            (t for t in texts if re.search(r"Special Intensive Revision", t, re.I) and not DATE_RE.search(t)),
            "Special Intensive Revision",
        )
        rev_type = re.sub(r",?\s*2026$", "", rev_type).strip() or "Special Intensive Revision"

    meta = {
        "source_pdf": pdf.name,
        "part_no": part,
        "roll_title": roll_title,
        "assembly_constituency": assembly or "46 - KUKATPALLY (GENERAL)",
        "parliamentary_constituency": parl or "7 - MALKAJGIRI (GEN)",
        "year_of_revision": year,
        "qualifying_date": qualifying,
        "type_of_revision": rev_type,
        "date_of_publication": publication,
        "roll_identification": next(
            (t for t in texts if re.search(r"Draft Electoral Roll", t, re.I)),
            "Draft Electoral Roll of Special Intensive Revision, 2026",
        ),
        "sections_in_part": extract_sections(tokens),
        "main_town_village": value_after_label(tokens, r"Main Town or Village") or "GHMC, KUKATPALLY",
        "post_office": value_after_label(tokens, r"Post Office") or "KUKATPALLY",
        "police_station": value_after_label(tokens, r"Police Station") or "KUKATPALLY",
        "tehsil_mandal": value_after_label(tokens, r"Tehsil/?Mandal") or "KUKATPALLY",
        "subdivision": value_after_label(tokens, r"^Subdivision$|Subdivision") or "MALKAJGIRI",
        "district": value_after_label(tokens, r"^District$|District") or "MEDCHAL MALKAJGIRI",
        "pin_code": pin or "500072",
        "polling_station_name": ps_name,
        "polling_station_address": ps_addr,
        "polling_station_type": value_after_label(tokens, r"Type of Polling Station") or "GENERAL",
        "net_male": net_male,
        "net_female": net_female,
        "net_total": net_total,
    }
    return meta


META_COLS = [
    "part_no",
    "assembly_constituency",
    "parliamentary_constituency",
    "year_of_revision",
    "qualifying_date",
    "type_of_revision",
    "date_of_publication",
    "roll_identification",
    "sections_in_part",
    "main_town_village",
    "post_office",
    "police_station",
    "tehsil_mandal",
    "subdivision",
    "district",
    "pin_code",
    "polling_station_name",
    "polling_station_address",
    "polling_station_type",
    "net_male",
    "net_female",
    "net_total",
    "roll_title",
    "source_pdf",
]


def merge_into_voters(meta_df: pd.DataFrame) -> None:
    if not VOTERS_ALL.exists():
        print("No voters_all.xlsx to merge")
        return
    voters = pd.read_excel(VOTERS_ALL, dtype=str).fillna("")
    # drop previous meta cols if re-run
    for c in META_COLS:
        if c in voters.columns and c not in {"part_no", "source_pdf"}:
            voters = voters.drop(columns=[c])
    meta = meta_df.copy()
    meta["part_no"] = meta["part_no"].astype(str)
    voters["part_no"] = voters["part_no"].astype(str)
    merge_cols = [c for c in META_COLS if c not in {"part_no", "source_pdf"}]
    merged = voters.merge(meta[["part_no"] + merge_cols], on="part_no", how="left")
    # Key roll columns first (S.No / EPIC / name…), then cover meta
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
        "assembly_constituency",
        "parliamentary_constituency",
        "district",
        "subdivision",
        "tehsil_mandal",
        "main_town_village",
        "post_office",
        "police_station",
        "pin_code",
        "polling_station_name",
        "polling_station_address",
        "polling_station_type",
        "year_of_revision",
        "qualifying_date",
        "type_of_revision",
        "date_of_publication",
        "roll_identification",
        "sections_in_part",
        "net_male",
        "net_female",
        "net_total",
    ]
    rest = [c for c in merged.columns if c not in front]
    ordered = [c for c in front if c in merged.columns] + rest
    merged = merged[ordered]
    merged.to_excel(VOTERS_ALL, index=False)
    print(f"✓ Merged cover meta into {VOTERS_ALL} ({len(merged)} rows)")

    # also merge into per-part excels
    if EXCEL_DIR.exists():
        for f in EXCEL_DIR.glob("*.xlsx"):
            df = pd.read_excel(f, dtype=str).fillna("")
            if "part_no" not in df.columns:
                continue
            for c in META_COLS:
                if c in df.columns and c not in {"part_no", "source_pdf"}:
                    df = df.drop(columns=[c])
            df["part_no"] = df["part_no"].astype(str)
            m = df.merge(meta[["part_no"] + merge_cols], on="part_no", how="left")
            m = m[[c for c in ordered if c in m.columns] + [c for c in m.columns if c not in ordered]]
            m.to_excel(f, index=False)
        print(f"✓ Updated per-part Excels in {EXCEL_DIR}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", type=Path, default=PDF_DIR)
    ap.add_argument("--out", type=Path, default=OUT_META)
    ap.add_argument("--merge-voters", action="store_true", default=True)
    ap.add_argument("--no-merge", action="store_true")
    args = ap.parse_args()

    pdfs = sorted(args.pdf_dir.glob("*.pdf"))
    rows = []
    for pdf in pdfs:
        print(f"Cover OCR: {pdf.name}")
        meta = extract_cover(pdf)
        print(
            f"  Part {meta['part_no']} | {meta['district']} | "
            f"PS: {meta['polling_station_name'][:40]} | pin {meta['pin_code']}"
        )
        rows.append(meta)

    df = pd.DataFrame(rows)
    for c in META_COLS:
        if c not in df.columns:
            df[c] = ""
    df = df[META_COLS].sort_values(by="part_no", key=lambda s: pd.to_numeric(s, errors="coerce"))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(args.out, index=False)
    print(f"\n✓ Wrote {len(df)} parts → {args.out}")

    if not args.no_merge:
        merge_into_voters(df)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
