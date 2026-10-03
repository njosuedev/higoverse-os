# Higoverse for Windows (setup)

`installer/` builds **HigoverseSetup.exe**, a standard Next/Back setup wizard:

1. Welcome → Choose options (Desktop shortcut, Start menu) → Ready → Install → Finish
2. Installs for the current user, no administrator rights needed
   (`%LOCALAPPDATA%\Programs\Higoverse`).
3. Higoverse opens https://higoverse.com in its own window (Microsoft Edge app mode).
4. Listed in **Settings → Apps** as "Higoverse"; Uninstall removes the shortcuts,
   the folder and the Apps entry. Account data stays on higoverse.com.

Build (uses the C# compiler that ships with Windows, nothing to install):

```
installer\build.cmd
```

The installer is not code-signed, so Windows SmartScreen may show
"Windows protected your PC" the first time: click **More info → Run anyway**.
A code-signing certificate removes that warning.
