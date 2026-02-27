import os
import json
import asyncio
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse, JSONResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stream", tags=["Streaming"])

MEDIA_DIRS = ["/downloads", "/downloads/temp", "/default-videos"]

RESOLUTION_MAP = {
    "360": 360,
    "480": 480,
    "720": 720,
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
        logger.warning(f"ffprobe failed on {filepath}: {stderr.decode()[:200]}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File is not yet playable (still downloading or corrupt)",
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
    for stream in probe.get("streams", []):
        if stream.get("codec_type") != "audio":
            continue
        tags = stream.get("tags", {})
        label = tags.get("title") or tags.get("language") or f"Track {audio_index}"
        audio_tracks.append({
            "index":    audio_index,
            "language": tags.get("language", "und"),
            "title":    label,
            "codec":    stream.get("codec_name", ""),
            "channels": stream.get("channels", 2),
        })
        audio_index += 1

    return JSONResponse({"duration": duration, "audio_tracks": audio_tracks})

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

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-ss", str(start),
        "-i", filepath,
        "-map", "0:v:0",
        "-map", f"0:a:{audio_track}",
    ]

    if use_copy:
        cmd += [
            "-avoid_negative_ts", "make_zero",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        ]
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
        "-f", "matroska",
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
        media_type="video/x-matroska",
        headers={"Cache-Control": "no-cache"},
    )
