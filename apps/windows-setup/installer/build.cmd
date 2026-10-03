@echo off
rem Builds HigoverseSetup.exe with the C# compiler that ships with Windows.
cd /d "%~dp0"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /codepage:65001 /target:winexe /optimize+ /out:HigoverseSetup.exe /win32icon:higoverse.ico /resource:higoverse.ico,higoverse.ico /resource:banner.png,banner.png /reference:System.Windows.Forms.dll /reference:System.Drawing.dll HigoverseSetup.cs
