using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Runtime.InteropServices.ComVisible(false)]

namespace NetPlusLauncher
{
    static class Config
    {
        public const string APP_URL        = "http://localhost:3000/login"; // netplus-desk Next.js login
        public const string HEALTH_URL     = "http://localhost:3000";       // health check
        public const string APP_TITLE      = "NetPlus";
        public const string COMPOSE_DIR    = "frappe_docker";
    }

    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TrayApp());
        }
    }

    class TrayApp : ApplicationContext
    {
        NotifyIcon  _tray;
        ContextMenu _menu;
        Form        _hidden;   // invisible form — needed for thread-safe Invoke

        public TrayApp()
        {
            // Hidden form gives us a proper Win32 HWND for cross-thread marshalling
            _hidden = new Form();
            _hidden.ShowInTaskbar = false;
            _hidden.WindowState   = FormWindowState.Minimized;
            _hidden.Opacity       = 0;
            _hidden.Show();
            _hidden.Hide();

            _menu = new ContextMenu(new[]
            {
                new MenuItem("Ouvrir NetPlus",  OnOpen),
                new MenuItem("-"),
                new MenuItem("Arreter NetPlus", OnStop),
                new MenuItem("Quitter",         OnQuit),
            });

            // Load custom icon (embedded in exe via /win32icon, also on disk as fallback)
            System.Drawing.Icon appIcon = null;
            try
            {
                string icoPath = Path.Combine(ExeDir(), "netplus.ico");
                if (File.Exists(icoPath))
                    appIcon = new System.Drawing.Icon(icoPath);
            }
            catch { }
            if (appIcon == null)
                appIcon = System.Drawing.SystemIcons.Application;

            _tray = new NotifyIcon
            {
                Icon        = appIcon,
                Text        = "NetPlus - Demarrage...",
                ContextMenu = _menu,
                Visible     = true,
            };

            _tray.DoubleClick += OnOpen;

            // Show an immediate balloon so user sees the tray icon right away
            Balloon("NetPlus demarre en arriere-plan...", ToolTipIcon.Info);

            // Start background worker
            var t = new Thread(StartupSequence) { IsBackground = true };
            t.Start();
        }

        void StartupSequence()
        {
            try
            {
                SetStatus("Recherche de Docker...");

                string dockerDesktop = FindDockerDesktop();
                string dockerCli     = FindDockerCli();

                if (dockerCli == null)
                {
                    Balloon("Docker introuvable. Relancez le programme d'installation de NetPlus.", ToolTipIcon.Error);
                    return;
                }

                if (!EngineRunning(dockerCli))
                {
                    SetStatus("Demarrage de Docker Desktop...");
                    if (dockerDesktop != null)
                        Process.Start(new ProcessStartInfo(dockerDesktop) { UseShellExecute = true });
                }

                SetStatus("Attente du moteur Docker...");
                for (int i = 0; i < 60; i++)
                {
                    if (EngineRunning(dockerCli)) break;
                    Thread.Sleep(5000);
                }

                if (!EngineRunning(dockerCli))
                {
                    Balloon("Docker n'a pas demarre. Un redemarrage Windows est peut-etre necessaire.", ToolTipIcon.Warning);
                    return;
                }

                SetStatus("Demarrage des services NetPlus...");
                string composeDir = Path.Combine(ExeDir(), Config.COMPOSE_DIR);
                RunSilent(dockerCli, "compose -f pwd.yml -f compose.netplus.yaml up -d", composeDir);

                // Start netplus-desk (Next.js) silently in background
                SetStatus("Demarrage du frontend NetPlus Desk...");
                string deskDir = Path.Combine(ExeDir(), "netplus-desk");
                string node    = FindNode();
                if (node != null && Directory.Exists(deskDir))
                {
                    // Use "npm run start" (production) or "npm run dev" (dev)
                    string npmCmd = Path.Combine(Path.GetDirectoryName(node), "npm.cmd");
                    if (!File.Exists(npmCmd))
                        npmCmd = Path.Combine(Path.GetDirectoryName(node), "npm");
                    if (File.Exists(npmCmd))
                    {
                        var psi = new ProcessStartInfo(npmCmd, "run start")
                        {
                            WorkingDirectory       = deskDir,
                            UseShellExecute        = false,
                            CreateNoWindow         = true,
                            RedirectStandardOutput = true,
                            RedirectStandardError  = true,
                        };
                        Process.Start(psi); // fire and forget — runs in background
                    }
                }

                SetStatus("Attente de l'application...");
                for (int i = 0; i < 60; i++)
                {
                    if (AppOnline(Config.HEALTH_URL)) break;
                    Thread.Sleep(5000);
                }

                SetStatus("NetPlus est pret !");
                Balloon("NetPlus est demarre ! Cliquez pour ouvrir.", ToolTipIcon.Info);
                OpenBrowser();
            }
            catch (Exception ex)
            {
                Balloon("Erreur: " + ex.Message, ToolTipIcon.Error);
            }
        }

        // ── Event handlers ──────────────────────────────────────
        void OnOpen(object s, EventArgs e) { OpenBrowser(); }

        void OnStop(object s, EventArgs e)
        {
            SetStatus("Arret des services...");
            var t = new Thread(() =>
            {
                string cli = FindDockerCli();
                string dir = Path.Combine(ExeDir(), Config.COMPOSE_DIR);
                if (cli != null) RunSilent(cli, "compose down", dir);
                SetStatus("Arrete.");
                Balloon("NetPlus est arrete.", ToolTipIcon.Info);
            }) { IsBackground = true };
            t.Start();
        }

        void OnQuit(object s, EventArgs e)
        {
            _tray.Visible = false;
            Application.Exit();
        }

        // ── Helpers ─────────────────────────────────────────────
        static string ExeDir()
        {
            return Path.GetDirectoryName(Application.ExecutablePath);
        }

        static string FindDockerDesktop()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf    = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);

            string[] candidates = {
                Path.Combine(local, @"Programs\DockerDesktop\Docker Desktop.exe"),
                Path.Combine(pf,    @"Docker\Docker\Docker Desktop.exe"),
            };
            foreach (string p in candidates)
                if (File.Exists(p)) return p;
            return null;
        }

        static string FindNode()
        {
            string pf  = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);

            string[] candidates = {
                Path.Combine(pf,   @"nodejs\node.exe"),
                Path.Combine(pf86, @"nodejs\node.exe"),
                @"C:\Program Files\nodejs\node.exe",
                "node",
            };
            foreach (string p in candidates)
            {
                if (p == "node")
                {
                    try
                    {
                        using (var proc = Process.Start(new ProcessStartInfo("node", "--version")
                            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true }))
                        {
                            proc.WaitForExit(3000);
                            if (proc.ExitCode == 0) return "node";
                        }
                    }
                    catch { }
                }
                else if (File.Exists(p)) return p;
            }
            return null;
        }

        static string FindDockerCli()
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string pf    = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);

            string[] candidates = {
                Path.Combine(local, @"Programs\DockerDesktop\resources\bin\docker.exe"),
                Path.Combine(pf,    @"Docker\Docker\resources\bin\docker.exe"),
                "docker",
            };

            foreach (string p in candidates)
            {
                if (p == "docker")
                {
                    try
                    {
                        using (var proc = Process.Start(new ProcessStartInfo("docker", "--version")
                            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true }))
                        {
                            proc.WaitForExit(3000);
                            if (proc.ExitCode == 0) return "docker";
                        }
                    }
                    catch { }
                }
                else if (File.Exists(p)) return p;
            }
            return null;
        }

        static bool EngineRunning(string cli)
        {
            try
            {
                using (var p = Process.Start(new ProcessStartInfo(cli, "info")
                    { UseShellExecute = false, CreateNoWindow = true,
                      RedirectStandardOutput = true, RedirectStandardError = true }))
                {
                    p.WaitForExit(5000);
                    return p.ExitCode == 0;
                }
            }
            catch { return false; }
        }

        static void RunSilent(string exe, string args, string workDir)
        {
            using (var p = Process.Start(new ProcessStartInfo(exe, args)
                { WorkingDirectory = workDir, UseShellExecute = false,
                  CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true }))
            {
                p.WaitForExit(120000);
            }
        }

        static bool AppOnline(string url = null)
        {
            if (url == null) url = Config.HEALTH_URL;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Timeout = 3000;
                req.Method  = "HEAD";
                using (req.GetResponse()) return true;
            }
            catch { return false; }
        }

        static void OpenBrowser()
        {
            try { Process.Start(new ProcessStartInfo(Config.APP_URL) { UseShellExecute = true }); }
            catch { }
        }

        void SetStatus(string msg)
        {
            try
            {
                string text = "NetPlus - " + msg;
                if (_hidden != null && _hidden.IsHandleCreated)
                    _hidden.Invoke(new Action(() => { _tray.Text = text; }));
                else
                    _tray.Text = text;
            }
            catch { }
        }

        void Balloon(string msg, ToolTipIcon icon)
        {
            try
            {
                string title = Config.APP_TITLE;
                if (_hidden != null && _hidden.IsHandleCreated)
                    _hidden.Invoke(new Action(() =>
                        _tray.ShowBalloonTip(6000, title, msg, icon)));
                else
                    _tray.ShowBalloonTip(6000, title, msg, icon);
            }
            catch { }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                if (_tray != null) _tray.Dispose();
                if (_menu != null) _menu.Dispose();
                if (_hidden != null) _hidden.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
