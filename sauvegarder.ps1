# Sauvegarde de l'application Pro : GitHub (branche master) + copie datée sur le Bureau.
# Ne supprime jamais rien : chaque copie du Bureau est un nouveau dossier.
param([string]$Message = "Sauvegarde automatique")

$projet = $PSScriptRoot
Set-Location $projet

# Les avertissements de Git (fins de ligne) passent par stderr : on ne juge que le code de retour.
cmd /c "git add -A 2>nul"
if ($LASTEXITCODE -ne 0) { throw "git add a échoué." }
$changes = cmd /c "git status --porcelain 2>nul"
if ($changes) {
    cmd /c "git commit -q -m `"$($Message -replace '"','')`" 2>nul"
    if ($LASTEXITCODE -ne 0) { throw "L'enregistrement Git a échoué." }
    Write-Host "Version enregistrée : $Message"
} else {
    Write-Host "Aucune modification à enregistrer dans Git."
}
cmd /c "git push -q origin master 2>&1"
if ($LASTEXITCODE -ne 0) { throw "L'envoi sur GitHub a échoué." }
Write-Host "GitHub : à jour (branche master)."

$date = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$dest = Join-Path ([Environment]::GetFolderPath('Desktop')) "Sauvegardes Frenchy App Pro\$date"
robocopy $projet $dest /E /XD .git node_modules .vercel /XF .env .env.* *.env .github-config.json /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "La copie sur le Bureau a échoué (code $LASTEXITCODE)." }
Write-Host "Bureau : copie dans $dest"
