import { useState, useEffect, useCallback, useRef } from "react";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { filmsApi } from "../api/films";
import PlayerModule from "./submodules/PlayerModule";

/* ═══════════════════════════════════════════════════════════════════════════════
   PlayerViewModule — inline view (not an overlay) shown inside MainContentModule
   when a film is selected from the library.
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function PlayerViewModule({
    imdbId,
    selectedFile,
    onTimeReport,
    initialTime,
    onBack,
}) {
    const { isLogged, username } = GlobalState();

    /* ─── TMDB movie details ─── */
    const [details, setDetails] = useState(null);
    const [detailsLoading, setDetailsLoading] = useState(true);

    /* ─── Comments ─── */
    const [comments, setComments] = useState([]);
    const [commentText, setCommentText] = useState("");
    const [commentSubmitting, setCommentSubmitting] = useState(false);

    const castContentRef = useRef(null);

    /* Fetch TMDB details */
    useEffect(() => {
        if (!imdbId) return;
        setDetailsLoading(true);
        searchApi.getMediaDetails(imdbId)
            .then(res => setDetails(res.data))
            .catch(() => setDetails(null))
            .finally(() => setDetailsLoading(false));
    }, [imdbId]);

    /* Fetch comments */
    const loadComments = useCallback(() => {
        if (!imdbId) return;
        filmsApi.getComments(imdbId)
            .then(res => setComments(res.data || []))
            .catch(() => {});
    }, [imdbId]);

    useEffect(() => { loadComments(); }, [loadComments]);

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

    const isPlayerMode = !!selectedFile;

    /* ─── Render ─── */
    if (detailsLoading) {
        return (
            <div style={s.loadingWrap}>
                <div style={s.spinner} />
                <span style={s.loadingText}>Loading...</span>
            </div>
        );
    }

    return (
        <div style={s.viewRoot}>
            {/* ─── Hero zone with backdrop ─── */}
            <div style={s.heroZone}>
                {details?.backdrop && (
                    <img src={details.backdrop} alt="" style={s.heroBackdropImg} />
                )}
                <div style={s.heroOverlay} />

                <div style={s.heroContent}>
                    {/* Back button */}
                    <button style={s.backBtn} onClick={onBack}>← Back</button>

                    {/* ─── Player / Source Picker ─── */}
                    <section style={s.playerSection}>
                        {isPlayerMode && (
                            <>
                                <PlayerModule
                                    filename={selectedFile.name}
                                    imdbId={imdbId}
                                    onTimeReport={onTimeReport}
                                    initialTime={initialTime}
                                />
                            </>
                        )}
                    </section>

                    {/* ─── Movie info section ─── */}
                    {details && (
                        <section style={s.infoSection}>
                            <div style={s.infoGrid}>
                                {details.poster && (
                                    <div style={s.posterWrap}>
                                        <img src={details.poster} alt={details.title} style={s.posterImg} />
                                    </div>
                                )}
                                <div style={s.infoText}>
                                    <h1 style={s.movieTitle}>
                                        {details.title}
                                        {details.year && <span style={s.year}> ({details.year})</span>}
                                    </h1>
                                    <div style={s.metaRow}>
                                        {details.imdb_rating && <span style={s.rating}>★ {details.imdb_rating}</span>}
                                        {details.runtime && <span style={s.metaItem}>{details.runtime}</span>}
                                        {details.genre && <span style={s.metaItem}>{details.genre}</span>}
                                        {details.language && <span style={s.metaItem}>{details.language}</span>}
                                    </div>
                                    {details.plot && <p style={s.plot}>{details.plot}</p>}
                                    <div style={s.crewGrid}>
                                        {details.director && (
                                            <div style={s.crewItem}>
                                                <span style={s.crewLabel}>Director</span>
                                                <span style={s.crewValue}>{details.director}</span>
                                            </div>
                                        )}
                                        {details.producer && (
                                            <div style={s.crewItem}>
                                                <span style={s.crewLabel}>Producer</span>
                                                <span style={s.crewValue}>{details.producer}</span>
                                            </div>
                                        )}
                                        {details.writer && (
                                            <div style={s.crewItem}>
                                                <span style={s.crewLabel}>Writer</span>
                                                <span style={s.crewValue}>{details.writer}</span>
                                            </div>
                                        )}
                                        {details.country && (
                                            <div style={s.crewItem}>
                                                <span style={s.crewLabel}>Country</span>
                                                <span style={s.crewValue}>{details.country}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {/* ─── Below hero: torrents, cast/crew, comments ─── */}
            <div style={s.belowHero}>
                {/* Cast & Crew expandable */}
                {details && ((details.cast_detailed && details.cast_detailed.length > 0) ||
                  (details.crew_detailed && details.crew_detailed.length > 0)) && (
                    <div style={s.expandSection}>
                        <div
                            ref={castContentRef}
                            style={{
                                ...s.expandContent,
                                maxHeight: 2000,
                                opacity: 1,
                            }}
                        >
                            {details.cast_detailed && details.cast_detailed.length > 0 && (
                                <div style={s.castSection}>
                                    <h3 style={s.subSectionTitle}>Cast</h3>
                                    <div style={s.castGrid}>
                                        {details.cast_detailed.map((person, idx) => (
                                            <div key={idx} style={s.castCard}>
                                                {person.profile_path ? (
                                                    <img src={person.profile_path} alt={person.name} style={s.castPhoto} />
                                                ) : (
                                                    <div style={s.castNoPhoto}><span>👤</span></div>
                                                )}
                                                <div style={s.castInfo}>
                                                    <span style={s.castName}>{person.name}</span>
                                                    {person.character && <span style={s.castChar}>{person.character}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {details.crew_detailed && details.crew_detailed.length > 0 && (
                                <div style={s.castSection}>
                                    <h3 style={s.subSectionTitle}>Crew</h3>
                                    <div style={s.castGrid}>
                                        {details.crew_detailed.map((person, idx) => (
                                            <div key={idx} style={s.castCard}>
                                                {person.profile_path ? (
                                                    <img src={person.profile_path} alt={person.name} style={s.castPhoto} />
                                                ) : (
                                                    <div style={s.castNoPhoto}><span>👤</span></div>
                                                )}
                                                <div style={s.castInfo}>
                                                    <span style={s.castName}>{person.name}</span>
                                                    {person.job && <span style={s.castChar}>{person.job}</span>}
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
                <section style={s.commentsSection}>
                    <h2 style={s.sectionTitle}>Comments</h2>

                    {isLogged && (
                        <form style={s.commentForm} onSubmit={handleSubmitComment}>
                            <textarea
                                style={s.commentInput}
                                placeholder="Leave a comment..."
                                value={commentText}
                                onChange={e => setCommentText(e.target.value)}
                                maxLength={2000}
                                rows={3}
                            />
                            <button
                                type="submit"
                                style={{
                                    ...s.commentBtn,
                                    ...(commentSubmitting || !commentText.trim() ? s.commentBtnDisabled : {}),
                                }}
                                disabled={commentSubmitting || !commentText.trim()}
                            >
                                {commentSubmitting ? "Posting..." : "Post"}
                            </button>
                        </form>
                    )}

                    {comments.length === 0 && (
                        <div style={s.noComments}>No comments yet. Be the first!</div>
                    )}

                    <div style={s.commentList}>
                        {comments.map(c => (
                            <div key={c.id} style={s.commentItem}>
                                <div style={s.commentHeader}>
                                    {c.profile_picture ? (
                                        <img src={c.profile_picture} alt="" style={s.commentAvatar} />
                                    ) : (
                                        <div style={s.commentAvatarPlaceholder}>
                                            {(c.username || "?")[0].toUpperCase()}
                                        </div>
                                    )}
                                    <span style={s.commentUser}>{c.username}</span>
                                    <span style={s.commentDate}>
                                        {new Date(c.created_at).toLocaleDateString("en-US", {
                                            year: "numeric", month: "short", day: "numeric",
                                            hour: "2-digit", minute: "2-digit",
                                        })}
                                    </span>
                                    {isLogged && c.username === username && (
                                        <button
                                            style={s.commentDeleteBtn}
                                            onClick={() => handleDeleteComment(c.id)}
                                            title="Delete comment"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <p style={s.commentText}>{c.text}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}


/* ═══ Styles ═══ */
const s = {
    viewRoot: {
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    loadingWrap: {
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        minHeight: 300,
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

    /* Hero zone */
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
        gap: 12,
    },
    belowHero: {
        maxWidth: 1400,
        width: "100%",
        margin: "0 auto",
        padding: "0 20px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
    },

    /* Back button */
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
    playerTopBar: {
        display: "flex",
        alignItems: "center",
        gap: 10,
    },
    playerBackBtn: {
        background: "#21262d",
        border: "1px solid #30363d",
        color: "#c9d1d9",
        fontSize: "0.82rem",
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        padding: "5px 12px",
        borderRadius: 6,
        cursor: "pointer",
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
        width: "100%",
    },
    sourceRowDisabled: {
        cursor: "not-allowed",
        opacity: 0.5,
        background: "#0d1117",
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
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
    },
    refreshBtn: {
        background: "#21262d",
        border: "1px solid #30363d",
        color: "#c9d1d9",
        borderRadius: 8,
        padding: "8px 18px",
        cursor: "pointer",
        fontSize: 13,
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
    movieTitle: {
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

    /* Torrent controls panel */
    torrentsPanel: {
        background: "rgba(22,27,34,0.75)",
        borderRadius: 10,
        border: "1px solid rgba(48,54,61,0.5)",
        padding: "12px 24px 16px",
    },
    panelHeader: { fontSize: 13, color: "#8b949e", marginBottom: 8, fontWeight: 600 },
    torrentRow: {
        display: "flex", alignItems: "center", gap: 12,
        padding: "6px 0", borderTop: "1px solid #21262d",
    },
    torrentInfo: { flex: 1, minWidth: 0 },
    torrentName: {
        display: "block", fontSize: 13, color: "#c9d1d9",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    },
    statusRow: { display: "flex", alignItems: "center", gap: 6, marginTop: 2 },
    statusBadge: {
        fontSize: 10, padding: "1px 7px", borderRadius: 8, color: "#fff",
        fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
    },
    statusDetail: { fontSize: 11, color: "#8b949e" },
    progressBg: {
        marginTop: 4, height: 4, borderRadius: 2, background: "#21262d", overflow: "hidden",
    },
    progressFill: { height: "100%", background: "#1f6feb", borderRadius: 2, transition: "width .4s" },
    torrentActions: { display: "flex", gap: 4, flexShrink: 0 },
    ctrlBtn: {
        width: 30, height: 30, borderRadius: 6, border: "1px solid #30363d",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontSize: 14, background: "#161b22", color: "#c9d1d9",
    },
    ctrlBtnPause:   { borderColor: "#d29922", color: "#d29922" },
    ctrlBtnResume:  { borderColor: "#238636", color: "#3fb950" },
    ctrlBtnDelete:  { borderColor: "#f85149", color: "#f85149" },
    ctrlBtnDefault: {},

    /* Cast & Crew expandable */
    expandSection: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
        background: "rgba(22,27,34,0.75)",
        borderRadius: 10,
        border: "1px solid rgba(48,54,61,0.5)",
        padding: "24px",
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
        background: "rgba(22, 27, 34, 0.75)",
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
