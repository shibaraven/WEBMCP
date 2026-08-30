$ErrorActionPreference = "Stop"

$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegCommand) {
  throw "ffmpeg is required to render the demo video"
}
$ffmpeg = $ffmpegCommand.Source
$submission = $PSScriptRoot
$source = Join-Path $submission "video-frames"
$verified = Join-Path $source "verified"
$output = Join-Path $submission "physical-ai-webmcp-demo.mp4"

New-Item -ItemType Directory -Force -Path $verified | Out-Null

function New-Frame {
  param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [Parameter(Mandatory = $true)][string]$Filter,
    [Parameter(Mandatory = $true)][string]$OutputFile
  )

  & $ffmpeg -hide_banner -loglevel error -y `
    -i (Join-Path $source $InputFile) `
    -vf $Filter `
    -frames:v 1 `
    (Join-Path $verified $OutputFile)

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to render $OutputFile"
  }
}

$dark = "0x061410"
$full = "scale=1920:1201:force_original_aspect_ratio=increase,crop=1920:1080:(in_w-out_w)/2:60"
$proof = "crop=696:480:370:88,scale=1450:1000:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$dark"
$approval = "crop=1425:760:0:120,scale=1800:960:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$dark"
$stage = "crop=885:420:56:67,scale=1800:854:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$dark"
$trace = "crop=285:240:780:88,scale=1283:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$dark"
$metrics = "crop=300:280:760:220,scale=1157:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=$dark"

New-Frame "01-overview.png" $full "v01-overview.png"
New-Frame "actual-completed.png" $proof "v02-verified-discovery.png"
New-Frame "actual-verified-metrics.png" $proof "v03-observable-planning.png"
New-Frame "02-planning-approval.png" $approval "v04-human-approval.png"
New-Frame "03-executing.png" $stage "v05-executing.png"
New-Frame "04-blocked.png" $stage "v06-blocked.png"
New-Frame "05-replanned.png" $stage "v07-recovery.png"
New-Frame "actual-completed.png" $proof "v08-completed.png"
New-Frame "actual-webmcp-trace.png" $trace "v09-webmcp-trace.png"
New-Frame "actual-verified-metrics.png" $metrics "v10-verified-metrics.png"
New-Frame "actual-completed.png" $proof "v11-close.png"

$subtitlePath = (Join-Path $submission "captions.en.srt").Replace("\", "/").Replace(":", "\:")
$subtitleFilter = "subtitles='$subtitlePath':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,BackColour=&H9A000000,Outline=1,Shadow=0,MarginV=28,Alignment=2'"

Push-Location $submission
try {
  & $ffmpeg -hide_banner -loglevel error -y `
    -f concat -safe 0 -i "video-frames-verified.txt" `
    -i "narration.en.final.wav" `
    -vf $subtitleFilter `
    -r 30 `
    -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p `
    -c:a aac -b:a 160k `
    -t 158 `
    -shortest -movflags +faststart `
    $output

  if ($LASTEXITCODE -ne 0) {
    throw "Failed to render the verified demo video"
  }
}
finally {
  Pop-Location
}

Write-Host "Rendered $output"
