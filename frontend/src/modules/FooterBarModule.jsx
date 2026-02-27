export default function FooterBarModule() {
    return (
        <footer style={{
            padding: "1.25rem 1rem",
            textAlign: "center",
            borderTop: "1px solid #21262d",
            background: "linear-gradient(180deg, #0d1117 0%, #090c10 100%)",
            marginTop: "auto",
        }}>
            <p style={{
                margin: 0,
                fontSize: "0.8rem",
                color: "#484f58",
                fontFamily: "'Inter', sans-serif",
                letterSpacing: "0.3px",
                transition: "color 0.4s cubic-bezier(0.25, 1, 0.3, 1)",
                cursor: "default",
            }}
                onMouseEnter={e => { e.currentTarget.style.color = "#8b949e"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "#484f58"; }}
            >&copy; 2026 HyperTube. All rights reserved.</p>
        </footer>
    );
}
