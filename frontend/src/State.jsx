import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from './api/client';

const StateContext = createContext();

export function State({ children }) {
    const [token, setTokenState] = useState(() => localStorage.getItem('token'))
    const [username, setUsername] = useState("");

    const [availableContentList, setAvailableContentList] = useState([])
    const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);

    const refreshTimerRef = useRef(null);

    const isLogged = !!token;

    const setToken = useCallback((newToken, expiresAt) => {
        setTokenState(newToken);
        if (newToken) {
            localStorage.setItem('token', newToken);
            if (expiresAt) localStorage.setItem('token_expires_at', String(expiresAt));
        } else {
            localStorage.removeItem('token');
            localStorage.removeItem('token_expires_at');
        }
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setUsername("");
    }, [setToken]);

    //  Proactive token refresh scheduling
    const scheduleRefresh = useCallback(() => {
        if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

        const expiresAtStr = localStorage.getItem('token_expires_at');
        const currentToken = localStorage.getItem('token');
        if (!expiresAtStr || !currentToken) return;

        const expiresAt = Number(expiresAtStr);
        // Refresh 60 seconds before expiry
        const refreshInMs = (expiresAt - 60) * 1000 - Date.now();

        if (refreshInMs <= 0) {
            // Already past the refresh window — try immediately
            import('./api/client').then(mod => {
                const axios = mod.default;
                axios.post('/auth/refresh', { token: currentToken }).then(res => {
                    const { access_token, expires_at } = res.data;
                    setToken(access_token, expires_at);
                    scheduleRefresh();
                }).catch(() => { /* interceptor handles fallback */ });
            });
            return;
        }

        refreshTimerRef.current = setTimeout(async () => {
            const tok = localStorage.getItem('token');
            if (!tok) return;
            try {
                const res = await api.post('/auth/refresh', { token: tok });
                const { access_token, expires_at } = res.data;
                setToken(access_token, expires_at);
                scheduleRefresh();
            } catch {
                // Interceptor will handle 401 retry on next real request
            }
        }, refreshInMs);
    }, [setToken]);

    useEffect(() => {
        if (token) scheduleRefresh();
        return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
    }, [token, scheduleRefresh]);

    // Listen for successful refreshes from the interceptor
    useEffect(() => {
        const handleRefreshed = (e) => {
            const { access_token, expires_at } = e.detail;
            setTokenState(access_token);
            scheduleRefresh();
        };
        window.addEventListener('auth-refreshed', handleRefreshed);
        return () => window.removeEventListener('auth-refreshed', handleRefreshed);
    }, [scheduleRefresh]);

    // Validate token and restore username on mount
    useEffect(() => {
        if (!token) return;
        api.get('/users/me')
            .then((res) => {
                setUsername(res.data.username);
            })
            .catch(() => {
                // Token is invalid/expired — logout
                setTokenState(null);
                setUsername("");
                localStorage.removeItem('token');
            });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Listen for 401 logout events from the API interceptor
    useEffect(() => {
        const handleAuthLogout = () => {
            setTokenState(null);
            setUsername("");
            localStorage.removeItem('token_expires_at');
        };
        window.addEventListener('auth-logout', handleAuthLogout);
        return () => window.removeEventListener('auth-logout', handleAuthLogout);
    }, []);

    return (
        <StateContext.Provider value={{
            isLogged,
            token, setToken,
            logout,
            username, setUsername,
            sidebarOpen, setSidebarOpen
        }}>
            {children}
        </StateContext.Provider>
    );
}

export const GlobalState = () => useContext(StateContext);
