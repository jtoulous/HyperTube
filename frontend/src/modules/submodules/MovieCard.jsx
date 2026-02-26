import { useState } from "react";

export default function MovieCard({ result, isWatched, onDownload, isLogged, onCardClick }) {
    const [downloading, setDownloading] = useState(false);
    const [added, setAdded] = useState(false);

    const handleDownload = async (e) => {
        e.stopPropagation();
        if (!result.magneturl || downloading || added) return;
        setDownloading(true);
        try {
            await onDownload(result.title, result.magneturl, result.imdbid);
            setAdded(true);
        } finally {
            setDownloading(false);
        }
    };

    const hasPoster = result.poster && result.poster !== "N/A";

    return (
        <div
            style={{
                ...styles.card,
                ...(isWatched ? styles.cardSeen : {}),
                ...(onCardClick ? styles.cardClickable : {}),
            }}
            onClick={onCardClick ? () => onCardClick(result.title, result.tmdb_id) : undefined}
        >
            <div style={styles.poster}>
                {hasPoster
                    ? <img src={result.poster} alt={result.title} loading="lazy" style={styles.posterImg} />
                    : <div style={styles.noPoster}><span>🎬</span></div>
                }
                {isWatched && <div style={styles.watchedBadge}>✓ Watched</div>}
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
                {isLogged && result.magneturl && (
                    <button
                        style={{
                            ...styles.dlBtn,
                            ...(added ? styles.dlBtnDone : {}),
                            ...((downloading || added) ? styles.dlBtnDisabled : {}),
                        }}
                        onClick={handleDownload}
                        disabled={downloading || added}
                    >
                        {downloading
                            ? <span style={styles.dlSpinner} />
                            : added ? "✓ Added" : "⬇ Download"
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
        border: "1px solid #21262d",
        borderRadius: 8,
        overflow: "hidden",
        transition: "transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease",
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
        border: "1px solid #30363d",
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
    },
    dlBtnDone: {
        background: "rgba(63, 185, 80, 0.1)",
        borderColor: "rgba(63, 185, 80, 0.25)",
        color: "#3fb950",
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
