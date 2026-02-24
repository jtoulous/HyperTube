import { useEffect } from "react";

export default function ProfileModule({ isOpen, onClose, username }) {
    // Lock body scroll when drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [isOpen]);

    return (
        <>
            <div
                style={{
                    ...styles.overlay,
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? "all" : "none",
                }}
                onClick={onClose}
            />

            <div style={{
                ...styles.drawer,
                transform: isOpen ? "translateX(0)" : "translateX(100%)",
            }}>
                <div style={styles.header}>
                    <span style={styles.heading}>Profile</span>
                    <button style={styles.closeButton} onClick={onClose} aria-label="Close">
                        &times;
                    </button>
                </div>
                <div style={styles.body}>
                    <input type="text" value={username} style={styles.input} />
                </div>
            </div>
        </>
    );
}

const styles = {
    overlay: {
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        zIndex: 200,
        transition: "opacity 0.25s ease",
    },
    drawer: {
        position: "fixed",
        top: 0,
        right: 0,
        height: "100dvh",
        width: "min(400px, 90vw)",
        backgroundColor: "#161b22",
        color: "#e6edf3",
        boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
        zIndex: 201,
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem 1.25rem",
        borderBottom: "1px solid #30363d",
    },
    heading: {
        fontSize: "1.1rem",
        fontWeight: 600,
    },
    closeButton: {
        background: "none",
        border: "none",
        color: "#8b949e",
        fontSize: "1.5rem",
        cursor: "pointer",
        lineHeight: 1,
        padding: "0.1rem 0.3rem",
    },
    body: {
        flex: 1,
        padding: "1.25rem",
        overflowY: "auto",
    },
    message: {
        fontSize: "0.9rem",
        color: "#8b949e",
    },
    input: {
        width: "100%",
        padding: "0.65rem 0.75rem",
        borderRadius: "6px",
        border: "1px solid #30363d",
        background: "#0d1117",
        color: "#c9d1d9",
        fontSize: "0.9rem",
        fontFamily: "'Inter', sans-serif",
        outline: "none",
    },
};

