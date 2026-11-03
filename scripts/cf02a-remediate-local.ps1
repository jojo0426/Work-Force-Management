# CF-02A targeted dependency remediation. Run on a local clone of the isolated branch.
# Never deploy, commit, push, or alter live infrastructure automatically.
$ErrorActionPreference = 'Stop'
$expected = 'engineering/cf-02a-dependency-security-recovery'
$actual = (git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $actual -ne $expected) { throw "Expected branch $expected; got $actual" }
if ((git status --porcelain).Length -gt 0) { throw 'Working tree must be clean before dependency changes' }
$root = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Not a Git checkout' }
Push-Location $root
try {
  Write-Host '=== WEB: apply official patched Next.js version (no force) ==='
  Push-Location web
  try {
    npm install --save-exact next@16.4.1 --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed' }
    npm run test:auth-contract
    if ($LASTEXITCODE -ne 0) { throw 'Web auth contract failed' }
    node --test scripts/cloud-config.test.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Cloud API config tests failed' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed' }
    npm audit --omit=dev --audit-level=high
    if ($LASTEXITCODE -ne 0) { throw 'Web security audit still reports high/critical vulnerabilities' }
  } finally { Pop-Location }
  Write-Host '=== BACKEND: inspect advisory tree before modifying dependencies ==='
  Push-Location backend
  try {
    npm audit --omit=dev --json | Out-File -FilePath ../cf02a-backend-audit.json -Encoding utf8
    # npm audit exits nonzero when advisories are found. Save evidence and stop.
    Write-Host 'Backend audit saved to cf02a-backend-audit.json; inspect all findings and choose compatible patched versions.'
    Write-Host 'Do NOT run npm audit fix --force. No backend packages changed.'
  } finally { Pop-Location }
  Write-Host '=== LOCAL CHANGES (NOT COMMITTED) ==='
  git status --short
  git diff --stat
  Write-Host 'Web fix is local until reviewed; backend remediation requires dependency review.'
} finally { Pop-Location }
