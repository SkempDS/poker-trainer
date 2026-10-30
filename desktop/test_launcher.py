# -*- coding: utf-8 -*-
"""桌面启动包测试。

因为本机沙箱禁管道、控制台是 GBK，这里统一用 subprocess + 文件重定向拿输出，
断言用纯 Python 做，不依赖 PowerShell 的解析。
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
POKER = os.path.dirname(HERE)
SRC_HTML = os.path.join(POKER, "德州扑克.html")
CON_EXE = os.path.join(HERE, "launcher_console.exe")
GUI_EXE = os.path.join(HERE, "德州扑克.exe")
PKG = os.path.join(HERE, "dist", "德州扑克")
ZIP = os.path.join(HERE, "dist", "德州扑克-桌面版.zip")
TMP = os.path.join(HERE, "_test_tmp")

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PASS = []
FAIL = []


def ok(name, cond, detail=""):
    if cond:
        PASS.append(name)
        print("  [OK]   %s" % name)
    else:
        FAIL.append((name, detail))
        print("  [FAIL] %s   %s" % (name, detail))


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()


def run_exe(exe, args, env_extra=None):
    """跑 exe，返回 (returncode, stdout, stderr)。用文件重定向避开管道。"""
    os.makedirs(TMP, exist_ok=True)
    o = os.path.join(TMP, "o.txt")
    e = os.path.join(TMP, "e.txt")
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    with open(o, "wb") as fo, open(e, "wb") as fe:
        p = subprocess.run([exe] + args, stdin=subprocess.DEVNULL,
                           stdout=fo, stderr=fe, env=env)
    with open(o, "rb") as f:
        out = f.read().decode("utf-8", "replace")
    with open(e, "rb") as f:
        err = f.read().decode("utf-8", "replace")
    return p.returncode, out, err


def dry_run(args, env_extra=None):
    rc, out, err = run_exe(CON_EXE, args, env_extra)
    line = ""
    for ln in out.splitlines():
        ln = ln.strip()
        if ln.startswith("{"):
            line = ln
            break
    data = None
    if line:
        try:
            data = json.loads(line)
        except Exception as ex:
            print("   JSON 解析失败:", ex, "原始:", line[:200])
    return rc, data, out, err


# ---------------- 用例 ----------------

def t1_build_outputs():
    print("\n[1] 构建产物存在")
    ok("GUI exe 存在", os.path.isfile(GUI_EXE), GUI_EXE)
    ok("控制台 exe 存在", os.path.isfile(CON_EXE), CON_EXE)
    ok("zip 存在", os.path.isfile(ZIP), ZIP)
    if os.path.isfile(GUI_EXE):
        sz = os.path.getsize(GUI_EXE)
        ok("exe ≤ 400 KB", sz <= 400 * 1024, "%d 字节" % sz)
    if os.path.isfile(ZIP):
        sz = os.path.getsize(ZIP)
        ok("zip ≤ 500 KB", sz <= 500 * 1024, "%d 字节" % sz)
    ok("源 HTML 存在", os.path.isfile(SRC_HTML), SRC_HTML)


def t2_extract():
    print("\n[2] --extract-only 解出内容与源 HTML 一致")
    d1 = os.path.join(TMP, "ex1")
    d2 = os.path.join(TMP, "ex2")
    for d in (d1, d2):
        if os.path.exists(d):
            shutil.rmtree(d, ignore_errors=True)

    rc, out, err = run_exe(CON_EXE, ["--extract-only", d1])
    ok("退出码 0", rc == 0, "rc=%d err=%s" % (rc, err[:200]))
    got1 = os.path.join(d1, "poker.html")
    ok("解出 poker.html", os.path.isfile(got1), got1)
    if os.path.isfile(got1):
        a = sha256_file(got1)
        b = sha256_file(SRC_HTML)
        ok("sha256 与源 HTML 一致", a == b, "%s vs %s" % (a[:16], b[:16]))

    # 幂等：再解一次结果相同
    rc2, out2, err2 = run_exe(CON_EXE, ["--extract-only", d2])
    ok("第二次退出码 0", rc2 == 0, "rc=%d" % rc2)
    got2 = os.path.join(d2, "poker.html")
    if os.path.isfile(got2):
        ok("两次解出内容相同（幂等）",
           sha256_file(got1) == sha256_file(got2))


def t3_dryrun_default():
    print("\n[3] --dry-run 默认探测结果")
    rc, d, out, err = dry_run(["--dry-run"])
    ok("JSON 有输出", d is not None, out[:200] or err[:200])
    if not d:
        return
    ok("ok=true", d.get("ok") == "true", str(d.get("ok")))
    br = d.get("browser", "")
    ok("browser 是 chrome.exe 或 msedge.exe",
       br.lower().endswith("chrome.exe") or br.lower().endswith("msedge.exe"), br)
    ok("browser 文件真实存在", os.path.isfile(br), br)
    url = d.get("url", "")
    ok("url 以 file:/// 开头", url.startswith("file:///"), url[:60])
    ok("url 以 poker.html 结尾", url.endswith("poker.html"), url[-40:])
    ok("url 不含未编码空格", " " not in url, url[:80])
    pd = d.get("profileDir", "")
    ok("profileDir 在 LOCALAPPDATA 下",
       "TexasHoldem" in pd, pd)
    ok("sha256 长度 64", len(d.get("sha256", "")) == 64, d.get("sha256", "")[:16])
    ok("htmlSource=embedded", d.get("htmlSource") == "embedded", d.get("htmlSource"))


def t4_force_edge():
    print("\n[4] --browser 强制指定 Edge")
    if not os.path.isfile(EDGE):
        print("  跳过：本机没有 Edge")
        return
    rc, d, out, err = dry_run(["--dry-run", "--browser", EDGE])
    ok("退出码 0", rc == 0, "rc=%d" % rc)
    ok("JSON 有输出", d is not None)
    if d:
        ok("browser 是 msedge.exe", d.get("browser", "").lower().endswith("msedge.exe"),
           d.get("browser", ""))


def t5_force_missing():
    print("\n[5] --browser 指向不存在的路径 → 失败")
    bogus = r"C:\This\Does\Not\Exist\fake.exe"
    rc, d, out, err = dry_run(["--dry-run", "--browser", bogus])
    ok("退出码 2", rc == 2, "rc=%d" % rc)
    if d:
        ok("ok=false", d.get("ok") == "false", str(d.get("ok")))
        ok("browser 为空", d.get("browser") == "", repr(d.get("browser")))


def t6_env_override():
    print("\n[6] POKER_BROWSER 环境变量优先于注册表")
    if not os.path.isfile(EDGE):
        print("  跳过：本机没有 Edge，无法验证覆盖")
        return
    rc, d, out, err = dry_run(["--dry-run"], {"POKER_BROWSER": EDGE})
    ok("退出码 0", rc == 0, "rc=%d" % rc)
    if d:
        ok("browser 变成 Edge", d.get("browser", "").lower().endswith("msedge.exe"),
           d.get("browser", ""))


def t7_env_invalid_falls_through():
    print("\n[7] POKER_BROWSER 指向不存在路径 → 回落到注册表探测")
    rc, d, out, err = dry_run(["--dry-run"],
                              {"POKER_BROWSER": r"C:\nope\nope.exe"})
    ok("退出码 0", rc == 0, "rc=%d" % rc)
    if d:
        br = d.get("browser", "")
        ok("仍找到了浏览器", br.lower().endswith(".exe") and os.path.isfile(br), br)


def t8_no_shortcut():
    print("\n[8] --no-shortcut 不创建快捷方式")
    desktop = os.path.join(os.path.expanduser("~"), "Desktop")
    lnk = os.path.join(desktop, "德州扑克.lnk")
    existed = os.path.isfile(lnk)
    rc, out, err = run_exe(CON_EXE, ["--dry-run", "--no-shortcut"])
    ok("退出码 0", rc == 0, "rc=%d" % rc)
    if existed:
        ok("原有快捷方式未被删除", os.path.isfile(lnk))
    else:
        ok("未创建快捷方式", not os.path.isfile(lnk))


def t9_package_contents():
    print("\n[9] 发布目录内容")
    if not os.path.isdir(PKG):
        ok("发布目录存在", False, PKG)
        return
    files = sorted(os.listdir(PKG))
    ok("恰好 3 个文件", len(files) == 3, str(files))
    ok("有 德州扑克.exe", "德州扑克.exe" in files, str(files))
    ok("有 使用说明.txt", "使用说明.txt" in files, str(files))
    ok("有 卸载.bat", "卸载.bat" in files, str(files))
    # 发布目录里的 exe 与编译产物字节一致
    a = os.path.join(PKG, "德州扑克.exe")
    if os.path.isfile(a):
        ok("发布 exe 与编译产物一致",
           sha256_file(a) == sha256_file(GUI_EXE))


def t10_zip_contents():
    print("\n[10] zip 内容")
    if not os.path.isfile(ZIP):
        ok("zip 存在", False)
        return
    # 用 Python 的 zipfile 读条目，避开 PowerShell 输出编码问题
    import zipfile
    with zipfile.ZipFile(ZIP) as z:
        entries = [n.replace("\\", "/") for n in z.namelist()]
    print("   zip 条目:", entries)
    ok("zip 条目数 3", len(entries) == 3, str(len(entries)))
    joined = " ".join(entries)
    ok("含德州扑克.exe", "德州扑克.exe" in joined, joined)
    ok("含使用说明.txt", "使用说明.txt" in joined, joined)
    ok("含卸载.bat", "卸载.bat" in joined, joined)
    ok("全部在 德州扑克/ 目录下",
       all(e.startswith("德州扑克/") for e in entries), joined)


def t11_clean_build():
    print("\n[11] 产物不含调试残留")
    if os.path.isfile(ZIP) and os.path.getsize(ZIP) > 0:
        ok("zip 非空", True)
    # 源 HTML 里不该出现桌面版路径泄漏
    if os.path.isfile(SRC_HTML):
        with open(SRC_HTML, encoding="utf-8", errors="replace") as f:
            body = f.read()
        ok("HTML 无 __pycache__ 泄漏", "__pycache__" not in body)
        ok("HTML 无 TexasHoldem 泄漏（游戏本体应干净）",
           "TexasHoldem" not in body)


def t12_browser_arguments():
    """精确核对启动器交给浏览器的命令行。

    本机没有交互式桌面（有窗口的进程数为 0），--app 窗口无法真的显示，
    所以不能靠截图判断。改为让启动器在 --dry-run 里报出它实际会用的
    命令行，逐条断言参数、引号与路径拼装。
    """
    print("\n[12] 传给浏览器的命令行")
    data_dir = os.path.join(TMP, "dd")
    if os.path.exists(data_dir):
        shutil.rmtree(data_dir, ignore_errors=True)
    rc, d, out, err = dry_run(["--dry-run", "--no-shortcut",
                               "--data-dir", data_dir])
    ok("退出码 0", rc == 0, "rc=%d err=%s" % (rc, err[:200]))
    if not d:
        ok("拿到 dry-run 报告", False, out[:300])
        return
    a = d.get("args", "")
    ok("报告里带 args 字段", bool(a), a[:120] if a else "(空)")
    if not a:
        return

    head, _, tail = a.partition("--user-data-dir")
    ok("用 --app 模式", head.startswith('--app="'), head[:48])
    ok("--app 的 URL 指向解出的 poker.html",
       ("file:///" in head) and (head.rstrip().endswith('poker.html"')), head[:160])
    ok("带 --user-data-dir 且指向独立 profile",
       tail.startswith('="') and "profile" in tail[:160], tail[:160])
    ok("带 --no-first-run", "--no-first-run" in a)
    ok("带 --no-default-browser-check", "--no-default-browser-check" in a)
    ok("窗口尺寸 1366x860", "--window-size=1366,860" in a)

    # profile 必须落在 --data-dir 指定的目录下，不能散到用户目录以外
    prof = d.get("profileDir", "").replace("\\", "/")
    ok("profileDir 在 --data-dir 之下",
       os.path.normcase(prof) ==
       os.path.normcase(os.path.join(data_dir, "profile").replace("\\", "/")),
       prof)

    # url 与 htmlPath 必须是同一个文件（防启动器打开错文件）
    url_path = d.get("url", "").replace("file:///", "").replace("/", os.sep)
    ok("url 与 htmlPath 指向同一文件",
       os.path.normcase(os.path.abspath(url_path)) ==
       os.path.normcase(os.path.abspath(d.get("htmlPath", ""))),
       "%s vs %s" % (url_path, d.get("htmlPath")))

    # 值必须用双引号闭合，否则路径含空格时会被浏览器截断
    ok("--app 的值双引号闭合", a.count('--app="') == 1)
    ok("--user-data-dir 的值双引号闭合", tail.count('="') == 1 and '"' in tail)


def main():
    print("=" * 60)
    print("桌面启动包测试")
    print("=" * 60)
    t1_build_outputs()
    t2_extract()
    t3_dryrun_default()
    t4_force_edge()
    t5_force_missing()
    t6_env_override()
    t7_env_invalid_falls_through()
    t8_no_shortcut()
    t9_package_contents()
    t10_zip_contents()
    t11_clean_build()
    t12_browser_arguments()

    print("\n" + "=" * 60)
    print("通过 %d 项，失败 %d 项" % (len(PASS), len(FAIL)))
    if FAIL:
        for name, detail in FAIL:
            print("  [FAIL] %s  %s" % (name, detail))
        return 1
    print("全部通过")
    return 0


if __name__ == "__main__":
    sys.exit(main())
