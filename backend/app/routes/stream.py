import os
import io
import re
import json
import asyncio
import zipfile
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse, JSONResponse, Response
import httpx
import logging

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stream", tags=["Streaming"])

MEDIA_DIRS = ["/downloads", "/downloads/temp", "/default-videos"]

RESOLUTION_MAP = {
    "360": 360,
    "480": 480,
    "720": 720,
}

# Text-based subtitle codecs that ffmpeg can convert to WebVTT
TEXT_SUBTITLE_CODECS = {
    "subrip", "srt", "ass", "ssa", "webvtt", "mov_text",
    "sami", "microdvd", "subviewer", "text", "realtext",
    "stl", "jacosub", "ttml",
}

def _safe_path(filename: str) -> str:
    """Search MEDIA_DIRS for the file, guarding against path traversal."""
    for base_dir in MEDIA_DIRS:
        base = os.path.realpath(base_dir)
        filepath = os.path.realpath(os.path.join(base, filename))
        if not filepath.startswith(base + os.sep) and filepath != base:
            continue
        if os.path.isfile(filepath):
            return filepath
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")


async def _run_ffprobe(filepath: str) -> dict:
    """Run ffprobe and return parsed JSON."""
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_streams",
        "-show_format",
        filepath,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ffprobe failed: {stderr.decode()}"
        )
    return json.loads(stdout)

@router.get("/info/{filename:path}")
async def get_file_info(filename: str):
    """
    Return total duration (seconds) and the list of audio tracks for a file.
    The player uses this to populate the language selector and the seek bar.
    """
    filepath = _safe_path(filename)
    probe = await _run_ffprobe(filepath)

    duration = float(probe.get("format", {}).get("duration", 0))

    audio_tracks = []
    audio_index = 0
    subtitle_tracks = []
    subtitle_index = 0
    for stream in probe.get("streams", []):
        codec_type = stream.get("codec_type")
        tags = stream.get("tags", {})
        if codec_type == "audio":
            label = tags.get("title") or tags.get("language") or f"Track {audio_index}"
            audio_tracks.append({
                "index":    audio_index,
                "language": tags.get("language", "und"),
                "title":    label,
                "codec":    stream.get("codec_name", ""),
                "channels": stream.get("channels", 2),
            })
            audio_index += 1
        elif codec_type == "subtitle":
            codec_name = stream.get("codec_name", "").lower()
            if codec_name not in TEXT_SUBTITLE_CODECS:
                subtitle_index += 1
                continue  # skip image-based subtitles (PGS, VOBSUB, etc.)
            label = tags.get("title") or tags.get("language") or f"Track {subtitle_index}"
            subtitle_tracks.append({
                "index":    subtitle_index,
                "language": tags.get("language", "und"),
                "title":    label,
                "codec":    codec_name,
            })
            subtitle_index += 1

    return JSONResponse({
        "duration": duration,
        "audio_tracks": audio_tracks,
        "subtitle_tracks": subtitle_tracks,
    })


@router.get("/subtitles/{filename:path}")
async def get_subtitles(
    filename: str,
    track: int = Query(default=0, description="Subtitle track index (0-based among subtitle streams)"),
):
    """Extract an embedded subtitle track as WebVTT."""
    filepath = _safe_path(filename)

    logger.info(f"[SUB-EXTRACT] Extracting track {track} from {filename}")

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-i", filepath,
        "-map", f"0:s:{track}",
        "-c:s", "webvtt",
        "-f", "webvtt",
        "pipe:1",
    ]

    logger.info(f"[SUB-EXTRACT] cmd: {' '.join(cmd)}")

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()

    if process.returncode != 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not extract subtitle track {track}: {stderr.decode()[:200]}",
        )

    return Response(content=stdout, media_type="text/vtt")


# ── Subdl.com subtitle API ──────────────────────────────────────────────
SUBDL_API_BASE = "https://api.subdl.com/api/v1/subtitles"
SUBDL_DL_BASE  = "https://dl.subdl.com"


def _srt_to_vtt(srt: str) -> str:
    """Convert SRT subtitle text to WebVTT."""
    vtt = "WEBVTT\n\n" + srt.replace("\r\n", "\n")
    vtt = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", vtt)
    return vtt


