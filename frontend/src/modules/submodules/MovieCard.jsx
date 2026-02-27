import { useState, useRef } from "react";

function formatEta(seconds) {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}min`;
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
}

export default function MovieCard({ result, isWatched, watchProgress, onDownload, isLogged, onCardClick, libraryMode, filmStatus }) {
    const [downloading, setDownloading] = useState(false);
    const [added, setAdded] = useState(false);
    const cardRef = useRef(null);

    // Film is already on the server (downloaded or in progress)
    const alreadyOnServer = !!filmStatus;
    const isCompleted = filmStatus === "completed";
    const isDownloading = filmStatus === "downloading";

    const hasDownloadLink = result.magneturl || result.torrenturl;

    const handleDownload = async (e) => {
        e.stopPropagation();
        if (!hasDownloadLink || downloading || added || alreadyOnServer) return;
        setDownloading(true);
        try {
            await onDownload(result.title, result.magneturl, result.imdbid, result.torrenturl);
            setAdded(true);
        } finally {
            setDownloading(false);
        }
    };

    const hasPoster = result.poster && result.poster !== "N/A";
    const status = result.status;       // "downloading" | "completed" | "error" | "paused"  (library only)
    const canWatch = result.can_watch;   // boolean (library only)
    const progress = result.progress;    // 0-100 (library only)
    const readyIn = result.watch_ready_in;

    // Watch progress (from watched_films table)
    const stoppedAt = watchProgress?.stopped_at || 0;
    const filmDuration = result.duration || 0;  // seconds
    const watchPct = (filmDuration > 0 && stoppedAt > 0) ? Math.min((stoppedAt / filmDuration) * 100, 100) : 0;
    const hasWatchProgress = !isWatched && stoppedAt > 0 && filmDuration > 0;

    return (
        <div
            ref={cardRef}
            style={{
                ...styles.card,
                ...(isWatched ? styles.cardSeen : {}),
                ...(onCardClick ? styles.cardClickable : {}),
            }}
            onClick={onCardClick ? () => onCardClick(result.title, result.tmdb_id) : undefined}
            onMouseEnter={() => {
                const el = cardRef.current;
                if (!el) return;
                el.style.transform = "translateY(-6px) scale(1.03)";
                el.style.boxShadow = isWatched
                    ? "0 12px 32px rgba(63,185,80,0.15), 0 0 0 1px rgba(63,185,80,0.3)"
                    : "0 12px 32px rgba(0,123,255,0.12), 0 0 0 1px rgba(0,123,255,0.15)";
                el.style.borderColor = isWatched ? "rgba(63,185,80,0.5)" : "rgba(0,123,255,0.35)";
                // zoom the poster image
                const img = el.querySelector('img[loading="lazy"]');
                if (img) img.style.transform = "scale(1.08)";
            }}
            onMouseLeave={() => {
                const el = cardRef.current;
                if (!el) return;
                el.style.transform = "translateY(0) scale(1)";
                el.style.boxShadow = "none";
                el.style.borderColor = isWatched ? "rgba(63,185,80,0.25)" : "#21262d";
                const img = el.querySelector('img[loading="lazy"]');
                if (img) img.style.transform = "scale(1)";
            }}
        >
            <div style={styles.poster}>
                {hasPoster
                    ? <img src={result.poster} alt={result.title} loading="lazy" style={{ ...styles.posterImg, ...(isWatched ? styles.posterImgWatched : {}) }} />
                    : <div style={styles.noPoster}><span>🎬</span></div>
                }

                {/* Status / badge overlays */}
                {isWatched && <div style={styles.watchedBadge}>✓ Watched</div>}

                {libraryMode && status === "completed" && canWatch && !isWatched && (
                    <div style={styles.readyBadge}>Fully Available</div>
                )}
                {libraryMode && status === "downloading" && canWatch && (
                    <div style={styles.canWatchBadge}>Partially Available</div>
                )}
                {libraryMode && status === "downloading" && !canWatch && (
                    <div style={styles.downloadingBadge}>
                        ⬇ {Math.round(progress || 0)}%
                        {readyIn != null && readyIn > 0 && (
                            <span style={styles.readyInText}> · {formatEta(readyIn)}</span>
                        )}
                    </div>
                )}
                {libraryMode && status === "paused" && (
                    <div style={styles.pausedBadge}>⏸ Paused</div>
                )}
                {libraryMode && status === "error" && (
                    <div style={styles.errorBadge}>✕ Error</div>
                )}

                {/* Progress bar overlay for downloading films */}
                {libraryMode && status === "downloading" && (
                    <div style={styles.progressBarBg}>
                        <div style={{ ...styles.progressBarFill, width: `${Math.min(progress || 0, 100)}%` }} />
                    </div>
                )}

                {/* Watch progress bar (how far the user watched) */}
                {hasWatchProgress && (
                    <>
                        <div style={styles.watchProgressBadge}>
                            ▶ {Math.round(watchPct)}%
                        </div>
                        <div style={styles.watchProgressBarBg}>
                            <div style={{ ...styles.watchProgressBarFill, width: `${watchPct}%` }} />
                        </div>
                    </>
                )}

                {result.imdb_rating && result.imdb_rating !== "N/A" && (
                    <div style={styles.ratingBadge}>★ {result.imdb_rating}</div>
                )}
            </div>
            <div style={styles.body}>
                <div style={styles.title} title={result.title}>{result.title}</div>
                <div style={styles.meta}>
                    {result.year && result.year !== "N/A" && (
                        <span style={styles.year}>{String(result.year).slice(0, 4)}</span>
                    )}
                    {result.seeders > 0 && (
                        <span style={styles.seeders}>▲ {result.seeders}</span>
                    )}
                </div>
                {result.genre_tags && result.genre_tags.length > 0 && (
                    <div style={styles.genres}>
                        {result.genre_tags.slice(0, 2).map(g => (
                            <span key={g} style={styles.genreTag}>{g}</span>
                        ))}
                    </div>
                )}
                {!libraryMode && isLogged && hasDownloadLink && (
                    <button
                        style={{
                            ...styles.dlBtn,
                            ...(added || isCompleted ? styles.dlBtnDone : {}),
                            ...(isDownloading ? styles.dlBtnInProgress : {}),
                            ...((downloading || added || alreadyOnServer) ? styles.dlBtnDisabled : {}),
                        }}
                        onClick={handleDownload}
                        disabled={downloading || added || alreadyOnServer}
                        onMouseEnter={e => { if (!downloading && !added && !alreadyOnServer) { e.currentTarget.style.background = "linear-gradient(135deg, #007BFF 0%, #0969da 100%)"; e.currentTarget.style.borderColor = "#007BFF"; e.currentTarget.style.color = "#fff"; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,123,255,0.25)"; } }}
                        onMouseLeave={e => { if (!downloading && !added && !alreadyOnServer) { e.currentTarget.style.background = "#21262d"; e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.color = "#c9d1d9"; e.currentTarget.style.boxShadow = "none"; } }}
                    >
                        {downloading
                            ? <span style={styles.dlSpinner} />
                            : isCompleted ? "✓ Available"
                            : isDownloading ? "⬇ In progress"
                            : added ? "✓ Added"
                            : "⬇ Download"
                        }
                    </button>
                )}
            </div>
        </div>
    );
}

const styles = {
    card: {
        background: "#0d1117",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#21262d",
        borderRadius: 10,
        overflow: "hidden",
        transition: "all 0.4s cubic-bezier(0.25, 1, 0.3, 1)",
        cursor: "default",
        display: "flex",
        flexDirection: "column",
    },
    cardSeen: {
        borderColor: "rgba(63, 185, 80, 0.25)",
    },
    cardClickable: {
        cursor: "pointer",
    },
    poster: {
        position: "relative",
        width: "100%",
        aspectRatio: "2 / 3",
        background: "#0d1117",
        overflow: "hidden",
        flexShrink: 0,
    },
    posterImg: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
        display: "block",
        transition: "transform 0.5s cubic-bezier(0.25, 1, 0.3, 1), filter 0.4s ease, opacity 0.4s ease",
    },
    posterImgWatched: {
        filter: "grayscale(0.55) brightness(0.65)",
        opacity: 0.75,
    },
    noPoster: {
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "2.2rem",
        background: "#161b22",
    },
    watchedBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        background: "rgba(35, 134, 54, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    readyBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        background: "rgba(35, 134, 54, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    canWatchBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        background: "rgba(0, 123, 255, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    downloadingBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        background: "rgba(210, 153, 34, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    readyInText: {
        fontWeight: 500,
        opacity: 0.85,
    },
    pausedBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        background: "rgba(158, 106, 3, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    errorBadge: {
        position: "absolute",
        top: 6,
        left: 6,
        background: "rgba(218, 54, 51, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    progressBarBg: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "rgba(0, 0, 0, 0.5)",
    },
    progressBarFill: {
        height: "100%",
        background: "#007BFF",
        transition: "width 1s ease",
    },
    watchProgressBadge: {
        position: "absolute",
        bottom: 6,
        left: 6,
        background: "rgba(0, 123, 255, 0.88)",
        color: "#fff",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 10,
        letterSpacing: "0.03em",
        backdropFilter: "blur(4px)",
    },
    watchProgressBarBg: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        background: "rgba(0, 0, 0, 0.5)",
    },
    watchProgressBarFill: {
        height: "100%",
        background: "#007BFF",
        transition: "width 0.3s ease",
    },
    ratingBadge: {
        position: "absolute",
        bottom: 6,
        right: 6,
        background: "rgba(0, 0, 0, 0.72)",
        color: "#f5c518",
        fontSize: "0.68rem",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 6,
        backdropFilter: "blur(4px)",
    },
    body: {
        padding: "10px 10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        flex: 1,
    },
    title: {
        fontSize: "0.8rem",
        fontWeight: 600,
        color: "#c9d1d9",
        fontFamily: "'Inter', sans-serif",
        lineHeight: 1.3,
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
    },
    meta: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
    },
    year: {
        color: "#8b949e",
        fontSize: "0.72rem",
    },
    seeders: {
        color: "#3fb950",
        fontSize: "0.7rem",
        fontWeight: 600,
    },
    genres: {
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
    },
    genreTag: {
        background: "rgba(0, 123, 255, 0.08)",
        border: "1px solid rgba(0, 123, 255, 0.2)",
        color: "#58a6ff",
        fontSize: "0.62rem",
        padding: "1px 7px",
        borderRadius: 8,
        whiteSpace: "nowrap",
    },
    dlBtn: {
        marginTop: "auto",
        padding: "5px 10px",
        width: "100%",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#30363d",
        borderRadius: 6,
        background: "#21262d",
        color: "#c9d1d9",
        fontSize: "0.74rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    dlBtnDone: {
        background: "rgba(63, 185, 80, 0.1)",
        borderColor: "rgba(63, 185, 80, 0.25)",
        color: "#3fb950",
    },
    dlBtnInProgress: {
        background: "rgba(210, 153, 34, 0.1)",
        borderColor: "rgba(210, 153, 34, 0.25)",
        color: "#d29922",
    },
    dlBtnDisabled: {
        cursor: "not-allowed",
        opacity: 0.5,
    },
    dlSpinner: {
        display: "inline-block",
        width: 11,
        height: 11,
        border: "2px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
};
