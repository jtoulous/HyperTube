import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import Icon from "@mdi/react";
import {
    mdiPlay, mdiPause,
    mdiVolumeHigh, mdiVolumeMedium, mdiVolumeOff,
    mdiTranslate, mdiCog,
    mdiFullscreen, mdiFullscreenExit,
    mdiSubtitles,
} from "@mdi/js";

const RESOLUTIONS = ["original", "720", "480", "360"];

const LANG_NAMES = {
    // ISO 639-1 (2-letter)
    en: "English", fr: "French", es: "Spanish", de: "German", pt: "Portuguese",
    it: "Italian", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
    ru: "Russian", nl: "Dutch", pl: "Polish", sv: "Swedish", da: "Danish",
    fi: "Finnish", no: "Norwegian", tr: "Turkish", el: "Greek", he: "Hebrew",
    hu: "Hungarian", cs: "Czech", ro: "Romanian", th: "Thai", vi: "Vietnamese",
    id: "Indonesian", ms: "Malay", hi: "Hindi", bn: "Bengali", uk: "Ukrainian",
    bg: "Bulgarian", hr: "Croatian", sk: "Slovak", sl: "Slovenian", sr: "Serbian",
    lt: "Lithuanian", lv: "Latvian", et: "Estonian", ca: "Catalan", gl: "Galician",
    eu: "Basque", fa: "Persian", ur: "Urdu", ta: "Tamil", te: "Telugu",
    // ISO 639-2/B (3-letter, used by MKV/FFmpeg)
    eng: "English", fre: "French", fra: "French", spa: "Spanish", ger: "German",
    deu: "German", por: "Portuguese", ita: "Italian", jpn: "Japanese", kor: "Korean",
    zho: "Chinese", chi: "Chinese", ara: "Arabic", rus: "Russian", dut: "Dutch",
    nld: "Dutch", pol: "Polish", swe: "Swedish", dan: "Danish", fin: "Finnish",
    nor: "Norwegian", tur: "Turkish", gre: "Greek", ell: "Greek", heb: "Hebrew",
    hun: "Hungarian", cze: "Czech", ces: "Czech", rum: "Romanian", ron: "Romanian",
    tha: "Thai", vie: "Vietnamese", ind: "Indonesian", may: "Malay", msa: "Malay",
    hin: "Hindi", ben: "Bengali", ukr: "Ukrainian", bul: "Bulgarian", hrv: "Croatian",
    slk: "Slovak", slo: "Slovak", slv: "Slovenian", srp: "Serbian", lit: "Lithuanian",
    lav: "Latvian", est: "Estonian", cat: "Catalan", glg: "Galician", baq: "Basque",
    eus: "Basque", per: "Persian", fas: "Persian", urd: "Urdu", tam: "Tamil",
    tel: "Telugu", und: "Unknown",
    // Additional 3-letter codes
    kan: "Kannada", mal: "Malayalam", nob: "Norwegian Bokmål",
};
function langName(code) {
    if (!code) return "Unknown";
    return LANG_NAMES[code.toLowerCase()] || code.charAt(0).toUpperCase() + code.slice(1);
}

// Mapping from ISO 639-1 (2-letter) to all ISO 639-2/B (3-letter) variants
const LANG_2_TO_3 = {
    en: ["eng"], fr: ["fre", "fra"], es: ["spa"], de: ["ger", "deu"],
    pt: ["por"], it: ["ita"], ja: ["jpn"], ko: ["kor"], zh: ["zho", "chi"],
    ar: ["ara"], ru: ["rus"], nl: ["dut", "nld"], pl: ["pol"], sv: ["swe"],
    da: ["dan"], fi: ["fin"], no: ["nor", "nob"], tr: ["tur"], el: ["gre", "ell"],
    he: ["heb"], hu: ["hun"], cs: ["cze", "ces"], ro: ["rum", "ron"], th: ["tha"],
    vi: ["vie"], id: ["ind"], ms: ["may", "msa"], hi: ["hin"], bn: ["ben"],
    uk: ["ukr"], bg: ["bul"], hr: ["hrv"], sk: ["slk", "slo"], sl: ["slv"],
    sr: ["srp"], lt: ["lit"], lv: ["lav"], et: ["est"], ca: ["cat"], gl: ["glg"],
    eu: ["baq", "eus"], fa: ["per", "fas"], ur: ["urd"], ta: ["tam"], te: ["tel"],
};