def _extract_subtitle_from_zip(zip_bytes: bytes) -> tuple[str, str]:
    """
    Extract the first subtitle file from a ZIP archive.
    Returns (content_string, format) where format is 'srt', 'vtt', or 'ass'.
    """
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        sub_extensions = (".srt", ".vtt", ".ass", ".ssa")
        for name in zf.namelist():
            # skip directories and macOS metadata
            if name.endswith("/") or "/__MACOSX" in name:
                continue
            ext = os.path.splitext(name)[1].lower()
            if ext in sub_extensions:
                raw = zf.read(name)
                # try utf-8-sig first (handles BOM), then latin-1 as fallback
                for encoding in ("utf-8-sig", "utf-8", "latin-1"):
                    try:
                        text = raw.decode(encoding)
                        return text, ext.lstrip(".")
                    except UnicodeDecodeError:
                        continue
                return raw.decode("latin-1"), ext.lstrip(".")
    raise ValueError("No subtitle file found in ZIP")


@router.get("/online-subtitles/search")
async def search_online_subtitles(
    imdb_id: str = Query(..., description="IMDB ID e.g. tt1234567"),
    languages: str = Query(default="en", description="Comma-separated language codes e.g. en,fr,es"),
):
    """
    Search for subtitles on Subdl.com.
    Free tier: 60 req/min, no daily download cap.
    Get an API key at https://subdl.com (free).
    """
    if not settings.SUBDL_API_KEY:
        return JSONResponse({"results": [], "error": "SUBDL_API_KEY not configured"})

    params = {
        "api_key":        settings.SUBDL_API_KEY,
        "imdb_id":        imdb_id,
        "languages":      languages,
        "subs_per_page":  30,
        "type":           "movie",
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(SUBDL_API_BASE, params=params)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.RequestError, httpx.HTTPStatusError) as e:
        logger.error(f"Subdl search error: {e}")
        return JSONResponse({"results": [], "error": str(e)}, status_code=502)

    if not data.get("status"):
        return JSONResponse({"results": [], "error": data.get("message", "Unknown error")})

    results = []
    for item in data.get("subtitles", []):
        results.append({
            "sd_id":     item.get("sd_id"),
            "url":       item.get("url", ""),       # relative path for download
            "file_name": item.get("name", ""),
            "language":  item.get("language", "??"),
            "release":   item.get("release_name", ""),
            "hi":        item.get("hi", False),
            "author":    item.get("author", "") if isinstance(item.get("author"), str) else (item.get("author") or {}).get("name", ""),
        })

    return JSONResponse({"results": results})


@router.get("/online-subtitles/download")
async def download_online_subtitle(
    url: str = Query(..., description="Subdl relative URL from search results"),
):
    """
    Download a subtitle ZIP from Subdl, extract it, and return WebVTT.
    """
    if not settings.SUBDL_API_KEY:
        raise HTTPException(status_code=500, detail="SUBDL_API_KEY not configured")

    download_url = SUBDL_DL_BASE + url if url.startswith("/") else f"{SUBDL_DL_BASE}/{url}"

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            resp = await client.get(download_url)
            resp.raise_for_status()
            zip_bytes = resp.content
    except (httpx.RequestError, httpx.HTTPStatusError) as e:
        logger.error(f"Subdl download error: {e}")
        raise HTTPException(status_code=502, detail=f"Download failed: {e}")

    try:
        text, fmt = _extract_subtitle_from_zip(zip_bytes)
    except Exception as e:
        logger.error(f"Subdl ZIP extraction error: {e}")
        raise HTTPException(status_code=502, detail=f"Could not extract subtitle: {e}")

    # Convert to WebVTT if needed
    if fmt == "srt":
        text = _srt_to_vtt(text)
    elif fmt in ("ass", "ssa"):
        # For ASS/SSA, do a basic conversion — strip formatting tags
        lines = text.split("\n")
        vtt_lines = ["WEBVTT", ""]
        in_events = False
        counter = 1
        for line in lines:
            if line.strip().startswith("[Events]"):
                in_events = True
                continue
            if in_events and line.startswith("Dialogue:"):
                parts = line.split(",", 9)
                if len(parts) >= 10:
                    start = parts[1].strip()
                    end   = parts[2].strip()
                    txt   = re.sub(r"\{[^}]*\}", "", parts[9].strip())
                    txt   = txt.replace("\\N", "\n").replace("\\n", "\n")
                    # Pad time to HH:MM:SS.mmm
                    for t in (start, end):
                        if len(t.split(":")[0]) < 2:
                            t = "0" + t
                    vtt_lines.append(str(counter))
                    vtt_lines.append(f"{start.replace(',','.')} --> {end.replace(',','.')}")
                    vtt_lines.append(txt)
                    vtt_lines.append("")
                    counter += 1
        text = "\n".join(vtt_lines)

    return Response(content=text.encode("utf-8"), media_type="text/vtt")


