"""Render workaround: when Build Command is still `pip install -r requirements.txt`,
this local package runs the real Vite build (npm is already on the image).
"""
from __future__ import annotations

import subprocess
from pathlib import Path

from setuptools import setup
from setuptools.command.install import install as _install

WEB_ROOT = Path(__file__).resolve().parent.parent


def run_vite_build() -> None:
    print("==> kphb: running npm ci + vite build via pip hook", flush=True)
    subprocess.check_call(["npm", "ci", "--include=dev"], cwd=str(WEB_ROOT))
    subprocess.check_call(["npm", "run", "build"], cwd=str(WEB_ROOT))
    dist = WEB_ROOT / "dist" / "index.html"
    if not dist.is_file():
        raise SystemExit(f"Build failed: missing {dist}")
    print(f"==> kphb: build ok → {dist}", flush=True)


class InstallWithVite(_install):
    def run(self) -> None:
        run_vite_build()
        _install.run(self)


# Also run at import/build time (PEP517 may skip custom install cmd).
run_vite_build()

setup(
    name="kphb-render-npm-build",
    version="0.0.1",
    description="Triggers Vite build during pip install on Render",
    cmdclass={"install": InstallWithVite},
    py_modules=[],
)
