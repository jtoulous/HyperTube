import { useEffect, useState } from "react";
import PlayerModule from "./PlayerModule";
import { formatSize } from "./utils";

function formatEta(seconds) {
    if (!seconds || seconds <= 0) return "";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}min`;
    const h = Math.floor(seconds / 3600);
    const m = Math.ceil((seconds % 3600) / 60);
    return m > 0 ? `${h}h${m}m` : `${h}h`;
}

function formatSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return "";
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1048576) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
}

const STATUS_LABELS = {
    downloading: { text: "Downloading", color: "#1f6feb" },
    completed:   { text: "Completed",   color: "#238636" },
    paused:      { text: "Paused",      color: "#d29922" },
    error:       { text: "Error",       color: "#f85149" },
};

/* Per-torrent control row */
function TorrentRow({ torrent, onPause, onResume, onDelete, onRecheck, onReannounce }) {
    const [actionLoading, setActionLoading] = useState(null);
    const { hash, name, status, progress, download_speed, eta } = torrent;
    const statusInfo = STATUS_LABELS[status] || { text: status || "Unknown", color: "#8b949e" };
    const isPaused = status === "paused";

    const run = async (key, fn) => {
        setActionLoading(key);
        try { await fn(hash); } finally { setActionLoading(null); }
    };

    return (
        <div style={styles.torrentRow}>
            <div style={styles.torrentInfo}>
                <span style={styles.torrentName} title={name}>{name}</span>
                <div style={styles.statusRow}>
                    <span style={{ ...styles.statusBadge, background: statusInfo.color }}>{statusInfo.text}</span>
                    {status === "downloading" && (
                        <>
                            <span style={styles.statusDetail}>{Math.round(progress)}%</span>
                            {download_speed > 0 && <span style={styles.statusDetail}>{formatSpeed(download_speed)}</span>}
                            {eta > 0 && <span style={styles.statusDetail}>ETA {formatEta(eta)}</span>}
                        </>
                    )}
                    {status === "completed" && <span style={styles.statusDetail}>100%</span>}
                </div>
                {status === "downloading" && (
                    <div style={styles.progressBg}>
                        <div style={{ ...styles.progressFill, width: `${Math.min(progress, 100)}%` }} />
                    </div>
                )}
            </div>
            <div style={styles.torrentActions}>
                {isPaused ? (
                    <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnResume }} onClick={() => run("resume", onResume)} disabled={!!actionLoading}>
                        {actionLoading === "resume" ? "\u2026" : "\u25b6"}
                    </button>
                ) : status === "downloading" ? (
                    <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnPause }} onClick={() => run("pause", onPause)} disabled={!!actionLoading}>
                        {actionLoading === "pause" ? "\u2026" : "\u23f8"}
                    </button>
                ) : null}
                <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnDefault }} onClick={() => run("recheck", onRecheck)} disabled={!!actionLoading} title="Force recheck">
                    {actionLoading === "recheck" ? "\u2026" : "\ud83d\udd04"}
                </button>
                <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnDefault }} onClick={() => run("reannounce", onReannounce)} disabled={!!actionLoading} title="Reannounce">
                    {actionLoading === "reannounce" ? "\u2026" : "\ud83d\udce2"}
                </button>
                <button style={{ ...styles.ctrlBtn, ...styles.ctrlBtnDelete }} onClick={() => run("delete", onDelete)} disabled={!!actionLoading} title="Delete torrent">
                    {actionLoading === "delete" ? "\u2026" : "\ud83d\uddd1"}
                </button>
            </div>
        </div>
    );
}

/* Main modal */
export default function WatchModal({
    file, title, allFiles, onFileChange, onClose, onTimeReport, initialTime = 0,
    torrents = [], onPause, onResume, onDelete, onRecheck, onReannounce, onRefresh,
}) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    // Build a set of torrent hashes that are watchable (files are playable)
    const watchableHashes = new Set(
        torrents.filter(t => t.can_watch).map(t => t.hash)
    );

    // Tag each file with playability based on its torrent's can_watch
    const taggedFiles = (allFiles || []).map(f => ({
        ...f,
        playable: !f.torrent_hash || watchableHashes.has(f.torrent_hash),
    }));
    const playableFiles = taggedFiles.filter(f => f.playable);

    // Split torrents: downloading (not yet watchable) vs available (can_watch)
    const downloadingTorrents = torrents.filter(t => !t.can_watch);
    const availableTorrents = torrents.filter(t => t.can_watch);

    const hasFiles = taggedFiles.length > 0;
    const hasPlayable = playableFiles.length > 0;
    const isPlayerMode = !!file;
    const isPickerMode = !file && hasFiles;

    return (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ ...styles.modalWrapper, ...(isPlayerMode ? {} : styles.modalNarrow) }}>

                {/* Header */}
                <div style={styles.header}>
                    {file && hasFiles && (
                        <button style={styles.backBtn} onClick={() => onFileChange(null)} title="Back to sources">{"\u2190"}</button>
                    )}
                    <span style={styles.title}>{title}</span>
                    <button style={styles.closeBtn} onClick={onClose} title="Close (Esc)">{"\u2715"}</button>
                </div>

                {/* Per-torrent controls — always visible */}
                {!isPlayerMode && torrents.length > 0 && (
                    <div style={styles.torrentsPanel}>
                        <div style={styles.panelHeader}>
                            Torrents ({torrents.length})
                        </div>
                        {torrents.map(t => (
                            <TorrentRow
                                key={t.hash}
                                torrent={t}
                                onPause={onPause}
                                onResume={onResume}
                                onDelete={onDelete}
                                onRecheck={onRecheck}
                                onReannounce={onReannounce}
                            />
                        ))}
                    </div>
                )}

                {/* Source picker — playable files from watchable torrents */}
                {isPickerMode && (
                    <div style={styles.pickerBody}>
                        <div style={styles.pickerLabel}>
                            {hasPlayable ? "Select a source to play" : "No sources are ready yet"}
                        </div>
                        <div style={styles.fileList}>
                            {taggedFiles.map((f) => {
                                const disabled = !f.playable;
                                return (
                                    <button
                                        key={f.name}
                                        style={{
                                            ...styles.fileRow,
                                            ...(disabled ? styles.fileRowDisabled : {}),
                                        }}
                                        onClick={disabled ? undefined : () => onFileChange(f)}
                                        onMouseEnter={disabled ? undefined : e => { e.currentTarget.style.background = "#30363d"; }}
                                        onMouseLeave={disabled ? undefined : e => { e.currentTarget.style.background = "#161b22"; }}
                                        disabled={disabled}
                                    >
                                        <span style={styles.fileIcon}>{"\ud83c\udfac"}</span>
                                        <div style={styles.fileInfo}>
                                            <span style={{
                                                ...styles.fileName,
                                                ...(disabled ? { color: "#484f58" } : {}),
                                            }}>{f.name.split("/").pop()}</span>
                                            <span style={styles.fileMeta}>
                                                {formatSize(f.size)}
                                                {disabled && " \u2014 downloading\u2026"}
                                            </span>
                                        </div>
                                        {!disabled && <span style={styles.playIcon}>{"\u25b6"}</span>}
                                        {disabled && <span style={{ ...styles.playIcon, color: "#484f58" }}>{"\u23f3"}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* No files yet */}
                {!isPlayerMode && !hasFiles && (
                    <div style={styles.noFilesMsg}>
                        {downloadingTorrents.length > 0
                            ? "No playable video files yet \u2014 download is still in progress."
                            : "No playable video files found."}
                        {onRefresh && (
                            <button style={styles.refreshBtn} onClick={onRefresh}>Refresh</button>
                        )}
                    </div>
                )}

                {/* Player */}
                {isPlayerMode && (
                    <>
                        {allFiles.length > 1 && (
                            <select
                                style={styles.fileSelect}
                                value={file.name}
                                onChange={e => {
                                    const chosen = allFiles.find(f => f.name === e.target.value);
                                    if (chosen) onFileChange(chosen);
                                }}
                            >
                                {allFiles.map(f => (
                                    <option key={f.name} value={f.name} style={styles.fileOption}>
                                        {f.name.split("/").pop()} ({formatSize(f.size)})
                                    </option>
                                ))}
                            </select>
                        )}
                        <PlayerModule filename={file.name} onTimeReport={onTimeReport} initialTime={initialTime} />
                    </>
                )}
            </div>
        </div>
    );
}

/* --- Inline styles --- */
const styles = {
    overlay: {
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.85)", display: "flex",
        alignItems: "center", justifyContent: "center",
    },
    modalWrapper: {
        background: "#0d1117", borderRadius: 12, width: "90vw", maxWidth: 1100,
        maxHeight: "92vh", overflow: "hidden", display: "flex", flexDirection: "column",
        border: "1px solid #30363d",
    },
    modalNarrow: { maxWidth: 600 },
    header: {
        display: "flex", alignItems: "center", padding: "14px 18px",
        borderBottom: "1px solid #21262d", gap: 10,
    },
    backBtn: {
        background: "none", border: "none", color: "#58a6ff", fontSize: 22,
        cursor: "pointer", padding: "0 4px",
    },
    title: { flex: 1, color: "#e6edf3", fontSize: 17, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    closeBtn: {
        background: "none", border: "none", color: "#8b949e", fontSize: 20,
        cursor: "pointer", padding: "0 4px",
    },

    /* Torrents panel */
    torrentsPanel: {
        borderBottom: "1px solid #21262d", padding: "10px 18px",
        maxHeight: 200, overflowY: "auto",
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

    /* File picker */
    pickerBody: { padding: "18px 18px 10px", overflowY: "auto", flex: 1 },
    pickerLabel: { fontSize: 14, color: "#8b949e", marginBottom: 10 },
    fileList: { display: "flex", flexDirection: "column", gap: 4 },
    fileRow: {
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px", borderRadius: 8, border: "1px solid #21262d",
        background: "#161b22", cursor: "pointer", textAlign: "left", width: "100%",
    },
    fileRowDisabled: {
        cursor: "not-allowed", opacity: 0.5, background: "#0d1117",
    },
    fileIcon: { fontSize: 22, flexShrink: 0 },
    fileInfo: { flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    fileName: { color: "#e6edf3", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    fileMeta: { color: "#8b949e", fontSize: 12 },
    playIcon: { fontSize: 18, color: "#58a6ff", flexShrink: 0 },

    /* No files */
    noFilesMsg: {
        padding: "40px 18px", textAlign: "center", color: "#8b949e", fontSize: 14,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
    },
    refreshBtn: {
        background: "#21262d", border: "1px solid #30363d", color: "#c9d1d9",
        borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13,
    },

    /* Player area */
    fileSelect: {
        margin: "8px 18px 0", padding: "6px 10px", borderRadius: 6,
        background: "#161b22", border: "1px solid #30363d", color: "#c9d1d9",
        fontSize: 13, cursor: "pointer",
    },
    fileOption: { background: "#0d1117", color: "#c9d1d9" },
};
