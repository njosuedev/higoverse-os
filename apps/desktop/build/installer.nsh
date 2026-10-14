; Higoverse installer additions (electron-builder includes build/installer.nsh).
;
; New installs are always for the current user (%LOCALAPPDATA%\Programs\
; Higoverse), never "for all users" in Program Files: updates then install
; by themselves, with no "allow this app to make changes" prompt each time.
; A copy already installed for all users keeps updating where it is (else
; an update would leave a second copy behind); reinstalling it once moves it.
!macro customInstallMode
  ReadRegStr $0 HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $0 == ""
    StrCpy $isForceCurrentInstall "1"
  ${endif}
!macroend

; Shortcuts page (after the install mode page; skipped for updates): a
; desktop shortcut and "pin to taskbar", both ticked to start with. Windows
; does not let an installer pin an app itself, so the second box leaves a
; note (pin-to-taskbar) for the app's first start to say how (main.js).
!ifndef BUILD_UNINSTALLER
  Var shortcutDesktop
  Var shortcutPin
  Var shortcutDesktopBox
  Var shortcutPinBox
!endif

!macro customPageAfterChangeDir
  Page custom shortcutsPageShow shortcutsPageLeave

  Function shortcutsPageShow
    ${if} ${isUpdated}
      Abort
    ${endif}
    !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose where you want to open Higoverse from."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateCheckbox} 0 0 100% 12u "Create a &desktop shortcut"
    Pop $shortcutDesktopBox
    ${ifNot} $shortcutDesktop == "0"
      ${NSD_Check} $shortcutDesktopBox
    ${endif}
    ${NSD_CreateCheckbox} 0 20u 100% 12u "&Pin to taskbar"
    Pop $shortcutPinBox
    ${ifNot} $shortcutPin == "0"
      ${NSD_Check} $shortcutPinBox
    ${endif}
    nsDialogs::Show
  FunctionEnd

  Function shortcutsPageLeave
    ${NSD_GetState} $shortcutDesktopBox $shortcutDesktop
    ${NSD_GetState} $shortcutPinBox $shortcutPin
  FunctionEnd
!macroend

; Updates leave the shortcuts as they are. A silent install (no page) keeps
; electron-builder's desktop shortcut and does not ask to pin.
!macro customInstall
  ${ifNot} ${isUpdated}
    ${if} $shortcutDesktop == "0"
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
    ${elseifNot} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endif}
    ${if} $shortcutPin == "1"
    ${andIfNot} ${FileExists} "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
      FileOpen $0 "$INSTDIR\pin-to-taskbar" w
      FileClose $0
    ${endif}
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${endif}
!macroend

; Uninstalling (not updating) also drops the taskbar pin, which would
; otherwise stay behind pointing at nothing.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar\${SHORTCUT_NAME}.lnk"
  ${endif}
!macroend
