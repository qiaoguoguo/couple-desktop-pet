[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDirectory,

  [Parameter(Mandatory = $true)]
  [string]$OutputFile
)

$root = (Resolve-Path -LiteralPath $PackageDirectory).Path
$outputPath = [System.IO.Path]::GetFullPath($OutputFile)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)

foreach ($required in @("pet.json", "preview.png")) {
  $requiredPath = Join-Path $root $required
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
    throw "Missing required package file: $required"
  }
}

if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$tempZip = [System.IO.Path]::ChangeExtension($outputPath, ".zip")
if (Test-Path -LiteralPath $tempZip) {
  Remove-Item -LiteralPath $tempZip -Force
}

Compress-Archive -Path (Join-Path $root "*") -DestinationPath $tempZip -Force

if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}

Move-Item -LiteralPath $tempZip -Destination $outputPath
Write-Host "Wrote $outputPath"
