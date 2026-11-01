#!/usr/bin/env python3
"""
Kukatpally electoral-roll extractor (ENG or TEL).

Typical use
-----------
  # 1) Unzip ZIPs under voter_pdf/ → voter_pdf/pdfs/
  .venv/bin/python scripts/extract.py unzip

  # 2) Extract all PDFs → Excel (+ dimension map)
  .venv/bin/python scripts/extract.py run

  # One part only / resume / engines
  .venv/bin/python scripts/extract.py run --limit 1
  .venv/bin/python scripts/extract.py run --skip-existing
  .venv/bin/python scripts/extract.py run --engine hybrid      # TEL (default for TEL files)
  .venv/bin/python scripts/extract.py run --engine vision      # ENG (fast)

  # Full pipeline: extract → cover meta → serial backfill → dims → web/
  .venv/bin/python scripts/extract.py pipeline --skip-existing

Outputs
-------
  output/excel/<pdf>.xlsx
  output/voters_all.xlsx
  output/voters_dimensional.xlsx
  output/dimension_keys.json
  web/public/data/voters_all.xlsx
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENV_PY = ROOT / ".venv" / "bin" / "python"
PDF_DIR = ROOT / "voter_pdf" / "pdfs"
ZIP_DIR = ROOT / "voter_pdf"
OUT_DIR = ROOT / "output"
EXCEL_DIR = OUT_DIR / "excel"
WEB_DATA = ROOT / "web" / "public" / "data"
PART_RE = re.compile(r"(?:ENG|TEL)-(\d+)-WI", re.I)


def py() -> str:
    return str(VENV_PY if VENV_PY.exists() else sys.executable)


def run_cmd(args: list[str], log: Path | None = None) -> int:
    print("$", " ".join(args), flush=True)
    if log is None:
        return subprocess.call(args, cwd=str(ROOT))
    log.parent.mkdir(parents=True, exist_ok=True)
    with log.open("a", encoding="utf-8") as fh:
        fh.write(f"\n$ {' '.join(args)}\n")
        fh.flush()
        proc = subprocess.Popen(
            args,
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            fh.write(line)
        return proc.wait()


def cmd_unzip(_args: argparse.Namespace) -> int:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    zips = sorted(ZIP_DIR.glob("*.zip"))
    if not zips:
        print(f"No zip files in {ZIP_DIR}")
        return 1

    tmp = ZIP_DIR / "_extract_tmp"
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True, exist_ok=True)

    for z in zips:
        print(f"Unzipping {z.name} …", flush=True)
        rc = subprocess.call(["unzip", "-o", str(z), "-d", str(tmp)], cwd=str(ROOT))
        if rc != 0:
            return rc

    n = 0
    for f in tmp.rglob("*.pdf"):
        if "__MACOSX" in f.parts:
            continue
        name = re.sub(r" \(\d+\)\.pdf$", ".pdf", f.name)
        dest = PDF_DIR / name
        shutil.copy2(f, dest)
        n += 1

    parts = set()
    for f in PDF_DIR.glob("*.pdf"):
        m = PART_RE.search(f.name)
        if m:
            parts.add(int(m.group(1)))
    print(f"✓ {n} PDFs → {PDF_DIR} ({len(parts)} parts)")
    shutil.rmtree(tmp, ignore_errors=True)
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    EXCEL_DIR.mkdir(parents=True, exist_ok=True)
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs in {PDF_DIR}. Run:  python scripts/extract.py unzip")
        return 1

    cmd = [
        py(),
        str(ROOT / "scripts" / "extract_voters.py"),
        "--pdf-dir",
        str(PDF_DIR),
        "--out-dir",
        str(EXCEL_DIR),
        "--combined",
        str(OUT_DIR / "voters_all.xlsx"),
        "--engine",
        args.engine,
        "--workers",
        str(args.workers),
        "--max-width",
        str(args.max_width),
    ]
    if args.skip_existing:
        cmd.append("--skip-existing")
    if args.limit and args.limit > 0:
        cmd.extend(["--limit", str(args.limit)])
    if args.no_combined:
        cmd.append("--no-combined")
    if args.pdf:
        # replace glob with explicit files
        cmd = [c for c in cmd if c != "--pdf-dir" and c != str(PDF_DIR)]
        for p in args.pdf:
            cmd.extend(["--pdf", str(Path(p).resolve())])

    log = OUT_DIR / "extract_run.log"
    t0 = time.time()
    rc = run_cmd(cmd, log=log)
    print(f"Extract finished in {time.time() - t0:.1f}s (log: {log})", flush=True)
    if rc != 0:
        return rc

    if not args.no_dims and (OUT_DIR / "voters_all.xlsx").exists():
        rc = run_cmd(
            [
                py(),
                str(ROOT / "scripts" / "dimension_map.py"),
                "--in",
                str(OUT_DIR / "voters_all.xlsx"),
                "--out",
                str(OUT_DIR / "voters_dimensional.xlsx"),
                "--map-json",
                str(OUT_DIR / "dimension_keys.json"),
            ],
            log=log,
        )
    return rc


def cmd_pipeline(args: argparse.Namespace) -> int:
    if args.unzip_first:
        rc = cmd_unzip(args)
        if rc != 0:
            return rc

    # force combined + dims in extract step
    args.no_combined = False
    args.no_dims = False
    rc = cmd_run(args)
    if rc != 0:
        return rc

    log = OUT_DIR / "extract_run.log"
    run_cmd(
        [
            py(),
            str(ROOT / "scripts" / "extract_cover_meta.py"),
            "--pdf-dir",
            str(PDF_DIR),
            "--merge-voters",
        ],
        log=log,
    )
    run_cmd([py(), str(ROOT / "scripts" / "backfill_serials.py")], log=log)

    # refresh dims after cover/serial merge
    run_cmd(
        [
            py(),
            str(ROOT / "scripts" / "dimension_map.py"),
            "--in",
            str(OUT_DIR / "voters_all.xlsx"),
            "--out",
            str(OUT_DIR / "voters_dimensional.xlsx"),
            "--map-json",
            str(OUT_DIR / "dimension_keys.json"),
        ],
        log=log,
    )

    WEB_DATA.mkdir(parents=True, exist_ok=True)
    src = OUT_DIR / "voters_all.xlsx"
    if src.exists():
        shutil.copy2(src, WEB_DATA / "voters_all.xlsx")
        print(f"✓ Copied → {WEB_DATA / 'voters_all.xlsx'}")
    dim = OUT_DIR / "voters_dimensional.xlsx"
    if dim.exists():
        shutil.copy2(dim, WEB_DATA / "voters_dimensional.xlsx")
    print("✓ Pipeline complete")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    pdfs = list(PDF_DIR.glob("*.pdf")) if PDF_DIR.exists() else []
    xls = list(EXCEL_DIR.glob("*.xlsx")) if EXCEL_DIR.exists() else []
    tel = [p for p in pdfs if "TEL-" in p.name.upper()]
    eng = [p for p in pdfs if "ENG-" in p.name.upper()]
    done = {p.stem for p in xls}
    pending = [p for p in pdfs if p.stem not in done]
    print(f"PDFs:      {len(pdfs)}  (TEL={len(tel)} ENG={len(eng)})")
    print(f"Extracted: {len(done)} excel files in {EXCEL_DIR}")
    print(f"Pending:   {len(pending)}")
    if pending[:8]:
        print("  next:", ", ".join(p.name for p in pending[:8]))
    va = OUT_DIR / "voters_all.xlsx"
    print(f"Combined:  {'yes' if va.exists() else 'no'} {va}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Extract Kukatpally voter PDFs to Excel (hybrid OCR for Telugu)"
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_un = sub.add_parser("unzip", help="Unzip voter_pdf/*.zip into voter_pdf/pdfs/")
    p_un.set_defaults(func=cmd_unzip)

    p_st = sub.add_parser("status", help="Show PDF / Excel progress")
    p_st.set_defaults(func=cmd_status)

    def add_run_flags(p: argparse.ArgumentParser) -> None:
        p.add_argument(
            "--engine",
            default="auto",
            choices=["auto", "hybrid", "easyocr", "vision", "rapid"],
            help="auto → hybrid for TEL, vision for ENG",
        )
        p.add_argument("--workers", type=int, default=1)
        p.add_argument("--max-width", type=int, default=1200)
        p.add_argument("--limit", type=int, default=0, help="Only first N PDFs")
        p.add_argument(
            "--skip-existing",
            action="store_true",
            help="Skip PDFs that already have Excel output",
        )
        p.add_argument("--pdf", action="append", default=None, help="Specific PDF path(s)")
        p.add_argument("--no-combined", action="store_true")
        p.add_argument("--no-dims", action="store_true", help="Skip dimension map step")

    p_run = sub.add_parser("run", help="OCR extract PDFs → Excel")
    add_run_flags(p_run)
    p_run.set_defaults(func=cmd_run)

    p_pipe = sub.add_parser(
        "pipeline",
        help="unzip(optional) → extract → cover → serials → dims → web data",
    )
    add_run_flags(p_pipe)
    p_pipe.add_argument(
        "--unzip-first",
        action="store_true",
        help="Unzip archives before extract",
    )
    p_pipe.set_defaults(func=cmd_pipeline)

    args = ap.parse_args()
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
