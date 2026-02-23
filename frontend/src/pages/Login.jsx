import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authApi } from "../api/auth";

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const res = await authApi.login({ username, password });
      localStorage.setItem("token", res.data.access_token);
      navigate("/");
    } catch {
      setError("Invalid credentials");
    }
  };

  return (
    <div style={containerStyle}>
      <h2>Login</h2>
      {error && <p style={{ color: "#f85149" }}>{error}</p>}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={inputStyle}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
          required
        />
        <button type="submit" style={buttonStyle}>
          Login
        </button>
      </form>
      <p style={{ marginTop: "1rem" }}>
        Don&apos;t have an account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}

const containerStyle = {
  maxWidth: 400,
  margin: "4rem auto",
  padding: "2rem",
  textAlign: "center",
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  marginTop: "1rem",
};

const inputStyle = {
  padding: "0.6rem",
  borderRadius: "6px",
  border: "1px solid #30363d",
  background: "#161b22",
  color: "#e6edf3",
  fontSize: "1rem",
};

const buttonStyle = {
  padding: "0.6rem",
  borderRadius: "6px",
  background: "#238636",
  color: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: "1rem",
};
