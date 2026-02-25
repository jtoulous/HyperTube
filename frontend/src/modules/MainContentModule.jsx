import { useState, useRef, useCallback, useEffect } from "react";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { downloadsApi } from "../api/downloads";
import "./MainContentModule.css";

function formatSize(bytes) {
    if (!bytes || bytes === 0) return "—";
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return gb.toFixed(2) + " GB";
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + " MB";
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
        return dateStr;
    }
}


function DownloadItem({ download }) {
    const [progress, setProgress] = useState(null);
    const pollingRef = useRef(true);

    // Poll for progress updates
    useEffect(() => {
        if (!download) return;

        let isMounted = true;

        const fetchProgress = async () => {
            if (!isMounted || !pollingRef.current) return;
            
            try {
                const res = await downloadsApi.getDownloadProgress(download.id);
                if (isMounted) {
                    setProgress(res.data);
                    
                    // Stop polling only if complete or error
                    if (res.data.status === "completed" || res.data.status === "error") {
                        pollingRef.current = false;
                    }
                }
            } catch (err) {
                console.error(`[Download ${download.id}] Fetch error:`, err);
            }
        };

        // Initial fetch
        fetchProgress();
        
        // Poll every 1 second for more responsive updates
        const interval = setInterval(fetchProgress, 1000);
        
        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [download.id]);

    const displayProgress = progress || download;
    const progressPct = Math.min(displayProgress.progress || 0, 100);

    return (
        <div className={"download-item download-item-" + (displayProgress.status || "downloading")}>
            <div className="download-header">
                <span className="download-title">{displayProgress.title}</span>
                <span className="download-status">{displayProgress.status}</span>
            </div>
            <div className="download-progress-bar">
                <div className="download-progress-fill" style={{ width: progressPct + "%" }} />
            </div>
            <div className="download-meta">
                <span className="download-size">{formatSize(displayProgress.downloaded_bytes)} / {formatSize(displayProgress.total_bytes)}</span>
                <span className="download-percent">{progressPct.toFixed(1)}%</span>
            </div>
        </div>
    );
}


function SearchResultRow({ result, isExpanded, onToggle, onDownload }) {
    const detailsRef = useRef(null);
    const [mediaDetails, setMediaDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState(null);

    // Fetch OMDB details when expanding a row with an imdbid
    const handleToggle = () => {
        if (!isExpanded && result.imdbid && !mediaDetails && !loadingDetails) {
            setLoadingDetails(true);
            setDetailsError(null);
            searchApi.getMediaDetails(result.imdbid)
                .then(res => setMediaDetails(res.data))
                .catch((err) => {
                    const msg = err?.response?.data?.detail || err?.message || "Could not load details";
                    console.error("OMDB fetch error:", result.imdbid, msg);
                    setDetailsError(msg);
                })
                .finally(() => setLoadingDetails(false));
        }
        onToggle();
    };

    // Animate expand/collapse via scrollHeight
    const updateHeight = () => {
        const el = detailsRef.current;
        if (!el) return;
        if (isExpanded) {
            el.style.height = el.scrollHeight + "px";
            el.style.opacity = "1";
        } else {
            el.style.height = "0px";
            el.style.opacity = "0";
        }
    };

    // Re-measure whenever expand state or content changes
    useState(() => {
        const timer = setTimeout(updateHeight, 10);
        return () => clearTimeout(timer);
    });

    // eslint-disable-next-line
    useState(() => { });

    return (
        <div className={"search-result-row" + (isExpanded ? " search-result-row-expanded" : "")}>
            <div className="search-result-header" onClick={handleToggle}>
                <div className="search-result-title-area">
                    <span className="search-result-title">{result.title}</span>
                    {result.imdbid && <span className="search-result-imdb-badge">IMDb</span>}
                </div>
                <div className="search-result-meta">
                    <span className="search-result-meta-item search-result-seeders" title="Seeders">▲ {result.seeders}</span>
                    <span className="search-result-meta-item search-result-peers" title="Peers">▼ {result.peers}</span>
                    <span className="search-result-meta-item">{formatSize(result.size)}</span>
                    <span className="search-result-meta-item search-result-indexer">{result.indexer || "—"}</span>
                    <span className={"search-result-chevron" + (isExpanded ? " search-result-chevron-open" : "")}>❯</span>
                </div>
            </div>

            <div
                className="search-result-details"
                ref={(el) => {
                    detailsRef.current = el;
                    if (el) {
                        if (isExpanded) {
                            el.style.height = el.scrollHeight + "px";
                            el.style.opacity = "1";
                        } else {
                            el.style.height = "0px";
                            el.style.opacity = "0";
                        }
                    }
                }}
            >
                <div className="search-result-details-inner">
                    {/* No IMDB id — show torrent info only */}
                    {!result.imdbid && (
                        <div className="search-result-torrent-info-only">
                            <div className="search-result-info-row"><span className="info-label">Published</span><span className="info-value">{formatDate(result.pub_date)}</span></div>
                            <div className="search-result-info-row"><span className="info-label">Category</span><span className="info-value">{result.category || "—"}</span></div>
                            <div className="search-result-info-row"><span className="info-label">Source</span><span className="info-value">{result.indexer || "—"}</span></div>
                            {result.magneturl && (
                                <button
                                    className="search-result-magnet-btn"
                                    onClick={() => onDownload(result.title, result.magneturl, result.imdbid)}
                                    title="Download torrent"
                                >
                                    🧲 Download
                                </button>
                            )}
                        </div>
                    )}

                    {/* Loading OMDB */}
                    {result.imdbid && loadingDetails && (
                        <div className="search-result-details-loading">
                            <div className="search-details-spinner" />
                            <span>Loading details...</span>
                        </div>
                    )}

                    {/* OMDB error */}
                    {result.imdbid && detailsError && !loadingDetails && (
                        <div className="search-result-details-error">{detailsError}</div>
                    )}

                    {/* Full OMDB details */}
                    {result.imdbid && mediaDetails && !loadingDetails && (
                        <div className="search-result-media-details">
                            {mediaDetails.poster && mediaDetails.poster !== "N/A" && (
                                <img className="search-result-poster" src={mediaDetails.poster} alt={mediaDetails.title} />
                            )}
                            <div className="search-result-media-info">
                                <div className="search-result-media-title-row">
                                    <span className="search-result-media-title">{mediaDetails.title}</span>
                                    <span className="search-result-media-year">{mediaDetails.year}</span>
                                    {mediaDetails.type && <span className="search-result-media-type">{mediaDetails.type}</span>}
                                </div>

                                {mediaDetails.genre && (
                                    <div className="search-result-genres">
                                        {mediaDetails.genre.split(", ").map((g, i) => (
                                            <span key={i} className="search-result-genre-tag">{g}</span>
                                        ))}
                                    </div>
                                )}

                                {mediaDetails.plot && mediaDetails.plot !== "N/A" && (
                                    <p className="search-result-plot">{mediaDetails.plot}</p>
                                )}

                                <div className="search-result-media-meta-grid">
                                    {mediaDetails.imdb_rating && mediaDetails.imdb_rating !== "N/A" && (
                                        <div className="search-result-rating">
                                            <span className="rating-star">★</span>
                                            <span className="rating-value">{mediaDetails.imdb_rating}</span>
                                            <span className="rating-label">/10</span>
                                        </div>
                                    )}
                                    {mediaDetails.runtime && mediaDetails.runtime !== "N/A" && (
                                        <div className="search-result-info-row"><span className="info-label">Runtime</span><span className="info-value">{mediaDetails.runtime}</span></div>
                                    )}
                                    {mediaDetails.director && mediaDetails.director !== "N/A" && (
                                        <div className="search-result-info-row"><span className="info-label">Director</span><span className="info-value">{mediaDetails.director}</span></div>
                                    )}
                                    {mediaDetails.actors && mediaDetails.actors !== "N/A" && (
                                        <div className="search-result-info-row"><span className="info-label">Cast</span><span className="info-value">{mediaDetails.actors}</span></div>
                                    )}
                                    {mediaDetails.language && mediaDetails.language !== "N/A" && (
                                        <div className="search-result-info-row"><span className="info-label">Language</span><span className="info-value">{mediaDetails.language}</span></div>
                                    )}
                                    {mediaDetails.country && mediaDetails.country !== "N/A" && (
                                        <div className="search-result-info-row"><span className="info-label">Country</span><span className="info-value">{mediaDetails.country}</span></div>
                                    )}
                                    {mediaDetails.total_seasons && (
                                        <div className="search-result-info-row"><span className="info-label">Seasons</span><span className="info-value">{mediaDetails.total_seasons}</span></div>
                                    )}
                                </div>

                                <div className="search-result-torrent-section">
                                    <div className="search-result-info-row"><span className="info-label">Published</span><span className="info-value">{formatDate(result.pub_date)}</span></div>
                                    <div className="search-result-info-row"><span className="info-label">Source</span><span className="info-value">{result.indexer || "—"}</span></div>
                                    {result.magneturl && (
                                        <button
                                            className="search-result-magnet-btn"
                                            onClick={() => onDownload(result.title, result.magneturl, result.imdbid)}
                                            title="Download torrent"
                                        >
                                            🧲 Download
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


export default function MainContentModule() {
    const { isLogged } = GlobalState();

    const [currentTab, setCurrentTab] = useState("search");
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [expandedIndex, setExpandedIndex] = useState(null);
    
    // Downloads / Library
    const [downloads, setDownloads] = useState([]);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [downloadError, setDownloadError] = useState(null);

    const handleTabClick = (tab) => {
        if (tab === "library" && !isLogged) return;
        setCurrentTab(tab);
    };

    const runNewSearch = useCallback(async () => {
        const q = searchQuery.trim();
        if (!q) return;

        setSearchLoading(true);
        setSearchError(null);
        setSearchResults([]);
        setHasSearched(true);
        setExpandedIndex(null);

        try {
            const res = await searchApi.search(q);
            setSearchResults(res.data.results || []);
        } catch {
            setSearchError("Search failed — check your connection or try again.");
        } finally {
            setSearchLoading(false);
        }
    }, [searchQuery]);

    const toggleExpand = (idx) => {
        setExpandedIndex(expandedIndex === idx ? null : idx);
    };

    // Load downloads from Library
    const loadDownloads = useCallback(async () => {
        if (!isLogged) return;
        try {
            const res = await downloadsApi.getDownloads();
            setDownloads(res.data || []);
            setDownloadError(null);
        } catch (err) {
            console.error("Load downloads error:", err);
            setDownloadError("Failed to load downloads: " + (err?.response?.data?.detail || err?.message));
        }
    }, [isLogged]);

    // Create a new download
    const handleDownload = useCallback(async (title, magnetLink, imdbId) => {
        if (!title || !magnetLink) return;
        
        try {
            setDownloadLoading(true);
            await downloadsApi.createDownload(title, magnetLink, imdbId);
            // Reload downloads list
            await loadDownloads();
            setDownloadError(null);
        } catch (err) {
            const msg = err?.response?.data?.detail || "Failed to start download";
            setDownloadError(msg);
            console.error("Download error:", msg);
        } finally {
            setDownloadLoading(false);
        }
    }, [loadDownloads]);

    // Load downloads when Library tab is opened
    useEffect(() => {
        if (currentTab === "library" && isLogged) {
            loadDownloads();
        }
    }, [currentTab, isLogged, loadDownloads]);

    return (
        <div className="main-content-container">
            <div className="tab-selection-bar">
                <div
                    className={"tab-btn tab-btn-search" + (currentTab === "search" ? " tab-btn-active" : "")}
                    onClick={() => handleTabClick("search")}
                >
                    Search
                </div>
                <div
                    className={"tab-btn tab-btn-library" + (currentTab === "library" && isLogged ? " tab-btn-active" : "") + (!isLogged ? " tab-btn-disabled" : "")}
                    onClick={() => handleTabClick("library")}
                >
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
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") runNewSearch(); }}
                            />
                            <button className="search-bar-btn" onClick={runNewSearch} disabled={searchLoading}>
                                {searchLoading ? "Searching..." : "Search"}
                            </button>
                        </div>

                        <div className="search-list">
                            {searchLoading && (
                                <div className="search-list-status">
                                    <div className="search-spinner" />
                                    <span>Searching across all sources...</span>
                                </div>
                            )}

                            {!searchLoading && searchError && (
                                <div className="search-list-status search-list-error">{searchError}</div>
                            )}

                            {!searchLoading && !searchError && hasSearched && searchResults.length === 0 && (
                                <div className="search-list-status">No results found.</div>
                            )}

                            {!searchLoading && !searchError && !hasSearched && (
                                <div className="search-list-status">Search for movies or series above.</div>
                            )}

                            {!searchLoading && !searchError && searchResults.length > 0 && (
                                <div className="search-results-container">
                                    <div className="search-results-count">{searchResults.length} result{searchResults.length > 1 ? "s" : ""}</div>
                                    {searchResults.map((result, idx) => (
                                        <SearchResultRow
                                            key={idx}
                                            result={result}
                                            isExpanded={expandedIndex === idx}
                                            onToggle={() => toggleExpand(idx)}
                                            onDownload={handleDownload}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {isLogged && currentTab === "library" && (
                    <div className="library-tab">
                        {downloadError && (
                            <div className="library-error">{downloadError}</div>
                        )}
                        
                        {downloads.length === 0 && !downloadError && (
                            <div className="library-empty">No downloads yet. Search and download a torrent above.</div>
                        )}

                        {downloads.length > 0 && (
                            <div className="library-downloads">
                                <div className="library-count">{downloads.length} download{downloads.length > 1 ? "s" : ""}</div>
                                {downloads.map((dl) => (
                                    <DownloadItem key={dl.id} download={dl} />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
