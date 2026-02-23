import { useState, useEffect, useRef } from "react";
import { GlobalState } from "../State";

function AuthModule() {
    const [currentView, setCurrentView] = useState("login");

    const tabs = [
        { key: "login", label: "Login" },
        { key: "register", label: "Register" },
        { key: "reset", label: "Reset" },
    ];

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
                        onClick={() => setCurrentView(tab.key)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {currentView === "login" && (
                <form style={styles.form} onSubmit={(e) => e.preventDefault()}>
                    <input style={styles.input} type="text" placeholder="Username" required />
                    <input style={styles.input} type="password" placeholder="Password" required />
                    <button style={styles.submitButton} type="submit">Login</button>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine} />
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine} />
                    </div>

                    <button style={styles.oauthButton} type="button" onClick={() => {}}>
                        Continue with 42
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => {}}>
                        Continue with Google
                    </button>
                </form>
            )}

            {currentView === "register" && (
                <form style={styles.form} onSubmit={(e) => e.preventDefault()}>
                    <input style={styles.input} type="text" placeholder="Username" required />
                    <input style={styles.input} type="email" placeholder="Email" required />
                    <input style={styles.input} type="password" placeholder="Password" required />
                    <input style={styles.input} type="password" placeholder="Confirm password" required />
                    <button style={styles.submitButton} type="submit">Register</button>

                    <div style={styles.divider}>
                        <span style={styles.dividerLine} />
                        <span style={styles.dividerText}>or</span>
                        <span style={styles.dividerLine} />
                    </div>

                    <button style={styles.oauthButton} type="button" onClick={() => {}}>
                        Continue with 42
                    </button>
                    <button style={styles.oauthButton} type="button" onClick={() => {}}>
                        Continue with Google
                    </button>
                </form>
            )}

            {currentView === "reset" && (
                <form style={styles.form} onSubmit={(e) => e.preventDefault()}>
                    <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.5rem", textAlign: "center" }}>
                        Enter your email to receive a reset link.
                    </p>
                    <input style={styles.input} type="email" placeholder="Email" required />
                    <button style={styles.submitButton} type="submit">Send reset link</button>
                </form>
            )}
        </div>
    );
}

export default function TopBarModule({ handleLogout }) {
    const { isLogged } = GlobalState();
    const [authModuleVisible, setAuthModuleVisible] = useState(false);
    const authWrapperRef = useRef(null);

    const handleAuthModule = () => {
        setAuthModuleVisible(!authModuleVisible);
    };

    useEffect(() => {
        if (!authModuleVisible) return;

        const handleClickOutside = (e) => {
            if (authWrapperRef.current && !authWrapperRef.current.contains(e.target)) {
                setAuthModuleVisible(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [authModuleVisible]);

    return (
        <div style={styles.topBar}>
            <span style={styles.title}>HyperTube</span>
            {isLogged ? (
                <button style={styles.logoutButton} onClick={handleLogout}>Logout</button>
            ) : (
                <div style={styles.authWrapper} ref={authWrapperRef}>
                    <button style={styles.authButton} onClick={handleAuthModule}>Login / Register</button>
                    {authModuleVisible && <AuthModule />}
                </div>
            )}
        </div>
    );
}

const styles = {
    topBar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem",
        background: "#282c34",
        color: "#fff",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    title: {
        fontSize: "1.5rem",
        fontWeight: "bold",
    },
    logoutButton: {
        padding: "0.6rem 1.5rem",
        borderRadius: "6px",
        background: "#fefefe",
        color: "#000",
        border: "none",
        cursor: "pointer",
        fontSize: "1rem",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    authButton: {
        padding: "0.6rem 1.5rem",
        borderRadius: "6px",
        background: "#fefefe",
        color: "#000",
        border: "none",
        cursor: "pointer",
        fontSize: "1rem",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    },
    authWrapper: {
        position: "relative",
    },
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
};
