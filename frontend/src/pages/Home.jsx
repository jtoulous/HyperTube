import React from "react";
import TopBarModule from "../modules/TopBarModule.jsx";
import MainContentModule from "../modules/MainContentModule.jsx";
import FooterBarModule from "../modules/FooterBarModule.jsx";

export default function Home() {
    const token = localStorage.getItem("token");

    const handleLogout = () => {
        localStorage.removeItem("token");
        window.location.reload();
    };

    return (
        <>
            <TopBarModule handleLogout={handleLogout} />
            <MainContentModule token={token} />
            <FooterBarModule />
        </>
    );
}
