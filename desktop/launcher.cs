// 德州扑克 Windows 桌面启动器（B2 方案）
// 用 Chrome / Edge 的 --app 模式打开内嵌的游戏页面，无地址栏、无标签栏。
// 编译：csc /target:winexe /define:GUI /resource:poker.html,PokerHtml launcher.cs
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

internal static class Launcher
{
    private const string AppDirName = "TexasHoldem";
    private const string ResName = "PokerHtml";
    private const string HtmlName = "poker.html";
    private const string ShortcutName = "德州扑克";
    private const int WindowW = 1366;
    private const int WindowH = 860;

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);

    private static bool _noShortcut;
    private static bool _dryRun;

    private static int Main(string[] args)
    {
        try
        {
            return Run(args);
        }
        catch (Exception ex)
        {
            Fail("启动失败：" + ex.Message + "\r\n\r\n" + ex.GetType().Name);
            return 1;
        }
    }

    private static int Run(string[] args)
    {
        string forcedBrowser = null;
        string extractOnly = null;
        string dataDirOverride = null;

        for (int i = 0; i < args.Length; i++)
        {
            string a = args[i];
            if (a == "--dry-run") { _dryRun = true; }
            else if (a == "--no-shortcut") { _noShortcut = true; }
            else if (a == "--browser" && i + 1 < args.Length) { forcedBrowser = args[++i]; }
            else if (a == "--extract-only" && i + 1 < args.Length) { extractOnly = args[++i]; }
            else if (a == "--data-dir" && i + 1 < args.Length) { dataDirOverride = args[++i]; }
            else if (a == "--help" || a == "-h")
            {
                Console.WriteLine("用法：德州扑克.exe [--dry-run] [--browser <路径>] [--no-shortcut]");
                Console.WriteLine("     德州扑克.exe --extract-only <目录>");
                Console.WriteLine("     德州扑克.exe --data-dir <目录>");
                return 0;
            }
        }

        string exeDir = ExeDir();
        string dataDir = string.IsNullOrEmpty(dataDirOverride)
            ? DefaultDataDir()
            : Path.GetFullPath(dataDirOverride);

        // 1. 决定用哪份 HTML：exe 同目录的 poker.html 优先，否则用内嵌资源
        string htmlPath;
        string srcInfo;
        string overridePath = Path.Combine(exeDir, HtmlName);
        if (File.Exists(overridePath))
        {
            htmlPath = overridePath;
            srcInfo = "external";
        }
        else
        {
            htmlPath = Path.Combine(dataDir, HtmlName);
            srcInfo = "embedded";
            // dry-run 不落盘：只算内嵌资源的 sha 用于报告
            if (!_dryRun && extractOnly == null)
            {
                string embeddedSha = Sha256Of(ReadResource());
                Directory.CreateDirectory(dataDir);
                if (!File.Exists(htmlPath) || Sha256OfFile(htmlPath) != embeddedSha)
                {
                    WriteResourceTo(htmlPath);
                }
            }
        }

        // 2. --extract-only：只解出并按 sha256 校验
        if (extractOnly != null)
        {
            Directory.CreateDirectory(extractOnly);
            string target = Path.Combine(extractOnly, HtmlName);
            WriteResourceTo(target);
            Console.WriteLine("extracted=" + target);
            Console.WriteLine("sha256=" + Sha256OfFile(target));
            return 0;
        }

        // dry-run 时目标文件可能还没解出来，用内嵌资源的 sha 顶上
        string sha = File.Exists(htmlPath) ? Sha256OfFile(htmlPath) : Sha256Of(ReadResource());
        string url = new Uri(htmlPath).AbsoluteUri;
        string profile = Path.Combine(dataDir, "profile");

        // 3. 找浏览器
        string browser = FindBrowser(forcedBrowser);

        // 浏览器命令行只在这里算一次，dry-run 报告与实际启动共用，避免两处漂移
        string arguments = BuildArguments(url, profile);

        if (_dryRun)
        {
            StringBuilder sb = new StringBuilder();
            sb.Append("{");
            JsonAdd(sb, "ok", browser != null ? "true" : "false", true);
            JsonAdd(sb, "browser", browser == null ? "" : browser, false);
            JsonAdd(sb, "url", url, false);
            JsonAdd(sb, "htmlPath", htmlPath, false);
            JsonAdd(sb, "htmlSource", srcInfo, false);
            JsonAdd(sb, "profileDir", profile, false);
            JsonAdd(sb, "sha256", sha, false);
            JsonAdd(sb, "exePath", Path.Combine(exeDir, ExeName()), false);
            JsonAdd(sb, "args", arguments, false);
            sb.Append("}");
            Console.WriteLine(sb.ToString());
            return browser == null ? 2 : 0;
        }

        if (browser == null)
        {
            Fail("没有找到 Chrome 或 Edge。\r\n\r\n"
                 + "本游戏用 Chrome/Edge 的应用窗口模式显示，需要机器上装有其中之一。\r\n"
                 + "Windows 自带的 Edge 通常已经满足要求。\r\n\r\n"
                 + "也可设置环境变量 POKER_BROWSER 指向浏览器 exe 的完整路径。");
            return 2;
        }

        // 4. 快捷方式（自愈：目标变了就重写）
        if (!_noShortcut)
        {
            try
            {
                EnsureShortcuts(Path.Combine(exeDir, ExeName()));
            }
            catch
            {
                // 建快捷方式失败不影响启动
            }
        }

        // 5. 启动
        ProcessStartInfo psi = new ProcessStartInfo(browser, arguments);
        psi.UseShellExecute = false;
        psi.WorkingDirectory = exeDir;
        Process.Start(psi);
        return 0;
    }

    // 传给浏览器的完整命令行。--app 的 URL 与 profile 路径都带引号，
    // 因为两者都可能含空格（用户名、安装目录）。
    private static string BuildArguments(string url, string profile)
    {
        return "--app=\"" + url + "\""
             + " --user-data-dir=\"" + profile + "\""
             + " --no-first-run --no-default-browser-check"
             + " --disable-features=Translate"
             + " --window-size=" + WindowW + "," + WindowH;
    }

    // ---------- 路径 ----------

    private static string ExeDir()
    {
        string loc = Assembly.GetExecutingAssembly().Location;
        if (string.IsNullOrEmpty(loc))
        {
            loc = Environment.GetCommandLineArgs()[0];
        }
        return Path.GetDirectoryName(Path.GetFullPath(loc));
    }

    private static string ExeName()
    {
        return Path.GetFileName(Assembly.GetExecutingAssembly().Location);
    }

    private static string DefaultDataDir()
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(local, AppDirName);
    }

    // ---------- 资源 ----------

    private static byte[] ReadResource()
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        using (Stream s = asm.GetManifestResourceStream(ResName))
        {
            if (s == null)
            {
                throw new InvalidOperationException("exe 内没有找到内嵌资源 " + ResName);
            }
            using (MemoryStream ms = new MemoryStream())
            {
                byte[] buf = new byte[81920];
                int n;
                while ((n = s.Read(buf, 0, buf.Length)) > 0)
                {
                    ms.Write(buf, 0, n);
                }
                return ms.ToArray();
            }
        }
    }

    private static void WriteResourceTo(string path)
    {
        byte[] data = ReadResource();
        string dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }
        // 先写临时文件再替换，避免半截文件
        string tmp = path + ".tmp";
        File.WriteAllBytes(tmp, data);
        if (File.Exists(path))
        {
            File.Delete(path);
        }
        File.Move(tmp, path);
    }

    private static string Sha256Of(byte[] data)
    {
        using (SHA256 sha = SHA256.Create())
        {
            byte[] h = sha.ComputeHash(data);
            StringBuilder sb = new StringBuilder(h.Length * 2);
            for (int i = 0; i < h.Length; i++)
            {
                sb.Append(h[i].ToString("x2", CultureInfo.InvariantCulture));
            }
            return sb.ToString();
        }
    }

    private static string Sha256OfFile(string path)
    {
        if (!File.Exists(path))
        {
            return "";
        }
        using (FileStream fs = File.OpenRead(path))
        using (SHA256 sha = SHA256.Create())
        {
            byte[] h = sha.ComputeHash(fs);
            StringBuilder sb = new StringBuilder(h.Length * 2);
            for (int i = 0; i < h.Length; i++)
            {
                sb.Append(h[i].ToString("x2", CultureInfo.InvariantCulture));
            }
            return sb.ToString();
        }
    }

    // ---------- 浏览器探测 ----------

    private static string FindBrowser(string forced)
    {
        if (!string.IsNullOrEmpty(forced))
        {
            if (File.Exists(forced))
            {
                return forced;
            }
            // 指定了但不存在，直接失败，不要静默回退到别的浏览器
            return null;
        }

        string env = Environment.GetEnvironmentVariable("POKER_BROWSER");
        if (!string.IsNullOrEmpty(env) && File.Exists(env))
        {
            return env;
        }

        string[] exes = new string[] { "chrome.exe", "msedge.exe" };
        for (int i = 0; i < exes.Length; i++)
        {
            string found = FromRegistry(exes[i]);
            if (found != null)
            {
                return found;
            }
        }

        string[] candidates = CommonPaths();
        for (int i = 0; i < candidates.Length; i++)
        {
            if (File.Exists(candidates[i]))
            {
                return candidates[i];
            }
        }

        return null;
    }

    private static string FromRegistry(string exe)
    {
        string[] subKeys = new string[]
        {
            @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe,
            @"SOFTWARE\Wow6432Node\Microsoft\Windows\CurrentVersion\App Paths\" + exe,
        };
        RegistryKey[] roots = new RegistryKey[] { Registry.LocalMachine, Registry.CurrentUser };

        for (int r = 0; r < roots.Length; r++)
        {
            for (int k = 0; k < subKeys.Length; k++)
            {
                try
                {
                    using (RegistryKey key = roots[r].OpenSubKey(subKeys[k]))
                    {
                        if (key == null)
                        {
                            continue;
                        }
                        object v = key.GetValue("");
                        string s = v as string;
                        if (!string.IsNullOrEmpty(s) && File.Exists(s))
                        {
                            return s;
                        }
                    }
                }
                catch
                {
                    // 权限不足等情况，继续找
                }
            }
        }
        return null;
    }

    private static string[] CommonPaths()
    {
        string pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
        string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "";
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

        return new string[]
        {
            Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(local, @"Google\Chrome\Application\chrome.exe"),
            Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"),
            Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"),
        };
    }

    // ---------- 快捷方式 ----------

    private static void EnsureShortcuts(string exePath)
    {
        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);

        EnsureOne(Path.Combine(desktop, ShortcutName + ".lnk"), exePath);
        if (!string.IsNullOrEmpty(startMenu))
        {
            EnsureOne(Path.Combine(startMenu, ShortcutName + ".lnk"), exePath);
        }
    }

    private static void EnsureOne(string lnkPath, string exePath)
    {
        if (File.Exists(lnkPath))
        {
            string cur = ReadShortcutTarget(lnkPath);
            if (string.Equals(cur, exePath, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }
        }

        Type t = Type.GetTypeFromProgID("WScript.Shell");
        if (t == null)
        {
            return;
        }
        object shell = Activator.CreateInstance(t);
        object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell,
                                    new object[] { lnkPath });
        Type lt = lnk.GetType();
        lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { exePath });
        lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk,
                        new object[] { Path.GetDirectoryName(exePath) });
        lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk,
                        new object[] { exePath + ",0" });
        lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk,
                        new object[] { "德州扑克" });
        lt.InvokeMember("WindowStyle", BindingFlags.SetProperty, null, lnk, new object[] { 1 });
        lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
    }

    private static string ReadShortcutTarget(string lnkPath)
    {
        try
        {
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            if (t == null)
            {
                return null;
            }
            object shell = Activator.CreateInstance(t);
            object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell,
                                        new object[] { lnkPath });
            object v = lnk.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, lnk, null);
            return v as string;
        }
        catch
        {
            return null;
        }
    }

    // ---------- 输出 ----------

    private static void JsonAdd(StringBuilder sb, string key, string val, bool first)
    {
        if (!first)
        {
            sb.Append(",");
        }
        sb.Append("\"").Append(key).Append("\":\"").Append(JsonEscape(val)).Append("\"");
    }

    private static string JsonEscape(string s)
    {
        if (s == null)
        {
            return "";
        }
        StringBuilder sb = new StringBuilder(s.Length + 8);
        for (int i = 0; i < s.Length; i++)
        {
            char c = s[i];
            switch (c)
            {
                case '\\': sb.Append("\\\\"); break;
                case '"': sb.Append("\\\""); break;
                case '\r': sb.Append("\\r"); break;
                case '\n': sb.Append("\\n"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20)
                    {
                        sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    }
                    else
                    {
                        sb.Append(c);
                    }
                    break;
            }
        }
        return sb.ToString();
    }

    private static void Fail(string msg)
    {
#if GUI
        MessageBoxW(IntPtr.Zero, msg, "德州扑克", 0x00000010u);
#else
        Console.Error.WriteLine(msg);
#endif
    }
}
