# -*- coding: utf-8 -*-
"""一键构建德州扑克 Windows 桌面启动包。

步骤：
  1. 调 poker/build.py 生成单文件 德州扑克.html
  2. 生成 icon.ico
  3. csc 编译两个 exe（GUI 版发布用 / 控制台版测试用）
  4. 组 dist 目录
  5. Compress-Archive 出 zip
"""
import hashlib
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
POKER = os.path.dirname(HERE)
SRC_HTML = os.path.join(POKER, "德州扑克.html")
DIST = os.path.join(HERE, "dist")
PKG_NAME = "德州扑克"
PKG = os.path.join(DIST, PKG_NAME)
ZIP = os.path.join(DIST, "德州扑克-桌面版.zip")

CSC = r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
PY = sys.executable

# Windows 控制台默认 GBK，打印外部命令输出里的替换字符会炸。
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def run(cmd, cwd=None):
    """跑外部命令。

    本机沙箱禁止创建管道，所以不能用 capture_output，
    改成把 stdout/stderr 重定向到临时文件再读回来。
    """
    print("\n$", " ".join(cmd) if isinstance(cmd, list) else cmd)
    # 沙箱只允许写工作区；mkdtemp 建的目录 ACL 不继承，写不进去。
    # 所以用固定目录 + 固定文件名（构建是串行的，不会冲突）。
    tmpdir = os.path.join(HERE, "_tmp")
    os.makedirs(tmpdir, exist_ok=True)
    out_path = os.path.join(tmpdir, "out.txt")
    err_path = os.path.join(tmpdir, "err.txt")

    with open(out_path, "wb") as fo, open(err_path, "wb") as fe:
        p = subprocess.run(cmd, cwd=cwd, stdin=subprocess.DEVNULL,
                           stdout=fo, stderr=fe)
    with open(out_path, "rb") as f:
        out = f.read().decode("utf-8", "replace")
    with open(err_path, "rb") as f:
        err = f.read().decode("utf-8", "replace")

    text = (out or "") + (err or "")
    if text.strip():
        print(text.strip())
    if p.returncode != 0:
        raise SystemExit("命令失败，退出码 %d" % p.returncode)
    return text


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def step_build_html():
    print("\n=== 1/5 生成单文件 HTML ===")
    run([PY, "build.py"], cwd=POKER)
    if not os.path.exists(SRC_HTML):
        raise SystemExit("没有产出 " + SRC_HTML)
    size = os.path.getsize(SRC_HTML)
    print("HTML: %d 字节  sha256=%s" % (size, sha256_of(SRC_HTML)[:16]))
    return size


def step_icon():
    print("\n=== 2/5 生成图标 ===")
    ico = os.path.join(HERE, "icon.ico")
    if os.path.exists(ico) and os.path.getmtime(ico) > os.path.getmtime(
            os.path.join(HERE, "make_icon.py")):
        print("图标已存在且比脚本新，跳过:", ico)
        return ico
    run([PY, "make_icon.py"], cwd=HERE)
    return ico


def step_compile(ico):
    print("\n=== 3/5 编译启动器 ===")
    if not os.path.exists(CSC):
        raise SystemExit("找不到 C# 编译器：" + CSC)

    gui_exe = os.path.join(HERE, "德州扑克.exe")
    con_exe = os.path.join(HERE, "launcher_console.exe")

    common = [
        "/nologo",
        "/codepage:65001",
        "/resource:" + SRC_HTML + ",PokerHtml",
        "/reference:System.dll",
        "/reference:System.Core.dll",
    ]

    # GUI 版：双击不弹黑框，错误走 MessageBox
    run([CSC] + common + [
        "/target:winexe", "/define:GUI", "/win32icon:" + ico,
        "/out:" + gui_exe, "launcher.cs",
    ], cwd=HERE)

    # 控制台版：测试用，能拿 stdout，不放进发布包
    run([CSC] + common + [
        "/target:exe",
        "/out:" + con_exe, "launcher.cs",
    ], cwd=HERE)

    gsz = os.path.getsize(gui_exe)
    csz = os.path.getsize(con_exe)
    print("GUI exe: %d 字节 (%.0f KB)" % (gsz, gsz / 1024.0))
    print("控制台 exe: %d 字节 (%.0f KB)" % (csz, csz / 1024.0))
    return gui_exe, con_exe


def step_package(gui_exe):
    print("\n=== 4/5 组织发布目录 ===")
    if os.path.exists(PKG):
        shutil.rmtree(PKG)
    os.makedirs(PKG)

    final_exe = os.path.join(PKG, "德州扑克.exe")
    shutil.copy2(gui_exe, final_exe)

    readme = os.path.join(HERE, "使用说明.txt")
    if os.path.exists(readme):
        shutil.copy2(readme, os.path.join(PKG, "使用说明.txt"))

    uninst = os.path.join(HERE, "卸载.bat")
    if os.path.exists(uninst):
        shutil.copy2(uninst, os.path.join(PKG, "卸载.bat"))

    for name in sorted(os.listdir(PKG)):
        p = os.path.join(PKG, name)
        print("  %-16s %8d 字节" % (name, os.path.getsize(p)))
    return final_exe


def step_zip():
    print("\n=== 5/5 打 zip ===")
    if os.path.exists(ZIP):
        os.remove(ZIP)
    # 用 PowerShell 压缩；Compress-Archive 对中文路径处理稳定
    ps = (
        "$ErrorActionPreference='Stop';"
        "Compress-Archive -Path '%s' -DestinationPath '%s' -CompressionLevel Optimal"
        % (PKG, ZIP)
    )
    run(["powershell", "-NoProfile", "-Command", ps])
    zsz = os.path.getsize(ZIP)
    print("zip: %d 字节 (%.0f KB)" % (zsz, zsz / 1024.0))
    return zsz


def main():
    os.makedirs(os.path.join(HERE, "_tmp"), exist_ok=True)
    html_size = step_build_html()
    ico = step_icon()
    gui_exe, con_exe = step_compile(ico)
    final_exe = step_package(gui_exe)
    zip_size = step_zip()

    print("\n" + "=" * 52)
    print("构建完成")
    print("  HTML      : %d 字节" % html_size)
    print("  exe       : %d 字节 (%.0f KB)" % (os.path.getsize(final_exe),
                                              os.path.getsize(final_exe) / 1024.0))
    print("  zip       : %d 字节 (%.0f KB)" % (zip_size, zip_size / 1024.0))
    print("  发布目录  : %s" % PKG)
    print("  分发文件  : %s" % ZIP)
    print("  测试用 exe: %s" % con_exe)
    print("=" * 52)


if __name__ == "__main__":
    main()
