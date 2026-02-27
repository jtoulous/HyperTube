import { useState, useEffect, useRef } from "react";
import { GlobalState } from "../State";
import AuthModule from "./submodules/AuthModule";
import ProfileModule from "./submodules/ProfileModule";

import Icon from '@mdi/react';
import { mdiMenu, mdiAccount, mdiLogout, mdiLogin } from '@mdi/js';

export default function TopBarModule() {
    const { isLogged, logout, username, sidebarOpen, setSidebarOpen } = GlobalState();
    const [authModuleVisible, setAuthModuleVisible] = useState(false);
    const [profileModuleVisible, setProfileModuleVisible] = useState(false);
    const authWrapperRef = useRef(null);

    const handleAuthModule = () => {
        setAuthModuleVisible(!authModuleVisible);
    };

    const handleProfileModule = () => {
        setProfileModuleVisible(!profileModuleVisible);
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
        <div className="top-bar" style={styles.topBar}>
            <div
                style={styles.iconWrapper}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(139,148,158,0.12)"; e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(139,148,158,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
            >
                <Icon path={mdiMenu} size={1.3} onClick={() => setSidebarOpen(!sidebarOpen)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {isLogged ? (
                    <>
                        <div
                            style={styles.iconWrapper}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(88,166,255,0.1)"; e.currentTarget.style.color = "#58a6ff"; e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(88,166,255,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#c9d1d9"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
                        >
                            <Icon path={mdiAccount} size={1.3} onClick={handleProfileModule} />
                        </div>
                        <ProfileModule isOpen={profileModuleVisible} onClose={() => setProfileModuleVisible(false)} targetUsername={username} />
                        <div
                            style={styles.iconWrapper}
                            onMouseEnter={e => { e.currentTarget.style.background = "rgba(248,81,73,0.1)"; e.currentTarget.style.color = "#f85149"; e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(248,81,73,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#c9d1d9"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
                        >
                            <Icon path={mdiLogout} onClick={logout} size={1.3} />
                        </div>
                    </>
                ) : (
                    <div
                        style={styles.iconWrapper}
                        onMouseEnter={e => { e.currentTarget.style.background = "rgba(63,185,80,0.1)"; e.currentTarget.style.color = "#3fb950"; e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 0 12px rgba(63,185,80,0.1)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#c9d1d9"; e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                        <div style={styles.authWrapper} ref={authWrapperRef}>
                            <Icon path={mdiLogin} onClick={handleAuthModule} size={1.3} />
                            {authModuleVisible && <AuthModule />}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    topBar: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "0 1rem",
        background: "#0d1117",
        color: "#c9d1d9",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        height: "56px",
        borderBottom: "1px solid #21262d",
    },
    iconWrapper: {
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px",
        borderRadius: 8,
        transition: "all 0.3s cubic-bezier(0.25, 1, 0.3, 1)",
    },
    authWrapper: {
        position: "relative",
    },
};
