// Higoverse for Windows - setup wizard.
//
// A classic Next/Back installer. Installs for the current user (no admin
// rights): copies itself as the uninstaller, adds Desktop / Start menu
// shortcuts that open https://higoverse.com in its own Microsoft Edge app
// window, and registers "Higoverse" in Settings > Apps so it can be removed
// like any other program. Run with /uninstall to remove.
//
// Build (C# 5, .NET Framework 4.x - ships with Windows):  build.cmd

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Higoverse Setup")]
[assembly: AssemblyProduct("Higoverse")]
[assembly: AssemblyCompany("Higoverse")]
[assembly: AssemblyCopyright("Higoverse")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace HigoverseSetup
{
    static class App
    {
        public const string Name = "Higoverse";
        public const string Version = "1.0.0";
        public const string Url = "https://higoverse.com/";
        public const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Higoverse";
        public static readonly Color Ink = Color.FromArgb(10, 102, 194);

        public static string InstallDir
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\Higoverse"); }
        }
        public static string DesktopLink
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Higoverse.lnk"); }
        }
        public static string StartMenuLink
        {
            get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Higoverse.lnk"); }
        }

        public static string FindEdge()
        {
            string[] candidates = {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe"),
            };
            foreach (string c in candidates) if (File.Exists(c)) return c;
            return null;
        }

        public static Stream Resource(string name)
        {
            return Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
        }

        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            bool uninstall = args.Length > 0 && args[0].Trim('/', '-').Equals("uninstall", StringComparison.OrdinalIgnoreCase);
            if (uninstall) Uninstaller.Run();
            else Application.Run(new Wizard());
        }
    }

    static class Shortcut
    {
        // WScript.Shell via late binding - no extra references needed.
        public static void Create(string path, string target, string arguments, string icon, string workDir)
        {
            Type t = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(t);
            object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
            Type lt = lnk.GetType();
            lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { target });
            lt.InvokeMember("Arguments", BindingFlags.SetProperty, null, lnk, new object[] { arguments });
            lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { icon + ",0" });
            lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { workDir });
            lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { "Higoverse - business records and sales" });
            lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
        }
    }

    static class Installer
    {
        public static void Install(bool desktop, bool startMenu, Action<int, string> progress)
        {
            string edge = App.FindEdge();
            if (edge == null) throw new InvalidOperationException("Microsoft Edge was not found on this computer. Install Microsoft Edge, then run this setup again.");

            progress(15, "Copying files...");
            Directory.CreateDirectory(App.InstallDir);
            string icon = Path.Combine(App.InstallDir, "higoverse.ico");
            using (Stream src = App.Resource("higoverse.ico"))
            using (FileStream dst = File.Create(icon)) src.CopyTo(dst);
            string uninstaller = Path.Combine(App.InstallDir, "Uninstall Higoverse.exe");
            File.Copy(Assembly.GetExecutingAssembly().Location, uninstaller, true);

            progress(45, "Creating shortcuts...");
            string args = "--app=" + App.Url;
            if (desktop) Shortcut.Create(App.DesktopLink, edge, args, icon, App.InstallDir);
            else if (File.Exists(App.DesktopLink)) File.Delete(App.DesktopLink);
            if (startMenu) Shortcut.Create(App.StartMenuLink, edge, args, icon, App.InstallDir);
            else if (File.Exists(App.StartMenuLink)) File.Delete(App.StartMenuLink);

            progress(75, "Registering Higoverse in Apps...");
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(App.UninstallKey))
            {
                k.SetValue("DisplayName", App.Name);
                k.SetValue("DisplayVersion", App.Version);
                k.SetValue("Publisher", "Higoverse");
                k.SetValue("DisplayIcon", icon);
                k.SetValue("InstallLocation", App.InstallDir);
                k.SetValue("URLInfoAbout", App.Url);
                k.SetValue("HelpLink", "mailto:higoverse@gmail.com");
                k.SetValue("UninstallString", "\"" + uninstaller + "\" /uninstall");
                k.SetValue("QuietUninstallString", "\"" + uninstaller + "\" /uninstall");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                k.SetValue("EstimatedSize", 200, RegistryValueKind.DWord);
                k.SetValue("InstallDate", DateTime.Now.ToString("yyyyMMdd"));
            }
            progress(100, "Done.");
        }

        public static void Launch()
        {
            string edge = App.FindEdge();
            if (edge != null) Process.Start(edge, "--app=" + App.Url);
        }
    }

    static class Uninstaller
    {
        public static void Run()
        {
            if (MessageBox.Show("Remove Higoverse from this computer?\n\nYour account and business data stay safe on higoverse.com.",
                    "Uninstall Higoverse", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            try
            {
                if (File.Exists(App.DesktopLink)) File.Delete(App.DesktopLink);
                if (File.Exists(App.StartMenuLink)) File.Delete(App.StartMenuLink);
                Registry.CurrentUser.DeleteSubKeyTree(App.UninstallKey, false);
                // This program is running from the install folder: remove the
                // folder once it has exited.
                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe",
                    "/c ping 127.0.0.1 -n 3 > nul & rmdir /s /q \"" + App.InstallDir + "\"");
                psi.CreateNoWindow = true;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(psi);
                MessageBox.Show("Higoverse has been removed from this computer.", "Uninstall Higoverse", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception e)
            {
                MessageBox.Show("Higoverse could not be removed completely:\n" + e.Message, "Uninstall Higoverse", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }
    }

    class Wizard : Form
    {
        int step;
        readonly Panel banner = new Panel();
        readonly Panel body = new Panel();
        readonly Panel footer = new Panel();
        readonly Button back = new Button(), next = new Button(), cancel = new Button();
        readonly CheckBox desktop = new CheckBox(), startMenu = new CheckBox(), launch = new CheckBox();
        readonly ProgressBar bar = new ProgressBar();
        readonly Label status = new Label();
        bool installed;

        public Wizard()
        {
            Text = "Higoverse Setup";
            ClientSize = new Size(560, 380);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9.5f);
            BackColor = Color.White;
            using (Stream s = App.Resource("higoverse.ico")) Icon = new Icon(s);

            banner.SetBounds(0, 0, 170, 330);
            banner.BackgroundImage = Image.FromStream(App.Resource("banner.png"));
            banner.BackgroundImageLayout = ImageLayout.Stretch;
            body.SetBounds(170, 0, 390, 330);
            body.Padding = new Padding(24, 22, 24, 10);
            footer.SetBounds(0, 330, 560, 50);
            footer.BackColor = Color.FromArgb(243, 242, 239);

            back.Text = "< Back"; next.Text = "Next >"; cancel.Text = "Cancel";
            foreach (Button b in new[] { back, next, cancel }) { b.Size = new Size(88, 28); b.FlatStyle = FlatStyle.System; footer.Controls.Add(b); }
            back.Location = new Point(270, 11); next.Location = new Point(362, 11); cancel.Location = new Point(462, 11);
            back.Click += delegate { Show(step - 1); };
            next.Click += delegate { OnNext(); };
            cancel.Click += delegate { Close(); };
            AcceptButton = next;

            desktop.Text = "Create a Desktop shortcut"; desktop.Checked = true; desktop.AutoSize = true;
            startMenu.Text = "Add to the Start menu"; startMenu.Checked = true; startMenu.AutoSize = true;
            launch.Text = "Open Higoverse now"; launch.Checked = true; launch.AutoSize = true;

            Controls.Add(banner); Controls.Add(body); Controls.Add(footer);
            Show(0);
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!installed && step < 3 && e.CloseReason == CloseReason.UserClosing &&
                MessageBox.Show("Are you sure you want to cancel the Higoverse setup?", "Higoverse Setup",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes)
                e.Cancel = true;
            base.OnFormClosing(e);
        }

        Label Title(string text, int y)
        {
            Label l = new Label();
            l.Text = text; l.Font = new Font("Segoe UI Semibold", 14f); l.ForeColor = Color.FromArgb(25, 25, 25);
            l.AutoSize = false; l.SetBounds(24, y, 340, 36);
            return l;
        }

        Label Para(string text, int y, int h)
        {
            Label l = new Label();
            l.Text = text; l.ForeColor = Color.FromArgb(51, 51, 51);
            l.AutoSize = false; l.SetBounds(24, y, 340, h);
            return l;
        }

        void Show(int s)
        {
            step = s;
            body.Controls.Clear();
            back.Enabled = s == 1 || s == 2;
            next.Enabled = true; cancel.Enabled = s < 3;
            switch (s)
            {
                case 0:
                    body.Controls.Add(Title("Welcome to the Higoverse Setup", 22));
                    body.Controls.Add(Para("This will install Higoverse on your computer.\n\nHigoverse keeps your business records, sales and stock in one place. It opens in its own window and signs you in to your Higoverse account.\n\nClick Next to continue, or Cancel to exit Setup.", 90, 200));
                    next.Text = "Next >";
                    break;
                case 1:
                    body.Controls.Add(Title("Choose options", 22));
                    body.Controls.Add(Para("Where should Setup add Higoverse?", 72, 22));
                    desktop.Location = new Point(28, 104); startMenu.Location = new Point(28, 132);
                    body.Controls.Add(desktop); body.Controls.Add(startMenu);
                    body.Controls.Add(Para("Install folder:\n" + App.InstallDir, 178, 50));
                    body.Controls.Add(Para("No administrator rights are needed.", 236, 22));
                    next.Text = "Next >";
                    break;
                case 2:
                    body.Controls.Add(Title("Ready to install", 22));
                    body.Controls.Add(Para("Setup is ready to install Higoverse " + App.Version + ".\n\n" +
                        (desktop.Checked ? "  •  Desktop shortcut\n" : "") +
                        (startMenu.Checked ? "  •  Start menu entry\n" : "") +
                        "  •  Listed in Settings > Apps (for uninstalling)\n\nClick Install to continue.", 72, 200));
                    next.Text = "Install";
                    break;
                case 3:
                    body.Controls.Add(Title("Installing Higoverse", 22));
                    status.AutoSize = false; status.SetBounds(24, 88, 340, 22); status.Text = "Starting...";
                    bar.SetBounds(24, 116, 340, 18); bar.Value = 0;
                    body.Controls.Add(status); body.Controls.Add(bar);
                    back.Enabled = false; next.Enabled = false; cancel.Enabled = false;
                    Application.DoEvents();
                    try
                    {
                        Installer.Install(desktop.Checked, startMenu.Checked, delegate (int p, string msg) { bar.Value = p; status.Text = msg; Application.DoEvents(); });
                        installed = true;
                        Show(4);
                    }
                    catch (Exception e)
                    {
                        MessageBox.Show("Setup could not finish:\n" + e.Message, "Higoverse Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        Show(2);
                    }
                    return;
                case 4:
                    body.Controls.Add(Title("Higoverse is installed", 22));
                    body.Controls.Add(Para("Setup has finished installing Higoverse on your computer." +
                        (desktop.Checked ? "\n\nOpen it any time from the Higoverse icon on your Desktop" + (startMenu.Checked ? " or in the Start menu." : ".") :
                         startMenu.Checked ? "\n\nOpen it any time from the Start menu." : "") +
                        "\n\nTip: right-click it in the Start menu and choose \"Pin to taskbar\".", 72, 150));
                    launch.Location = new Point(28, 230); body.Controls.Add(launch);
                    back.Enabled = false; cancel.Enabled = false; next.Text = "Finish";
                    break;
            }
        }

        void OnNext()
        {
            if (step < 3) { Show(step + 1); return; }
            if (step == 4)
            {
                if (launch.Checked) Installer.Launch();
                Close();
            }
        }
    }
}

