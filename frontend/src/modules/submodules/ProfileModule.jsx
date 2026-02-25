import { useEffect, useState, useCallback } from "react";
import { usersApi } from "../../api/users";
import { GlobalState } from "../../State";

const LANGUAGES = [
    { value: "en", label: "English" },
    { value: "fr", label: "Français" },
    { value: "es", label: "Español" },
    { value: "de", label: "Deutsch" },
];

export default function ProfileModule({ isOpen, onClose, targetUsername }) {
    const { username: loggedUsername, setUsername: setGlobalUsername } = GlobalState();
    const [profile, setProfile] = useState(null);
    const [isSelf, setIsSelf] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    // Editable fields
    const [email, setEmail] = useState("");
    const [username, setUsernameField] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [language, setLanguage] = useState("en");
    const [authProvider, setAuthProvider] = useState("");

    // Password change
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    const [profilePicture, setProfilePicture] = useState("");

    // Search
    const [searchQuery, setSearchQuery] = useState("");

    const fetchProfileFor = useCallback(async (usernameToFetch) => {
        setLoading(true);
        setError("");
        setSuccess("");
        setProfile(null);
        try {
            let res;
            if (!usernameToFetch || usernameToFetch === loggedUsername) {
                res = await usersApi.getMe();
            } else {
                res = await usersApi.searchUser(usernameToFetch);
            }
            const data = res.data;
            setProfile(data.profile);
            setIsSelf(data.is_self);

            if (data.is_self) {
                setEmail(data.profile.email || "");
                setUsernameField(data.profile.username || "");
                setFirstName(data.profile.first_name || "");
                setLastName(data.profile.last_name || "");
                setLanguage(data.profile.language || "en");
                setAuthProvider(data.profile.auth_provider || "");
                setProfilePicture(data.profile.profile_picture || "");
            }
        } catch {
            setProfile(null);
            setError(usernameToFetch ? "User not found" : "Failed to load profile");
        } finally {
            setLoading(false);
        }
    }, [loggedUsername]);

    const handleSearch = () => {
        fetchProfileFor(searchQuery.trim() || null);
    };

    const handleSearchKeyDown = (e) => {
        if (e.key === "Enter") handleSearch();
    };

    useEffect(() => {
        if (!isOpen) return;
        setError("");
        setSuccess("");
        setShowPasswordForm(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSearchQuery("");
        fetchProfileFor(targetUsername || null);
    }, [isOpen, targetUsername, fetchProfileFor]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => { document.body.style.overflow = ""; };
    }, [isOpen]);

    const handleSave = async () => {
        setError("");
        setSuccess("");
        try {
            const payload = {};
            if (username !== profile.username) payload.username = username;
            if (firstName !== (profile.first_name || "")) payload.first_name = firstName;
            if (lastName !== (profile.last_name || "")) payload.last_name = lastName;
            if (language !== (profile.language || "en")) payload.language = language;
            if (isSelf && authProvider === "EMAIL" && email !== profile.email) payload.email = email;
            if (profilePicture !== (profile.profile_picture || "")) payload.profile_picture = profilePicture;

            if (Object.keys(payload).length === 0) {
                setSuccess("No changes to save");
                return;
            }

            const res = await usersApi.updateProfile(payload);
            setProfile({ ...profile, ...res.data });
            if (payload.username) setGlobalUsername(payload.username);
            setSuccess("Profile updated");
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "Failed to update profile");
        }
    };

    const handlePasswordChange = async () => {
        setError("");
        setSuccess("");
        if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
        if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
        try {
            await usersApi.changePassword({ current_password: currentPassword, new_password: newPassword });
            setSuccess("Password changed");
            setShowPasswordForm(false);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            const detail = err.response?.data?.detail;
            setError(typeof detail === "string" ? detail : "Failed to change password");
        }
    };

    const avatarUrl = profile?.profile_picture || null;
    const displayName = profile
        ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.username
        : "";

    const providerLabel = (p) => {
        if (p === "FORTYTWO") return "42";
        if (p === "GITHUB") return "GitHub";
        return "Email";
    };

    return (
        <>
            <div
                style={{ ...styles.overlay, opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? "all" : "none" }}
                onClick={onClose}
            />
            <div style={{ ...styles.drawer, transform: isOpen ? "translateX(0)" : "translateX(100%)" }}>
                {/* Header */}
                <div style={styles.header}>
                    <span style={styles.heading}>{isSelf ? "My Profile" : "Profile"}</span>
                    <button style={styles.closeButton} onClick={onClose} aria-label="Close">&times;</button>
                </div>

                <div style={styles.body}>
                    {/* Search input */}
                    <div style={styles.searchRow}>
                        <input
                            style={styles.searchInput}
                            type="text"
                            placeholder="Search user by username…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={handleSearchKeyDown}
                        />
                        <button style={styles.searchButton} onClick={handleSearch}>Search</button>
                    </div>

                    <div style={{ marginTop: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid #30363d" }} />

                    {loading && <p style={styles.muted}>Loading…</p>}
                    {error && <p style={styles.error}>{error}</p>}
                    {success && <p style={styles.success}>{success}</p>}

                    {profile && !loading && (
                        <>
                            {/* Avatar */}
                            <div style={styles.avatarSection}>
                                <div style={styles.avatar}>
                                    {avatarUrl
                                        ? <img src={avatarUrl} alt="avatar" style={styles.avatarImg} />
                                        : <span style={styles.avatarFallback}>{(profile.username || "?")[0].toUpperCase()}</span>
                                    }
                                </div>
                                {!isSelf && <p style={styles.displayName}>{displayName}</p>}
                            </div>

                            {/* ── Self-edit view ── */}
                            {isSelf ? (
                                <div style={styles.fieldGroup}>
                                    {/* Email (only email provider) */}
                                    {authProvider === "EMAIL" && (
                                        <label style={styles.label}>
                                            Email
                                            <input style={styles.input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                                        </label>
                                    )}

                                    <label style={styles.label}>
                                        Username
                                        <input style={styles.input} type="text" value={username} onChange={(e) => setUsernameField(e.target.value)} />
                                    </label>

                                    <label style={styles.label}>
                                        First name
                                        <input style={styles.input} type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                                    </label>

                                    <label style={styles.label}>
                                        Last name
                                        <input style={styles.input} type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                                    </label>

                                    <label style={styles.label}>
                                        Language
                                        <select style={styles.input} value={language} onChange={(e) => setLanguage(e.target.value)}>
                                            {LANGUAGES.map((l) => (
                                                <option key={l.value} value={l.value}>{l.label}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <label style={styles.label}>
                                        Profile picture URL
                                        <input style={styles.input} type="url" placeholder="https://..." value={profilePicture} onChange={(e) => setProfilePicture(e.target.value)} />
                                    </label>

                                    <label style={styles.label}>
                                        Auth provider
                                        <input style={{ ...styles.input, opacity: 0.6 }} type="text" value={providerLabel(authProvider)} readOnly />
                                    </label>

                                    <button style={styles.saveButton} onClick={handleSave}>Save changes</button>

                                    {/* Password section (email auth only) */}
                                    {authProvider === "EMAIL" && (
                                        <>
                                            <div style={styles.divider} />
                                            {!showPasswordForm ? (
                                                <button
                                                    style={styles.secondaryButton}
                                                    onClick={() => setShowPasswordForm(true)}
                                                >
                                                    Change password
                                                </button>
                                            ) : (
                                                <div style={styles.fieldGroup}>
                                                    <label style={styles.label}>
                                                        Current password
                                                        <input style={styles.input} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                                                    </label>
                                                    <label style={styles.label}>
                                                        New password
                                                        <input style={styles.input} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                                                    </label>
                                                    <label style={styles.label}>
                                                        Confirm new password
                                                        <input style={styles.input} type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                                                    </label>
                                                    <div style={{ display: "flex", gap: "0.5rem" }}>
                                                        <button style={styles.saveButton} onClick={handlePasswordChange}>Update password</button>
                                                        <button style={styles.secondaryButton} onClick={() => setShowPasswordForm(false)}>Cancel</button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                                /* ── Read-only view for other users ── */
                                <div style={styles.fieldGroup}>
                                    <div style={styles.readOnlyRow}>
                                        <span style={styles.readOnlyLabel}>Username</span>
                                        <span style={styles.readOnlyValue}>{profile.username}</span>
                                    </div>
                                    {profile.first_name && (
                                        <div style={styles.readOnlyRow}>
                                            <span style={styles.readOnlyLabel}>First name</span>
                                            <span style={styles.readOnlyValue}>{profile.first_name}</span>
                                        </div>
                                    )}
                                    {profile.last_name && (
                                        <div style={styles.readOnlyRow}>
                                            <span style={styles.readOnlyLabel}>Last name</span>
                                            <span style={styles.readOnlyValue}>{profile.last_name}</span>
                                        </div>
                                    )}
                                    <div style={styles.readOnlyRow}>
                                        <span style={styles.readOnlyLabel}>Language</span>
                                        <span style={styles.readOnlyValue}>
                                            {LANGUAGES.find((l) => l.value === profile.language)?.label || profile.language || "—"}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

const styles = {
    overlay: {
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.55)",
        zIndex: 200,
        transition: "opacity 0.25s ease",
    },
    drawer: {
        position: "fixed",
        top: 0,
        right: 0,
        height: "100dvh",
        width: "min(420px, 92vw)",
        backgroundColor: "#161b22",
        color: "#e6edf3",
        boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.4)",
        zIndex: 201,
        display: "flex",
        flexDirection: "column",
        transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        fontFamily: "'Inter', sans-serif",
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "1rem 1.25rem",
        borderBottom: "1px solid #30363d",
    },
    heading: { fontSize: "1.1rem", fontWeight: 600 },
    closeButton: {
        background: "none",
        border: "none",
        color: "#8b949e",
        fontSize: "1.5rem",
        cursor: "pointer",
        lineHeight: 1,
        padding: "0.1rem 0.3rem",
    },
    body: {
        flex: 1,
        padding: "1.25rem",
        overflowY: "auto",
    },
    searchRow: {
        display: "flex",
        gap: "0.5rem",
        marginBottom: "1rem",
    },
    searchInput: {
        flex: 1,
        padding: "0.6rem 0.75rem",
        borderRadius: "6px",
        border: "1px solid #30363d",
        background: "#0d1117",
        color: "#c9d1d9",
        fontSize: "0.9rem",
        fontFamily: "'Inter', sans-serif",
        outline: "none",
        boxSizing: "border-box",
    },
    searchButton: {
        padding: "0.6rem 1rem",
        borderRadius: "6px",
        background: "#21262d",
        color: "#c9d1d9",
        border: "1px solid #30363d",
        cursor: "pointer",
        fontSize: "0.85rem",
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
        whiteSpace: "nowrap",
    },
    muted: { fontSize: "0.9rem", color: "#8b949e" },
    error: {
        fontSize: "0.8rem",
        color: "#f85149",
        background: "rgba(248,81,73,0.1)",
        padding: "0.5rem 0.75rem",
        borderRadius: "6px",
        marginBottom: "0.75rem",
    },
    success: {
        fontSize: "0.8rem",
        color: "#3fb950",
        background: "rgba(63,185,80,0.1)",
        padding: "0.5rem 0.75rem",
        borderRadius: "6px",
        marginBottom: "0.75rem",
    },

    /* Avatar */
    avatarSection: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: "1.25rem",
    },
    avatar: {
        position: "relative",
        width: 88,
        height: 88,
        borderRadius: "50%",
        overflow: "hidden",
        background: "#30363d",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarImg: { width: "100%", height: "100%", objectFit: "cover" },
    avatarFallback: { fontSize: "2rem", fontWeight: 700, color: "#8b949e" },
    displayName: { marginTop: "0.5rem", fontSize: "1rem", fontWeight: 600 },

    /* Form fields */
    fieldGroup: { display: "flex", flexDirection: "column", gap: "0.75rem" },
    label: {
        display: "flex",
        flexDirection: "column",
        gap: "0.3rem",
        fontSize: "0.8rem",
        color: "#8b949e",
        fontWeight: 500,
    },
    input: {
        width: "100%",
        padding: "0.6rem 0.75rem",
        borderRadius: "6px",
        border: "1px solid #30363d",
        background: "#0d1117",
        color: "#c9d1d9",
        fontSize: "0.9rem",
        fontFamily: "'Inter', sans-serif",
        outline: "none",
        boxSizing: "border-box",
    },
    saveButton: {
        padding: "0.6rem",
        borderRadius: "6px",
        background: "#238636",
        color: "#fff",
        border: "none",
        cursor: "pointer",
        fontSize: "0.9rem",
        fontWeight: 600,
        fontFamily: "'Inter', sans-serif",
        marginTop: "0.25rem",
    },
    secondaryButton: {
        padding: "0.55rem",
        borderRadius: "6px",
        background: "#21262d",
        color: "#c9d1d9",
        border: "1px solid #30363d",
        cursor: "pointer",
        fontSize: "0.85rem",
        fontFamily: "'Inter', sans-serif",
        fontWeight: 500,
    },
    divider: {
        height: "1px",
        background: "#30363d",
        margin: "0.5rem 0",
    },

    /* Read-only rows */
    readOnlyRow: {
        display: "flex",
        justifyContent: "space-between",
        padding: "0.6rem 0",
        borderBottom: "1px solid #21262d",
    },
    readOnlyLabel: { fontSize: "0.85rem", color: "#8b949e" },
    readOnlyValue: { fontSize: "0.9rem", fontWeight: 500 },
};

