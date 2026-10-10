# Deploys HomeIntel (single-origin image: API + SPA) to Azure Container Apps.
# Safe to re-run: resources are reused, and secrets are generated only when missing (regenerating MFA_ENCRYPTION_KEY
# would make every enrolled two-factor secret undecryptable).
#
#   powershell -ExecutionPolicy Bypass -File scripts\azure-deploy.ps1                 # build + deploy
#   powershell -ExecutionPolicy Bypass -File scripts\azure-deploy.ps1 -SetMongoUri -SkipBuild   # set/replace MONGODB_URI
#
# -SetMongoUri prompts for the connection string with hidden input; it goes straight into a Container Apps secret and
# is never printed. Defaults suit an "Azure for Students" subscription (allowed regions include uaenorth).
param(
  [string]$ResourceGroup = 'homeintel-rg',
  [string]$Location = 'uaenorth',
  [string]$AppName = 'homeintel',
  [string]$EnvName = 'homeintel-env-std',
  [string]$AcrName,                 # default: an existing registry in the resource group, else homeintelacr<random>
  [string]$EnvFile,                 # e.g. .env.azure: MONGODB_URI and provider keys become Container Apps secrets
  [switch]$SetMongoUri,
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
# Call the CLI's Python directly: az.cmd goes through cmd.exe, which mangles '&' in values such as MongoDB URIs.
$cli = @("$env:ProgramFiles\Microsoft SDKs\Azure\CLI2", "${env:ProgramFiles(x86)}\Microsoft SDKs\Azure\CLI2") | Where-Object { Test-Path "$_\python.exe" } | Select-Object -First 1
if (-not $cli) { throw 'Azure CLI not found. Install it: winget install Microsoft.AzureCLI' }
# Windows PowerShell turns any native stderr line (warnings, "not found") into a terminating error under 'Stop', so
# these helpers judge success by exit code only. Az shows stderr on the console and returns stdout for capture.
function Az {
  $ErrorActionPreference = 'Continue'
  & "$cli\python.exe" -IBm azure.cli @args 2>&1 | ForEach-Object { if ($_ -is [Management.Automation.ErrorRecord]) { Write-Host "  $_" -ForegroundColor DarkGray } else { $_ } }
  if ($LASTEXITCODE) { throw "az $($args[0..2] -join ' ') failed (exit $LASTEXITCODE)" }
}
function AzTry { $ErrorActionPreference = 'Continue'; & "$cli\python.exe" -IBm azure.cli @args 2>&1 | Out-Null; $LASTEXITCODE -eq 0 }
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function NewHex($bytes) { $b = [byte[]]::new($bytes); [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }

Step 'Azure subscription'
if (-not (AzTry account show -o none)) { Az login -o none }
Az account show --query "{subscription:name, user:user.name}" -o table

Step "Resource group $ResourceGroup ($Location)"
Az group create -n $ResourceGroup -l $Location --tags app=homeintel -o none

if (-not $AcrName) { $AcrName = (Az acr list -g $ResourceGroup --query "[0].name" -o tsv) }
if (-not $AcrName) { $AcrName = 'homeintelacr' + (NewHex 3) }
Step "Container registry $AcrName"
if (-not (AzTry acr show -n $AcrName -o none)) { Az acr create -g $ResourceGroup -n $AcrName --sku Basic -l $Location -o none }
$server = "$AcrName.azurecr.io"

$tag = Get-Date -Format 'yyyyMMdd-HHmmss'
# Newest build by its yyyyMMdd-HHmmss tag (the registry's time ordering proved unreliable and redeployed an old image).
if ($SkipBuild) { $tag = @(Az acr repository show-tags -n $AcrName --repository homeintel -o tsv) | Where-Object { $_ -match '^\d{8}-\d{6}$' } | Sort-Object | Select-Object -Last 1 }
$image = "${server}/homeintel:$tag"
if (-not $SkipBuild) {
  # Prefer a local Docker build + push: "Azure for Students" subscriptions reject ACR Tasks (TasksOperationsNotAllowed).
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    Step "Building the image locally (tag $tag) and pushing to $server"
    $ErrorActionPreference = 'Continue'
    docker build --platform linux/amd64 -t $image -t "${server}/homeintel:latest" $root; if ($LASTEXITCODE) { throw 'docker build failed' }
    Az acr login -n $AcrName
    docker push $image; if ($LASTEXITCODE) { throw 'docker push failed' }
    docker push "${server}/homeintel:latest" | Out-Null
    $ErrorActionPreference = 'Stop'
  } else {
    Step "Building the image in Azure (tag $tag) - a few minutes"
    Az acr build -r $AcrName -t "homeintel:$tag" -t 'homeintel:latest' $root
  }
}

Step "Container Apps environment $EnvName"
if (-not (AzTry containerapp env show -g $ResourceGroup -n $EnvName -o none)) {
  # Created through the 2024-03-01 API on purpose: newer CLIs make "express" environments, which reject registry
  # credentials and managed identities. Logs go to a Log Analytics workspace (key fetched here, never printed).
  $ws = "$AppName-logs"
  if (-not (AzTry monitor log-analytics workspace show -g $ResourceGroup -n $ws -o none)) { Az monitor log-analytics workspace create -g $ResourceGroup -n $ws -l $Location -o none }
  $wid = "$(Az monitor log-analytics workspace show -g $ResourceGroup -n $ws --query customerId -o tsv)".Trim()
  $wkey = "$(Az monitor log-analytics workspace get-shared-keys -g $ResourceGroup -n $ws --query primarySharedKey -o tsv)".Trim()
  $sub = "$(Az account show --query id -o tsv)".Trim()
  $body = Join-Path $env:TEMP "homeintel-env-$PID.json"
  @{ location = $Location; properties = @{ workloadProfiles = @(@{ name = 'Consumption'; workloadProfileType = 'Consumption' });
     appLogsConfiguration = @{ destination = 'log-analytics'; logAnalyticsConfiguration = @{ customerId = $wid; sharedKey = $wkey } } } } |
    ConvertTo-Json -Depth 6 | Set-Content -Encoding ascii $body
  try { Az rest --method put --url "https://management.azure.com/subscriptions/$sub/resourceGroups/$ResourceGroup/providers/Microsoft.App/managedEnvironments/${EnvName}?api-version=2024-03-01" --body "@$body" -o none }
  finally { Remove-Item $body -Force; $wkey = $null }
  for ($i = 0; $i -lt 60 -and "$(Az containerapp env show -g $ResourceGroup -n $EnvName --query properties.provisioningState -o tsv)".Trim() -ne 'Succeeded'; $i++) { Start-Sleep 10 }
}
$fqdn = "$AppName." + (Az containerapp env show -g $ResourceGroup -n $EnvName --query properties.defaultDomain -o tsv)
$origin = "https://$fqdn"

$envVars = @('NODE_ENV=production', 'SERVE_CLIENT=1', 'PORT=5000', 'TRUST_PROXY=1', 'COOKIE_SAMESITE=lax',
  "CLIENT_ORIGINS=$origin", "PUBLIC_APP_URL=$origin",
  'JWT_ACCESS_SECRET=secretref:jwt-access-secret', 'MFA_ENCRYPTION_KEY=secretref:mfa-encryption-key', 'WEBHOOK_SIGNING_SECRET=secretref:webhook-signing-secret')

Step "Container app $AppName"
# New environments can be "express", which rejects managed-identity registry pulls, so use the registry's admin
# credential (fetched here, passed straight to Azure, never printed; stored by Container Apps as a secret).
# passwords[1]: on a fresh registry the first password was rejected while the second worked.
Az acr update -n $AcrName --admin-enabled true -o none
$acrUser = "$(Az acr credential show -n $AcrName --query username -o tsv)".Trim()
$acrPass = "$(Az acr credential show -n $AcrName --query 'passwords[1].value' -o tsv)".Trim()
if (-not (AzTry containerapp show -g $ResourceGroup -n $AppName -o none)) {
  $secrets = @("jwt-access-secret=$(NewHex 48)", "mfa-encryption-key=$(NewHex 32)", "webhook-signing-secret=$(NewHex 48)")
  Write-Host '  generated JWT_ACCESS_SECRET, MFA_ENCRYPTION_KEY, WEBHOOK_SIGNING_SECRET (stored as Container Apps secrets)'
  # One replica: rate limits and on-demand ingestion are in-process.
  Az containerapp create -g $ResourceGroup -n $AppName --environment $EnvName --image $image `
    --registry-server $server --registry-username $acrUser --registry-password $acrPass `
    --ingress external --target-port 5000 --transport auto --min-replicas 1 --max-replicas 1 --cpu 0.5 --memory 1.0Gi `
    --secrets @secrets --env-vars @envVars -o none
} else {
  Az containerapp registry set -g $ResourceGroup -n $AppName --server $server --username $acrUser --password $acrPass -o none
  Az containerapp update -g $ResourceGroup -n $AppName --image $image --set-env-vars @envVars -o none
}

if ($EnvFile) {
  Step "Settings from $EnvFile (values are not printed)"
  $secretKeys = 'MONGODB_URI', 'OPENAQ_API_KEY', 'DATA_GOV_IN_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'
  $plainKeys = 'CONTACT_EMAIL', 'AI_PROVIDER', 'AI_MODEL', 'AI_DAILY_LIMIT', 'CPCB_VALUE_KIND'
  $sec = @(); $vars = @()
  foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*(#|$)') { continue }
    $k, $v = $line -split '=', 2
    $k = $k.Trim(); $v = "$v".Trim().Trim('"').Trim("'")
    if (-not $v) { continue }
    if ($k -in 'AI_PROVIDER', 'CPCB_VALUE_KIND') { $v = $v.ToLower() }   # the server's enums are lowercase
    if ($secretKeys -contains $k) {
      $name = $k.ToLower().Replace('_', '-')
      $sec += "$name=$v"; $vars += "$k=secretref:$name"; Write-Host "  $k (secret)"
    } elseif ($plainKeys -contains $k) { $vars += "$k=$v"; Write-Host "  $k" }
    else { Write-Host "  skipped unknown or script-managed key $k" -ForegroundColor Yellow }
  }
  $mongo = $sec | Where-Object { $_ -like 'mongodb-uri=*' }
  if ($mongo -and $mongo -notmatch '^mongodb-uri=mongodb(\+srv)?://[^/]+/homeintel') { throw 'MONGODB_URI must look like mongodb+srv://user:pass@host/homeintel?... (include /homeintel).' }
  if ($sec) { Az containerapp secret set -g $ResourceGroup -n $AppName --secrets @sec -o none }
  if ($vars) { Az containerapp update -g $ResourceGroup -n $AppName --set-env-vars @vars -o none }
}

if ($SetMongoUri) {
  Step 'MongoDB connection string'
  $sec = Read-Host 'Paste the MongoDB connection string (mongodb+srv://user:pass@host/homeintel?...; input hidden)' -AsSecureString
  $uri = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  if ($uri -notmatch '^mongodb(\+srv)?://[^/]+/homeintel') { throw 'Expected mongodb+srv://user:pass@host/homeintel?... (include the /homeintel database name).' }
  Az containerapp secret set -g $ResourceGroup -n $AppName --secrets "mongodb-uri=$uri" -o none
  Az containerapp update -g $ResourceGroup -n $AppName --set-env-vars 'MONGODB_URI=secretref:mongodb-uri' -o none
}

$hasMongo = (Az containerapp show -g $ResourceGroup -n $AppName --query "properties.template.containers[0].env[?name=='MONGODB_URI'] | length(@)" -o tsv) -eq '1'
Step 'MongoDB Atlas network access'
Write-Host '  Container Apps (Consumption) has no fixed outbound IP. In Atlas -> Network Access, allow 0.0.0.0/0'
Write-Host '  (protected by the database password and TLS), or add a NAT gateway with a static IP.'

if (-not $hasMongo) {
  Write-Host "`nDeployed, but no database is configured yet, so the app will restart until it has one." -ForegroundColor Yellow
  Write-Host 'Allow 0.0.0.0/0 in Atlas -> Network Access, then run:'
  Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\azure-deploy.ps1 -SetMongoUri -SkipBuild'
  exit 0
}

Step "Waiting for $origin/api/health (up to 5 minutes)"
for ($i = 0; $i -lt 30; $i++) {
  try { $r = Invoke-RestMethod "$origin/api/health" -TimeoutSec 10; if ($r.data.status -eq 'ok') { Write-Host "`nLive: $origin" -ForegroundColor Green; exit 0 } } catch { }
  Start-Sleep 10; Write-Host -NoNewline '.'
}
Write-Host "`nNot healthy yet. Most common cause: Atlas Network Access does not allow 0.0.0.0/0. Logs:" -ForegroundColor Yellow
Write-Host "  az containerapp logs show -g $ResourceGroup -n $AppName --tail 50"
exit 1
