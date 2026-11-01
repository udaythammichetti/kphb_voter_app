#!/usr/bin/env python3
"""
Electoral-roll PDF → Excel extractor.

Engines
-------
  vision   — fast (ENG rolls, macOS Vision)
  hybrid   — TEL default: Vision for EPICs/ages + EasyOCR on name crops (~4× vs full EasyOCR)
  easyocr  — full-page Telugu OCR (slower, highest name coverage)
  rapid    — ONNX RapidOCR fallback

Preferred entrypoint
--------------------
  .venv/bin/python scripts/extract.py run --skip-existing
  .venv/bin/python scripts/extract.py pipeline --skip-existing

Output
------
  output/excel/<pdf-stem>.xlsx
  output/voters_all.xlsx
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import tempfile
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd
import pymupdf as fitz
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PDF_DIR = ROOT / "voter_pdf" / "pdfs"
DEFAULT_OUT_DIR = ROOT / "output" / "excel"
DEFAULT_COMBINED = ROOT / "output" / "voters_all.xlsx"

EPIC_RE = re.compile(r"\b([A-Z]{3}\d{6,7})\b")
SERIAL_RE = re.compile(r"^\d{1,4}$")
AGE_GENDER_RE = re.compile(
    r"Age\s*:?\s*(\d{1,3})\s*Gender\s*:?\s*(Male|Female|Other)", re.I
)
AGE_ONLY_RE = re.compile(r"Age\s*:?\s*(\d{1,3})\b", re.I)
GENDER_ONLY_RE = re.compile(r"Gender\s*:?\s*(Male|Female|Other)\b", re.I)
NAME_RE = re.compile(r"^Name\s*:?\s*(.+)$", re.I)
RELATION_RE = re.compile(
    r"^(Father'?s|Husband'?s|Mother'?s|Others?)\s*Name\s*:?\s*(.+)$", re.I
)
HOUSE_RE = re.compile(r"^House\s*Number\s*:?\s*(.+)$", re.I)
PART_RE = re.compile(r"Part\s*No\.?\s*:?\s*(\d+)", re.I)
CONST_RE = re.compile(
    r"Assembly\s*Constituency\s*No\s*and\s*Name\s*:?\s*(.+)$", re.I
)
SECTION_RE = re.compile(r"Section\s*No\s*and\s*Name\s*:?\s*(.+)$", re.I)
SECTION_NO_RE = re.compile(r"^(\d+)\s*[-–]\s*(.+)$")
PART_FROM_FILE_RE = re.compile(r"(?:ENG|TEL)-(\d+)-WI", re.I)

# Telugu roll labels (OCR often mutates పేరు → పరు/పీరు/సీరు)
TEL_PERU = r"ప[ేెీస]రు"  # పేరు / పరు / పీరు / సీరు
TEL_NAME_RE = re.compile(rf"ఓటరు\s*{TEL_PERU}\s*:?\s*(.*)$")
TEL_FATHER_RE = re.compile(rf"తండ్రి\s*{TEL_PERU}\s*:?\s*(.*)$")
TEL_HUSBAND_RE = re.compile(rf"భర్త\s*{TEL_PERU}\s*:?\s*(.*)$")
TEL_MOTHER_RE = re.compile(rf"తల్లి\s*{TEL_PERU}\s*:?\s*(.*)$")
TEL_HOUSE_RE = re.compile(r"ఇంటి\s*సంఖ్య\s*:?\s*(.*)$")
TEL_AGE_RE = re.compile(r"వయస[్]?సు\s*:?\s*(\d{1,3})")
TEL_AGE_GENDER_RE = re.compile(r"(\d{1,3})\s*లింగ")
TEL_PART_RE = re.compile(r"భాగం\s*సంఖ్య\s*:?\s*(\d+)")
TEL_SECTION_NUM_RE = re.compile(r"^(\d+)\s*[-–]\s*(.+)$")
TEL_SCRIPT_RE = re.compile(r"[\u0C00-\u0C7F]")

_ENGINE_NAME = "vision"
_RAPID = None
_EASYOCR = None


@dataclass
class Voter:
    part_no: str = ""
    constituency: str = ""
    section_no: str = ""
    section_name: str = ""
    section: str = ""
    serial_no: str = ""
    epic_no: str = ""
    name: str = ""
    relation_type: str = ""
    relation_name: str = ""
    house_number: str = ""
    age: str = ""
    gender: str = ""
    source_pdf: str = ""
    page_no: int = 0


COLS = [
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
    "source_pdf",
    "page_no",
]


def normalize(text: str) -> str:
    t = re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()
    t = re.sub(r"(?i)^name\s*:", "Name:", t)
    t = re.sub(r"(?i)^fathers?\s*name\s*:", "Fathers Name:", t)
    t = re.sub(r"(?i)^husbands?\s*name\s*:", "Husbands Name:", t)
    t = re.sub(r"(?i)^mothers?\s*name\s*:", "Mothers Name:", t)
    t = re.sub(r"(?i)^house\s*number\s*:", "House Number:", t)
    t = re.sub(r"(?i)\bage\s*:", "Age:", t)
    t = re.sub(r"(?i)\bgender\s*:", "Gender:", t)
    return t.strip()


def is_noise(text: str) -> bool:
    """Drop photo placeholders / footers only — keep headers for mapping."""
    t = text.lower().strip()
    if t in {"photo", "available", "photo available"}:
        return True
    return t.startswith(("age as", "date of", "total pages", "photo"))


def is_header_line(text: str) -> bool:
    t = text.lower()
    return (
        "constituency" in t
        or t.startswith("part no")
        or t.startswith("section no")
        or t.startswith("section ")
    )


def page_image(doc: fitz.Document, page_index: int, max_width: int) -> Image.Image:
    page = doc[page_index]
    images = page.get_images(full=True)
    if images:
        pix = fitz.Pixmap(doc, images[0][0])
        if pix.n - pix.alpha >= 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    else:
        pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    if img.width > max_width:
        ratio = max_width / float(img.width)
        img = img.resize((max_width, int(img.height * ratio)), Image.Resampling.BILINEAR)
    return img.convert("RGB")


def ocr_vision(img: Image.Image) -> list[tuple[str, float, float]]:
    from ocrmac import ocrmac

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        path = tmp.name
        img.save(path, format="JPEG", quality=92)
    try:
        raw = ocrmac.OCR(path, language_preference=["en-US"]).recognize()
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass

    w, h = img.size
    tokens = []
    for text, _conf, bbox in raw or []:
        text = normalize(str(text))
        if not text or is_noise(text):
            continue
        x, y, bw, bh = bbox
        cx = (x + bw / 2.0) * w
        cy = (1.0 - y - bh / 2.0) * h
        tokens.append((text, cx, cy))
    return tokens


def ocr_rapid(img: Image.Image) -> list[tuple[str, float, float]]:
    global _RAPID
    if _RAPID is None:
        from rapidocr_onnxruntime import RapidOCR

        _RAPID = RapidOCR()
    result, _ = _RAPID(img.convert("L"))
    tokens = []
    for item in result or []:
        box, text, _score = item
        text = normalize(str(text))
        if not text or is_noise(text):
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        tokens.append((text, sum(xs) / 4, sum(ys) / 4))
    return tokens


def ocr_easy(img: Image.Image) -> list[tuple[str, float, float]]:
    """Telugu + English OCR via EasyOCR (needed for TEL rolls)."""
    global _EASYOCR
    import numpy as np

    if _EASYOCR is None:
        import easyocr

        _EASYOCR = easyocr.Reader(["te", "en"], gpu=False, verbose=False)
    result = _EASYOCR.readtext(np.array(img.convert("RGB")), detail=1, paragraph=False)
    tokens = []
    for item in result or []:
        box, text, _score = item
        text = normalize(str(text))
        if not text or is_noise(text):
            continue
        # EasyOCR boxes are [[x,y],...]; also fix mangled EPIC casing
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        up = text.replace(" ", "").upper()
        m = EPIC_RE.search(up)
        if m and re.fullmatch(r"[A-Z0-9]+", up):
            text = m.group(1)
        tokens.append((text, sum(xs) / 4, sum(ys) / 4))
    return tokens


def ocr_hybrid(img: Image.Image) -> list[tuple[str, float, float]]:
    """Fast TEL path: Vision for EPICs/ages/houses + EasyOCR only on name crops.

    ~4× faster than full-page EasyOCR while keeping Telugu names readable.
    """
    import numpy as np

    # Structure pass (fast)
    base = ocr_vision(img)
    w, h = img.size
    epics = []
    for text, x, y in base:
        m = EPIC_RE.search(text.replace(" ", "").upper())
        if m:
            epics.append((m.group(1), x, y))
    if len(epics) < 3:
        # Fallback if Vision finds too few EPICs
        return ocr_easy(img)

    # Estimate card height from EPIC spacing
    by_col: dict[int, list[float]] = {0: [], 1: [], 2: []}
    for _e, x, y in epics:
        by_col[col_of(x, float(w))].append(y)
    gaps = []
    for ys in by_col.values():
        ys = sorted(ys)
        gaps.extend(b - a for a, b in zip(ys, ys[1:]) if 80 < (b - a) < 500)
    card_h = sorted(gaps)[len(gaps) // 2] if gaps else (h * 0.085)

    global _EASYOCR
    if _EASYOCR is None:
        import easyocr

        _EASYOCR = easyocr.Reader(["te", "en"], gpu=False, verbose=False)

    tel_tokens: list[tuple[str, float, float]] = []

    def easy_crop(x0: int, y0: int, x1: int, y1: int) -> None:
        if x1 - x0 < 40 or y1 - y0 < 24:
            return
        crop = img.crop((x0, y0, x1, y1))
        try:
            result = _EASYOCR.readtext(np.array(crop.convert("RGB")), detail=1, paragraph=False)
        except Exception:
            return
        for item in result or []:
            box, text, _score = item
            text = normalize(str(text))
            if not text or is_noise(text):
                continue
            if EPIC_RE.fullmatch(text.replace(" ", "").upper()):
                continue
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            tel_tokens.append((text, x0 + sum(xs) / 4, y0 + sum(ys) / 4))

    # Header band → section / part / constituency (Telugu labels)
    easy_crop(0, 0, w, max(80, int(h * 0.11)))

    for _epic, x, y in epics:
        # Name/relation/age band: below EPIC, left ~72% of column (skip photo)
        col = col_of(x, float(w))
        col_w = w / 3.0
        x0 = max(0, int(col * col_w + 4))
        x1 = min(w, int(col * col_w + col_w * 0.72))
        y0 = max(0, int(y - 8))
        y1 = min(h, int(y + card_h * 0.88))
        easy_crop(x0, y0, x1, y1)

    # Merge: keep Vision structure tokens + Telugu name/header tokens
    return base + tel_tokens


def run_ocr(img: Image.Image) -> list[tuple[str, float, float]]:
    if _ENGINE_NAME == "rapid":
        return ocr_rapid(img)
    if _ENGINE_NAME == "easyocr":
        return ocr_easy(img)
    if _ENGINE_NAME == "hybrid":
        return ocr_hybrid(img)
    return ocr_vision(img)


def col_of(x: float, width: float) -> int:
    return min(max(int(x // (width / 3.0)), 0), 2)


def parse_section(raw: str) -> tuple[str, str, str]:
    """Return (section_full, section_no, section_name)."""
    m = SECTION_RE.search(raw)
    cleaned = m.group(1).strip() if m else raw
    cleaned = re.sub(r"(?i)^Section\s*No\s*and\s*Name\s*:?\s*", "", cleaned).strip()
    if not cleaned:
        return "", "", ""
    m = SECTION_NO_RE.match(cleaned)
    if m:
        return cleaned, m.group(1), m.group(2).strip()
    # e.g. "1-Dayarguda 5-6-1 To 5-6-34"
    m2 = re.match(r"^(\d+)\s*[-–]?\s*(.+)$", cleaned)
    if m2:
        return cleaned, m2.group(1), m2.group(2).strip()
    return cleaned, "", cleaned


def looks_like_constituency(text: str) -> bool:
    t = str(text or "")
    if re.search(r"కూకట్|kukatpally|మల్కాజ్|malkajgiri", t, re.I):
        return True
    m = TEL_SECTION_NUM_RE.match(t.strip())
    return bool(m and m.group(1) in {"46", "7"} and "to" not in t.lower())


def header_meta(tokens: list[tuple[str, float, float]], source_pdf: str) -> dict[str, str]:
    meta = {
        "part_no": "",
        "constituency": "",
        "section": "",
        "section_no": "",
        "section_name": "",
    }
    # Include a bit lower — hybrid header crops can sit around y~150–260 at width 1200
    header_tokens = [(t, x, y) for t, x, y in tokens if y <= 280]
    for text, _x, y in header_tokens:
        m = PART_RE.search(text) or TEL_PART_RE.search(text)
        if m and not meta["part_no"]:
            meta["part_no"] = m.group(1)

        m = CONST_RE.search(text)
        if m and not meta["constituency"]:
            meta["constituency"] = m.group(1).strip()
        elif "KUKATPALLY" in text.upper() and not meta["constituency"]:
            cleaned = re.sub(r"(?i).*Name\s*:?\s*", "", text).strip()
            meta["constituency"] = cleaned or "46-KUKATPALLY"
        elif re.search(r"46\s*[-–]?\s*కూకట్", text) and not meta["constituency"]:
            meta["constituency"] = "46-KUKATPALLY"

        if re.search(r"(?i)section\s*no", text) or text.lower().startswith("section"):
            full, sno, sname = parse_section(text)
            if full:
                meta["section"] = full
                meta["section_no"] = sno
                meta["section_name"] = sname

        # Telugu section line often OCR'd as "1-Colony … to …" without label.
        # Do NOT treat "46-కూకట్ పల్లి" (constituency) as a section.
        if not meta["section"]:
            m = TEL_SECTION_NUM_RE.match(text)
            low = text.lower()
            looks_const = bool(
                re.search(r"కూకట్|kukatpally|మల్కాజ్|malkajgiri", text, re.I)
            ) or (m and m.group(1) in {"46", "7"})
            looks_section = ("to" in low) and bool(re.search(r"\d", text))
            if m and looks_section and not looks_const:
                meta["section"] = text
                meta["section_no"] = m.group(1)
                meta["section_name"] = m.group(2).strip()

    # Prefer section token that follows a విభాగం / Section label
    if not meta["section"] or looks_like_constituency(meta["section"]):
        for i, (text, _x, _y) in enumerate(header_tokens):
            if "విభాగం" in text or re.search(r"(?i)section", text):
                for text2, _, _ in header_tokens[i : i + 6]:
                    m = TEL_SECTION_NUM_RE.match(text2)
                    if m and not looks_like_constituency(text2):
                        meta["section"] = text2
                        meta["section_no"] = m.group(1)
                        meta["section_name"] = m.group(2).strip()
                        break
            if meta["section"] and not looks_like_constituency(meta["section"]):
                break

    # Last resort: any token on page that looks like "N-… to …"
    if not meta["section"] or looks_like_constituency(meta["section"]):
        for text, _x, _y in tokens:
            m = TEL_SECTION_NUM_RE.match(text.strip())
            if not m or looks_like_constituency(text):
                continue
            if "to" in text.lower() and re.search(r"\d", text):
                meta["section"] = text.strip()
                meta["section_no"] = m.group(1)
                meta["section_name"] = m.group(2).strip()
                break

    # Telugu: part number may be a lone digit near "భాగం"
    if not meta["part_no"]:
        for i, (text, _x, y) in enumerate(header_tokens):
            if "భాగం" in text or "సంఖ్య" in text:
                for text2, _, y2 in header_tokens[i : i + 4]:
                    if SERIAL_RE.match(text2) and int(text2) < 1000:
                        meta["part_no"] = text2
                        break
            if meta["part_no"]:
                break

    # Fallback part from filename
    if not meta["part_no"]:
        m = PART_FROM_FILE_RE.search(source_pdf)
        if m:
            meta["part_no"] = m.group(1)
    if not meta["constituency"]:
        meta["constituency"] = "46-KUKATPALLY"
    return meta


def _is_labelish(text: str) -> bool:
    t = text.lower()
    return bool(
        re.search(
            r"ఓటరు|తండ్రి|భర్త|తల్లి|ఇంటి|వయస|లింగ|photo|available|name|house|age|gender|father|husband|mother|పురుష|స్త్రీ",
            t,
        )
    )


def _has_telugu(text: str) -> bool:
    return bool(TEL_SCRIPT_RE.search(text or ""))


def _looks_house(text: str) -> bool:
    t = (text or "").strip()
    if not t:
        return False
    if re.match(r"^\d", t):
        return True
    if re.search(r"సంఖ్య|plot|nagar|colony|road|ఫ్లాట్|అంతస్తు", t, re.I):
        return True
    return False


def _looks_person_name(text: str) -> bool:
    t = (text or "").strip(" :;-–")
    if len(t) < 2 or _is_labelish(t) or _looks_house(t):
        return False
    if EPIC_RE.search(t.replace(" ", "").upper()) or SERIAL_RE.match(t):
        return False
    if re.fullmatch(r"\d{1,3}", t):
        return False
    # Reject Vision garbage on Telugu pages (mojibake / mixed junk)
    if re.search(r"[ãáàâäåæçñø:°]", t) or re.search(r"\d", t):
        return False
    # Prefer real Telugu script names from EasyOCR crops
    if _has_telugu(t):
        return len(TEL_SCRIPT_RE.findall(t)) >= 2
    # Clean Latin-only names (ENG rolls)
    letters = re.sub(r"[^A-Za-z\s.]", "", t)
    return len(re.sub(r"\s+", "", letters)) >= 4 and letters.strip() == t.strip(" .")


def fill_voter(texts: list[str], v: Voter) -> None:
    pending_name = False
    pending_rel = None  # Father/Husband/Mother
    pending_house = False

    for text in texts:
        if SERIAL_RE.match(text) and not v.serial_no:
            v.serial_no = text
            continue
        epic = EPIC_RE.search(text.replace(" ", "").upper())
        if epic and not v.epic_no:
            code = epic.group(1)
            if len(code) >= 9:
                v.epic_no = code
            continue

        # ----- English labels -----
        m = NAME_RE.match(text)
        if m and not v.name:
            v.name = m.group(1).strip()
            continue
        m = RELATION_RE.match(text)
        if m:
            rel = m.group(1).lower()
            if "father" in rel:
                v.relation_type = "Father"
            elif "husband" in rel:
                v.relation_type = "Husband"
            elif "mother" in rel:
                v.relation_type = "Mother"
            else:
                v.relation_type = "Other"
            v.relation_name = m.group(2).strip()
            continue
        m = HOUSE_RE.match(text)
        if m and not v.house_number:
            v.house_number = m.group(1).strip()
            continue
        m = AGE_GENDER_RE.search(text)
        if m:
            v.age = m.group(1)
            v.gender = m.group(2).title()
            continue
        if not v.age:
            m = AGE_ONLY_RE.search(text)
            if m:
                v.age = m.group(1)
        if not v.gender:
            m = GENDER_ONLY_RE.search(text)
            if m:
                v.gender = m.group(1).title()

        # ----- Telugu labels -----
        m = TEL_NAME_RE.match(text)
        if m is not None:
            rest = (m.group(1) or "").strip()
            if rest and not v.name:
                v.name = rest
            else:
                pending_name = True
            continue
        if re.match(rf"^ఓటరు\s*{TEL_PERU}\s*:?\s*$", text.strip()) or text.strip() in {
            "ఓటరు పేరు",
            "ఓటరు పేరు:",
            "ఓటరు సీరు",
        }:
            pending_name = True
            continue

        m = TEL_FATHER_RE.match(text)
        if m is not None:
            v.relation_type = "Father"
            rest = (m.group(1) or "").strip()
            if rest:
                v.relation_name = rest
            else:
                pending_rel = "Father"
            continue
        m = TEL_HUSBAND_RE.match(text)
        if m is not None:
            v.relation_type = "Husband"
            rest = (m.group(1) or "").strip()
            if rest:
                v.relation_name = rest
            else:
                pending_rel = "Husband"
            continue
        m = TEL_MOTHER_RE.match(text)
        if m is not None:
            v.relation_type = "Mother"
            rest = (m.group(1) or "").strip()
            if rest:
                v.relation_name = rest
            else:
                pending_rel = "Mother"
            continue

        m = TEL_HOUSE_RE.match(text)
        if m is not None:
            rest = (m.group(1) or "").strip()
            if rest and not v.house_number:
                v.house_number = rest
            else:
                pending_house = True
            continue
        if text.strip() in {"ఇంటి సంఖ్య", "ఇంటి", "సంఖ్య"}:
            if text.strip() == "సంఖ్య" and not pending_house:
                pass
            else:
                pending_house = True
            continue

        m = TEL_AGE_RE.search(text)
        if m and not v.age:
            v.age = m.group(1)
        m = TEL_AGE_GENDER_RE.search(text)
        if m and not v.age:
            v.age = m.group(1)
        if "పురుష" in text and not v.gender:
            v.gender = "Male"
        if "స్త్రీ" in text and not v.gender:
            v.gender = "Female"

        # Consume pending value tokens (name / relation / house split across OCR lines)
        if pending_name and not v.name and not _is_labelish(text) and not EPIC_RE.search(text.replace(" ", "").upper()):
            v.name = text.strip()
            pending_name = False
            continue
        if pending_rel and not _is_labelish(text) and not EPIC_RE.search(text.replace(" ", "").upper()):
            v.relation_type = pending_rel
            v.relation_name = f"{v.relation_name} {text}".strip() if v.relation_name else text.strip()
            pending_rel = None
            continue
        if pending_house and not v.house_number and not _is_labelish(text):
            v.house_number = text.strip()
            pending_house = False
            continue

        if (
            v.relation_name
            and not v.house_number
            and not _is_labelish(text)
            and not EPIC_RE.search(text.replace(" ", "").upper())
            and not SERIAL_RE.match(text)
        ):
            # continuation of relation name
            if not re.search(r"\d", text) or "/" in text:
                if not re.match(r"^\d", text):
                    v.relation_name = f"{v.relation_name} {text}".strip()

    # Fallback when labels were missed/garbled: Telugu person lines only
    candidates = [t.strip() for t in texts if _looks_person_name(t) and _has_telugu(t)]
    if not candidates:
        candidates = [t.strip() for t in texts if _looks_person_name(t)]
    if not v.name and candidates:
        v.name = candidates[0]
        candidates = candidates[1:]
    if (not v.relation_name or not _has_telugu(str(v.relation_name))) and candidates:
        # Prefer Telugu relation name over Vision junk already stored
        if not v.relation_name or not _has_telugu(str(v.relation_name)):
            v.relation_name = candidates[0]
        if not v.relation_type:
            if v.gender == "Female":
                v.relation_type = "Husband"
            elif v.gender == "Male":
                v.relation_type = "Father"
    # Drop relation_name if it's clearly Vision garbage
    if v.relation_name and not _looks_person_name(v.relation_name) and not _has_telugu(v.relation_name):
        v.relation_name = ""
    if v.name and not _looks_person_name(v.name) and not _has_telugu(v.name):
        v.name = ""
        if candidates:
            v.name = candidates[0]
    if not v.house_number:
        for t in texts:
            if _looks_house(t) and not _is_labelish(t):
                v.house_number = t.strip()
                break


def attach_serials(
    cards: list[tuple[float, float, Voter]],
    tokens: list[tuple[str, float, float]],
    width: float,
) -> None:
    """Map small top-left serial numbers onto nearest EPIC card in same column."""
    serials = [(t, x, y) for t, x, y in tokens if SERIAL_RE.match(t)]
    for cy, cx, v in cards:
        if v.serial_no:
            continue
        col = col_of(cx, width)
        best = None
        best_score = 1e9
        for text, sx, sy in serials:
            if col_of(sx, width) != col:
                continue
            # serial sits left of / near EPIC, same row band
            if sx > cx + 10:
                continue
            dy = abs(sy - cy)
            if dy > 40:
                continue
            score = dy * 3 + max(0, cx - sx) * 0.05
            if score < best_score:
                best_score = score
                best = text
        if best:
            v.serial_no = best


def infer_serials_from_grid(
    cards: list[tuple[float, float, Voter]],
    page_start_hint: int | None = None,
) -> int | None:
    """
    Fill missing S.No using 3-column reading order.
    Returns next page start hint (max serial + 1) when possible.
    """
    if not cards:
        return page_start_hint
    ordered = sorted(cards, key=lambda c: (c[0], c[1]))
    rows: list[list[tuple[float, float, Voter]]] = []
    for item in ordered:
        if not rows or abs(item[0] - rows[-1][0][0]) > 90:
            rows.append([item])
        else:
            rows[-1].append(item)
    flat: list[tuple[float, float, Voter]] = []
    for row in rows:
        flat.extend(sorted(row, key=lambda c: c[1]))

    obs: list[int] = []
    for i, (_y, _x, v) in enumerate(flat):
        if v.serial_no and str(v.serial_no).isdigit():
            obs.append(int(v.serial_no) - i)
    if obs:
        obs.sort()
        start = obs[len(obs) // 2]
    elif page_start_hint is not None:
        start = page_start_hint
    else:
        start = 1

    for i, (_y, _x, v) in enumerate(flat):
        expected = str(start + i)
        if not v.serial_no:
            v.serial_no = expected
        elif str(v.serial_no).isdigit() and abs(int(v.serial_no) - (start + i)) > 2 and len(obs) >= 2:
            v.serial_no = expected

    vals = [int(v.serial_no) for _y, _x, v in flat if str(v.serial_no).isdigit()]
    return (max(vals) + 1) if vals else page_start_hint


def parse_tokens(
    tokens: list[tuple[str, float, float]],
    width: float,
    height: float,
    source_pdf: str,
    page_no: int,
) -> list[Voter]:
    meta = header_meta(tokens, source_pdf)
    content = [(t, x, y) for t, x, y in tokens if 40 < y < height - 50 and not is_header_line(t)]
    epics = [
        (t, x, y)
        for t, x, y in content
        if EPIC_RE.search(t.replace(" ", "").upper())
    ]
    # Keep only strongest EPIC-looking tokens (prefer 7 digits)
    cleaned_epics = []
    for t, x, y in epics:
        m = EPIC_RE.search(t.replace(" ", "").upper())
        if not m:
            continue
        code = m.group(1)
        if len(re.sub(r"\D", "", code)) < 6:
            continue
        cleaned_epics.append((code if len(code) >= 9 else m.group(0), x, y, code))
    if len(cleaned_epics) < 3:
        return []

    cards: list[tuple[float, float, Voter]] = []
    for _text, x, y, code in cleaned_epics:
        # normalize to 3 letters + digits
        m = re.match(r"([A-Z]{3})(\d{6,7})", code)
        epic = f"{m.group(1)}{m.group(2)}" if m else code
        cards.append(
            (
                y,
                x,
                Voter(
                    part_no=meta["part_no"],
                    constituency=meta["constituency"],
                    section=meta["section"],
                    section_no=meta["section_no"],
                    section_name=meta["section_name"],
                    epic_no=epic,
                    source_pdf=source_pdf,
                    page_no=page_no,
                ),
            )
        )

    by_col: dict[int, list[float]] = {0: [], 1: [], 2: []}
    for y, x, _ in cards:
        by_col[col_of(x, width)].append(y)
    gaps = []
    for ys in by_col.values():
        ys = sorted(ys)
        gaps.extend(b - a for a, b in zip(ys, ys[1:]) if 120 < (b - a) < 450)
    card_h = sorted(gaps)[len(gaps) // 2] if gaps else 200.0

    buckets: dict[int, list[str]] = {i: [] for i in range(len(cards))}
    for text, x, y in content:
        col = col_of(x, width)
        best_i, best_dy = None, 1e9
        for i, (cy, cx, _) in enumerate(cards):
            if col_of(cx, width) != col:
                continue
            dy = y - cy
            # Wider band so hybrid Telugu crops still attach to the EPIC card
            if -70 <= dy <= card_h * 1.05 and abs(dy) < best_dy:
                best_dy = abs(dy)
                best_i = i
        if best_i is not None:
            buckets[best_i].append(text)

    attach_serials(cards, content, width)
    infer_serials_from_grid(cards)

    voters: list[Voter] = []
    for i, (_, _, v) in enumerate(cards):
        fill_voter(buckets[i], v)
        if v.epic_no and (v.name or v.serial_no):
            voters.append(v)

    def key(v: Voter):
        try:
            return int(v.serial_no)
        except Exception:
            return 10**9

    voters.sort(key=key)
    return voters


def process_page_job(job: tuple[str, int, int, str]) -> tuple[str, int, list[dict], float]:
    pdf_path, page_index, max_width, engine = job
    global _ENGINE_NAME
    _ENGINE_NAME = engine
    t0 = time.time()
    doc = fitz.open(pdf_path)
    img = page_image(doc, page_index, max_width=max_width)
    tokens = run_ocr(img)
    voters = parse_tokens(
        tokens,
        width=float(img.width),
        height=float(img.height),
        source_pdf=Path(pdf_path).name,
        page_no=page_index + 1,
    )
    return Path(pdf_path).name, page_index + 1, [asdict(v) for v in voters], time.time() - t0


def build_jobs(
    pdfs: list[Path], max_width: int, skip_first: int, skip_last: int, engine: str
) -> list[tuple[str, int, int, str]]:
    jobs = []
    for pdf in pdfs:
        n = fitz.open(pdf).page_count
        start = min(skip_first, max(0, n - 1))
        end = max(start, n - max(0, skip_last))
        for i in range(start, end):
            jobs.append((str(pdf), i, max_width, engine))
    return jobs


def rows_to_df(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=COLS)
    for c in COLS:
        if c not in df.columns:
            df[c] = ""
    df = df[COLS].drop_duplicates(
        subset=["part_no", "epic_no", "serial_no"], keep="first"
    )
    df["_serial_sort"] = pd.to_numeric(df["serial_no"], errors="coerce").fillna(10**9)
    df = df.sort_values(by=["part_no", "section_no", "page_no", "_serial_sort"]).drop(
        columns=["_serial_sort"]
    )
    return df.reset_index(drop=True)


def save_excel(rows: list[dict], out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df = rows_to_df(rows)
    df.to_excel(out_path, index=False)
    print(f"  ✓ Wrote {len(df)} rows → {out_path}")
    return len(df)


def excel_name_for_pdf(pdf: Path) -> str:
    return f"{pdf.stem}.xlsx"


def process_one_pdf(
    pdf: Path,
    out_dir: Path,
    workers: int,
    max_width: int,
    skip_first: int,
    skip_last: int,
    engine: str,
    skip_existing: bool = False,
) -> list[dict]:
    out_xlsx = out_dir / excel_name_for_pdf(pdf)
    if skip_existing and out_xlsx.exists() and out_xlsx.stat().st_size > 1000:
        try:
            df = pd.read_excel(out_xlsx)
            rows = df.to_dict(orient="records")
            print(f"\n=== {pdf.name} | skip-existing ({len(rows)} rows) ===")
            return rows
        except Exception:
            pass

    jobs = build_jobs([pdf], max_width, skip_first, skip_last, engine)
    print(f"\n=== {pdf.name} | {len(jobs)} pages | workers={workers} | engine={engine} ===")
    rows: list[dict] = []
    done = 0

    # EasyOCR model is heavy — keep page loop in-process for easyocr/hybrid
    use_pool = workers > 1 and engine not in {"easyocr", "hybrid"}
    if not use_pool:
        futures_results = [process_page_job(job) for job in jobs]
        for pdf_name, page_no, page_rows, secs in futures_results:
            done += 1
            rows.extend(page_rows)
            print(
                f"  [{done:3d}/{len(jobs)}] p{page_no}: "
                f"{len(page_rows):3d} voters ({secs:.2f}s)"
            )
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(process_page_job, job) for job in jobs]
            for fut in as_completed(futures):
                pdf_name, page_no, page_rows, secs = fut.result()
                done += 1
                rows.extend(page_rows)
                print(
                    f"  [{done:3d}/{len(jobs)}] p{page_no}: "
                    f"{len(page_rows):3d} voters ({secs:.2f}s)"
                )

    save_excel(rows, out_xlsx)
    return rows


def detect_engine(requested: str, pdfs: list[Path] | None = None) -> str:
    if requested != "auto":
        return requested
    if pdfs and any("TEL-" in p.name.upper() for p in pdfs):
        # Hybrid: Vision structure + EasyOCR name crops (~4× faster than full EasyOCR)
        try:
            import easyocr  # noqa: F401
            import ocrmac  # noqa: F401

            return "hybrid"
        except Exception:
            try:
                import easyocr  # noqa: F401

                return "easyocr"
            except Exception:
                return "rapid"
    try:
        import ocrmac  # noqa: F401

        return "vision"
    except Exception:
        return "rapid"


def main() -> int:
    ap = argparse.ArgumentParser(description="Electoral-roll PDF → Excel with section mapping")
    ap.add_argument("--pdf-dir", type=Path, default=DEFAULT_PDF_DIR)
    ap.add_argument("--pdf", type=Path, action="append", default=None)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    ap.add_argument("--combined", type=Path, default=DEFAULT_COMBINED)
    ap.add_argument("--no-combined", action="store_true")
    ap.add_argument(
        "--engine",
        choices=["auto", "vision", "rapid", "easyocr", "hybrid"],
        default="auto",
    )
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--max-width", type=int, default=1400)
    ap.add_argument("--skip-first", type=int, default=2)
    ap.add_argument("--skip-last", type=int, default=1)
    ap.add_argument(
        "--skip-existing",
        action="store_true",
        help="Reuse per-PDF Excel if already extracted",
    )
    ap.add_argument("--limit", type=int, default=0, help="First N PDFs only (0=all)")
    args = ap.parse_args()

    pdfs = args.pdf or sorted(args.pdf_dir.glob("*.pdf"))
    if not pdfs:
        pdfs = sorted((ROOT / "voter_pdf").glob("*.pdf"))
    if args.limit and args.limit > 0:
        pdfs = pdfs[: args.limit]
    if not pdfs:
        print("No PDFs found", file=sys.stderr)
        return 1

    engine = detect_engine(args.engine, pdfs)
    global _ENGINE_NAME
    _ENGINE_NAME = engine

    args.out_dir.mkdir(parents=True, exist_ok=True)
    print(
        f"PDFs: {len(pdfs)} | engine: {engine} | workers: {args.workers} | "
        f"max_width: {args.max_width} | skip_existing={args.skip_existing}"
    )

    if engine == "vision":
        print("Warming up Vision OCR...")
        ocr_vision(Image.new("RGB", (200, 200), "white"))
    elif engine in {"easyocr", "hybrid"}:
        print(f"Warming up {engine} OCR...")
        if engine == "hybrid":
            ocr_vision(Image.new("RGB", (200, 200), "white"))
        ocr_easy(Image.new("RGB", (120, 80), "white"))

    all_rows: list[dict] = []
    t0 = time.time()
    for pdf in pdfs:
        rows = process_one_pdf(
            pdf,
            args.out_dir,
            workers=args.workers,
            max_width=args.max_width,
            skip_first=args.skip_first,
            skip_last=args.skip_last,
            engine=engine,
            skip_existing=args.skip_existing,
        )
        all_rows.extend(rows)

    if not args.no_combined:
        save_excel(all_rows, args.combined)
        # Factor repeated values (section / station / cover fields) into dimension keys
        try:
            sys.path.insert(0, str(Path(__file__).resolve().parent))
            from dimension_map import convert as dim_convert  # noqa: WPS433

            dim_out = ROOT / "output" / "voters_dimensional.xlsx"
            report = dim_convert(
                rows_to_df(all_rows),
                dim_out,
                map_json=ROOT / "output" / "dimension_keys.json",
            )
            print(
                f"  ✓ Dimension map → {dim_out} "
                f"(file={report['dim_file_rows']} section={report['dim_section_rows']} "
                f"~{report['saved_pct']}% smaller)"
            )
        except Exception as exc:  # noqa: BLE001
            print(f"  ! Dimension map skipped: {exc}")

    # Quick quality report
    df = rows_to_df(all_rows)
    if not df.empty:
        def miss(col):
            s = df[col].isna() | (df[col].astype(str).str.strip() == "") | (df[col].astype(str) == "nan")
            return f"{s.mean()*100:.1f}%"

        print("\nField coverage (missing %):")
        for c in ["part_no", "constituency", "section", "section_no", "serial_no", "age", "gender"]:
            print(f"  {c}: missing {miss(c)}")

    print(f"\nDone. Total voters: {len(all_rows)} | Time: {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
