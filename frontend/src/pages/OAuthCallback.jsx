import { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { GlobalState } from "../State";
import { authApi } from "../api/auth";

export default function OAuthCallback({ provider }) {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { setToken, setUsername } = GlobalState();
    const [error, setError] = useState("");
    const exchanged = useRef(false);

    useEffect(() => {
        if (exchanged.current) return;
        exchanged.current = true;

        const code = searchParams.get("code");
        if (!code) {
            setError("No authorization code received.");
            return;
        }

        const exchangeCode = async () => {
            try {
                const redirectUri = window.location.origin + "/oauth-callback/" + provider;
                const res = await authApi.oauthCallback(provider, { code, redirect_uri: redirectUri });
                setToken(res.data.token.access_token, res.data.token.expires_at);
                setUsername(res.data.user.username);
                navigate("/", { replace: true });
            } catch (err) {
                const detail = err.response?.data?.detail;
                setError(typeof detail === "string" ? detail : "OAuth login failed. Please try again.");
            }
        };

        exchangeCode();
    }, []);

    if (error) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h2 style={styles.heading}>Login Failed</h2>
                    <p style={styles.message}>{error}</p>
                    <button style={styles.button} onClick={() => navigate("/", { replace: true })}>
                        Go to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2 style={styles.heading}>Logging you in…</h2>
                <p style={styles.message}>Please wait while we complete authentication.</p>
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        padding: "1.5rem",
    },
    card: {
        width: "100%",
        maxWidth: "400px",
        padding: "2rem",
        background: "#fefefe",
        borderRadius: "12px",
        textAlign: "center",
        fontFamily: "'Inter', sans-serif",
    },
    heading: {
        fontSize: "1.3rem",
        fontWeight: 700,
        color: "#1f2328",
        marginBottom: "0.75rem",
    },
    message: {
        fontSize: "0.9rem",
        color: "#8b949e",
        marginBottom: "1.25rem",
    },
    button: {
        padding: "0.65rem 1.5rem",
        borderRadius: "6px",
        background: "#007BFF",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: "0.9rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
    },
};
