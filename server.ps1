$ErrorActionPreference = 'Stop'
$root = (Get-Location).Path
$prefix = 'http://localhost:8000/'

# A small multi-threaded static file server with HTTP Range support.
# Compiled via Add-Type so it can serve large media files concurrently,
# avoiding the single-threaded blocking that broke bgm.mp3 playback.
$csharp = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

public sealed class StaticServer
{
    private readonly HttpListener _listener;
    private readonly string _root;
    private static readonly Dictionary<string, string> Mime =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        { ".html", "text/html; charset=utf-8" },
        { ".css", "text/css; charset=utf-8" },
        { ".js", "application/javascript; charset=utf-8" },
        { ".svg", "image/svg+xml" },
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".png", "image/png" },
        { ".webm", "video/webm" },
        { ".mp4", "video/mp4" },
        { ".mp3", "audio/mpeg" },
        { ".ico", "image/x-icon" },
        { ".woff", "font/woff" },
        { ".woff2", "font/woff2" }
    };

    public StaticServer(string prefix, string root)
    {
        _root = root;
        _listener = new HttpListener();
        _listener.Prefixes.Add(prefix);
    }

    public void Start()
    {
        _listener.Start();
        Console.WriteLine("Serving " + _root + " at " + _listener.Prefixes.ToString());
        while (_listener.IsListening)
        {
            HttpListenerContext ctx;
            try
            {
                ctx = _listener.GetContext();
            }
            catch
            {
                break;
            }
            ThreadPool.QueueUserWorkItem(_ => Handle(ctx));
        }
    }

    private void Handle(HttpListenerContext ctx)
    {
        HttpListenerResponse res = ctx.Response;
        HttpListenerRequest req = ctx.Request;
        try
        {
            string relPath = Uri.UnescapeDataString(req.Url.AbsolutePath);
            if (relPath == "/") relPath = "/index.html";
            string file = Path.Combine(_root, relPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

            if (!File.Exists(file))
            {
                byte[] msg = Encoding.UTF8.GetBytes("Not Found");
                res.StatusCode = 404;
                res.ContentType = "text/plain; charset=utf-8";
                res.ContentLength64 = msg.Length;
                res.OutputStream.Write(msg, 0, msg.Length);
                return;
            }

            string ext = Path.GetExtension(file).ToLower();
            string contentType;
            if (!Mime.TryGetValue(ext, out contentType)) contentType = "application/octet-stream";
            bool isHead = req.HttpMethod == "HEAD";

            res.ContentType = contentType;
            res.AddHeader("Accept-Ranges", "bytes");

            using (FileStream fs = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
            {
                long fileLen = fs.Length;
                string range = req.Headers["Range"];
                if (string.IsNullOrEmpty(range))
                {
                    res.StatusCode = 200;
                    res.ContentLength64 = fileLen;
                    if (!isHead) Copy(fs, res.OutputStream, fileLen);
                }
                else
                {
                    HandleRange(fs, res, range, isHead);
                }
            }
        }
        catch
        {
            try { res.StatusCode = 500; } catch { }
        }
        finally
        {
            try { res.Close(); } catch { }
        }
    }

    private static void HandleRange(FileStream fs, HttpListenerResponse res, string range, bool isHead)
    {
        long fileLen = fs.Length;
        string spec = range.Substring(6); // strip "bytes="
        string[] parts = spec.Split('-');
        long start, end;

        if (parts.Length < 2 || (parts[0].Length == 0 && parts[1].Length == 0))
        {
            res.StatusCode = 416;
            res.AddHeader("Content-Range", "bytes */" + fileLen);
            return;
        }

        if (parts[0].Length == 0)
        {
            long suffixLen = long.Parse(parts[1]);
            if (suffixLen <= 0)
            {
                res.StatusCode = 416;
                res.AddHeader("Content-Range", "bytes */" + fileLen);
                return;
            }
            start = Math.Max(0, fileLen - suffixLen);
            end = fileLen - 1;
        }
        else
        {
            start = long.Parse(parts[0]);
            end = parts[1].Length > 0 ? Math.Min(long.Parse(parts[1]), fileLen - 1) : fileLen - 1;
        }

        if (start >= fileLen || start > end)
        {
            res.StatusCode = 416;
            res.AddHeader("Content-Range", "bytes */" + fileLen);
            return;
        }

        long length = end - start + 1;
        res.StatusCode = 206;
        res.AddHeader("Content-Range", "bytes " + start + "-" + end + "/" + fileLen);
        res.ContentLength64 = length;
        fs.Seek(start, SeekOrigin.Begin);
        if (!isHead) Copy(fs, res.OutputStream, length);
    }

    private static void Copy(Stream src, Stream dst, long count)
    {
        byte[] buf = new byte[65536];
        long remaining = count;
        while (remaining > 0)
        {
            int toRead = (int)Math.Min(buf.Length, remaining);
            int read = src.Read(buf, 0, toRead);
            if (read <= 0) break;
            dst.Write(buf, 0, read);
            remaining -= read;
        }
    }
}
'@

Add-Type -TypeDefinition $csharp -Language CSharp

$server = New-Object StaticServer($prefix, $root)
$server.Start()
