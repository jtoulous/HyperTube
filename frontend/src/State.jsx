import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from './api/client';

const StateContext = createContext();

export function State({ children }) {
    const [token, setTokenState] = useState(() => localStorage.getItem('token'))
    const [username, setUsername] = useState("");

    const [availableContentList, setAvailableContentList] = useState([])

    const isLogged = !!token;

    const setToken = useCallback((newToken) => {
        setTokenState(newToken);
        if (newToken) {
            localStorage.setItem('token', newToken);
        } else {
            localStorage.removeItem('token');
        }
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setUsername("");
    }, [setToken]);

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
        };
        window.addEventListener('auth-logout', handleAuthLogout);
        return () => window.removeEventListener('auth-logout', handleAuthLogout);
    }, []);

    return (
        <StateContext.Provider value={{
            isLogged,
            token, setToken,
            logout,
            username, setUsername
        }}>
            {children}
        </StateContext.Provider>
    );
}

export const GlobalState = () => useContext(StateContext);
