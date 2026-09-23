[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("Install", "Start", "Stop", "Restart", "Update", "Status", "Uninstall")]
    [string]$Action = "Install",

    [ValidatePattern("^[A-Za-z0-9]+$")]
    [string]$ServiceName = "InfotecStorageClient",

    [switch]$SkipPrepare
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$winSwVersion = "2.12.0"
$winSwSha256 = "05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA"
$winSwUrl = "https://github.com/winsw/winsw/releases/download/v$winSwVersion/WinSW-x64.exe"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runtimeDirectory = Join-Path $projectRoot ".windows-service"
$wrapperPath = Join-Path $runtimeDirectory "storage-client-service.exe"
$configurationPath = Join-Path $runtimeDirectory "storage-client-service.xml"
$logDirectory = Join-Path $runtimeDirectory "logs"

function Assert-Windows {
    if ([System.Environment]::OSVersion.Platform -ne [System.PlatformID]::Win32NT) {
        throw "Este script so pode ser executado no Windows."
    }
}

function Get-RequiredCommandPath {
    param([Parameter(Mandatory = $true)][string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "O comando '$Name' nao foi encontrado no PATH."
    }

    return $command.Source
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "O comando '$Executable $($Arguments -join ' ')' falhou com codigo $LASTEXITCODE."
    }
}

function Assert-ServiceFiles {
    if (-not (Test-Path -LiteralPath $wrapperPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $configurationPath -PathType Leaf)) {
        throw "Os arquivos do servico nao foram encontrados. Execute 'npm run service:install' primeiro."
    }
}

function Install-WinSw {
    New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

    $downloadRequired = $true
    if (Test-Path -LiteralPath $wrapperPath -PathType Leaf) {
        $currentHash = (Get-FileHash -LiteralPath $wrapperPath -Algorithm SHA256).Hash
        $downloadRequired = $currentHash -ne $winSwSha256
    }

    if ($downloadRequired) {
        Write-Host "Baixando WinSW $winSwVersion..."
        Invoke-WebRequest -Uri $winSwUrl -OutFile $wrapperPath -UseBasicParsing
    }

    $downloadedHash = (Get-FileHash -LiteralPath $wrapperPath -Algorithm SHA256).Hash
    if ($downloadedHash -ne $winSwSha256) {
        Remove-Item -LiteralPath $wrapperPath -Force
        throw "A verificacao SHA-256 do WinSW falhou. O arquivo baixado foi removido."
    }
}

function Invoke-ProjectPreparation {
    $environmentPath = Join-Path $projectRoot ".env"
    if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
        throw "Arquivo .env ausente. Copie .env.example para .env e configure-o antes da instalacao."
    }

    $npmPath = Get-RequiredCommandPath "npm.cmd"
    $npxPath = Get-RequiredCommandPath "npx.cmd"

    Push-Location $projectRoot
    try {
        Invoke-CheckedCommand $npmPath @("ci")
        Invoke-CheckedCommand $npxPath @("prisma", "generate")
        Invoke-CheckedCommand $npxPath @("prisma", "migrate", "deploy")
        Invoke-CheckedCommand $npmPath @("run", "build")
    }
    finally {
        Pop-Location
    }
}

function Write-ServiceConfiguration {
    param([Parameter(Mandatory = $true)][string]$NodePath)

    $escapedServiceName = [System.Security.SecurityElement]::Escape($ServiceName)
    $escapedNodePath = [System.Security.SecurityElement]::Escape($NodePath)
    $escapedProjectRoot = [System.Security.SecurityElement]::Escape($projectRoot)
    $entryPoint = [System.Security.SecurityElement]::Escape((Join-Path $projectRoot "dist\app.js"))
    $escapedLogDirectory = [System.Security.SecurityElement]::Escape($logDirectory)

    $configuration = @"
<service>
  <id>$escapedServiceName</id>
  <name>Infotec Storage Client ($escapedServiceName)</name>
  <description>Servico local de armazenamento de arquivos da Infotec.</description>
  <executable>$escapedNodePath</executable>
  <arguments>&quot;$entryPoint&quot;</arguments>
  <workingdirectory>$escapedProjectRoot</workingdirectory>
  <startmode>Automatic</startmode>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>15 sec</stoptimeout>
  <logpath>$escapedLogDirectory</logpath>
  <log mode="roll-by-size-time">
    <sizeThreshold>10240</sizeThreshold>
    <pattern>yyyyMMdd</pattern>
    <autoRollAtTime>00:00:00</autoRollAtTime>
    <keepFiles>14</keepFiles>
  </log>
</service>
"@

    Set-Content -LiteralPath $configurationPath -Value $configuration -Encoding UTF8
}

function Invoke-WinSw {
    param([Parameter(Mandatory = $true)][string]$Command)

    Assert-ServiceFiles
    Invoke-CheckedCommand $wrapperPath @($Command)
}

Assert-Windows

switch ($Action) {
    "Install" {
        if ($null -ne (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue)) {
            throw "O servico '$ServiceName' ja esta instalado. Remova-o primeiro ou use service:restart."
        }

        $nodePath = Get-RequiredCommandPath "node.exe"
        if (-not $SkipPrepare) {
            Invoke-ProjectPreparation
        }
        elseif (-not (Test-Path -LiteralPath (Join-Path $projectRoot "dist\app.js") -PathType Leaf)) {
            throw "dist/app.js nao existe. Execute 'npm run build' ou remova -SkipPrepare."
        }

        Install-WinSw
        Write-ServiceConfiguration $nodePath
        Invoke-WinSw "install"
        Invoke-WinSw "start"
        Write-Host "Servico '$ServiceName' instalado e iniciado. Logs: $logDirectory"
    }
    "Start" {
        Invoke-WinSw "start"
    }
    "Stop" {
        Invoke-WinSw "stop"
    }
    "Restart" {
        Invoke-WinSw "restart"
    }
    "Update" {
        Assert-ServiceFiles
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($null -eq $service) {
            throw "O servico '$ServiceName' nao esta instalado. Execute 'npm run service:install' primeiro."
        }
        if ($service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
            Invoke-WinSw "stop"
        }
        Invoke-ProjectPreparation
        Invoke-WinSw "start"
        Write-Host "Servico '$ServiceName' atualizado e iniciado."
    }
    "Status" {
        Assert-ServiceFiles
        & $wrapperPath status
    }
    "Uninstall" {
        Assert-ServiceFiles
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($null -ne $service -and $service.Status -ne [System.ServiceProcess.ServiceControllerStatus]::Stopped) {
            Invoke-WinSw "stop"
        }
        Invoke-WinSw "uninstall"
        Write-Host "Servico '$ServiceName' removido. Os logs foram preservados em $logDirectory"
    }
}
