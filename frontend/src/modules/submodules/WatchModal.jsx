import { useEffect, useState, useCallback, useRef } from "react";
import PlayerModule from "./PlayerModule";
import { formatSize } from "./utils";
import { watchApi } from "../../api/watch";

export default function WatchModal({ file, title, allFiles, onFileChange, onClose, downloadId, onWatchHistoryUpdate }) {
    const [initialPosition, setInitialPosition] = useState(0);
    const resumeFetched = useRef(false);

    // Fetch resume position on mount — doesn't block player rendering
    useEffect(() => {
        if (!downloadId || resumeFetched.current) return;
        resumeFetched.current = true;
        watchApi.getProgress(downloadId)
            .then(res => {
                const data = res.data;
                if (data.completed) {
                    setInitialPosition(0);
                } else if (data.last_position > 0) {
                    setInitialPosition(data.last_position);
                }
            })
            .catch(() => { /* no history yet — start from beginning */ });
    }, [downloadId]);

    // Save progress callback (called by PlayerModule every 15s + on unmount)
    const handleSaveProgress = useCallback(async (dlId, position, duration) => {
        if (!dlId) return;
        try {
            await watchApi.saveProgress(dlId, position, duration);
            if (onWatchHistoryUpdate) onWatchHistoryUpdate();
        } catch (err) {
            console.error("Failed to save watch progress:", err);
        }
    }, [onWatchHistoryUpdate]);

    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={styles.modalWrapper}>
                <div style={styles.header}>
                    <span style={styles.title}>{title}</span>
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
                    <button style={styles.closeBtn} onClick={onClose} title="Close (Esc)">✕</button>
                </div>
                <PlayerModule
                    filename={file.name}
                    downloadId={downloadId}
                    onSaveProgress={handleSaveProgress}
                    initialPosition={initialPosition}
                />
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0, 0, 0, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backdropFilter: "blur(6px)",
    },
    modalWrapper: {
        width: "92vw",
        maxWidth: 980,
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: 10,
    },
    title: {
        flex: 1,
        color: "#c9d1d9",
        fontSize: "0.9rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
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
        maxWidth: 260,
        outline: "none",
    },
    fileOption: {
        background: "#161b22",
        color: "#c9d1d9",
    },
    closeBtn: {
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: "50%",
        color: "#c9d1d9",
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.9rem",
        cursor: "pointer",
        flexShrink: 0,
    },
};
