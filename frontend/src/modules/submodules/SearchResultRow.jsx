import { useState, useRef } from "react";
import { searchApi } from "../../api/search";
import { formatSize, formatDate } from "./utils";

export default function SearchResultRow({ result, isExpanded, onToggle, onDownload, isLogged }) {
    const detailsRef = useRef(null);
    const [mediaDetails, setMediaDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState(null);
    const [hoverBtn, setHoverBtn] = useState(null);
    const [dlSuccess, setDlSuccess] = useState(false);
    const [dlLoading, setDlLoading] = useState(false);

    const handleDownloadClick = async (title, magneturl, imdbid, torrenturl) => {
        if (dlLoading || dlSuccess) return;
        setDlLoading(true);
        try {
            await onDownload(title, magneturl, imdbid, torrenturl);
            setDlSuccess(true);
            setTimeout(() => setDlSuccess(false), 3000);
        } finally {
            setDlLoading(false);
        }
    };

    // Effective IMDb ID: prefer Jackett's, fall back to guessit's
    const effectiveImdbId = result.imdbid || result.guessed_imdbid;

    const handleToggle = () => {
        if (!isExpanded && effectiveImdbId && !mediaDetails && !loadingDetails) {
            setLoadingDetails(true);
            setDetailsError(null);
            searchApi.getMediaDetails(effectiveImdbId)
                .then(res => setMediaDetails(res.data))
                .catch((err) => {
                    const msg = err?.response?.data?.detail || err?.message || "Could not load details";
                    console.error("TMDB fetch error:", effectiveImdbId, msg);
                    setDetailsError(msg);
                })
                .finally(() => setLoadingDetails(false));
        }
        onToggle();
    };

    const updateHeight = () => {
        const el = detailsRef.current;
        if (!el) return;
        if (isExpanded) {
            el.style.height = el.scrollHeight + "px";
            el.style.opacity = "1";
        } else {
            el.style.height = "0px";
            el.style.opacity = "0";
        }
    };

    useState(() => {
        const timer = setTimeout(updateHeight, 10);
        return () => clearTimeout(timer);
    });

    // eslint-disable-next-line
    useState(() => { });

    return (
        <div
            style={{ ...styles.row, ...(isExpanded ? styles.rowExpanded : {}) }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,123,255,0.08)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#21262d"; e.currentTarget.style.boxShadow = "none"; }}
        >
            <div
                style={styles.header}
                onClick={handleToggle}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.paddingLeft = "20px"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.paddingLeft = "16px"; }}
            >
                <div style={styles.titleArea}>
                    <span style={styles.title}>{result.title}</span>
                    {result.match_quality === "exact" && (
                        <span style={styles.matchExactBadge}>✓ Match</span>
                    )}
                    {result.match_quality === "different" && (
                        <span style={styles.matchDiffBadge}>✗ Different</span>
                    )}
                    {result.match_quality === "unknown" && !effectiveImdbId && (
                        <span style={styles.noMatchBadge}>? No ID</span>
                    )}
                    {result.imdbid && <span style={styles.imdbBadge}>IMDb</span>}
                    {!result.imdbid && result.guessed_imdbid && (
                        <span style={styles.guessedBadge}>Guessed</span>
                    )}
                </div>
                <div style={styles.meta}>
                    <span style={{ ...styles.metaItem, ...styles.seeders }} title="Seeders">▲ {result.seeders}</span>
                    <span style={{ ...styles.metaItem, ...styles.peers }} title="Peers">▼ {result.peers}</span>
                    <span style={styles.metaItem}>{formatSize(result.size)}</span>
                    <span style={{ ...styles.metaItem, ...styles.indexer }}>{result.indexer || "—"}</span>
                    <span style={{ ...styles.chevron, ...(isExpanded ? styles.chevronOpen : {}) }}>❯</span>
                </div>
            </div>

            <div
                style={styles.details}
                ref={(el) => {
                    detailsRef.current = el;
                    if (el) {
                        if (isExpanded) {
                            el.style.height = el.scrollHeight + "px";
                            el.style.opacity = "1";
                        } else {
                            el.style.height = "0px";
                            el.style.opacity = "0";
                        }
                    }
                }}
            >
                <div style={styles.detailsInner}>
                    {!effectiveImdbId && (
                        <div style={styles.torrentInfoOnly}>
                            <div style={styles.infoRow}><span style={styles.infoLabel}>Published</span><span style={styles.infoValue}>{formatDate(result.pub_date)}</span></div>
                            <div style={styles.infoRow}><span style={styles.infoLabel}>Category</span><span style={styles.infoValue}>{result.category || "—"}</span></div>
                            <div style={styles.infoRow}><span style={styles.infoLabel}>Source</span><span style={styles.infoValue}>{result.indexer || "—"}</span></div>
                            {isLogged && (result.magneturl || result.torrenturl) && (
                                <button
                                    style={{ ...styles.magnetBtn, ...(dlSuccess ? styles.magnetBtnSuccess : {}), ...(hoverBtn === "noImdb" && !dlSuccess ? styles.magnetBtnHover : {}), ...((dlLoading || dlSuccess) ? styles.magnetBtnDisabled : {}) }}
                                    onClick={() => handleDownloadClick(result.title, result.magneturl, effectiveImdbId, result.torrenturl)}
                                    onMouseEnter={() => setHoverBtn("noImdb")}
                                    onMouseLeave={() => setHoverBtn(null)}
                                    disabled={dlLoading || dlSuccess}
                                    title="Download torrent"
                                >
                                    {dlLoading ? "⏳ Starting..." : dlSuccess ? "✓ Download started" : result.magneturl ? "Download (magnet)" : "Download (.torrent)"}
                                </button>
                            )}
                        </div>
                    )}

                    {effectiveImdbId && loadingDetails && (
                        <div style={styles.detailsLoading}>
                            <div style={styles.detailsSpinner} />
                            <span>Loading details...</span>
                        </div>
                    )}

                    {effectiveImdbId && detailsError && !loadingDetails && (
                        <div style={styles.detailsError}>{detailsError}</div>
                    )}

                    {effectiveImdbId && mediaDetails && !loadingDetails && (
                        <div style={styles.mediaDetails}>
                            {mediaDetails.poster && mediaDetails.poster !== "N/A" && (
                                <img style={styles.poster} src={mediaDetails.poster} alt={mediaDetails.title} />
                            )}
                            <div style={styles.mediaInfo}>
                                <div style={styles.mediaTitleRow}>
                                    <span style={styles.mediaTitle}>{mediaDetails.title}</span>
                                    <span style={styles.mediaYear}>{mediaDetails.year}</span>
                                    {mediaDetails.type && <span style={styles.mediaType}>{mediaDetails.type}</span>}
                                </div>

                                {mediaDetails.genre && (
                                    <div style={styles.genres}>
                                        {mediaDetails.genre.split(", ").map((g, i) => (
                                            <span key={i} style={styles.genreTag}>{g}</span>
                                        ))}
                                    </div>
                                )}

                                {mediaDetails.plot && mediaDetails.plot !== "N/A" && (
                                    <p style={styles.plot}>{mediaDetails.plot}</p>
                                )}

                                <div style={styles.mediaMetaGrid}>
                                    {mediaDetails.imdb_rating && mediaDetails.imdb_rating !== "N/A" && (
                                        <div style={styles.rating}>
                                            <span style={styles.ratingStar}>★</span>
                                            <span style={styles.ratingValue}>{mediaDetails.imdb_rating}</span>
                                            <span style={styles.ratingLabel}>/10</span>
                                        </div>
                                    )}
                                    {mediaDetails.runtime && mediaDetails.runtime !== "N/A" && (
                                        <div style={styles.infoRow}><span style={styles.infoLabel}>Runtime</span><span style={styles.infoValue}>{mediaDetails.runtime}</span></div>
                                    )}
                                    {mediaDetails.director && mediaDetails.director !== "N/A" && (
                                        <div style={styles.infoRow}><span style={styles.infoLabel}>Director</span><span style={styles.infoValue}>{mediaDetails.director}</span></div>
                                    )}
                                    {mediaDetails.actors && mediaDetails.actors !== "N/A" && (
                                        <div style={styles.infoRow}><span style={styles.infoLabel}>Cast</span><span style={styles.infoValue}>{mediaDetails.actors}</span></div>
                                    )}
                                    {mediaDetails.language && mediaDetails.language !== "N/A" && (
                                        <div style={styles.infoRow}><span style={styles.infoLabel}>Language</span><span style={styles.infoValue}>{mediaDetails.language}</span></div>
                                    )}
                                    {mediaDetails.country && mediaDetails.country !== "N/A" && (
                                        <div style={styles.infoRow}><span style={styles.infoLabel}>Country</span><span style={styles.infoValue}>{mediaDetails.country}</span></div>
                                    )}
                                    {mediaDetails.total_seasons && (
                                        <div style={styles.infoRow}><span style={styles.infoLabel}>Seasons</span><span style={styles.infoValue}>{mediaDetails.total_seasons}</span></div>
                                    )}
                                </div>

                                <div style={styles.torrentSection}>
                                    <div style={styles.infoRow}><span style={styles.infoLabel}>Published</span><span style={styles.infoValue}>{formatDate(result.pub_date)}</span></div>
                                    <div style={styles.infoRow}><span style={styles.infoLabel}>Source</span><span style={styles.infoValue}>{result.indexer || "—"}</span></div>
                                    {isLogged && (result.magneturl || result.torrenturl) && (
                                        <button
                                            style={{ ...styles.magnetBtn, ...(dlSuccess ? styles.magnetBtnSuccess : {}), ...(hoverBtn === "imdb" && !dlSuccess ? styles.magnetBtnHover : {}), ...((dlLoading || dlSuccess) ? styles.magnetBtnDisabled : {}) }}
                                            onClick={() => handleDownloadClick(result.title, result.magneturl, effectiveImdbId, result.torrenturl)}
                                            onMouseEnter={() => setHoverBtn("imdb")}
                                            onMouseLeave={() => setHoverBtn(null)}
                                            disabled={dlLoading || dlSuccess}
                                            title="Download torrent"
                                        >
                                            {dlLoading ? "⏳ Starting..." : dlSuccess ? "✓ Download started" : result.magneturl ? "🧲 Download" : "⬇ Download (.torrent)"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    row: {
        background: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 10,
        marginBottom: 4,
        overflow: "hidden",
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        cursor: "pointer",
        gap: 14,
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    titleArea: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
        flex: 1,
    },
    title: {
        fontSize: "0.92rem",
        fontWeight: 500,
        color: "#c9d1d9",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: "'Inter', sans-serif",
    },
    imdbBadge: {
        fontSize: "0.64rem",
        fontWeight: 700,
        color: "#000",
        background: "#f5c518",
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: "0.5px",
        flexShrink: 0,
        lineHeight: 1.4,
    },
    matchExactBadge: {
        fontSize: "0.64rem",
        fontWeight: 700,
        color: "#fff",
        background: "#238636",
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: "0.5px",
        flexShrink: 0,
        lineHeight: 1.4,
    },
    matchDiffBadge: {
        fontSize: "0.64rem",
        fontWeight: 700,
        color: "#fff",
        background: "#da3633",
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: "0.5px",
        flexShrink: 0,
        lineHeight: 1.4,
    },
    noMatchBadge: {
        fontSize: "0.64rem",
        fontWeight: 700,
        color: "#8b949e",
        background: "#21262d",
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: "0.5px",
        flexShrink: 0,
        lineHeight: 1.4,
    },
    guessedBadge: {
        fontSize: "0.64rem",
        fontWeight: 700,
        color: "#a371f7",
        background: "rgba(163, 113, 247, 0.1)",
        borderRadius: 3,
        padding: "1px 5px",
        letterSpacing: "0.5px",
        flexShrink: 0,
        lineHeight: 1.4,
    },
    meta: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexShrink: 0,
    },
    metaItem: {
        fontSize: "0.8rem",
        color: "#8b949e",
        whiteSpace: "nowrap",
    },
    seeders: {
        color: "#3fb950",
        fontWeight: 600,
    },
    peers: {
        color: "#f85149",
        fontWeight: 600,
    },
    indexer: {
        color: "#484f58",
        fontSize: "0.76rem",
        maxWidth: 100,
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    chevron: {
        color: "#484f58",
        fontSize: "0.82rem",
        transition: "transform 0.3s cubic-bezier(0.25, 1, 0.3, 1), color 0.15s",
        display: "inline-block",
    },
    chevronOpen: {
        transform: "rotate(90deg)",
        color: "#007BFF",
    },
    details: {
        height: 0,
        opacity: 0,
        overflow: "hidden",
        transition: "height 0.45s cubic-bezier(0.25, 1, 0.3, 1), opacity 0.35s ease",
    },
    detailsInner: {
        padding: "0 16px 16px",
    },
    torrentInfoOnly: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        paddingTop: 4,
    },
    infoRow: {
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        fontSize: "0.85rem",
        lineHeight: 1.5,
    },
    infoLabel: {
        color: "#8b949e",
        fontWeight: 600,
        minWidth: 76,
        fontSize: "0.8rem",
    },
    infoValue: {
        color: "#c9d1d9",
        fontSize: "0.85rem",
    },
    magnetBtn: {
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 8,
        padding: "7px 16px",
        background: "#21262d",
        color: "#c9d1d9",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: "#30363d",
        borderRadius: 6,
        fontSize: "0.85rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        width: "fit-content",
        outline: "none",
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    magnetBtnHover: {
        background: "linear-gradient(135deg, #007BFF 0%, #0969da 100%)",
        borderColor: "#007BFF",
        color: "#fff",
        transform: "translateY(-1px)",
        boxShadow: "0 4px 16px rgba(0, 123, 255, 0.3)",
    },
    magnetBtnSuccess: {
        background: "rgba(63, 185, 80, 0.12)",
        borderColor: "rgba(63, 185, 80, 0.3)",
        color: "#3fb950",
        cursor: "default",
    },
    magnetBtnDisabled: {
        opacity: 0.7,
        cursor: "not-allowed",
    },
    detailsLoading: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 0",
        color: "#8b949e",
        fontSize: "0.85rem",
    },
    detailsSpinner: {
        width: 16,
        height: 16,
        border: "2px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
    detailsError: {
        color: "#f85149",
        fontSize: "0.85rem",
        padding: "10px 0",
    },
    mediaDetails: {
        display: "flex",
        gap: 18,
        paddingTop: 4,
    },
    poster: {
        width: 130,
        height: "auto",
        maxHeight: 200,
        objectFit: "cover",
        borderRadius: 8,
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.4)",
        flexShrink: 0,
        transition: "transform 0.4s cubic-bezier(0.25, 1, 0.3, 1), box-shadow 0.4s ease",
        cursor: "default",
    },
    mediaInfo: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        flex: 1,
        minWidth: 0,
    },
    mediaTitleRow: {
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        flexWrap: "wrap",
    },
    mediaTitle: {
        fontSize: "1.1rem",
        fontWeight: 700,
        color: "#e6edf3",
        fontFamily: "'Inter', sans-serif",
    },
    mediaYear: {
        fontSize: "0.88rem",
        color: "#8b949e",
        fontWeight: 500,
    },
    mediaType: {
        fontSize: "0.68rem",
        fontWeight: 600,
        color: "#007BFF",
        background: "rgba(0, 123, 255, 0.1)",
        border: "1px solid rgba(0, 123, 255, 0.25)",
        borderRadius: 4,
        padding: "1px 7px",
        textTransform: "uppercase",
        letterSpacing: "0.7px",
    },
    genres: {
        display: "flex",
        flexWrap: "wrap",
        gap: 5,
    },
    genreTag: {
        fontSize: "0.72rem",
        color: "#c9d1d9",
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: 12,
        padding: "2px 10px",
        letterSpacing: "0.2px",
    },
    plot: {
        fontSize: "0.85rem",
        color: "#8b949e",
        lineHeight: 1.55,
        maxHeight: "4.8em",
        overflow: "hidden",
        display: "-webkit-box",
        WebkitLineClamp: 3,
        WebkitBoxOrient: "vertical",
    },
    rating: {
        display: "flex",
        alignItems: "baseline",
        gap: 4,
    },
    ratingStar: {
        color: "#f5c518",
        fontSize: "1rem",
    },
    ratingValue: {
        fontSize: "1rem",
        fontWeight: 700,
        color: "#e6edf3",
    },
    ratingLabel: {
        fontSize: "0.76rem",
        color: "#484f58",
    },
    mediaMetaGrid: {
        display: "flex",
        flexDirection: "column",
        gap: 3,
    },
    torrentSection: {
        display: "flex",
        flexDirection: "column",
        gap: 5,
        marginTop: 6,
        paddingTop: 8,
        borderTop: "1px solid #21262d",
    },
};
