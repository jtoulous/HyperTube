import React, { use, useEffect } from "react";
import TopBarModule from "../modules/TopBarModule.jsx";
import MainContentModule from "../modules/MainContentModule.jsx";
import FooterBarModule from "../modules/FooterBarModule.jsx";

export default function Home() {
    return (
        <div className="home-page">
            <TopBarModule handleLogout={handleLogout} />
            <MainContentModule />
            <FooterBarModule />
        </div>
    );
}
