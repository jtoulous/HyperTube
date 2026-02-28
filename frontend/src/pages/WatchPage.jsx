import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { filmsApi } from "../api/films";
import PlayerModule from "../modules/submodules/PlayerModule";
import { formatSize } from "../modules/submodules/utils";
import TopBarModule from "../modules/TopBarModule";
import FooterBarModule from "../modules/FooterBarModule";

export default function WatchPage() {
    const { imdbId } = useParams();
    const navigate = useNavigate();
    const { isLogged, username, language } = GlobalState();

    /* ─── Movie details from TMDB ─── */
    const [details, setDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(true);

    /* ─── Film files (for the player) ─── */
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [filesLoading, setFilesLoading] = useState(true);

    /* ─── Watched state ─── */
    const [watchedInfo, setWatchedInfo] = useState(null);
    const [watchedLoaded, setWatchedLoaded] = useState(false);

    /* ─── Comments ─── */
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState("");
    const [commentSubmitting, setCommentSubmitting] = useState(false);

    /* ─── Cast/Crew expand ─── */
    const [castExpanded, setCastExpanded] = useState(false);
    const castContentRef = useRef(null);



    /* Fetch movie details */
    useEffect(() => {
        if (!imdbId) return;
        setDetailsLoading(true);
        searchApi.getMediaDetails(imdbId)
            .then(res => setDetails(res.data))
            .catch(() => setDetails(null))
            .finally(() => setDetailsLoading(false));
    }, [imdbId]);

    /* Fetch video files */
    useEffect(() => {
        if (!imdbId) return;
        setFilesLoading(true);
        filmsApi.getFilmFiles(imdbId)
            .then(res => {
                const f = res.data?.files || [];
                setFiles(f);
                if (f.length === 1) setSelectedFile(f[0]);
            })
            .catch(() => setFiles([]))
            .finally(() => setFilesLoading(false));
    }, [imdbId]);

    /* Fetch watched info */
    useEffect(() => {
        if (!isLogged || !imdbId) { setWatchedLoaded(true); return; }
        filmsApi.getWatchedIds()
            .then(res => {
                const found = (res.data || []).find(w => w.imdb_id === imdbId);
                setWatchedInfo(found || null);
            })
            .catch(() => {})
            .finally(() => setWatchedLoaded(true));
    }, [isLogged, imdbId]);

    /* Fetch comments */
    const loadComments = useCallback(() => {
        if (!imdbId) return;
        filmsApi.getComments(imdbId)
            .then(res => setComments(res.data || []))
            .catch(() => {});
    }, [imdbId]);

    useEffect(() => { loadComments(); }, [loadComments]);

    /* Mark watched on file selection */
    const handleFileSelect = useCallback((f) => {
        setSelectedFile(f);
        if (f && isLogged && imdbId) {
            filmsApi.markWatched(imdbId, 0).catch(() => {});
        }
    }, [isLogged, imdbId]);

    /* Report playback progress */
    const handleTimeReport = useCallback(async (stoppedAt, duration) => {
        if (!isLogged || !imdbId) return;
        try {
            const res = await filmsApi.updateProgress(imdbId, stoppedAt);
            setWatchedInfo(res.data);
        } catch {}
    }, [isLogged, imdbId]);

    /* Submit comment */
    const handleSubmitComment = async (e) => {
        e.preventDefault();
        const text = commentText.trim();
        if (!text || commentSubmitting) return;
        setCommentSubmitting(true);
        try {
            const res = await filmsApi.addComment(imdbId, text);
            setComments(prev => [res.data, ...prev]);
            setCommentText("");
        } catch {}
        setCommentSubmitting(false);
    };

    /* Delete comment */
    const handleDeleteComment = async (commentId) => {
        try {
            await filmsApi.deleteComment(commentId);
            setComments(prev => prev.filter(c => c.id !== commentId));
        } catch {}
    };

    const initialTime = watchedInfo?.stopped_at || 0;

    if (detailsLoading) {
        return (
            <div style={styles.page}>
                <TopBarModule />
                <div style={styles.loadingWrap}>
                    <div style={styles.spinner} />
                    <span style={styles.loadingText}>Loading...</span>
                </div>
                <FooterBarModule />
            </div>
        );
    }

    return (
        <div style={styles.page}>
            <TopBarModule />

            {/* ─── Hero zone: backdrop behind player + info ─── */}
            <div style={styles.heroZone}>
                {details?.backdrop && (
                    <img src={details.backdrop} alt="" style={styles.heroBackdropImg} />
                )}
                <div style={styles.heroOverlay} />

                <div style={styles.heroContent}>
                    {/* Back button */}
                    <button style={styles.backBtn} onClick={() => navigate("/", { state: { tab: "library" } })}>
                        ← Back
                    </button>

                    {/* ─── Player section ─── */}
                    <section style={styles.playerSection}>
                    {!selectedFile && files.length > 0 && (
                        <div style={styles.sourcePicker}>
                            <div style={styles.sourceLabel}>Select a source to play</div>
                            {files.map((f) => (
                                <button
                                    key={f.name}
                                    style={styles.sourceRow}
                                    onClick={() => handleFileSelect(f)}
                                    onMouseEnter={e => { e.currentTarget.style.background = "#30363d"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "#161b22"; }}
                                >
                                    <span style={{ fontSize: "1.1rem" }}>🎬</span>
                                    <div style={styles.sourceInfo}>
                                        <span style={styles.sourceName}>{f.name.split("/").pop()}</span>
                                        <span style={styles.sourceMeta}>{formatSize(f.size)}</span>
                                    </div>
                                    <span style={{ color: "#007BFF" }}>▶</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {!selectedFile && files.length === 0 && !filesLoading && (
                        <div style={styles.noFiles}>
                            No playable files available yet.
                        </div>
                    )}

                    {selectedFile && watchedLoaded && (
                        <>
                            {files.length > 1 && (
                                <select
                                    style={styles.fileSelect}
                                    value={selectedFile.name}
                                    onChange={e => {
                                        const chosen = files.find(f => f.name === e.target.value);
                                        if (chosen) handleFileSelect(chosen);
                                    }}
                                >
                                    {files.map(f => (
                                        <option key={f.name} value={f.name}>
                                            {f.name.split("/").pop()} ({formatSize(f.size)})
                                        </option>
                                    ))}
                                </select>
                            )}
                            <PlayerModule
                                filename={selectedFile.name}
                                imdbId={imdbId}
                                onTimeReport={handleTimeReport}
                                initialTime={initialTime}
                                userLang={language}
                            />
                        </>
                    )}
                    </section>

                    {/* ─── Movie info section ─── */}
                    {details && (
                        <section style={styles.infoSection}>
                            <div style={styles.infoGrid}>
                            {/* Poster */}
                            {details.poster && (
                                <div style={styles.posterWrap}>
                                    <img src={details.poster} alt={details.title} style={styles.posterImg} />
                                </div>
                            )}

                            {/* Text details */}
                            <div style={styles.infoText}>
                                <h1 style={styles.title}>
                                    {details.title}
                                    {details.year && <span style={styles.year}> ({details.year})</span>}
                                </h1>

                                <div style={styles.metaRow}>
                                    {details.imdb_rating && (
                                        <span style={styles.rating}>★ {details.imdb_rating}</span>
                                    )}
                                    {details.runtime && (
                                        <span style={styles.metaItem}>{details.runtime}</span>
                                    )}
                                    {details.genre && (
                                        <span style={styles.metaItem}>{details.genre}</span>
                                    )}
                                    {details.language && (
                                        <span style={styles.metaItem}>{details.language}</span>
                                    )}
                                </div>

                                {details.plot && (
                                    <p style={styles.plot}>{details.plot}</p>
                                )}

                                <div style={styles.crewGrid}>
                                    {details.director && (
                                        <div style={styles.crewItem}>
                                            <span style={styles.crewLabel}>Director</span>
                                            <span style={styles.crewValue}>{details.director}</span>
                                        </div>
                                    )}
                                    {details.producer && (
                                        <div style={styles.crewItem}>
                                            <span style={styles.crewLabel}>Producer</span>
                                            <span style={styles.crewValue}>{details.producer}</span>
                                        </div>
                                    )}
                                    {details.writer && (
                                        <div style={styles.crewItem}>
                                            <span style={styles.crewLabel}>Writer</span>
                                            <span style={styles.crewValue}>{details.writer}</span>
                                        </div>
                                    )}
                                    {details.country && (
                                        <div style={styles.crewItem}>
                                            <span style={styles.crewLabel}>Country</span>
                                            <span style={styles.crewValue}>{details.country}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        </section>
                    )}
                </div>
            </div>

            {/* ─── Cast/Crew + Comments ─── */}
            <div style={styles.belowHero}>
                {/* Cast & Crew — visually continues the info card */}
                {details && ((details.cast_detailed && details.cast_detailed.length > 0) ||
                  (details.crew_detailed && details.crew_detailed.length > 0)) && (
                    <div style={styles.expandSection}>
                        <button
                            style={styles.expandBtn}
                            onClick={() => setCastExpanded(v => !v)}
                            onMouseEnter={e => {
                                e.currentTarget.style.color = "#e6edf3";
                                e.currentTarget.style.borderColor = "#58a6ff";
                                e.currentTarget.style.background = "rgba(56,139,253,0.08)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.color = "#8b949e";
                                e.currentTarget.style.borderColor = "transparent";
                                e.currentTarget.style.background = "none";
                            }}
                        >
                            <span style={{ transition: "transform 0.25s", display: "inline-block", transform: castExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▸</span>
                            {" "}Cast & Crew
                        </button>

                        <div
                            ref={castContentRef}
                            style={{
                                ...styles.expandContent,
                                maxHeight: castExpanded ? (castContentRef.current?.scrollHeight || 2000) : 0,
                                opacity: castExpanded ? 1 : 0,
                            }}
                        >
                            {/* Cast */}
                            {details.cast_detailed && details.cast_detailed.length > 0 && (
                                <div style={styles.castSection}>
                                    <h3 style={styles.subSectionTitle}>Cast</h3>
                                    <div style={styles.castGrid}>
                                        {details.cast_detailed.map((person, idx) => (
                                            <div key={idx} style={styles.castCard}>
                                                {person.profile_path ? (
                                                    <img src={person.profile_path} alt={person.name} style={styles.castPhoto} />
                                                ) : (
                                                    <div style={styles.castNoPhoto}>
                                                        <span>👤</span>
                                                    </div>
                                                )}
                                                <div style={styles.castInfo}>
                                                    <span style={styles.castName}>{person.name}</span>
                                                    {person.character && (
                                                        <span style={styles.castChar}>{person.character}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Crew */}
                            {details.crew_detailed && details.crew_detailed.length > 0 && (
                                <div style={styles.castSection}>
                                    <h3 style={styles.subSectionTitle}>Crew</h3>
                                    <div style={styles.castGrid}>
                                        {details.crew_detailed.map((person, idx) => (
                                            <div key={idx} style={styles.castCard}>
                                                {person.profile_path ? (
                                                    <img src={person.profile_path} alt={person.name} style={styles.castPhoto} />
                                                ) : (
                                                    <div style={styles.castNoPhoto}>
                                                        <span>👤</span>
                                                    </div>
                                                )}
                                                <div style={styles.castInfo}>
                                                    <span style={styles.castName}>{person.name}</span>
                                                    {person.job && (
                                                        <span style={styles.castChar}>{person.job}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Comments */}
                <section style={styles.commentsSection}>
                    <h2 style={styles.sectionTitle}>Comments</h2>

                    {isLogged && (
                        <form style={styles.commentForm} onSubmit={handleSubmitComment}>
                            <textarea
                                style={styles.commentInput}
                                placeholder="Leave a comment..."
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                maxLength={2000}
                                rows={3}
                            />
                            <button
                                type="submit"
                                style={{
                                    ...styles.commentBtn,
                                    ...(commentSubmitting || !commentText.trim() ? styles.commentBtnDisabled : {}),
                                }}
                                disabled={commentSubmitting || !commentText.trim()}
                            >
                                {commentSubmitting ? "Posting..." : "Post"}
                            </button>
                        </form>
                    )}

                    {comments.length === 0 && (
                        <div style={styles.noComments}>No comments yet. Be the first!</div>
                    )}

                    <div style={styles.commentList}>
                        {comments.map(c => (
                            <div key={c.id} style={styles.commentItem}>
                                <div style={styles.commentHeader}>
                                    {c.profile_picture ? (
                                        <img src={c.profile_picture} alt="" style={styles.commentAvatar} />
                                    ) : (
                                        <div style={styles.commentAvatarPlaceholder}>
                                            {(c.username || "?")[0].toUpperCase()}
                                        </div>
                                    )}
                                    <span style={styles.commentUser}>{c.username}</span>
                                    <span style={styles.commentDate}>
                                        {new Date(c.created_at).toLocaleDateString("en-US", {
                                            year: "numeric", month: "short", day: "numeric",
                                            hour: "2-digit", minute: "2-digit",
                                        })}
                                    </span>
                                    {isLogged && c.username === username && (
                                        <button
                                            style={styles.commentDeleteBtn}
                                            onClick={() => handleDeleteComment(c.id)}
                                            title="Delete comment"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <p style={styles.commentText}>{c.text}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <FooterBarModule />
        </div>
    );
}


/* ─── Styles ─── */

const styles = {
    page: {
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        background: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    heroZone: {
        position: "relative",
        overflow: "hidden",
    },
    heroBackdropImg: {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "center top",
        pointerEvents: "none",
    },
    heroOverlay: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(13,17,23,0.60) 0%, rgba(13,17,23,0.82) 50%, #0d1117 100%)",
        pointerEvents: "none",
    },
    heroContent: {
        position: "relative",
        zIndex: 1,
        maxWidth: 1400,
        width: "100%",
        margin: "0 auto",
        padding: "24px 20px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
    },
    belowHero: {
        maxWidth: 1400,
        width: "100%",
        margin: "0 auto",
        padding: "0 20px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 28,
    },
    loadingWrap: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    spinner: {
        width: 24,
        height: 24,
        border: "3px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
    loadingText: {
        color: "#8b949e",
        fontSize: "0.9rem",
    },
    backBtn: {
        alignSelf: "flex-start",
        background: "#21262d",
        border: "1px solid #30363d",
        color: "#c9d1d9",
        fontSize: "0.85rem",
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        padding: "6px 14px",
        borderRadius: 6,
        cursor: "pointer",
    },

    /* Player section */
    playerSection: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    sourcePicker: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        maxWidth: 560,
    },
    sourceLabel: {
        color: "#8b949e",
        fontSize: "0.8rem",
    },
    sourceRow: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        cursor: "pointer",
        transition: "background 0.15s",
        textAlign: "left",
        color: "#c9d1d9",
        fontFamily: "'Inter', sans-serif",
    },
    sourceInfo: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
    },
    sourceName: {
        fontSize: "0.85rem",
        fontWeight: 500,
        color: "#e6edf3",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    sourceMeta: {
        fontSize: "0.75rem",
        color: "#8b949e",
    },
    noFiles: {
        padding: "40px 20px",
        textAlign: "center",
        color: "#8b949e",
        fontSize: "0.9rem",
        background: "#161b22",
        borderRadius: 8,
        border: "1px solid #21262d",
    },
    fileSelect: {
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#c9d1d9",
        padding: "4px 8px",
        fontSize: "0.8rem",
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        maxWidth: 360,
        outline: "none",
    },

    /* Info section */
    infoSection: {
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 28,
        background: "rgba(22,27,34,0.55)",
        backdropFilter: "blur(6px)",
        borderRadius: 10,
        border: "1px solid rgba(48,54,61,0.5)",
        overflow: "hidden",
        padding: "24px",
        marginBottom: -28,
    },
    infoGrid: {
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
    },
    posterWrap: {
        flexShrink: 0,
        width: 180,
        position: "relative",
        zIndex: 1,
    },
    posterImg: {
        width: "100%",
        borderRadius: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    },
    infoText: {
        flex: 1,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        paddingTop: 8,
    },
    title: {
        fontSize: "1.6rem",
        fontWeight: 700,
        color: "#e6edf3",
        margin: 0,
        lineHeight: 1.2,
    },
    year: {
        fontWeight: 400,
        color: "#8b949e",
        fontSize: "1.2rem",
    },
    metaRow: {
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "center",
    },
    rating: {
        color: "#f5c518",
        fontWeight: 600,
        fontSize: "0.95rem",
    },
    metaItem: {
        color: "#8b949e",
        fontSize: "0.85rem",
    },
    plot: {
        color: "#c9d1d9",
        fontSize: "0.9rem",
        lineHeight: 1.6,
        margin: 0,
    },
    crewGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 10,
    },
    crewItem: {
        display: "flex",
        flexDirection: "column",
        gap: 2,
    },
    crewLabel: {
        fontSize: "0.72rem",
        fontWeight: 600,
        color: "#8b949e",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
    },
    crewValue: {
        fontSize: "0.85rem",
        color: "#e6edf3",
    },

    /* Cast */
    expandSection: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
        background: "rgba(22,27,34,0.75)",
        borderRadius: 10,
        border: "1px solid rgba(48,54,61,0.5)",
        padding: "4px 24px 12px",
    },
    expandBtn: {
        background: "none",
        border: "1px solid transparent",
        borderRadius: 6,
        color: "#8b949e",
        fontSize: "0.88rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        padding: "10px 16px",
        cursor: "pointer",
        textAlign: "left",
        transition: "color 0.2s, border-color 0.2s, background 0.2s",
        display: "flex",
        alignItems: "center",
        gap: 6,
    },
    expandContent: {
        overflow: "hidden",
        transition: "max-height 0.4s ease, opacity 0.3s ease",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        paddingTop: 0,
    },
    subSectionTitle: {
        fontSize: "0.95rem",
        fontWeight: 600,
        color: "#e6edf3",
        margin: 0,
    },
    castSection: {
        padding: "0 0 0",
        display: "flex",
        flexDirection: "column",
        gap: 14,
    },
    sectionTitle: {
        fontSize: "1.1rem",
        fontWeight: 600,
        color: "#e6edf3",
        margin: 0,
    },
    castGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 12,
    },
    castCard: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        padding: "10px 6px",
        background: "#0d1117",
        borderRadius: 8,
        border: "1px solid #21262d",
    },
    castPhoto: {
        width: 72,
        height: 72,
        borderRadius: "50%",
        objectFit: "cover",
    },
    castNoPhoto: {
        width: 72,
        height: 72,
        borderRadius: "50%",
        background: "#21262d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.6rem",
    },
    castInfo: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        textAlign: "center",
    },
    castName: {
        fontSize: "0.78rem",
        fontWeight: 600,
        color: "#e6edf3",
    },
    castChar: {
        fontSize: "0.7rem",
        color: "#8b949e",
    },

    /* Comments */
    commentsSection: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
        background: "#161b22",
        borderRadius: 10,
        border: "1px solid #21262d",
        padding: 24,
    },
    commentForm: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },
    commentInput: {
        width: "100%",
        background: "#0d1117",
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#c9d1d9",
        fontSize: "0.85rem",
        fontFamily: "'Inter', sans-serif",
        padding: "10px 12px",
        resize: "vertical",
        outline: "none",
        minHeight: 50,
        maxHeight: 200,
        boxSizing: "border-box",
    },
    commentBtn: {
        alignSelf: "flex-end",
        background: "#007BFF",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "7px 18px",
        fontSize: "0.82rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
    },
    commentBtnDisabled: {
        opacity: 0.5,
        cursor: "not-allowed",
    },
    noComments: {
        color: "#484f58",
        fontSize: "0.85rem",
        padding: "12px 0",
    },
    commentList: {
        display: "flex",
        flexDirection: "column",
        gap: 12,
    },
    commentItem: {
        padding: "12px 14px",
        background: "#0d1117",
        borderRadius: 8,
        border: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    commentHeader: {
        display: "flex",
        alignItems: "center",
        gap: 8,
    },
    commentAvatar: {
        width: 28,
        height: 28,
        borderRadius: "50%",
        objectFit: "cover",
    },
    commentAvatarPlaceholder: {
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: "#21262d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.75rem",
        fontWeight: 700,
        color: "#8b949e",
    },
    commentUser: {
        fontSize: "0.82rem",
        fontWeight: 600,
        color: "#e6edf3",
    },
    commentDate: {
        fontSize: "0.72rem",
        color: "#484f58",
        marginLeft: "auto",
    },
    commentDeleteBtn: {
        background: "none",
        border: "none",
        color: "#484f58",
        cursor: "pointer",
        fontSize: "0.75rem",
        padding: "2px 6px",
        borderRadius: 4,
        marginLeft: 4,
    },
    commentText: {
        fontSize: "0.85rem",
        color: "#c9d1d9",
        lineHeight: 1.5,
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
    },
};
