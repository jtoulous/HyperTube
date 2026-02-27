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
            setToken(res.data.token.access_token, res.data.token.expires_at);
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
            setToken(res.data.token.access_token, res.data.token.expires_at);
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
                        onMouseEnter={e => { if (currentView !== tab.key) { e.currentTarget.style.color = "#333"; e.currentTarget.style.borderBottomColor = "rgba(0,123,255,0.3)"; } }}
                        onMouseLeave={e => { if (currentView !== tab.key) { e.currentTarget.style.color = "#888"; e.currentTarget.style.borderBottomColor = "transparent"; } }}
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
                    <button style={styles.submitButton} type="submit"
                        onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, #1a8cff 0%, #0560c7 100%)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,123,255,0.35)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #007BFF 0%, #0969da 100%)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,123,255,0.2)"; e.currentTarget.style.transform = "translateY(0)"; }}
                    >Login</button>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine} />
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine} />
                    </div>

                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauth42()}
                        onMouseEnter={e => { e.currentTarget.style.background = "#eaeaea"; e.currentTarget.style.borderColor = "#bbb"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        Continue with 42
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthGithub()}
                        onMouseEnter={e => { e.currentTarget.style.background = "#eaeaea"; e.currentTarget.style.borderColor = "#bbb"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        Continue with GitHub
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthDiscord()}
                        onMouseEnter={e => { e.currentTarget.style.background = "#eaeaea"; e.currentTarget.style.borderColor = "#bbb"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
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
                    <button style={styles.submitButton} type="submit"
                        onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, #1a8cff 0%, #0560c7 100%)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,123,255,0.35)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #007BFF 0%, #0969da 100%)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,123,255,0.2)"; e.currentTarget.style.transform = "translateY(0)"; }}
                    >Register</button>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine} />
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine} />
                    </div>

                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauth42()}
                        onMouseEnter={e => { e.currentTarget.style.background = "#eaeaea"; e.currentTarget.style.borderColor = "#bbb"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        Continue with 42
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthGithub()}
                        onMouseEnter={e => { e.currentTarget.style.background = "#eaeaea"; e.currentTarget.style.borderColor = "#bbb"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        Continue with GitHub
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => authApi.oauthDiscord()}
                        onMouseEnter={e => { e.currentTarget.style.background = "#eaeaea"; e.currentTarget.style.borderColor = "#bbb"; e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#f5f5f5"; e.currentTarget.style.borderColor = "#d0d0d0"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
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
                    <button style={styles.submitButton} type="submit"
                        onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, #1a8cff 0%, #0560c7 100%)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,123,255,0.35)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, #007BFF 0%, #0969da 100%)"; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,123,255,0.2)"; e.currentTarget.style.transform = "translateY(0)"; }}
                    >Send reset link</button>
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
        borderRadius: "12px",
        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0,0,0,0.05)",
        zIndex: 100,
        fontFamily: "'Inter', sans-serif",
        animation: "fadeSlideIn 0.25s cubic-bezier(0.25, 1, 0.3, 1)",
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
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
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
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    submitButton: {
        padding: "0.6rem",
        borderRadius: "6px",
        background: "linear-gradient(135deg, #007BFF 0%, #0969da 100%)",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: "0.9rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
        boxShadow: "0 2px 8px rgba(0, 123, 255, 0.2)",
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
        transition: "all 0.35s cubic-bezier(0.25, 1, 0.3, 1)",
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
