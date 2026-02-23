import { Link } from "react-router-dom";

export default function Home() {
  const token = localStorage.getItem("token");

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>HyperTube</h1>
      <p style={{ marginTop: "1rem", color: "#8b949e" }}>
        Welcome to HyperTube
      </p>
      <nav style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
        {token ? (
          <button onClick={handleLogout} style={buttonStyle}>
            Logout
          </button>
        ) : (
          <>
            <Link to="/login" style={buttonStyle}>
              Login
            </Link>
            <Link to="/register" style={buttonStyle}>
              Register
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}

const buttonStyle = {
  padding: "0.6rem 1.5rem",
  borderRadius: "6px",
  background: "#238636",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: "1rem",
};
