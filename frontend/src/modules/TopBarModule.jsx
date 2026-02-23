export default function TopBarModule({ handleLogout }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "#282c34", color: "#fff" }}>
            <h1>HyperTube</h1>
            <button onClick={handleLogout} style={{ padding: "0.6rem 1.5rem", borderRadius: "6px", background: "#238636", color: "#fff", border: "none", cursor: "pointer", fontSize: "1rem" }}>
                Logout
            </button>
        </div>
    );
}
