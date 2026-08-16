$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$prefix = 'http://localhost:8000/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $root at $prefix"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png'  = 'image/png'
  '.webm' = 'video/webm'
  '.mp4'  = 'video/mp4'
  '.mp3'  = 'audio/mpeg'
  '.ico'  = 'image/x-icon'
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rawPath = $ctx.Request.Url.AbsolutePath
    $relPath = [System.Uri]::UnescapeDataString($rawPath)
    if ($relPath -eq '/') { $relPath = '/index.html' }
    $file = Join-Path $root ($relPath.TrimStart('/') -replace '/', '\')
    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.StatusCode = 200
      $res.ContentType = $contentType
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
      $res.ContentType = 'text/plain; charset=utf-8'
      $res.ContentLength64 = $msg.Length
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
