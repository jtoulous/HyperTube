import React, { createContext, useContext, useState, useEffect, use } from 'react';



const StateContext = createContext();



export function State({ children }) {
//    const [ws_group, setWsGroup] = useState("global")

    const [leftBarIsOpen, setLeftBarIsOpen] = useState(false)
    const [isLogged, setIsLogged] = useState(false)


    useEffect(() => {
        if (typeof window !== 'undefined') {
            window._globalState = {
                leftBarIsOpen, setLeftBarIsOpen,
                isLogged, setIsLogged
            };
        }
    });


    return (
        <StateContext.Provider value={{
            leftBarIsOpen, setLeftBarIsOpen,
            isLogged, setIsLogged
        }}>
            {children}
        </StateContext.Provider>
    );
}

export const GlobalState = () => useContext(StateContext);
