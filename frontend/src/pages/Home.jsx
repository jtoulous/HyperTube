import React, { use, useEffect } from "react";
import TopBarModule from "../modules/TopBarModule.jsx";
import MainContentModule from "../modules/MainContentModule.jsx";
import FooterBarModule from "../modules/FooterBarModule.jsx";

export default function Home() {
    return (
        <>
            <TopBarModule />
            <MainContentModule />
            <FooterBarModule />
        </>
    );
}
