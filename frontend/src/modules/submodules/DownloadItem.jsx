import { useState, useRef, useEffect } from "react";
import { downloadsApi } from "../../api/downloads";
import WatchModal from "./WatchModal";
import { formatSize } from "./utils";

const TERMINAL_STATUSES = new Set(["completed", "error"]);

const BORDER_COLORS = {
    completed: { borderLeftColor: "#3fb950" },
    error:     { borderLeftColor: "#f85149" },
    paused:    { borderLeftColor: "#d29922" },
};

const STATUS_BADGES = {
    completed: { background: "#238636" },
    error:     { background: "#da3633" },
    paused:    { background: "#9e6a03" },
};

const FILL_COLORS = {
    completed: { background: "#3fb950" },
    error:     { background: "#f85149" },
};

const PCT_COLORS = {
    completed: { color: "#3fb950" },
    error:     { color: "#f85149" },
};

export default function DownloadItem({ download, onMarkWatched }) {
    const [progress, setProgress] = useState(null);
    const pollingRef = useRef(!TERMINAL_STATUSES.has(download.status));
    const [playerFile, setPlayerFile] = useState(null);
    const [allFiles, setAllFiles] = useState([]);
    const [watchLoading, setWatchLoading] = useState(false);

    useEffect(() => {
        if (!download || !pollingRef.current) return;

        let isMounted = true;

        const fetchProgress = async () => {
            if (!isMounted || !pollingRef.current) return;

            try {
                const res = await downloadsApi.getDownloadProgress(download.id);
                if (isMounted) {
                    setProgress(res.data);

                    if (TERMINAL_STATUSES.has(res.data.status)) {
                        pollingRef.current = false;
                    }
                }
            } catch (err) {
                console.error(`[Download ${download.id}] Fetch error:`, err);
            }
        };

        fetchProgress();

        const interval = setInterval(fetchProgress, 1000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [download.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleWatch = async () => {
        setWatchLoading(true);
        try {
            const res = await downloadsApi.getDownloadFiles(download.id);
            const files = res.data.files || [];
            if (files.length === 0) {
                alert("No playable video files found.");
                return;
            }
            setAllFiles(files);
            setPlayerFile(files[0]);
            if (download.imdb_id && onMarkWatched) {
                onMarkWatched(download.imdb_id);
            }
        } catch (err) {
            console.error("Failed to load files:", err);
            alert("Could not load video files.");
        } finally {
            setWatchLoading(false);
        }
    };

    const displayProgress = progress || download;
    const progressPct = Math.min(displayProgress.progress || 0, 100);
    const isCompleted = displayProgress.status === "completed";
    const status = displayProgress.status || "downloading";

    return (
        <>
            {playerFile && (
                <WatchModal
                    file={playerFile}
                    title={displayProgress.title}
                    allFiles={allFiles}
                    onFileChange={setPlayerFile}
                    onClose={() => setPlayerFile(null)}
                />
            )}
            <div
                style={{ ...styles.item, ...(BORDER_COLORS[status] || {}) }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "#21262d"; e.currentTarget.style.boxShadow = "none"; }}
            >
                <div style={styles.header}>
                    <span style={styles.title}>{displayProgress.title}</span>
                    <div style={styles.headerRight}>
                        {isCompleted && (
                            <button
                                style={{ ...styles.watchBtn, ...(watchLoading ? styles.watchBtnDisabled : {}) }}
                                onClick={handleWatch}
                                disabled={watchLoading}
                                title="Watch this video"
                                onMouseEnter={e => { if (!watchLoading) { e.currentTarget.style.background = "linear-gradient(135deg, #2ea043 0%, #3fb950 100%)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(35,134,54,0.35)"; e.currentTarget.style.transform = "translateY(-1px)"; } }}
                                onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #238636 0%, #2ea043 100%)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(35,134,54,0.2)"; e.currentTarget.style.transform = "translateY(0)"; }}
                            >
                                {watchLoading ? (
                                    <span style={styles.watchSpinner} />
                                ) : (
                                    "▶ Watch"
                                )}
                            </button>
                        )}
                        <span style={{ ...styles.status, ...(STATUS_BADGES[status] || {}) }}>{status}</span>
                    </div>
                </div>
                <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, ...(FILL_COLORS[status] || {}), width: progressPct + "%" }} />
                </div>
                <div style={styles.meta}>
                    <span style={styles.size}>{formatSize(displayProgress.downloaded_bytes)} / {formatSize(displayProgress.total_bytes)}</span>
                    <span style={{ ...styles.percent, ...(PCT_COLORS[status] || {}) }}>{progressPct.toFixed(1)}%</span>
                </div>
            </div>
        </>
    );
}

const styles = {
    item: {
        background: "#0d1117",
        border: "1px solid #21262d",
        borderRadius: 10,
        padding: "14px 16px",
        borderLeft: "3px solid #007BFF",
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    header: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        marginBottom: 10,
    },
    title: {
        fontSize: "0.9rem",
        fontWeight: 600,
        color: "#c9d1d9",
        flex: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        fontFamily: "'Inter', sans-serif",
    },
    headerRight: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
    },
    watchBtn: {
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 14px",
        border: "none",
        borderRadius: 6,
        background: "linear-gradient(135deg, #238636 0%, #2ea043 100%)",
        color: "#fff",
        fontSize: "0.8rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        letterSpacing: "0.02em",
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
        boxShadow: "0 2px 8px rgba(35, 134, 54, 0.2)",
    },
    watchBtnDisabled: {
        opacity: 0.5,
        cursor: "not-allowed",
    },
    watchSpinner: {
        display: "inline-block",
        width: 12,
        height: 12,
        border: "2px solid rgba(255, 255, 255, 0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
    status: {
        fontSize: "0.68rem",
        fontWeight: 700,
        color: "#fff",
        background: "#007BFF",
        padding: "2px 10px",
        borderRadius: 4,
        textTransform: "uppercase",
        letterSpacing: "0.6px",
        whiteSpace: "nowrap",
    },
    progressBar: {
        width: "100%",
        height: 6,
        background: "#21262d",
        borderRadius: 3,
        overflow: "hidden",
        marginBottom: 8,
    },
    progressFill: {
        height: "100%",
        background: "linear-gradient(90deg, #007BFF, #58a6ff)",
        borderRadius: 3,
        transition: "width 1s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    meta: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "0.78rem",
        color: "#8b949e",
    },
    size: {
        fontWeight: 500,
    },
    percent: {
        fontWeight: 600,
        color: "#007BFF",
        minWidth: 48,
        textAlign: "right",
    },
};
