import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { downloadsApi } from "../api/downloads";
import PlayerModule from "./submodules/PlayerModule";
import "./MainContentModule.css";

const BROWSE_GENRES = ["", "Action", "Comedy", "Drama", "Horror", "Thriller", "Sci-Fi", "Animation", "Romance", "Crime", "Adventure", "Documentary", "Family"];
const BROWSE_PERIODS = [
    { key: "all",   label: "All Time" },
    { key: "month", label: "This Month" },
    { key: "week",  label: "This Week" },
    { key: "day",   label: "Today" },
];
const BROWSE_SORTS = [
    { key: "seeders", label: "Most Seeded" },
    { key: "rating",  label: "Top Rated" },
    { key: "year",    label: "Newest" },
    { key: "name",    label: "A-Z" },
];

// ─── Movie Card ───────────────────────────────────────────────────────────────

function MovieCard({ result, isWatched, onDownload, isLogged }) {
    const [downloading, setDownloading] = useState(false);
    const [added, setAdded] = useState(false);

    const handleDownload = async () => {
        if (!result.magneturl || downloading || added) return;
        setDownloading(true);
        try {
            await onDownload(result.title, result.magneturl, result.imdbid);
            setAdded(true);
        } finally {
            setDownloading(false);
        }
    };

    const hasPoster = result.poster && result.poster !== "N/A";

    return (
        <div className={"movie-card" + (isWatched ? " movie-card-seen" : "")}>
            <div className="movie-card-poster">
                {hasPoster
                    ? <img src={result.poster} alt={result.title} loading="lazy" />
                    : <div className="movie-card-no-poster"><span>🎬</span></div>
                }
                {isWatched && <div className="movie-card-watched-badge">✓ Watched</div>}
                {result.imdb_rating && result.imdb_rating !== "N/A" && (
                    <div className="movie-card-rating-badge">★ {result.imdb_rating}</div>
                )}
            </div>
            <div className="movie-card-body">
                <div className="movie-card-title" title={result.title}>{result.title}</div>
                <div className="movie-card-meta">
                    {result.year && result.year !== "N/A" && (
                        <span className="movie-card-year">{String(result.year).slice(0, 4)}</span>
                    )}
                    {result.seeders > 0 && (
                        <span className="movie-card-seeders">▲ {result.seeders}</span>
                    )}
                </div>
                {result.genre_tags && result.genre_tags.length > 0 && (
                    <div className="movie-card-genres">
                        {result.genre_tags.slice(0, 2).map(g => (
                            <span key={g} className="movie-card-genre-tag">{g}</span>
                        ))}
                    </div>
                )}
                {isLogged && result.magneturl && (
                    <button
                        className={"movie-card-dl-btn" + (added ? " movie-card-dl-btn-done" : "")}
                        onClick={handleDownload}
                        disabled={downloading || added}
                    >
                        {downloading
                            ? <span className="movie-card-dl-spinner" />
                            : added ? "✓ Added" : "⬇ Download"
                        }
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Browse View ──────────────────────────────────────────────────────────────

function BrowseView({ watchedImdbIds, onDownload, isLogged }) {
    const [genre,  setGenre]  = useState("");
    const [period, setPeriod] = useState("all");
    const [sortBy, setSortBy] = useState("seeders");
    const [page,   setPage]   = useState(1);
    const [results,  setResults]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [hasMore,  setHasMore]  = useState(true);
    const [initialLoaded, setInitialLoaded] = useState(false);

    // Stable refs to avoid stale closures in observer
    const loadingRef = useRef(false);
    const hasMoreRef = useRef(true);
    const pageRef    = useRef(1);
    const filtersRef = useRef({ genre, period, sortBy });
    filtersRef.current = { genre, period, sortBy };

    const sentinelRef = useRef(null);
    const observerRef = useRef(null);

    const fetchPage = useCallback(async (pageNum, append) => {
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        const { genre: g, period: p, sortBy: s } = filtersRef.current;
        try {
            const res = await searchApi.browseMedia({
                genre:   g,
                period:  p,
                sort_by: s,
                page:    pageNum,
                limit:   20,
            });
            const data = res.data;
            setResults(prev => append ? [...prev, ...data.results] : data.results);
            hasMoreRef.current = data.has_more;
            pageRef.current = pageNum;
            setHasMore(data.has_more);
            setPage(pageNum);
        } catch (err) {
            console.error("Browse error:", err);
        } finally {
            loadingRef.current = false;
            setLoading(false);
            if (!append) setInitialLoaded(true);
        }
    }, []);

    // Re-fetch from page 1 when filters change
    useEffect(() => {
        setInitialLoaded(false);
        setPage(1);
        setResults([]);
        hasMoreRef.current = true;
        setHasMore(true);
        pageRef.current = 1;
        fetchPage(1, false);
    }, [genre, period, sortBy, fetchPage]);

    // Attach IntersectionObserver AFTER initial load completes
    useEffect(() => {
        if (!initialLoaded) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        // Disconnect any previous observer
        observerRef.current?.disconnect();

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !loadingRef.current && hasMoreRef.current) {
                fetchPage(pageRef.current + 1, true);
            }
        }, { rootMargin: "200px" });

        observer.observe(sentinel);
        observerRef.current = observer;

        return () => observer.disconnect();
    }, [initialLoaded, fetchPage]);

    return (
        <div className="browse-view">
            {/* Genre pills */}
            <div className="browse-genre-pills">
                {BROWSE_GENRES.map(g => (
                    <button
                        key={g || "all"}
                        className={"genre-pill" + (genre === g ? " genre-pill-active" : "")}
                        onClick={() => setGenre(g)}
                    >
                        {g || "All"}
                    </button>
                ))}
            </div>

            {/* Period + Sort row */}
            <div className="browse-filters-row">
                <div className="period-tabs">
                    {BROWSE_PERIODS.map(p => (
                        <button
                            key={p.key}
                            className={"period-tab" + (period === p.key ? " period-tab-active" : "")}
                            onClick={() => setPeriod(p.key)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <select
                    className="browse-sort-select"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                >
                    {BROWSE_SORTS.map(s => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                    ))}
                </select>
            </div>

            {/* Movie grid */}
            {results.length === 0 && !loading && (
                <div className="browse-empty">No results for these filters — try a different genre or period.</div>
            )}
            <div className="movie-grid">
                {results.map((result, idx) => (
                    <MovieCard
                        key={result.imdbid || idx}
                        result={result}
                        isWatched={!!(result.imdbid && watchedImdbIds.has(result.imdbid))}
                        onDownload={onDownload}
                        isLogged={isLogged}
                    />
                ))}
            </div>

            {loading && (
                <div className="browse-loading">
                    <div className="browse-spinner" />
                    <span>Loading...</span>
                </div>
            )}

            <div ref={sentinelRef} className="browse-sentinel" />
        </div>
    );
}

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

// ─── Watch Modal (wraps colleague's PlayerModule) ────────────────────────────

function WatchModal({ file, title, allFiles, onFileChange, onClose }) {
    // Close on Escape
    useEffect(() => {
        const onKey = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="vp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="vp-modal-wrapper">
                <div className="vp-modal-header">
                    <span className="vp-modal-title">{title}</span>
                    {allFiles.length > 1 && (
                        <select
                            className="vp-file-select"
                            value={file.name}
                            onChange={e => {
                                const chosen = allFiles.find(f => f.name === e.target.value);
                                if (chosen) onFileChange(chosen);
                            }}
                        >
                            {allFiles.map(f => (
                                <option key={f.name} value={f.name}>
                                    {f.name.split("/").pop()} ({formatSize(f.size)})
                                </option>
                            ))}
                        </select>
                    )}
                    <button className="vp-close-btn" onClick={onClose} title="Close (Esc)">✕</button>
                </div>
                <PlayerModule filename={file.name} />
            </div>
        </div>
    );
}

// ─── Download Item ────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "error"]);

function DownloadItem({ download }) {
    const [progress, setProgress] = useState(null);
    // If the DB already says the download is done, never poll at all
    const pollingRef = useRef(!TERMINAL_STATUSES.has(download.status));
    const [playerFile, setPlayerFile] = useState(null);
    const [allFiles, setAllFiles] = useState([]);
    const [watchLoading, setWatchLoading] = useState(false);

    // Poll for progress updates — skipped entirely for terminal statuses
    useEffect(() => {
        if (!download || !pollingRef.current) return;

        let isMounted = true;

        const fetchProgress = async () => {
            if (!isMounted || !pollingRef.current) return;

            try {
                const res = await downloadsApi.getDownloadProgress(download.id);
                if (isMounted) {
                    setProgress(res.data);

                    // Stop polling permanently once a terminal state is reached
                    if (TERMINAL_STATUSES.has(res.data.status)) {
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
    }, [download.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleWatch = async () => {
        setWatchLoading(true);
        try {
            const res = await downloadsApi.getDownloadFiles(download.id);
            const files = res.data.files || [];
            if (files.length === 0) {
                alert("No playable video files found.");
                return;
            }
            setAllFiles(files);
            setPlayerFile(files[0]);
        } catch (err) {
            console.error("Failed to load files:", err);
            alert("Could not load video files.");
        } finally {
            setWatchLoading(false);
        }
    };

    const displayProgress = progress || download;
    const progressPct = Math.min(displayProgress.progress || 0, 100);
    const isCompleted = displayProgress.status === "completed";

    return (
        <>
            {playerFile && (
                <WatchModal
                    file={playerFile}
                    title={displayProgress.title}
                    allFiles={allFiles}
                    onFileChange={setPlayerFile}
                    onClose={() => setPlayerFile(null)}
                />
            )}
            <div className={"download-item download-item-" + (displayProgress.status || "downloading")}>
                <div className="download-header">
                    <span className="download-title">{displayProgress.title}</span>
                    <div className="download-header-right">
                        {isCompleted && (
                            <button
                                className="download-watch-btn"
                                onClick={handleWatch}
                                disabled={watchLoading}
                                title="Watch this video"
                            >
                                {watchLoading ? (
                                    <span className="download-watch-spinner" />
                                ) : (
                                    "▶ Watch"
                                )}
                            </button>
                        )}
                        <span className="download-status">{displayProgress.status}</span>
                    </div>
                </div>
                <div className="download-progress-bar">
                    <div className="download-progress-fill" style={{ width: progressPct + "%" }} />
                </div>
                <div className="download-meta">
                    <span className="download-size">{formatSize(displayProgress.downloaded_bytes)} / {formatSize(displayProgress.total_bytes)}</span>
                    <span className="download-percent">{progressPct.toFixed(1)}%</span>
                </div>
            </div>
        </>
    );
}


function SearchResultRow({ result, isExpanded, onToggle, onDownload }) {
    const detailsRef = useRef(null);
    const [mediaDetails, setMediaDetails] = useState(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [detailsError, setDetailsError] = useState(null);

    // Fetch TMDB details when expanding a row with an imdbid
    const handleToggle = () => {
        if (!isExpanded && result.imdbid && !mediaDetails && !loadingDetails) {
            setLoadingDetails(true);
            setDetailsError(null);
            searchApi.getMediaDetails(result.imdbid)
                .then(res => setMediaDetails(res.data))
                .catch((err) => {
                    const msg = err?.response?.data?.detail || err?.message || "Could not load details";
                    console.error("TMDB fetch error:", result.imdbid, msg);
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

                    {/* Loading TMDB */}
                    {result.imdbid && loadingDetails && (
                        <div className="search-result-details-loading">
                            <div className="search-details-spinner" />
                            <span>Loading details...</span>
                        </div>
                    )}

                    {/* TMDB error */}
                    {result.imdbid && detailsError && !loadingDetails && (
                        <div className="search-result-details-error">{detailsError}</div>
                    )}

                    {/* Full TMDB details */}
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

    // Downloads (shared between Library tab + watched tracking in Browse)
    const [downloads, setDownloads] = useState([]);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [downloadError, setDownloadError] = useState(null);

    // Set of imdbids the user has already watched/downloaded (completed)
    const watchedImdbIds = useMemo(() => {
        const ids = new Set();
        downloads.forEach(dl => {
            if (dl.imdb_id && dl.status === "completed") ids.add(dl.imdb_id);
        });
        return ids;
    }, [downloads]);

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

    // Load downloads (used both for Library tab and for watched tracking in Browse)
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

    // Load downloads as soon as the user is logged in (needed for watched badges)
    useEffect(() => {
        if (isLogged) loadDownloads();
    }, [isLogged, loadDownloads]);

    // Refresh downloads list when Library tab is opened
    useEffect(() => {
        if (currentTab === "library" && isLogged) loadDownloads();
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

                            {/* Browse view: shown when no search has been submitted */}
                            {!searchLoading && !hasSearched && (
                                <BrowseView
                                    watchedImdbIds={watchedImdbIds}
                                    onDownload={handleDownload}
                                    isLogged={isLogged}
                                />
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