# Codecs the browser can decode natively in an MP4 container
BROWSER_SAFE_AUDIO = {"aac", "mp3", "opus", "flac", "vorbis"}


async def _probe_keyframe_time(filepath: str, target: float) -> float:
    """Return the PTS of the first frame FFmpeg would output when seeking
    to *target* in copy-mode (i.e. the nearest keyframe at or before target)."""
    if target <= 0:
        return 0.0
    proc = await asyncio.create_subprocess_exec(
        "ffprobe", "-v", "quiet",
        "-select_streams", "v:0",
        "-read_intervals", f"{target}%+#1",
        "-show_entries", "frame=pts_time",
        "-print_format", "csv=p=0",
        filepath,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, _ = await proc.communicate()
    for line in stdout.decode().strip().split("\n"):
        line = line.strip()
        if line:
            try:
                return float(line)
            except ValueError:
                pass
    return target  # fallback


@router.get("/keyframe-time/{filename:path}")
async def get_keyframe_time(
    filename: str,
    start: float = Query(default=0.0, description="Requested seek time in seconds"),
):
    """
    Return the actual keyframe PTS that FFmpeg copy-mode would seek to.
    Used by the player to set timeOffset for subtitle sync.
    """
    filepath = _safe_path(filename)
    actual = await _probe_keyframe_time(filepath, start)
    return JSONResponse({"actual_start": actual})


@router.get("/{filename:path}")
async def stream_video(
    filename: str,
    resolution: Optional[str] = Query(
        default="original",
        description="Target resolution height: 360 | 480 | 720 | original",
    ),
    audio_track: int = Query(default=0, description="Audio track index (0-based)"),
    start: float = Query(default=0.0, description="Seek start time in seconds"),
):
    """
    Stream a video file via FFmpeg.

    - resolution='original': stream-copy (no re-encode, fastest output).
    - Other resolutions: libx264 transcode to target height.
    Output is fragmented MP4 so the browser can begin playback immediately.
    """
    filepath = _safe_path(filename)

    target_height = RESOLUTION_MAP.get(resolution)
    use_copy = (resolution == "original")

    # --- copy-mode: detect audio codec & resolve keyframe seek position ---
    actual_start = start
    audio_needs_transcode = False
    if use_copy:
        probe = await _run_ffprobe(filepath)
        audio_streams = [s for s in probe.get("streams", [])
                         if s.get("codec_type") == "audio"]
        if audio_track < len(audio_streams):
            codec = audio_streams[audio_track].get("codec_name", "").lower()
            if codec not in BROWSER_SAFE_AUDIO:
                audio_needs_transcode = True
                logger.info(f"Audio codec '{codec}' not browser-safe – transcoding to AAC")

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", str(actual_start),
        "-i", filepath,
        "-map", "0:v:0",
        "-map", f"0:a:{audio_track}",
    ]

    if use_copy:
        cmd += ["-start_at_zero", "-c:v", "copy"]
        if audio_needs_transcode:
            cmd += ["-c:a", "aac", "-b:a", "192k"]
        else:
            cmd += ["-c:a", "copy"]
    else:
        # resolution downscale
        if target_height:
            cmd += ["-vf", f"scale=-2:{target_height}"]
        cmd += [
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-tune", "zerolatency",
            "-crf", "28",
            "-g", "150",
            "-sc_threshold", "0",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        ]

    cmd += [
        "-f", "mp4",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof",
        "pipe:1",
    ]

    logger.info(f"FFmpeg: {' '.join(cmd)}")

    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )

    async def iter_ffmpeg():
        try:
            while True:
                chunk = await process.stdout.read(64 * 1024)
                if not chunk:
                    break
                yield chunk
        except (Exception, GeneratorExit) as e:
            logger.error(f"FFmpeg stream error: {e}")
        finally:
            if process.returncode is None:
                try:
                    process.kill()
                except ProcessLookupError:
                    pass
            await process.wait()

    return StreamingResponse(
        iter_ffmpeg(),
        media_type="video/mp4",
        headers={"Cache-Control": "no-cache"},
    )
