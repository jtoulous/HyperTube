export default function FooterBarModule() {
    return (
        <footer style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "0.6rem 1rem",
            textAlign: "center",
            borderTop: "1px solid #21262d",
            background: "#0d1117",
            fontSize: "0.78rem",
            color: "#8b949e",
            zIndex: 100,
        }}>
            <p>&copy; 2026 HyperTube. All rights reserved.</p>
        </footer>
    );
}
