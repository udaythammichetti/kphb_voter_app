#!/usr/bin/env python3
"""
Dimension-map electoral-roll Excel to shrink repeated values.

Duplicate *values* (not files) are factored into lookup tables:

  dim_file     — one row per source PDF / part (cover + geo + station fields)
  dim_section  — unique sections within each file
  dim_gender   — Male / Female / …
  dim_relation — Father / Husband / Mother / …

  voters       — fact rows keep only keys + person-specific fields

Usage
-----
  # Convert existing flat workbook
  .venv/bin/python scripts/dimension_map.py \\
      --in output/voters_all.xlsx \\
      --out output/voters_dimensional.xlsx

  # Also emit a flat rebuild (for the web app)
  .venv/bin/python scripts/dimension_map.py --in … --out … --also-flat output/voters_all.xlsx
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IN = ROOT / "output" / "voters_all.xlsx"
DEFAULT_OUT = ROOT / "output" / "voters_dimensional.xlsx"
DEFAULT_MAP_JSON = ROOT / "output" / "dimension_keys.json"

# Values that repeat for every voter in the same source PDF / part
FILE_DIM_COLS = [
    "source_pdf",
    "part_no",
    "constituency",
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
    "roll_title",
]

SECTION_DIM_COLS = ["section_no", "section_name", "section"]

# Person-level columns that stay on the fact table
FACT_KEEP = [
    "serial_no",
    "epic_no",
    "name",
    "relation_name",
    "house_number",
    "age",
    "page_no",
]


def _norm(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    s = str(v).strip()
    return "" if s.lower() in {"nan", "none"} else s


def _key_map(values: list[str], prefix: str) -> dict[str, str]:
    """Stable keys: PREFIX-0001 … for unique non-empty values ('' → PREFIX-0000)."""
    uniq: list[str] = []
    seen: set[str] = set()
    for v in values:
        if v not in seen:
            seen.add(v)
            uniq.append(v)
    out: dict[str, str] = {}
    for i, v in enumerate(uniq):
        out[v] = f"{prefix}-{i:04d}"
    return out


def build_dimensions(df: pd.DataFrame) -> dict[str, pd.DataFrame]:
    work = df.copy()
    for c in FILE_DIM_COLS + SECTION_DIM_COLS + ["gender", "relation_type", "source_pdf"]:
        if c not in work.columns:
            work[c] = ""
        work[c] = work[c].map(_norm)

    # ---- dim_file: unique by source_pdf (fallback part_no) ----
    file_id_col = "source_pdf" if work["source_pdf"].astype(bool).any() else "part_no"
    file_rows = []
    file_key_by_id: dict[str, str] = {}
    for i, (fid, g) in enumerate(work.groupby(file_id_col, sort=False), start=1):
        fid_s = _norm(fid)
        fkey = f"F-{i:04d}"
        file_key_by_id[fid_s] = fkey
        row = {"file_key": fkey, "file_id": fid_s}
        sample = g.iloc[0]
        for c in FILE_DIM_COLS:
            row[c] = _norm(sample.get(c, ""))
        row["voter_count"] = int(len(g))
        file_rows.append(row)
    dim_file = pd.DataFrame(file_rows)

    # ---- dim_section: unique (file_key, section) ----
    section_rows = []
    section_key_by: dict[tuple[str, str], str] = {}
    seq = 0
    for _, r in work.iterrows():
        fid = _norm(r[file_id_col])
        fkey = file_key_by_id[fid]
        sec = _norm(r.get("section", "")) or (
            f"{_norm(r.get('section_no',''))}-{_norm(r.get('section_name',''))}".strip("-")
        )
        tup = (fkey, sec)
        if tup in section_key_by:
            continue
        seq += 1
        skey = f"S-{seq:05d}"
        section_key_by[tup] = skey
        section_rows.append(
            {
                "section_key": skey,
                "file_key": fkey,
                "section_no": _norm(r.get("section_no", "")),
                "section_name": _norm(r.get("section_name", "")),
                "section": sec,
            }
        )
    dim_section = pd.DataFrame(section_rows)

    # ---- enum dims ----
    gender_map = _key_map([_norm(v) for v in work["gender"].tolist()], "G")
    relation_map = _key_map([_norm(v) for v in work["relation_type"].tolist()], "R")
    dim_gender = pd.DataFrame(
        [{"gender_key": k, "gender": v} for v, k in gender_map.items()]
    )
    dim_relation = pd.DataFrame(
        [{"relation_key": k, "relation_type": v} for v, k in relation_map.items()]
    )

    # ---- facts ----
    facts = []
    for _, r in work.iterrows():
        fid = _norm(r[file_id_col])
        fkey = file_key_by_id[fid]
        sec = _norm(r.get("section", "")) or (
            f"{_norm(r.get('section_no',''))}-{_norm(r.get('section_name',''))}".strip("-")
        )
        skey = section_key_by[(fkey, sec)]
        row = {
            "file_key": fkey,
            "section_key": skey,
            "gender_key": gender_map[_norm(r.get("gender", ""))],
            "relation_key": relation_map[_norm(r.get("relation_type", ""))],
        }
        for c in FACT_KEEP:
            row[c] = r.get(c, "")
            if isinstance(row[c], float) and pd.isna(row[c]):
                row[c] = ""
        facts.append(row)
    fact = pd.DataFrame(facts)

    return {
        "dim_file": dim_file,
        "dim_section": dim_section,
        "dim_gender": dim_gender,
        "dim_relation": dim_relation,
        "voters": fact,
        "_maps": {
            "file_key_by_id": file_key_by_id,
            "section_key_by": {f"{a}|{b}": k for (a, b), k in section_key_by.items()},
            "gender_map": gender_map,
            "relation_map": relation_map,
        },
    }


def expand_flat(dims: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Rebuild denormalized voter rows from dimension sheets."""
    fact = dims["voters"].copy()
    out = fact.merge(dims["dim_file"], on="file_key", how="left")
    out = out.merge(dims["dim_section"], on=["section_key", "file_key"], how="left")
    out = out.merge(dims["dim_gender"], on="gender_key", how="left")
    out = out.merge(dims["dim_relation"], on="relation_key", how="left")
    # Prefer person fields; drop helper keys from wide export if desired
    return out


