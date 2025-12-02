# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['local_server.py'],
    pathex=[],
    binaries=[],
    datas=[('config.py', '.'), ('main.py', '.'), ('routers', 'routers'), ('services', 'services'), ('schemas', 'schemas'), ('database', 'database'), ('models', 'models'), ('middleware', 'middleware'), ('utils', 'utils'), ('analyzer', 'analyzer')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['playwright', 'selenium', 'tkinter'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='BlogIndexAnalyzer',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
