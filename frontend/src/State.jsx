import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const StateContext = createContext();

export function State({ children }) {
    const [leftBarIsOpen, setLeftBarIsOpen] = useState(false)
    const [token, setTokenState] = useState(() => localStorage.getItem('token'))

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
    }, [setToken]);

    return (
        <StateContext.Provider value={{
            leftBarIsOpen, setLeftBarIsOpen,
            isLogged,
            token, setToken,
            logout
        }}>
            {children}
        </StateContext.Provider>
    );
}

export const GlobalState = () => useContext(StateContext);
