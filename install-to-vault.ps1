param(
	[string]$VaultPath = ""
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

function Get-ObsidianVaults {
	$configPath = Join-Path $env:APPDATA "obsidian\obsidian.json"
	if (-not (Test-Path $configPath)) {
		return @()
	}

	$config = Get-Content -Raw -Path $configPath -Encoding UTF8 | ConvertFrom-Json
	$vaults = @()

	foreach ($entry in $config.vaults.PSObject.Properties) {
		$vault = $entry.Value
		$vaults += [PSCustomObject]@{
			Path = $vault.path
			Open = [bool]$vault.open
			LastUsed = [long]$vault.ts
		}
	}

	return $vaults
}

function Resolve-VaultPath {
	param([string]$RequestedPath)

	if ($RequestedPath) {
		if (-not (Test-Path $RequestedPath)) {
			throw "Vault path not found: $RequestedPath"
		}
		return (Resolve-Path $RequestedPath).Path
	}

	$vaults = Get-ObsidianVaults
	if ($vaults.Count -eq 0) {
		throw @"
Could not find Obsidian vaults. Pass your vault path explicitly:

  .\install-to-vault.ps1 -VaultPath "C:\path\to\your\vault"
"@
	}

	$openVaults = $vaults | Where-Object { $_.Open }
	$candidate = if ($openVaults.Count -gt 0) {
		$openVaults | Sort-Object LastUsed -Descending | Select-Object -First 1
	} else {
		$vaults | Sort-Object LastUsed -Descending | Select-Object -First 1
	}

	Write-Host "Using vault: $($candidate.Path)"
	return $candidate.Path
}

if (-not (Test-Path (Join-Path $root "main.js"))) {
	Write-Host "main.js not found. Run: npm run build"
	exit 1
}

$VaultPath = Resolve-VaultPath -RequestedPath $VaultPath
$dest = Join-Path $VaultPath ".obsidian\plugins\block-step-reader"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item @(
	(Join-Path $root "main.js"),
	(Join-Path $root "manifest.json"),
	(Join-Path $root "styles.css")
) -Destination $dest -Force

Write-Host "Installed to $dest"
Write-Host "Reload Obsidian community plugins, then enable Block Step Reader (渐读)."
