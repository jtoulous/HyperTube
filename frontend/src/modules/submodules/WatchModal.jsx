import { useEffect } from "react";
import PlayerModule from "./PlayerModule";
import { formatSize } from "./utils";

export default function WatchModal({ file, title, allFiles, onFileChange, onClose, onTimeReport, initialTime = 0 }) {
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    const isPickerMode = !file; // no file selected to show source picker

    return (
        <div style={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ ...styles.modalWrapper, ...(isPickerMode ? styles.modalPicker : {}) }}>

                {/* ─── Header ─── */}
                <div style={styles.header}>
                    {file && (
                        <button
                            style={styles.backBtn}
                            onClick={() => onFileChange(null)}
                            title="Back to sources"
                            onMouseEnter={e => { e.currentTarget.style.background = "#30363d"; e.currentTarget.style.transform = "translateX(-2px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.3)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "#21262d"; e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.boxShadow = "none"; }}
                        >
                            ←
                        </button>
                    )}
                    <span style={styles.title}>{title}</span>
                    <button
                        style={styles.closeBtn}
                        onClick={onClose}
                        title="Close (Esc)"
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,81,73,0.15)"; e.currentTarget.style.color = "#f85149"; e.currentTarget.style.borderColor = "rgba(248,81,73,0.3)"; e.currentTarget.style.transform = "scale(1.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#21262d"; e.currentTarget.style.color = "#c9d1d9"; e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.transform = "scale(1)"; }}
                    >✕</button>
                </div>

                {/* ─── Source picker ─── */}
                {isPickerMode && (
                    <div style={styles.pickerBody}>
                        <div style={styles.pickerLabel}>Select a source to play</div>
                        <div style={styles.fileList}>
                            {allFiles.map((f, idx) => (
                                <button
                                    key={f.name}
                                    style={styles.fileRow}
                                    onClick={() => onFileChange(f)}
                                    onMouseEnter={e => { e.currentTarget.style.background = "#30363d"; e.currentTarget.style.borderColor = "rgba(0,123,255,0.3)"; e.currentTarget.style.transform = "translateX(4px)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = "#161b22"; e.currentTarget.style.borderColor = "#30363d"; e.currentTarget.style.transform = "translateX(0)"; e.currentTarget.style.boxShadow = "none"; }}
                                >
                                    <span style={styles.fileIcon}>🎬</span>
                                    <div style={styles.fileInfo}>
                                        <span style={styles.fileName}>{f.name.split("/").pop()}</span>
                                        <span style={styles.fileMeta}>{formatSize(f.size)}</span>
                                    </div>
                                    <span style={styles.playIcon}>▶</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ─── Player ─── */}
                {file && (
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
    modalPicker: {
        maxWidth: 560,
    },
    header: {
        display: "flex",
        alignItems: "center",
        gap: 10,
    },
    backBtn: {
        background: "#21262d",
        border: "1px solid #30363d",
        borderRadius: "50%",
        color: "#c9d1d9",
        width: 32,
        height: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1rem",
        cursor: "pointer",
        flexShrink: 0,
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    title: {
        flex: 1,
        color: "#e6edf3",
        fontSize: "1rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
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
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
    },

    /* Source picker */
    pickerBody: {
        display: "flex",
        flexDirection: "column",
        gap: 8,
    },
    pickerLabel: {
        color: "#8b949e",
        fontSize: "0.8rem",
        fontFamily: "'Inter', sans-serif",
    },
    fileList: {
        display: "flex",
        flexDirection: "column",
        gap: 4,
    },
    fileRow: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 8,
        cursor: "pointer",
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
        textAlign: "left",
        color: "#c9d1d9",
        fontFamily: "'Inter', sans-serif",
    },
    fileIcon: {
        fontSize: "1.2rem",
        flexShrink: 0,
    },
    fileInfo: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
    },
    fileName: {
        fontSize: "0.85rem",
        fontWeight: 500,
        color: "#e6edf3",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
    },
    fileMeta: {
        fontSize: "0.75rem",
        color: "#8b949e",
    },
    playIcon: {
        fontSize: "0.9rem",
        color: "#007BFF",
        flexShrink: 0,
    },

    /* File selector within player view */
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
    fileOption: {
        background: "#161b22",
        color: "#c9d1d9",
    },
};
