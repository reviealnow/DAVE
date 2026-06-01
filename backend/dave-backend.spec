# dave-backend.spec — PyInstaller build for the DAVE desktop backend sidecar.
#
# Produces a single-file binary `dave-backend` that the Tauri shell spawns as a
# sidecar. Build from the repo root:
#
#     .venv/bin/pyinstaller backend/dave-backend.spec --noconfirm
#
# Then copy dist/dave-backend to
#     desktop/src-tauri/binaries/dave-backend-<target-triple>
# (e.g. dave-backend-aarch64-apple-darwin) so Tauri can bundle it.
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

REPO = Path(SPECPATH).resolve().parent  # spec lives in backend/ → REPO is repo root
BACKEND = REPO / "backend"

# Read-only resources the backend reads at runtime (see app.config.RESOURCE_ROOT
# and app.versioning). Laid out under the bundle root to match RESOURCE_ROOT.
datas = [
    (str(REPO / "VERSION"), "."),
    (str(REPO / "release.json"), "."),
    (str(REPO / "tools" / "analyzer3.py"), "tools"),
    (str(REPO / "tools" / "log_event_detector.py"), "tools"),
]
binaries = []
hiddenimports = collect_submodules("uvicorn") + collect_submodules("app")

# matplotlib (used by tools/analyzer3.py) ships data + fonts that must be bundled.
mpl_datas, mpl_binaries, mpl_hidden = collect_all("matplotlib")
datas += mpl_datas
binaries += mpl_binaries
hiddenimports += mpl_hidden

a = Analysis(
    [str(BACKEND / "desktop_backend.py")],
    pathex=[str(BACKEND)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="dave-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
