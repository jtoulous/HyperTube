import React, { useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import TopBarModule from "../modules/TopBarModule.jsx";
import FooterBarModule from "../modules/FooterBarModule.jsx";
import { authApi } from "../api/auth";

export default function ResetPassword() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = useMemo(() => searchParams.get("token"), [searchParams]);

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [loading, setLoading] = useState(false);

    const extractError = (err) => {
        const detail = err.response?.data?.detail;
        if (!detail) return "Something went wrong";
        if (typeof detail === "string") return detail;
        if (Array.isArray(detail)) return detail.map((e) => e.msg).join(", ");
        return JSON.stringify(detail);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            await authApi.resetPassword({ token, new_password: password });
            setSuccess("Password reset successfully! Redirecting to login…");
            setTimeout(() => navigate("/", { replace: true }), 2000);
        } catch (err) {
            setError(extractError(err));
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <>
                <TopBarModule />
                <div style={styles.container}>
                    <div style={styles.card}>
                        <h2 style={styles.heading}>Invalid Link</h2>
                        <p style={styles.subtitle}>
                            This reset link is missing a token. Please request a new password reset.
                        </p>
                        <button style={styles.submitButton} onClick={() => navigate("/", { replace: true })}>
                            Go to Home
                        </button>
                    </div>
                </div>
                <FooterBarModule />
            </>
        );
    }

    return (
        <>
            <TopBarModule />
            <div style={styles.container}>
                <div style={styles.card}>
                    <h2 style={styles.heading}>Reset Your Password</h2>
                    <p style={styles.subtitle}>Enter your new password below.</p>

                    {error && <p style={styles.error}>{error}</p>}
                    {success && <p style={styles.success}>{success}</p>}

                    <form style={styles.form} onSubmit={handleSubmit}>
                        <label style={styles.label}>New Password</label>
                        <input
                            style={styles.input}
                            type="password"
                            placeholder="Minimum 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            disabled={!!success}
                        />

                        <label style={styles.label}>Confirm Password</label>
                        <input
                            style={styles.input}
                            type="password"
                            placeholder="Re-enter your password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            minLength={8}
                            disabled={!!success}
                        />

                        <button
                            style={{
                                ...styles.submitButton,
                                opacity: loading || success ? 0.6 : 1,
                                cursor: loading || success ? "not-allowed" : "pointer",
                            }}
                            type="submit"
                            disabled={loading || !!success}
                        >
                            {loading ? "Resetting…" : "Reset Password"}
                        </button>
                    </form>
                </div>
            </div>
            <FooterBarModule />
        </>
    );
}

const styles = {
    container: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "calc(100vh - 140px)",
        padding: "1.5rem",
    },
    card: {
        width: "100%",
        maxWidth: "420px",
        padding: "2rem",
        background: "#fefefe",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
        fontFamily: "'Inter', sans-serif",
    },
    heading: {
        fontSize: "1.5rem",
        fontWeight: 700,
        color: "#1f2328",
        marginBottom: "0.25rem",
        textAlign: "center",
    },
    subtitle: {
        fontSize: "0.9rem",
        color: "#8b949e",
        textAlign: "center",
        marginBottom: "1.25rem",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
    },
    label: {
        fontSize: "0.85rem",
        fontWeight: 500,
        color: "#8b949e",
    },
    input: {
        padding: "0.65rem 0.75rem",
        borderRadius: "6px",
        border: "1px solid #d0d7de",
        background: "#fefefe",
        color: "#1f2328",
        fontSize: "0.9rem",
        fontFamily: "'Inter', sans-serif",
        outline: "none",
    },
    submitButton: {
        marginTop: "0.5rem",
        padding: "0.7rem",
        borderRadius: "6px",
        background: "#007BFF",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: "0.95rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
    },
    error: {
        fontSize: "0.8rem",
        color: "#f85149",
        background: "rgba(248,81,73,0.1)",
        padding: "0.5rem 0.75rem",
        borderRadius: "6px",
        marginBottom: "0.5rem",
        textAlign: "center",
    },
    success: {
        fontSize: "0.8rem",
        color: "#3fb950",
        background: "rgba(63,185,80,0.1)",
        padding: "0.5rem 0.75rem",
        borderRadius: "6px",
        marginBottom: "0.5rem",
        textAlign: "center",
    },
};