// Build reverse map: 3-letter → 2-letter
const LANG_3_TO_2 = {};
for (const [code2, codes3] of Object.entries(LANG_2_TO_3)) {
    for (const c3 of codes3) LANG_3_TO_2[c3] = code2;
}

/** Check if a track's language tag matches a user preference (2- or 3-letter) */
function langMatches(trackLang, userLang) {
    if (!trackLang || !userLang) return false;
    const tl = trackLang.toLowerCase();
    const ul = userLang.toLowerCase();
    if (tl === ul) return true;
    // Normalise both to 2-letter and compare
    const tl2 = LANG_3_TO_2[tl] || tl;
    const ul2 = LANG_3_TO_2[ul] || ul;
    return tl2 === ul2;
}

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

export default function PlayerModule({ filename, imdbId, onTimeReport, initialTime = 0, userLang }) {
    const videoRef      = useRef(null);
    const containerRef  = useRef(null);
    const seekRef       = useRef(null);
    const hideTimerRef  = useRef(null);
    const wasPlayingRef = useRef(false); // remember play state across stream reloads

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
    const [showSubMenu,     setShowSubMenu]      = useState(false);
    const [controlsVisible, setControlsVisible] = useState(true);

    // Subtitle state
    const [subtitleTracks,    setSubtitleTracks]    = useState([]);
    const [onlineResults,     setOnlineResults]     = useState([]);
    const [onlineSubtitles,   setOnlineSubtitles]   = useState([]);
    const [onlineSearching,   setOnlineSearching]   = useState(false);
    const [onlineSearchDone,  setOnlineSearchDone]  = useState(false);
    const [downloadingFileId, setDownloadingFileId] = useState(null);  // url being downloaded
    const [activeSubtitle,    setActiveSubtitle]    = useState(-1);   // -1 = off
    const [activeCueText,     setActiveCueText]     = useState("");   // current subtitle text to render
    const [parsedCues,        setParsedCues]        = useState([]);   // array of arrays of {start, end, text}
    const vttCacheRef  = useRef(new Map());  // src → raw VTT text
    const [infoLoaded,        setInfoLoaded]        = useState(false);
    const autoSubRanRef = useRef(false);  // auto-subtitle selection ran

    // Derived absolute time: timeOffset = actual keyframe time, currentTime = relative from there
    const absTime = timeOffset + currentTime;
    const progress = totalDuration > 0 ? (absTime / totalDuration) * 100 : 0;
    const bufferProgress = totalDuration > 0 ? ((timeOffset + buffered) / totalDuration) * 100 : 0;

    const streamUrl = buildUrl(filename, resolution, audioTrack, startParam);

    // Fetch file info (duration + audio tracks), then resume from initialTime if set
    useEffect(() => {
        setAudioTrack(0);
        setResolution("original");
        setActiveSubtitle(-1);
        setOnlineSubtitles(prev => { prev.forEach(os => URL.revokeObjectURL(os.url)); return []; });
        setOnlineResults([]);
        setOnlineSearchDone(false);
        vttCacheRef.current.clear();
        setParsedCues([]);
        setInfoLoaded(false);
        autoSubRanRef.current = false;

        const resumeTime = initialTime || 0;
        setStartParam(resumeTime);
        setCurrentTime(0);

        // For copy mode, probe actual keyframe time; for start=0 just use 0
        if (resumeTime > 0) {
            fetch(`/api/v1/stream/keyframe-time/${filename}?start=${resumeTime}`)
                .then(r => r.json())
                .then(data => setTimeOffset(data.actual_start ?? resumeTime))
                .catch(() => setTimeOffset(resumeTime));
        } else {
            setTimeOffset(0);
        }

        fetch(`/api/v1/stream/info/${filename}`)
            .then(r => r.json())
            .then(data => {
                setTotalDuration(data.duration || 0);
                setAudioTracks(data.audio_tracks || []);
                setSubtitleTracks(data.subtitle_tracks || []);
                setInfoLoaded(true);
            })
            .catch(() => {
                setTotalDuration(0);
                setAudioTracks([]);
                setSubtitleTracks([]);
                setInfoLoaded(true);
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
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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
                setShowSubMenu(false);
            }
        }, 3000);
    }, []);

    // Combined subtitle list (embedded + downloaded online)
    const allSubtitles = useMemo(() => {
        const list = [
            ...subtitleTracks.map((t) => ({
                label: langName(t.language) + (t.title !== t.language ? ` — ${t.title}` : ""),
                language: t.language,
                src: `/api/v1/stream/subtitles/${filename}?track=${t.index}`,
            })),
            ...onlineSubtitles.map(os => ({
                label: os.name, language: os.language || "", src: os.url,
            })),
        ];
        return list;
    }, [subtitleTracks, onlineSubtitles, filename]);

    // Parse a VTT string into an array of {start, end, text}
    const parseVtt = useCallback((vttText) => {
        const cues = [];
        const blocks = vttText.split(/\n\n+/);

        // Convert a VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to seconds
        const parseTs = (str) => {
            const parts = str.split(":");
            if (parts.length === 3) {
                // HH:MM:SS.mmm
                return +parts[0]*3600 + +parts[1]*60 + parseFloat(parts[2]);
            } else if (parts.length === 2) {
                // MM:SS.mmm
                return +parts[0]*60 + parseFloat(parts[1]);
            }
            return 0;
        };

        for (const block of blocks) {
            const m = block.match(/(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})|(\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}[.,]\d{3})/);
            if (!m) continue;
            const startStr = m[1] || m[3];
            const endStr   = m[2] || m[4];
            const start = parseTs(startStr.replace(",", "."));
            const end   = parseTs(endStr.replace(",", "."));
            // Text is everything after the timestamp line
            const lines = block.split("\n");
            const tsIdx = lines.findIndex(l => /-->/.test(l));
            const text = lines.slice(tsIdx + 1).join("\n").trim();
            if (text) cues.push({ start, end, text });
        }
        return cues;
    }, []);

    // Fetch & parse VTT for all subtitle tracks (cached)
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const allCues = [];
            for (const sub of allSubtitles) {
                let raw = vttCacheRef.current.get(sub.src);
                if (!raw) {
                    try {
                        const resp = await fetch(sub.src);
                        raw = await resp.text();
                        vttCacheRef.current.set(sub.src, raw);
                    } catch (e) {
                        allCues.push([]);
                        continue;
                    }
                }
                if (cancelled) return;
                const cues = parseVtt(raw);
                allCues.push(cues);
            }
            if (!cancelled) {
                setParsedCues(allCues);
            }
        })();

        return () => { cancelled = true; };
    }, [allSubtitles, parseVtt]);

    // Render active subtitle text based on absTime (absolute movie time)
    useEffect(() => {
        if (activeSubtitle < 0 || activeSubtitle >= parsedCues.length) {
            setActiveCueText("");
            return;
        }
        const cues = parsedCues[activeSubtitle];
        if (!cues || cues.length === 0) { setActiveCueText(""); return; }

        let rafId;
        const update = () => {
            const t = absTimeRef.current;
            const active = [];
            for (const c of cues) {
                if (c.start > t + 1) break;
                if (t >= c.start && t < c.end) active.push(c.text);
            }
            setActiveCueText(active.join("\n"));
            rafId = requestAnimationFrame(update);
        };
        rafId = requestAnimationFrame(update);
        return () => cancelAnimationFrame(rafId);
    }, [activeSubtitle, parsedCues]);

    useEffect(() => {
        if (!infoLoaded || !userLang || autoSubRanRef.current) return;
        autoSubRanRef.current = true;

        const userAudioIdx = audioTracks.findIndex(t => langMatches(t.language, userLang));
        if (userAudioIdx >= 0) {
            if (userAudioIdx !== audioTrack) reloadStream({ track: userAudioIdx });
            return;
        }

        (async () => {
            const userEmbedIdx = subtitleTracks.findIndex(t => langMatches(t.language, userLang));
            if (userEmbedIdx >= 0) { setActiveSubtitle(userEmbedIdx); return; }

            const engEmbedIdx = subtitleTracks.findIndex(t => langMatches(t.language, "en"));

            if (imdbId) {
                try {
                    const searchLangs = langMatches(userLang, "en") ? "en" : `${userLang},en`;
                    const resp = await fetch(
                        `/api/v1/stream/online-subtitles/search?imdb_id=${encodeURIComponent(imdbId)}&languages=${searchLangs}`
                    );
                    const data = await resp.json();
                    const results = data.results || [];
                    setOnlineResults(results);
                    setOnlineSearchDone(true);

                    const userResult = results.find(r => langMatches(r.language, userLang));
                    const engResult = !userResult ? results.find(r => langMatches(r.language, "en")) : null;
                    const target = userResult || engResult;

                    if (target) {
                        const dlResp = await fetch(
                            `/api/v1/stream/online-subtitles/download?url=${encodeURIComponent(target.url)}`
                        );
                        if (dlResp.ok) {
                            const blob = await dlResp.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            const name = `${langName(target.language)} — ${target.release || target.file_name}`.slice(0, 60);
                            const newIdx = subtitleTracks.length;
                            setOnlineSubtitles(prev => [...prev, { name, language: target.language, url: blobUrl, dlUrl: target.url }]);
                            setActiveSubtitle(newIdx);
                            return;
                        }
                    }
                } catch {}
            }

            if (engEmbedIdx >= 0) { setActiveSubtitle(engEmbedIdx); return; }
        })();
    }, [infoLoaded, userLang, imdbId, subtitleTracks, audioTracks, audioTrack]);

    // Search for online subtitles (Subdl)
    const searchOnlineSubtitles = useCallback(async () => {
        if (!imdbId || onlineSearchDone) return;
        setOnlineSearching(true);
        try {
            const resp = await fetch(`/api/v1/stream/online-subtitles/search?imdb_id=${encodeURIComponent(imdbId)}&languages=en,fr,es,de,pt,it,ja,ko,zh,ar,ru`);
            const data = await resp.json();
            setOnlineResults(data.results || []);
        } catch {
            setOnlineResults([]);
        }
        setOnlineSearching(false);
        setOnlineSearchDone(true);
    }, [imdbId, onlineSearchDone]);

    // Download an online subtitle and add it as a track
    const downloadOnlineSub = useCallback(async (result) => {
        if (downloadingFileId) return;
        setDownloadingFileId(result.url);
        try {
            const resp = await fetch(`/api/v1/stream/online-subtitles/download?url=${encodeURIComponent(result.url)}`);
            if (!resp.ok) throw new Error("Download failed");
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const name = `${langName(result.language)} — ${result.release || result.file_name}`.slice(0, 60);
            setOnlineSubtitles(prev => [...prev, { name, language: result.language, url: blobUrl, dlUrl: result.url }]);
            // Auto-select the downloaded subtitle
            setActiveSubtitle(subtitleTracks.length + onlineSubtitles.length);
        } catch (e) {
            console.error("Subtitle download failed:", e);
        }
        setDownloadingFileId(null);
    }, [downloadingFileId, subtitleTracks.length, onlineSubtitles.length]);

    // Auto-fetch online subtitles when subtitle menu is opened
    useEffect(() => {
        if (showSubMenu && imdbId && !onlineSearchDone && !onlineSearching) {
            searchOnlineSubtitles();
        }
    }, [showSubMenu, searchOnlineSubtitles, onlineSearchDone, onlineSearching, imdbId]);

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

    // Reload the stream at a new position/resolution/track, preserving play state.
    // For copy mode, we AWAIT the keyframe probe so timeOffset is set correctly
    // BEFORE startParam triggers the stream URL change.
    const reloadStream = useCallback(async ({ time, res, track } = {}) => {
        const video = videoRef.current;
        wasPlayingRef.current = !!(video && !video.paused);
        const currentAbsTime = timeOffset + (video?.currentTime || 0);
        // Use startParam as fallback when video hasn't started playing yet
        const seekTarget = time ?? (currentAbsTime > 0 ? currentAbsTime : startParam);
        const effectiveRes = res !== undefined ? res : resolution;

        // Determine actual keyframe offset for copy mode
        let actualOffset = seekTarget;
        if (effectiveRes === "original" && seekTarget > 0) {
            try {
                const resp = await fetch(`/api/v1/stream/keyframe-time/${filename}?start=${seekTarget}`);
                const data = await resp.json();
                if (data.actual_start != null) actualOffset = data.actual_start;
            } catch {}
        }

        // Set timeOffset first, then startParam (which triggers stream URL change)
        setTimeOffset(actualOffset);
        setCurrentTime(0);
        setStartParam(seekTarget);
        if (res   !== undefined) setResolution(res);
        if (track !== undefined) setAudioTrack(track);
    }, [timeOffset, startParam, filename, resolution]);

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

            {/* Custom subtitle overlay */}
            {activeCueText && (
                <div style={styles.subtitleOverlay}>
                    <span style={styles.subtitleText}
                          dangerouslySetInnerHTML={{ __html: activeCueText.replace(/\n/g, "<br/>") }}
                    />
                </div>
            )}

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
                                onClick={() => { setShowLangMenu(v => !v); setShowResMenu(false); setShowSubMenu(false); }}
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

                        {/* Subtitles */}
                        <div style={styles.menuWrapper}>
                            <button
                                style={styles.ctrlBtn}
                                title="Subtitles"
                                onClick={() => { setShowSubMenu(v => !v); setShowResMenu(false); setShowLangMenu(false); }}
                            >
                                <Icon path={mdiSubtitles} size={1} />
                            </button>
                            {showSubMenu && (
                                <div
                                    style={{ ...styles.popupMenu, maxHeight: 340, overflowY: "auto", overflowX: "hidden", minWidth: 220 }}
                                    onClick={e => e.stopPropagation()}
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    {/* Off + embedded tracks */}
                                    <button
                                        style={{ ...styles.menuItem, ...(activeSubtitle === -1 ? styles.menuItemActive : {}) }}
                                        onClick={() => { setActiveSubtitle(-1); setShowSubMenu(false); }}
                                    >
                                        Off
                                    </button>
                                    {allSubtitles.map((sub, i) => (
                                        <button
                                            key={i}
                                            style={{ ...styles.menuItem, ...(activeSubtitle === i ? styles.menuItemActive : {}) }}
                                            onClick={() => { setActiveSubtitle(i); setShowSubMenu(false); }}
                                        >
                                            {sub.label}
                                        </button>
                                    ))}

                                    {/* Online subtitles section */}
                                    {imdbId && (
                                        <>
                                            <div style={styles.menuDivider} />
                                            <span style={styles.menuSectionLabel}>Subdl.com</span>
                                            {onlineSearching && (
                                                <span style={styles.menuEmpty}>Searching…</span>
                                            )}
                                            {onlineSearchDone && onlineResults.length === 0 && (
                                                <span style={styles.menuEmpty}>No subtitles found</span>
                                            )}
                                            {onlineResults.map((r, idx) => {
                                                const alreadyDownloaded = onlineSubtitles.some(os => os.dlUrl === r.url);
                                                const isDownloading = downloadingFileId === r.url;
                                                return (
                                                    <button
                                                        key={r.url || `sub-${idx}`}
                                                        style={{
                                                            ...styles.menuItem,
                                                            ...(alreadyDownloaded ? { color: "#238636" } : {}),
                                                            opacity: isDownloading ? 0.5 : 1,
                                                        }}
                                                        onClick={alreadyDownloaded ? undefined : () => downloadOnlineSub(r)}
                                                        disabled={isDownloading}
                                                        title={r.release || r.file_name}
                                                    >
                                                        <span style={{ fontWeight: 600, marginRight: 6, fontSize: "0.72rem" }}>
                                                            {langName(r.language)}
                                                        </span>
                                                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                            {r.release || r.file_name}
                                                        </span>
                                                        {isDownloading && <span style={{ marginLeft: 4 }}>…</span>}
                                                        {alreadyDownloaded && <span style={{ marginLeft: 4, fontSize: "0.7rem" }}>✓</span>}
                                                    </button>
                                                );
                                            })}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Resolution */}
                        <div style={styles.menuWrapper}>
                            <button
                                style={styles.ctrlBtn}
                                title="Quality"
                                onClick={() => { setShowResMenu(v => !v); setShowLangMenu(false); setShowSubMenu(false); }}
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
        zIndex: 1,
    },
    subtitleOverlay: {
        position: "absolute",
        bottom: "60px",
        left: "10%",
        right: "10%",
        textAlign: "center",
        pointerEvents: "none",
        zIndex: 15,
    },
    subtitleText: {
        display: "inline",
        padding: "2px 8px",
        background: "rgba(0,0,0,0.7)",
        color: "#fff",
        fontSize: "clamp(1rem, 2.5vw, 1.6rem)",
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1.4,
        borderRadius: "3px",
        boxDecorationBreak: "clone",
        WebkitBoxDecorationBreak: "clone",
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
        zIndex: 20,
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
        zIndex: 30,
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
    menuDivider: {
        height: 1,
        background: "rgba(255,255,255,0.1)",
        margin: "0.2rem 0",
    },
    menuEmpty: {
        display: "block",
        padding: "0.4rem 0.85rem",
        color: "#555",
        fontSize: "0.78rem",
        fontFamily: "'Inter', sans-serif",
    },
    menuSectionLabel: {
        display: "block",
        padding: "0.25rem 0.85rem 0.15rem",
        color: "#888",
        fontSize: "0.68rem",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        fontFamily: "'Inter', sans-serif",
    },
};

