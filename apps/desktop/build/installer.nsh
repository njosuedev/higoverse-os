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