def size_report(flat: pd.DataFrame, dims: dict[str, pd.DataFrame]) -> dict:
    def nbytes(df: pd.DataFrame) -> int:
        return int(df.memory_usage(deep=True).sum())

    flat_n = nbytes(flat)
    dim_n = sum(
        nbytes(dims[k])
        for k in ("dim_file", "dim_section", "dim_gender", "dim_relation", "voters")
    )
    return {
        "flat_rows": len(flat),
        "flat_bytes": flat_n,
        "dimensional_bytes": dim_n,
        "saved_bytes": max(0, flat_n - dim_n),
        "saved_pct": round((1 - dim_n / flat_n) * 100, 1) if flat_n else 0,
        "dim_file_rows": len(dims["dim_file"]),
        "dim_section_rows": len(dims["dim_section"]),
        "dim_gender_rows": len(dims["dim_gender"]),
        "dim_relation_rows": len(dims["dim_relation"]),
        "fact_rows": len(dims["voters"]),
    }


def write_dimensional(
    dims: dict[str, pd.DataFrame],
    out_path: Path,
    map_json: Path | None = None,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        dims["dim_file"].to_excel(writer, sheet_name="dim_file", index=False)
        dims["dim_section"].to_excel(writer, sheet_name="dim_section", index=False)
        dims["dim_gender"].to_excel(writer, sheet_name="dim_gender", index=False)
        dims["dim_relation"].to_excel(writer, sheet_name="dim_relation", index=False)
        dims["voters"].to_excel(writer, sheet_name="voters", index=False)
    if map_json is not None:
        map_json.parent.mkdir(parents=True, exist_ok=True)
        maps = dims.get("_maps", {})
        map_json.write_text(json.dumps(maps, indent=2, ensure_ascii=False), encoding="utf-8")


def dataframe_from_flat_or_path(src: Path | pd.DataFrame) -> pd.DataFrame:
    if isinstance(src, pd.DataFrame):
        return src
    return pd.read_excel(src)


def convert(
    flat: pd.DataFrame,
    out_path: Path,
    map_json: Path | None = None,
    also_flat: Path | None = None,
) -> dict:
    dims = build_dimensions(flat)
    write_dimensional(dims, out_path, map_json=map_json)
    report = size_report(flat, dims)
    if also_flat is not None:
        expanded = expand_flat(dims)
        also_flat.parent.mkdir(parents=True, exist_ok=True)
        # keep a usable flat export without internal map keys noise
        drop = [c for c in expanded.columns if c.endswith("_key") or c == "file_id"]
        expanded.drop(columns=[c for c in drop if c in expanded.columns], errors="ignore").to_excel(
            also_flat, index=False
        )
    return report


def main() -> int:
    ap = argparse.ArgumentParser(description="Map duplicate column values into dimension keys")
    ap.add_argument("--in", dest="inp", type=Path, default=DEFAULT_IN)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--map-json", type=Path, default=DEFAULT_MAP_JSON)
    ap.add_argument(
        "--also-flat",
        type=Path,
        default=None,
        help="Optional path to rewrite a denormalized flat Excel",
    )
    args = ap.parse_args()

    if not args.inp.exists():
        print(f"Input not found: {args.inp}")
        return 1

    flat = pd.read_excel(args.inp)
    report = convert(flat, args.out, map_json=args.map_json, also_flat=args.also_flat)
    print(f"✓ Dimensional workbook → {args.out}")
    print(f"  dim_file:     {report['dim_file_rows']} unique files/parts")
    print(f"  dim_section:  {report['dim_section_rows']} unique sections")
    print(f"  dim_gender:   {report['dim_gender_rows']}")
    print(f"  dim_relation: {report['dim_relation_rows']}")
    print(f"  voters/fact:  {report['fact_rows']}")
    print(
        f"  memory: flat {report['flat_bytes']:,} B → dimensional {report['dimensional_bytes']:,} B "
        f"(~{report['saved_pct']}% smaller in-process)"
    )
    if args.map_json:
        print(f"  key map JSON → {args.map_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
