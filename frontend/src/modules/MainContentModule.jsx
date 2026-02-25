import { useState, useEffect } from "react";
import { GlobalState } from "../State";
import "./MainContentModule.css";

export default function MainContentModule() {
    const {
        isLogged,
        availableContentList
    } = GlobalState();

    const [currentTab, setCurrentTab] = useState("search");
    const [newSearchForm, setNewSearchForm] = useState({title: '', tags:[]})
    const [searchResults, setSearchResults] = useState({})
    const [searchTags, setSearchTags] = useState([])

    useEffect(() => {
        // Faire le search initiale par default
    }, []);



    ////    Functions

    const handleTabClick = (tab) => {
        if (tab === "library" && !isLogged) return;
        setCurrentTab(tab);
    };


    //// Api Requests


    const runNewSearch = (searchForm) => {
        return 'Nique ta grand mere'
    };


    return (
        <div className="main-content-container">
            <div className="tab-selection-bar">
                <div className={"tab-btn tab-btn-search" + (currentTab === "search" ? " tab-btn-active" : "")} onClick={() => handleTabClick("search")}>
                    Search
                </div>
                <div className={"tab-btn tab-btn-library" + (currentTab === "library" && isLogged ? " tab-btn-active" : "") + (!isLogged ? " tab-btn-disabled" : "")} onClick={() => handleTabClick("library")}>
                    Library
                </div>
            </div>

            <div className="tab-content-area">
                {currentTab === "search" && (
                    <div className="search-tab">
                        <div className="search-bar">
                            <input
                                className="search-bar-input"
                                type="text"
                                placeholder="Search for a movie or series..."
                                value={newSearchForm.title}
                                onChange={(e) => setNewSearchForm({ ...newSearchForm, title: e.target.value })}
                                onKeyDown={(e) => { if (e.key === "Enter") runNewSearch(newSearchForm); }}
                            />
                            <button className="search-bar-btn" onClick={() => runNewSearch(newSearchForm)}>Search</button>
                        </div>

                        <div className="search-tags">

                        </div>

                        <div className="search-list">
                            No Search Results...
                        </div>
                    </div>
                )}

                {isLogged && currentTab === "library" && (
                    <div className="library-tab">
                        <div className="default-library-content">Ta bibliothèque s'affichera ici.</div>
                    </div>
                )}
            </div>
        </div>
    );
}
