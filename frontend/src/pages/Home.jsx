import React, { use, useEffect } from "react";
import TopBarModule from "../modules/TopBarModule.jsx";
import MainContentModule from "../modules/MainContentModule.jsx";
import FooterBarModule from "../modules/FooterBarModule.jsx";
import PlayerModule from "../modules/submodules/PlayerModule.jsx";

export default function Home() {
    return (
        <div className="home-page">
            <TopBarModule />
            <MainContentModule />
            <FooterBarModule />
        </div>
    );
}
