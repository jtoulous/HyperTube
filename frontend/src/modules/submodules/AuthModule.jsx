import { useState, useEffect } from "react";
import { authApi } from "../../api/auth";
import { GlobalState } from "../../State";

export default function AuthModule() {
    const { setToken, setUsername } = GlobalState();
    const [currentView, setCurrentView] = useState("login");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Login state
    const [loginEmail, setLoginEmail] = useState("");
    const [loginPassword, setLoginPassword] = useState("");

    // Register state
    const [regFirstName, setRegFirstName] = useState("");
    const [regLastName, setRegLastName] = useState("");
    const [regUsername, setRegUsername] = useState("");
    const [regEmail, setRegEmail] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regConfirm, setRegConfirm] = useState("");

    // Reset state
    const [resetEmail, setResetEmail] = useState("");

    const clearMessages = () => { setError(""); setSuccess(""); };

    const extractError = (err) => {
        const detail = err.response?.data?.detail;
        if (!detail) return "Something went wrong";
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail)) return detail.map((e) => e.msg).join(", ");
        return JSON.stringify(detail);
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        clearMessages();
        try {
            const res = await authApi.login({ email: loginEmail, password: loginPassword });
            setToken(res.data.token.access_token);
            setUsername(res.data.user.username);

        } catch (err) {
            setError(extractError(err));
        }
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        clearMessages();
        if (regPassword !== regConfirm) {
            setError("Passwords do not match");
            return;
        }
        if (regPassword.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        try {
            const res = await authApi.register({
                email: regEmail,
                username: regUsername,
                password: regPassword,
                first_name: regFirstName || undefined,
                last_name: regLastName || undefined,
            });
            setToken(res.data.token.access_token);
        } catch (err) {
            setError(extractError(err));
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        clearMessages();
        try {
            await authApi.forgotPassword({ email: resetEmail });
            setSuccess("If that email exists, a reset link has been sent.");
        } catch (err) {
            setError(extractError(err));
        }
    };

    const tabs = [
        { key: "login", label: "Login" },
        { key: "register", label: "Register" },
        { key: "reset", label: "Reset" },
    ];

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
            params.delete("code");
            const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
            window.history.replaceState({}, "", newUrl);
        }
    }, []);

    return (
        <div style={styles.authModule}>
            <div style={styles.tabBar}>
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        style={{
                            ...styles.tab,
                            ...(currentView === tab.key ? styles.tabActive : {}),
                        }}
                        onClick={() => { setCurrentView(tab.key); clearMessages(); }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {error && <p style={styles.error}>{error}</p>}
            {success && <p style={styles.success}>{success}</p>}

            {currentView === "login" && (
                <form style={styles.form} onSubmit={handleLogin}>
                    <input style={styles.input} type="email" placeholder="Email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                    <input style={styles.input} type="password" placeholder="Password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                    <button style={styles.submitButton} type="submit">Login</button>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine} />
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine} />
                    </div>

                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauth42()}>
                        Continue with 42
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthGithub()}>
                        Continue with GitHub
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthDiscord()}>
                        Continue with Discord
                    </button>
                </form>
            )}

            {currentView === "register" && (
                <form style={styles.form} onSubmit={handleRegister}>
                    <input style={styles.input} type="text" placeholder="First name" value={regFirstName} onChange={(e) => setRegFirstName(e.target.value)} />
                    <input style={styles.input} type="text" placeholder="Last name" value={regLastName} onChange={(e) => setRegLastName(e.target.value)} />
                    <input style={styles.input} type="text" placeholder="Username" value={regUsername} onChange={(e) => setRegUsername(e.target.value)} required />
                    <input style={styles.input} type="email" placeholder="Email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} required />
                    <input style={styles.input} type="password" placeholder="Password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} required />
                    <input style={styles.input} type="password" placeholder="Confirm password" value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} required />
                    <button style={styles.submitButton} type="submit">Register</button>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine} />
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine} />
                    </div>

                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauth42()}>
                        Continue with 42
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthGithub()}>
                        Continue with GitHub
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthDiscord()}>
                        Continue with Discord
                    </button>
                </form>
            )}

            {currentView === "reset" && (
                <form style={styles.form} onSubmit={handleForgotPassword}>
                    <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem", textAlign: "center" }}>
                        Enter your email to receive a reset link.
                    </p>
                    <input style={styles.input} type="email" placeholder="Email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} required />
                    <button style={styles.submitButton} type="submit">Send reset link</button>
                </form>
            )}
        </div>
    );
}

const styles = {
    authModule: {
        position: "absolute",
        top: "calc(100% + 0.5rem)",
        right: 0,
        width: "320px",
        padding: "1.25rem",
        background: "#fff",
        color: "#333",
        borderRadius: "10px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
        zIndex: 100,
        fontFamily: "'Inter', sans-serif",
    },
    tabBar: {
        display: "flex",
        borderBottom: "2px solid #e0e0e0",
        marginBottom: "1rem",
    },
    tab: {
        flex: 1,
        padding: "0.5rem 0",
        background: "none",
        border: "none",
        borderBottom: "2px solid transparent",
        marginBottom: "-2px",
        cursor: "pointer",
        fontSize: "0.9rem",
        fontWeight: 500,
        color: "#888",
        textDecoration: "none",
        fontFamily: "'Inter', sans-serif",
        WebkitAppearance: "none",
        outline: "none",
    },
    tabActive: {
        color: "#007BFF",
        borderBottom: "2px solid #007BFF",
        fontWeight: 600,
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
    },
    input: {
        padding: "0.55rem 0.75rem",
        borderRadius: "6px",
        border: "1px solid #d0d0d0",
        fontSize: "0.9rem",
        fontFamily: "'Inter', sans-serif",
        outline: "none",
    },
    submitButton: {
        padding: "0.6rem",
        borderRadius: "6px",
        background: "#007BFF",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: "0.9rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
    },
    divider: {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        margin: "0.25rem 0",
    },
    dividerLine: {
        flex: 1,
        height: "1px",
        background: "#d0d0d0",
    },
    dividerText: {
        fontSize: "0.8rem",
        color: "#999",
    },
    oauthButton: {
        padding: "0.55rem",
        borderRadius: "6px",
        background: "#f5f5f5",
        color: "#333",
        border: "1px solid #d0d0d0",
        cursor: "pointer",
        fontSize: "0.85rem",
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
    },
    error: {
        fontSize: "0.8rem",
        color: "#d32f2f",
        background: "#fdecea",
        padding: "0.4rem 0.6rem",
        borderRadius: "4px",
        marginBottom: "0.5rem",
        textAlign: "center",
    },
    success: {
        fontSize: "0.8rem",
        color: "#2e7d32",
        background: "#edf7ed",
        padding: "0.4rem 0.6rem",
        borderRadius: "4px",
        marginBottom: "0.5rem",
        textAlign: "center",
    },
};
