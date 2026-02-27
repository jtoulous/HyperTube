import { useRef, useState, useCallback, useEffect } from "react";
import Icon from "@mdi/react";
import {
    mdiPlay, mdiPause,
    mdiVolumeHigh, mdiVolumeMedium, mdiVolumeOff,
    mdiTranslate, mdiCog,
    mdiFullscreen, mdiFullscreenExit,
} from "@mdi/js";

const RESOLUTIONS = ["360", "480", "720", "original"];

function formatTime(sec) {
    if (!sec || isNaN(sec) || !isFinite(sec)) return "0:00";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${m}:${String(s).padStart(2, "0")}`;
}

function buildUrl(filename, resolution, audioTrack, start) {
    const p = new URLSearchParams({
        resolution,
        audio_track: audioTrack,
        start: start.toFixed(3),
    });
    return `/api/v1/stream/${filename}?${p}`;
}

export default function PlayerModule({ filename, onTimeReport, initialTime = 0 }) {
    const videoRef      = useRef(null);
    const containerRef  = useRef(null);
    const seekRef       = useRef(null);
    const hideTimerRef  = useRef(null);
    const wasPlayingRef = useRef(false); // remember play state across stream reloads
    const initialTimeApplied = useRef(false);

    // Inject keyframe animation for the spinner once
    useEffect(() => {
        const id = "player-keyframes";
        if (!document.getElementById(id)) {
            const style = document.createElement("style");
            style.id = id;
            style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
            document.head.appendChild(style);
        }
    }, []);

    // Stream parameters
    const [resolution,  setResolution]  = useState("original");
    const [audioTrack,  setAudioTrack]  = useState(0);
    const [startParam,  setStartParam]  = useState(0);

    // File metadata (from /info endpoint)
    const [totalDuration, setTotalDuration] = useState(0);
    const [audioTracks,   setAudioTracks]   = useState([]);

    // Playback UI state
    const [playing,         setPlaying]         = useState(false);
    const [stalled,         setStalled]         = useState(false);
    const [currentTime,     setCurrentTime]      = useState(0);   // relative to current stream segment
    const [timeOffset,      setTimeOffset]       = useState(0);   // absolute seconds before this segment
    const [buffered,        setBuffered]         = useState(0);
    const [volume,          setVolume]           = useState(1);
    const [muted,           setMuted]            = useState(false);
    const [isFullscreen,    setIsFullscreen]     = useState(false);
    const [showResMenu,     setShowResMenu]      = useState(false);
    const [showLangMenu,    setShowLangMenu]     = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);

    // Derived absolute time
    const absTime = timeOffset + currentTime;
    const progress = totalDuration > 0 ? (absTime / totalDuration) * 100 : 0;
    const bufferProgress = totalDuration > 0 ? ((timeOffset + buffered) / totalDuration) * 100 : 0;

    const streamUrl = buildUrl(filename, resolution, audioTrack, startParam);

    // Fetch file info (duration + audio tracks), then resume from initialTime if set
    useEffect(() => {
        initialTimeApplied.current = false;
        setAudioTrack(0);
        setResolution("original");

        const resumeTime = initialTime || 0;
        setTimeOffset(resumeTime);
        setStartParam(resumeTime);

        fetch(`/api/v1/stream/info/${filename}`)
            .then(r => r.json())
            .then(data => {
                setTotalDuration(data.duration || 0);
                setAudioTracks(data.audio_tracks || []);
            })
            .catch(() => {
                setTotalDuration(0);
                setAudioTracks([]);
            });
    }, [filename]);

    // Video event listeners (attached once, persistent across stream reloads)
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateBuffered = () => {
            if (video.buffered.length > 0)
                setBuffered(video.buffered.end(video.buffered.length - 1));
        };
        const onPlay       = () => { setPlaying(true); setStalled(false); };
        const onPause      = () => { setPlaying(false); setControlsVisible(true); };
        const onTimeUpdate = () => { setCurrentTime(video.currentTime); updateBuffered(); };
        const onProgress   = () => updateBuffered();
        const onVolChange  = () => { setVolume(video.volume); setMuted(video.muted); };
        const onWaiting    = () => setStalled(true);
        const onCanPlay    = () => {
            setStalled(false);
            if (wasPlayingRef.current) {
                wasPlayingRef.current = false;
                video.play().catch(() => {});
            }
        };

        video.addEventListener("play",         onPlay);
        video.addEventListener("pause",        onPause);
        video.addEventListener("timeupdate",   onTimeUpdate);
        video.addEventListener("progress",     onProgress);
        video.addEventListener("volumechange", onVolChange);
        video.addEventListener("waiting",      onWaiting);
        video.addEventListener("canplay",      onCanPlay);
        video.addEventListener("playing",      onCanPlay);

        return () => {
            video.removeEventListener("play",         onPlay);
            video.removeEventListener("pause",        onPause);
            video.removeEventListener("timeupdate",   onTimeUpdate);
            video.removeEventListener("progress",     onProgress);
            video.removeEventListener("volumechange", onVolChange);
            video.removeEventListener("waiting",      onWaiting);
            video.removeEventListener("canplay",      onCanPlay);
            video.removeEventListener("playing",      onCanPlay);
            // Abort any in-flight stream on unmount
            video.pause();
            video.removeAttribute("src");
            video.load();
        };
    }, []);

    // Load new stream URL into persistent <video> element.
    // Setting .src on an attached element auto-aborts the previous fetch.
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        setCurrentTime(0);
        setBuffered(0);
        setStalled(true);
        video.src = streamUrl;
        video.load();
    }, [streamUrl]);

    // Fullscreen listener
    useEffect(() => {
        const onChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onChange);
        return () => document.removeEventListener("fullscreenchange", onChange);
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e) => {
            const video = videoRef.current;
            if (!video) return;
            switch (e.key) {
                case " ":          e.preventDefault(); video.paused ? video.play() : video.pause(); break;
                case "ArrowUp":    e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); break;
                case "ArrowDown":  e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); break;
                case "f":          toggleFullscreen(); break;
                case "m":          video.muted = !video.muted; break;
                default: return;
            }
            showControls();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [absTime, totalDuration]);

    // Report playback position periodically (every 15s) and on unmount
    const absTimeRef = useRef(0);
    const totalDurationRef = useRef(0);
    absTimeRef.current = absTime;
    totalDurationRef.current = totalDuration;

    useEffect(() => {
        if (!onTimeReport) return;

        const interval = setInterval(() => {
            const t = absTimeRef.current;
            if (t > 0) onTimeReport(Math.floor(t), totalDurationRef.current);
        }, 15000);

        return () => {
            clearInterval(interval);
            // Report final position on unmount
            const t = absTimeRef.current;
            if (t > 0) onTimeReport(Math.floor(t), totalDurationRef.current);
        };
    }, [onTimeReport]);

    // Controls auto-hide
    const showControls = useCallback(() => {
        setControlsVisible(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => {
            if (videoRef.current && !videoRef.current.paused) {
                setControlsVisible(false);
                setShowResMenu(false);
                setShowLangMenu(false);
            }
        }, 3000);
    }, []);

    // Actions
    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.ended) {
            reloadStream({ time: 0 });
        } else {
            v.paused ? v.play() : v.pause();
        }
    };

    const toggleMute = () => {
        const v = videoRef.current;
        if (v) v.muted = !v.muted;
    };

    const toggleFullscreen = () => {
        const el = containerRef.current;
        if (!el) return;
        document.fullscreenElement
            ? document.exitFullscreen().catch(() => {})
            : el.requestFullscreen().catch(() => {});
    };

    // Reload the stream at a new position/resolution/track, preserving play state
    const reloadStream = useCallback(({ time, res, track } = {}) => {
        const video = videoRef.current;
        wasPlayingRef.current = !!(video && !video.paused);
        const absTime = timeOffset + (video?.currentTime || 0);
        setTimeOffset(time ?? absTime);
        setStartParam(time ?? absTime);
        if (res   !== undefined) setResolution(res);
        if (track !== undefined) setAudioTrack(track);
    }, [timeOffset]);

    // Seek to an absolute timestamp (seconds) by reloading the stream
    const seekToAbsolute = useCallback((absoluteSec) => {
        const time = Math.max(0, Math.min(totalDuration, absoluteSec));
        reloadStream({ time });
    }, [totalDuration, reloadStream]);

    const handleSeekClick = (e) => {
        const bar = seekRef.current;
        if (!bar || totalDuration === 0) return;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        seekToAbsolute(ratio * totalDuration);
    };

    const handleVolume = (e) => {
        const v = videoRef.current;
        if (!v) return;
        const val = parseFloat(e.target.value);
        v.volume = val;
        if (val > 0) v.muted = false;
    };

    const switchResolution = useCallback((res) => {
        reloadStream({ res });
        setShowResMenu(false);
    }, [reloadStream]);

    const switchAudioTrack = useCallback((idx) => {
        reloadStream({ track: idx });
        setShowLangMenu(false);
    }, [reloadStream]);

    const volIcon = muted || volume === 0
        ? <Icon path={mdiVolumeOff}    size={1} />
        : volume < 0.5
        ? <Icon path={mdiVolumeMedium} size={1} />
        : <Icon path={mdiVolumeHigh}   size={1} />;

    const currentAudioLabel = audioTracks[audioTrack]?.title || `Track ${audioTrack}`;

    return (
        <div
            ref={containerRef}
            style={styles.container}
            onMouseMove={showControls}
            onMouseLeave={() => { if (playing) setControlsVisible(false); }}
        >
            <video
                ref={videoRef}
                style={styles.video}
                preload="metadata"
                autoPlay={false}
                onClick={togglePlay}
            />

            {/* Big play overlay when paused */}
            {!playing && !stalled && (
                <div style={styles.bigPlayOverlay} onClick={togglePlay}>
                    <div style={styles.bigPlayBtn}>
                        <Icon path={mdiPlay} size={1.5} />
                    </div>
                </div>
            )}

            {/* Buffering spinner */}
            {stalled && (
                <div style={styles.bigPlayOverlay}>
                    <div style={styles.spinner} />
                </div>
            )}

            {/* Top info bar */}
            <div style={{ ...styles.topBar, opacity: controlsVisible ? 1 : 0, pointerEvents: "none" }}>
                <span style={styles.fileInfo}>
                    {filename}
                    {resolution !== "original" && ` · ${resolution}p`}
                    {audioTracks.length > 0 && ` · ${currentAudioLabel}`}
                </span>
            </div>

            {/* Bottom controls */}
            <div style={{ ...styles.controls, opacity: controlsVisible ? 1 : 0, pointerEvents: controlsVisible ? "auto" : "none" }}>

                {/* Seek bar */}
                <div ref={seekRef} style={styles.seekBar} onClick={handleSeekClick}>
                    <div style={{ ...styles.seekBuffered, width: `${bufferProgress}%` }} />
                    <div style={{ ...styles.seekProgress, width: `${progress}%` }} />
                    <div style={{ ...styles.seekThumb,    left: `${progress}%` }} />
                </div>

                <div style={styles.controlsRow}>
                    {/* Left */}
                    <div style={styles.controlGroup}>
                        <button style={styles.ctrlBtn} onClick={togglePlay} title={playing ? "Pause" : "Play"}>
                            <Icon path={playing ? mdiPause : mdiPlay} size={1} />
                        </button>

                        <button style={styles.ctrlBtn} onClick={toggleMute} title="Mute">
                            {volIcon}
                        </button>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={muted ? 0 : volume}
                            onChange={handleVolume}
                            style={styles.volumeSlider}
                        />

                        <span style={styles.timeLabel}>
                            {formatTime(absTime)} / {formatTime(totalDuration)}
                        </span>
                    </div>

                    {/* Right */}
                    <div style={styles.controlGroup}>

                        {/* Language / audio track */}
                        <div style={styles.menuWrapper}>
                            <button
                                style={styles.ctrlBtn}
                                title="Audio track"
                                onClick={() => { setShowLangMenu(v => !v); setShowResMenu(false); }}
                            >
                                <Icon path={mdiTranslate} size={1} />
                            </button>
                            {showLangMenu && (
                                <div style={styles.popupMenu}>
                                    {audioTracks.length === 0
                                        ? <span style={styles.menuEmpty}>No audio tracks</span>
                                        : audioTracks.map(t => (
                                            <button
                                                key={t.index}
                                                style={{ ...styles.menuItem, ...(audioTrack === t.index ? styles.menuItemActive : {}) }}
                                                onClick={() => switchAudioTrack(t.index)}
                                            >
                                                {t.title}
                                            </button>
                                        ))
                                    }
                                </div>
                            )}
                        </div>

                        {/* Resolution */}
                        <div style={styles.menuWrapper}>
                            <button
                                style={styles.ctrlBtn}
                                title="Quality"
                                onClick={() => { setShowResMenu(v => !v); setShowLangMenu(false); }}
                            >
                                <Icon path={mdiCog} size={1} />
                            </button>
                            {showResMenu && (
                                <div style={styles.popupMenu}>
                                    {RESOLUTIONS.map(res => (
                                        <button
                                            key={res}
                                            style={{ ...styles.menuItem, ...(resolution === res ? styles.menuItemActive : {}) }}
                                            onClick={() => switchResolution(res)}
                                        >
                                            {res === "original" ? "Original" : `${res}p`}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Fullscreen */}
                        <button style={styles.ctrlBtn} onClick={toggleFullscreen} title="Fullscreen">
                            <Icon path={isFullscreen ? mdiFullscreenExit : mdiFullscreen} size={1} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
        aspectRatio: "16 / 9",
        background: "#000",
        borderRadius: "8px",
        overflow: "hidden",
        userSelect: "none",
    },
    video: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        cursor: "pointer",
    },
    bigPlayOverlay: {
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.25)",
        cursor: "pointer",
    },
    bigPlayBtn: {
        width: "64px",
        height: "64px",
        borderRadius: "50%",
        background: "rgba(255,255,255,0.15)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
    },
    spinner: {
        width: "48px",
        height: "48px",
        borderRadius: "50%",
        border: "4px solid rgba(255,255,255,0.15)",
        borderTopColor: "#007BFF",
        animation: "spin 0.8s linear infinite",
    },
    topBar: {
        position: "absolute",
        top: 0, left: 0, right: 0,
        padding: "0.6rem 0.8rem",
        background: "linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)",
        transition: "opacity 0.3s",
    },
    fileInfo: {
        color: "#ddd",
        fontSize: "0.78rem",
        fontFamily: "'Inter', monospace",
    },
    controls: {
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.85), transparent)",
        padding: "0.5rem 0.6rem 0.45rem",
        transition: "opacity 0.3s",
    },
    seekBar: {
        position: "relative",
        height: "4px",
        background: "rgba(255,255,255,0.2)",
        borderRadius: "2px",
        cursor: "pointer",
        marginBottom: "0.5rem",
    },
    seekBuffered: {
        position: "absolute",
        top: 0, left: 0, height: "100%",
        background: "rgba(255,255,255,0.25)",
        borderRadius: "2px",
        pointerEvents: "none",
    },
    seekProgress: {
        position: "absolute",
        top: 0, left: 0, height: "100%",
        background: "#007BFF",
        borderRadius: "2px",
        pointerEvents: "none",
    },
    seekThumb: {
        position: "absolute",
        top: "50%",
        width: "12px",
        height: "12px",
        borderRadius: "50%",
        background: "#fff",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        boxShadow: "0 0 4px rgba(0,0,0,0.5)",
    },
    controlsRow: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },
    controlGroup: {
        display: "flex",
        alignItems: "center",
        gap: "0.35rem",
    },
    ctrlBtn: {
        background: "none",
        border: "none",
        color: "#fff",
        cursor: "pointer",
        padding: "0.2rem 0.3rem",
        borderRadius: "4px",
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
    },
    timeLabel: {
        color: "#ccc",
        fontSize: "0.75rem",
        fontFamily: "'Inter', monospace",
        whiteSpace: "nowrap",
        marginLeft: "0.2rem",
    },
    volumeSlider: {
        width: "60px",
        accentColor: "#007BFF",
        cursor: "pointer",
    },
    menuWrapper: {
        position: "relative",
    },
    popupMenu: {
        position: "absolute",
        bottom: "calc(100% + 8px)",
        right: 0,
        background: "rgba(18,18,18,0.96)",
        borderRadius: "6px",
        padding: "0.3rem 0",
        minWidth: "120px",
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
        zIndex: 10,
    },
    menuItem: {
        display: "block",
        width: "100%",
        padding: "0.4rem 0.85rem",
        background: "none",
        border: "none",
        color: "#bbb",
        fontSize: "0.8rem",
        fontFamily: "'Inter', sans-serif",
        textAlign: "left",
        cursor: "pointer",
    },
    menuItemActive: {
        color: "#007BFF",
        fontWeight: 600,
    },
    menuEmpty: {
        display: "block",
        padding: "0.4rem 0.85rem",
        color: "#555",
        fontSize: "0.78rem",
        fontFamily: "'Inter', sans-serif",
    },
};

