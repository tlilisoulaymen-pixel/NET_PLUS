; ============================================================
;  NetPlus — Inno Setup installer script
;  Compile with Inno Setup 6 (free): https://jrsoftware.org/isinfo.php
;  See README.md for the full build procedure.
;  Run build-installer.ps1 to compile automatically.
; ============================================================

#define AppName "NetPlus"
#define AppVersion "1.0.0"
#define AppPublisher "NetPlus Technologies"
#define AppURL "https://github.com/tlilisoulaymen-pixel/NET_PLUS"
#define AppExeName "NetPlusLauncher.exe"

[Setup]
; GUID identifies this product across all future upgrades — never change it.
AppId={{E6C1D1B2-1D2A-4D7C-A261-C8A31B8AE255}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DisableProgramGroupPage=yes
LicenseFile=LICENSE.txt
OutputDir=dist
OutputBaseFilename=NetPlus-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
MinVersion=10.0.17763
; Optional branding — put the files next to this script and uncomment:
SetupIconFile=netplus.ico
; WizardImageFile=wizard-banner.bmp        (164x314 px)
; WizardSmallImageFile=wizard-small.bmp    (55x58 px)

[Languages]
Name: "french";  MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart";   Description: "Lancer NetPlus au démarrage de Windows"; GroupDescription: "Options de démarrage"; Flags: unchecked

[Files]
; Application payload (netplus_app, netplus-desk, frappe_docker, addons …)
Source: "payload\*";             DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

; Installer support scripts
Source: "install-prerequisites.ps1"; DestDir: "{app}\installer"; Flags: ignoreversion

; Silent launcher executable (compiled C# WinForms tray app — no console window)
Source: "launcher\NetPlusLauncher.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "netplus.ico";                  DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Desktop shortcut
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\netplus.ico"; Tasks: desktopicon

; Start menu shortcut
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\netplus.ico"

; Startup (optional task)
Name: "{userstartup}\{#AppName}"; Filename: "{app}\{#AppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\netplus.ico"; Tasks: autostart

[Run]
; Step 1 — install prerequisites (WSL2 + Docker Desktop) with live status
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\installer\install-prerequisites.ps1"""; \
  StatusMsg: "Installation des prérequis (WSL2, Docker Desktop)… Cela peut prendre plusieurs minutes."; \
  Flags: waituntilterminated

; Step 2 — offer to launch NetPlus right after install (silent .exe launcher)
Filename: "{app}\{#AppExeName}"; Description: "Lancer {#AppName} maintenant"; \
  Flags: postinstall nowait skipifsilent

[UninstallRun]
; Stop containers cleanly on uninstall
Filename: "powershell.exe"; \
  Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Set-Location '{app}\frappe_docker'; docker compose down"""; \
  Flags: waituntilterminated runhidden; RunOnceId: "StopContainers"

[Code]
// Refuse 32-bit Windows and warn if hardware virtualization seems off.
function InitializeSetup(): Boolean;
begin
  Result := True;
  if not IsWin64 then
  begin
    MsgBox('NetPlus nécessite Windows 10 (build 17763) ou supérieur, 64 bits.', mbError, MB_OK);
    Result := False;
  end;
end;
