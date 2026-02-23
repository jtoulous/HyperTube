import { useState, useEffect, useRef } from "react";
import { GlobalState } from "../State";
import AuthModule from "./submodules/AuthModule";

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
};
