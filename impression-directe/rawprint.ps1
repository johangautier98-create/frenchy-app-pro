# Envoie un fichier tel quel (langage de l'imprimante, TSPL) à une imprimante Windows, sans passer par le pilote graphique.
# Usage : rawprint.ps1 -Printer "Xprinter XP-365B" -File job.bin
#         rawprint.ps1 -Check            (vérifie seulement que l'outil fonctionne, n'imprime rien)
param(
  [string]$Printer = "Xprinter XP-365B",
  [string]$File = "",
  [switch]$Check
)
$ErrorActionPreference = "Stop"
$cs = @"
using System;
using System.Runtime.InteropServices;
public class FlRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr h, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr h, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] static extern bool WritePrinter(IntPtr h, byte[] data, int count, out int written);
  public static string CanOpen(string printer) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERREUR ouverture " + Marshal.GetLastWin32Error();
    ClosePrinter(h);
    return "OK";
  }
  public static string Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) return "ERREUR ouverture " + Marshal.GetLastWin32Error();
    try {
      var di = new DOCINFO { pDocName = "Frenchy Leurres - etiquettes", pDataType = "RAW" };
      if (StartDocPrinter(h, 1, di) == 0) return "ERREUR document " + Marshal.GetLastWin32Error();
      try {
        StartPagePrinter(h);
        int written;
        bool ok = WritePrinter(h, data, data.Length, out written);
        EndPagePrinter(h);
        return (ok && written == data.Length) ? "OK" : "ERREUR envoi " + Marshal.GetLastWin32Error();
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
"@
if (-not ("FlRawPrinter" -as [type])) { Add-Type -TypeDefinition $cs -Language CSharp }
if ($Check) { [FlRawPrinter]::CanOpen($Printer); exit 0 }
if (-not $File -or -not (Test-Path -LiteralPath $File)) { "ERREUR fichier introuvable"; exit 1 }
[FlRawPrinter]::Send($Printer, [System.IO.File]::ReadAllBytes($File))
