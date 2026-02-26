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
        <div style={styles.topBar}>
            <div style={styles.iconWrapper}>
                <Icon path={mdiMenu} size={1.5} onClick={() => setSidebarOpen(!sidebarOpen)} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                {isLogged ? (
                    <>
                        <div style={styles.iconWrapper}>
                            <Icon path={mdiAccount} size={1.5} onClick={handleProfileModule} />
                        </div>
                        <ProfileModule isOpen={profileModuleVisible} onClose={() => setProfileModuleVisible(false)} targetUsername={username} />
                        <div style={styles.iconWrapper}>
                            <Icon path={mdiLogout} onClick={logout} size={1.5} />
                        </div>
                    </>
                ) : (
                    <div style={styles.iconWrapper}>
                        <div style={styles.authWrapper} ref={authWrapperRef}>
                            <Icon path={mdiLogin} onClick={handleAuthModule} size={1.5} />
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
        padding: "1rem",
        background: "#0d1117",
        color: "#fff",
        fontFamily: "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        height: "60px",
        borderBottom: "1px solid #21262d",
    },
    iconWrapper: {
        cursor: "pointer",
    },
    authWrapper: {
        position: "relative",
    },
};
