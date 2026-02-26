import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { downloadsApi } from "../api/downloads";
import { watchApi } from "../api/watch";
import MovieCard from "./submodules/MovieCard";
import BrowseView from "./submodules/BrowseView";
import SearchResultRow from "./submodules/SearchResultRow";
import DownloadItem from "./submodules/DownloadItem";

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

export default function MainContentModule() {
    const { isLogged, sidebarOpen, setSidebarOpen } = GlobalState();

    const [isMobile, setIsMobile] = useState(
        typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
    );

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 768px)");
        const handler = (e) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    const [currentTab, setCurrentTab] = useState("browse");
    const [searchQuery, setSearchQuery] = useState("");

    const [tmdbResults, setTmdbResults] = useState([]);
    const [tmdbLoading, setTmdbLoading] = useState(false);
    const [tmdbError,   setTmdbError]   = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    const [torrentMode,    setTorrentMode]    = useState(false);
    const [torrentTitle,   setTorrentTitle]   = useState("");
    const [torrentResults, setTorrentResults] = useState([]);
    const [torrentLoading, setTorrentLoading] = useState(false);
    const [torrentError,   setTorrentError]   = useState(null);
    const [expandedIndex,  setExpandedIndex]  = useState(null);
    const [torrentVisible, setTorrentVisible] = useState(20);
    const torrentSentinelRef = useRef(null);

    const [browseGenre, setBrowseGenre] = useState("");
    const [browsePeriod, setBrowsePeriod] = useState("all");
    const [browseSortBy, setBrowseSortBy] = useState("seeders");

    const [downloads, setDownloads] = useState([]);
    const [downloadLoading, setDownloadLoading] = useState(false);
    const [downloadError,  setDownloadError]  = useState(null);

    const [libraryMovies, setLibraryMovies] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [selectedLibraryMovie, setSelectedLibraryMovie] = useState(null);

    // Watch history: maps download_id → { completed, last_position, duration, ... }
    const [watchHistory, setWatchHistory] = useState({});

    // Derive watched IMDB IDs from watch history + downloads for browse/search badge
    const watchedImdbIds = useMemo(() => {
        const ids = new Set();
        downloads.forEach(dl => {
            const wh = watchHistory[dl.id];
            if (wh?.completed && dl.imdb_id) ids.add(dl.imdb_id);
        });
        return ids;
    }, [downloads, watchHistory]);

    /* ── Enrich downloads with TMDB metadata for library view ── */
    const enrichLibrary = useCallback(async () => {
        if (!downloads.length) { setLibraryMovies([]); return; }
        setLibraryLoading(true);
        const groups = {};
        downloads.forEach(dl => {
            const key = dl.imdb_id || `__title_${dl.title}`;
            if (!groups[key]) groups[key] = { imdb_id: dl.imdb_id, title: dl.title, downloads: [] };
            groups[key].downloads.push(dl);
        });
        const entries = Object.values(groups);
        const enriched = await Promise.all(entries.map(async (entry) => {
            const bestStatus = entry.downloads.some(d => d.status === "completed") ? "completed"
                : entry.downloads.some(d => d.status === "downloading") ? "downloading" : entry.downloads[0]?.status;
            if (!entry.imdb_id) {
                return { title: entry.title, imdbid: null, poster: null, year: null,
                    imdb_rating: null, genre_tags: [], downloads: entry.downloads, dlStatus: bestStatus, dlDate: entry.downloads[0]?.created_at };
            }
            try {
                const res = await searchApi.getMediaDetails(entry.imdb_id);
                const d = res.data;
                return { tmdb_id: d.tmdb_id, imdbid: d.imdb_id, title: d.title || entry.title,
                    year: d.year, poster: d.poster, imdb_rating: d.imdb_rating,
                    genre_tags: d.genre ? d.genre.split(", ") : [], downloads: entry.downloads,
                    dlStatus: bestStatus, dlDate: entry.downloads[0]?.created_at };
            } catch {
                return { title: entry.title, imdbid: entry.imdb_id, poster: null, year: null,
                    imdb_rating: null, genre_tags: [], downloads: entry.downloads, dlStatus: bestStatus, dlDate: entry.downloads[0]?.created_at };
            }
        }));
        setLibraryMovies(enriched);
        setLibraryLoading(false);
    }, [downloads]);

    useEffect(() => {
        if (currentTab === "library" && isLogged && downloads.length > 0) enrichLibrary();
    }, [currentTab, isLogged, downloads, enrichLibrary]);

    /* ── Filtered / sorted library movies ── */
    const filteredLibraryMovies = useMemo(() => {
        let movies = [...libraryMovies];
        const q = searchQuery.trim().toLowerCase();
        if (q) movies = movies.filter(m => (m.title || "").toLowerCase().includes(q));
        if (browseGenre) movies = movies.filter(m => m.genre_tags.some(g => g.toLowerCase() === browseGenre.toLowerCase()));
        if (browsePeriod !== "all") {
            const now = Date.now();
            const deltas = { day: 86400000, week: 604800000, month: 2592000000 };
            const delta = deltas[browsePeriod];
            if (delta) movies = movies.filter(m => m.dlDate && (now - new Date(m.dlDate).getTime()) <= delta);
        }
        if (browseSortBy === "rating") movies.sort((a, b) => (parseFloat(b.imdb_rating) || 0) - (parseFloat(a.imdb_rating) || 0));
        else if (browseSortBy === "year") movies.sort((a, b) => (b.year || "0").localeCompare(a.year || "0"));
        else if (browseSortBy === "name") movies.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        return movies;
    }, [libraryMovies, searchQuery, browseGenre, browseSortBy, browsePeriod]);

    const handleTabClick = (tab) => {
        if (tab === "library" && !isLogged) return;
        setCurrentTab(tab);
        setSelectedLibraryMovie(null);
    };

    const clearSearch = () => {
        setSearchQuery("");
        setTmdbResults([]);
        setHasSearched(false);
        setTmdbError(null);
        setTorrentMode(false);
        setTorrentResults([]);
        setExpandedIndex(null);
    };

    const runNewSearch = useCallback(async () => {
        const trimmed = searchQuery.trim();
        if (!trimmed) return;
        setTmdbLoading(true);
        setTmdbError(null);
        setTmdbResults([]);
        setHasSearched(true);
        setTorrentMode(false);
        setTorrentResults([]);
        try {
            const res = await searchApi.searchTmdb(trimmed);
            setTmdbResults(res.data.results || []);
        } catch {
            setTmdbError("Search failed — check your connection or try again.");
        } finally {
            setTmdbLoading(false);
        }
    }, [searchQuery]);

    const handleMovieCardClick = useCallback(async (title, tmdbId) => {
        setTorrentTitle(title);
        setTorrentMode(true);
        setTorrentLoading(true);
        setTorrentError(null);
        setTorrentResults([]);
        setExpandedIndex(null);
        setTorrentVisible(20);
        try {
            const res = await searchApi.search(title, tmdbId);
            setTorrentResults(res.data.results || []);
        } catch {
            setTorrentError("Torrent search failed — try again.");
        } finally {
            setTorrentLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!torrentMode || torrentLoading || torrentResults.length === 0) return;
        const sentinel = torrentSentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setTorrentVisible(prev => Math.min(prev + 20, torrentResults.length));
            }
        }, { rootMargin: "300px" });
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [torrentMode, torrentLoading, torrentResults.length]);

    const handleBackFromTorrents = useCallback(() => {
        setTorrentMode(false);
        setTorrentResults([]);
        setTorrentError(null);
    }, []);

    const toggleExpand = (idx) => {
        setExpandedIndex(expandedIndex === idx ? null : idx);
    };

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

    const loadWatchHistory = useCallback(async () => {
        if (!isLogged) return;
        try {
            const res = await watchApi.getHistory();
            setWatchHistory(res.data.history || {});
        } catch (err) {
            console.error("Load watch history error:", err);
        }
    }, [isLogged]);

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

    useEffect(() => {
        if (isLogged) { loadDownloads(); loadWatchHistory(); }
    }, [isLogged, loadDownloads, loadWatchHistory]);

    useEffect(() => {
        if (currentTab === "library" && isLogged) { loadDownloads(); loadWatchHistory(); }
    }, [currentTab, isLogged, loadDownloads, loadWatchHistory]);

    /* ── Computed sidebar style ── */
    const sidebarStyle = isMobile
        ? { ...s.sidebar, ...s.sidebarMobile, ...(sidebarOpen ? {} : s.sidebarMobileClosed) }
        : { ...s.sidebar, ...(sidebarOpen ? s.sidebarOpen : s.sidebarClosed) };

    return (
        <div style={{ ...s.container, ...(isMobile ? s.containerMobile : {}) }}>
            {isMobile && sidebarOpen && <div style={s.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}
            <aside style={sidebarStyle}>
                <nav style={s.sidebarNav}>
                    <button
                        style={{ ...s.navBtn, ...(currentTab === "browse" ? s.navBtnActive : {}) }}
                        onClick={() => handleTabClick("browse")}
                    >
                        🔍 Browse
                    </button>
                    <button
                        style={{
                            ...s.navBtn,
                            ...(currentTab === "library" && isLogged ? s.navBtnActive : {}),
                            ...(!isLogged ? s.navBtnDisabled : {}),
                        }}
                        onClick={() => handleTabClick("library")}
                    >
                        📚 Library
                    </button>
                </nav>

                <div style={s.divider} />

                <div style={s.section}>
                    <div style={s.sectionLabel}>Search</div>
                    <input
                        style={s.searchInput}
                        type="text"
                        placeholder="Movie or series..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && currentTab === "browse") runNewSearch(); }}
                    />
                    {currentTab === "browse" && (
                        <button
                            style={{ ...s.searchBtn, ...(tmdbLoading ? s.searchBtnDisabled : {}) }}
                            onClick={runNewSearch}
                            disabled={tmdbLoading}
                        >
                            {tmdbLoading ? "Searching..." : "Search"}
                        </button>
                    )}
                    {currentTab === "browse" && hasSearched && (
                        <button style={s.clearBtn} onClick={clearSearch}>
                            ← Browse
                        </button>
                    )}
                </div>

                {(currentTab === "library" || (currentTab === "browse" && !hasSearched)) && (
                    <>
                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={s.sectionLabel}>Genre</div>
                            <div style={s.genresList}>
                                {BROWSE_GENRES.map(g => (
                                    <button
                                        key={g || "all"}
                                        style={{ ...s.genreBtn, ...(browseGenre === g ? s.genreBtnActive : {}) }}
                                        onClick={() => setBrowseGenre(g)}
                                    >
                                        {g || "All"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={s.sectionLabel}>Period</div>
                            <div style={s.periodList}>
                                {BROWSE_PERIODS.map(p => (
                                    <button
                                        key={p.key}
                                        style={{ ...s.periodBtn, ...(browsePeriod === p.key ? s.periodBtnActive : {}) }}
                                        onClick={() => setBrowsePeriod(p.key)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={s.sectionLabel}>Sort by</div>
                            <select
                                style={s.sortSelect}
                                value={browseSortBy}
                                onChange={e => setBrowseSortBy(e.target.value)}
                            >
                                {BROWSE_SORTS.map(opt => (
                                    <option key={opt.key} value={opt.key} style={s.sortOption}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}
            </aside>

            <div style={s.tabContentArea}>
                {currentTab === "browse" && (
                    <div style={s.searchTab}>
                        <div style={s.searchList}>

                            {/* ── Phase 2: torrent list for selected movie ── */}
                            {torrentMode && (
                                <div style={s.torrentContainer}>
                                    <div style={s.torrentHeader}>
                                        <button style={s.backBtn} onClick={handleBackFromTorrents}>
                                            ← Back to results
                                        </button>
                                        <span style={s.torrentTitle}>Torrents : <strong style={{ color: "#e6edf3" }}>{torrentTitle}</strong></span>
                                    </div>
                                    {torrentLoading && (
                                        <div style={s.searchListStatus}>
                                            <div style={s.searchSpinner} />
                                            <span>Searching torrents...</span>
                                        </div>
                                    )}
                                    {!torrentLoading && torrentError && (
                                        <div style={{ ...s.searchListStatus, ...s.searchListError }}>{torrentError}</div>
                                    )}
                                    {!torrentLoading && !torrentError && torrentResults.length === 0 && (
                                        <div style={s.searchListStatus}>No torrents found for this title.</div>
                                    )}
                                    {!torrentLoading && torrentResults.length > 0 && (
                                        <div style={s.resultsContainer}>
                                            <div style={s.resultsCount}>{torrentResults.length} torrent{torrentResults.length > 1 ? "s" : ""}</div>
                                            {torrentResults.slice(0, torrentVisible).map((result, idx) => (
                                                <SearchResultRow
                                                    key={idx}
                                                    result={result}
                                                    isExpanded={expandedIndex === idx}
                                                    onToggle={() => toggleExpand(idx)}
                                                    onDownload={handleDownload}
                                                />
                                            ))}
                                            {torrentVisible < torrentResults.length && (
                                                <div style={s.browseLoading}>
                                                    <div style={s.browseSpinner} />
                                                    <span>Loading more...</span>
                                                </div>
                                            )}
                                            <div ref={torrentSentinelRef} style={s.browseSentinel} />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Phase 1: TMDB thumbnail grid after search ── */}
                            {!torrentMode && tmdbLoading && (
                                <div style={s.searchListStatus}>
                                    <div style={s.searchSpinner} />
                                    <span>Searching movies...</span>
                                </div>
                            )}
                            {!torrentMode && !tmdbLoading && tmdbError && (
                                <div style={{ ...s.searchListStatus, ...s.searchListError }}>{tmdbError}</div>
                            )}
                            {!torrentMode && !tmdbLoading && hasSearched && tmdbResults.length === 0 && (
                                <div style={s.searchListStatus}>No results found.</div>
                            )}
                            {!torrentMode && !tmdbLoading && hasSearched && tmdbResults.length > 0 && (
                                <div style={s.movieGrid}>
                                    {tmdbResults.map((result, idx) => (
                                        <MovieCard
                                            key={result.tmdb_id || idx}
                                            result={result}
                                            isWatched={!!(result.imdbid && watchedImdbIds.has(result.imdbid))}
                                            onDownload={handleDownload}
                                            isLogged={isLogged}
                                            onCardClick={handleMovieCardClick}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* ── Browse view: shown when no search yet ── */}
                            {!torrentMode && !tmdbLoading && !hasSearched && (
                                <BrowseView
                                    genre={browseGenre}
                                    period={browsePeriod}
                                    sortBy={browseSortBy}
                                    watchedImdbIds={watchedImdbIds}
                                    onDownload={handleDownload}
                                    isLogged={isLogged}
                                    onCardClick={handleMovieCardClick}
                                />
                            )}
                        </div>
                    </div>
                )}

                {isLogged && currentTab === "library" && (
                    <div style={s.libraryTab}>
                        {downloadError && (
                            <div style={s.libraryError}>{downloadError}</div>
                        )}

                        {/* ── Drill-down: downloads for a specific movie ── */}
                        {selectedLibraryMovie && (
                            <div style={s.torrentContainer}>
                                <div style={s.torrentHeader}>
                                    <button style={s.backBtn} onClick={() => setSelectedLibraryMovie(null)}>
                                        ← Back to library
                                    </button>
                                    <span style={s.torrentTitle}>
                                        Downloads : <strong style={{ color: "#e6edf3" }}>{selectedLibraryMovie.title}</strong>
                                    </span>
                                </div>
                                <div style={s.libraryDownloads}>
                                    {selectedLibraryMovie.downloads.map(dl => (
                                        <DownloadItem
                                            key={dl.id}
                                            download={dl}
                                            watchInfo={watchHistory[dl.id]}
                                            onWatchHistoryUpdate={loadWatchHistory}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Library movie grid ── */}
                        {!selectedLibraryMovie && libraryLoading && (
                            <div style={s.searchListStatus}>
                                <div style={s.searchSpinner} />
                                <span>Loading library...</span>
                            </div>
                        )}
                        {!selectedLibraryMovie && !libraryLoading && filteredLibraryMovies.length === 0 && downloads.length === 0 && !downloadError && (
                            <div style={s.libraryEmpty}>No downloads yet. Browse and download a torrent to get started.</div>
                        )}
                        {!selectedLibraryMovie && !libraryLoading && filteredLibraryMovies.length === 0 && downloads.length > 0 && (
                            <div style={s.libraryEmpty}>No movies match your filters.</div>
                        )}
                        {!selectedLibraryMovie && !libraryLoading && filteredLibraryMovies.length > 0 && (
                            <>
                                <div style={s.libraryCount}>
                                    {filteredLibraryMovies.length} movie{filteredLibraryMovies.length > 1 ? "s" : ""}
                                </div>
                                <div style={s.movieGrid}>
                                    {filteredLibraryMovies.map((movie, idx) => {
                                        // Check if any of this movie's downloads have been watched by the user
                                        const isWatchedByUser = movie.downloads?.some(dl => watchHistory[dl.id]?.completed)
                                            || !!(movie.imdbid && watchedImdbIds.has(movie.imdbid));
                                        return (
                                            <MovieCard
                                                key={movie.imdbid || movie.title || idx}
                                                result={movie}
                                                isWatched={isWatchedByUser}
                                                onDownload={handleDownload}
                                                isLogged={isLogged}
                                                onCardClick={() => setSelectedLibraryMovie(movie)}
                                            />
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

const s = {
    container: {
        flex: 1,
        width: "100%",
        display: "flex",
        flexDirection: "row",
        background: "#161b22",
        overflow: "hidden",
    },
    containerMobile: {
        flexDirection: "column",
        position: "relative",
    },
    sidebar: {
        width: 220,
        minWidth: 220,
        background: "#0d1117",
        borderRight: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        padding: 0,
        scrollbarWidth: "thin",
        scrollbarColor: "#30363d transparent",
        transition: "width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.25s cubic-bezier(0.4,0,0.2,1)",
    },
    sidebarOpen: {
        width: 220,
        minWidth: 220,
    },
    sidebarClosed: {
        width: 0,
        minWidth: 0,
        overflow: "hidden",
        borderRight: "none",
    },
    sidebarMobile: {
        position: "fixed",
        top: 60,
        left: 0,
        bottom: 0,
        width: 280,
        minWidth: 280,
        zIndex: 150,
        borderRight: "1px solid #21262d",
        overflowY: "auto",
        overflowX: "hidden",
        transform: "translateX(0)",
        transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
    },
    sidebarMobileClosed: {
        transform: "translateX(-100%)",
        width: 280,
        minWidth: 280,
    },
    sidebarOverlay: {
        position: "fixed",
        inset: 0,
        top: 60,
        background: "rgba(0, 0, 0, 0.55)",
        zIndex: 149,
    },
    sidebarNav: {
        display: "flex",
        flexDirection: "column",
        padding: "14px 12px 10px",
        gap: 4,
    },
    navBtn: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 12px",
        border: "none",
        borderRadius: 6,
        background: "transparent",
        color: "#8b949e",
        fontSize: "0.85rem",
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        textAlign: "left",
        outline: "none",
        WebkitAppearance: "none",
        whiteSpace: "nowrap",
    },
    navBtnActive: {
        background: "#313946",
        color: "#e6edf3",
        fontWeight: 600,
    },
    navBtnDisabled: {
        color: "#484f58",
        cursor: "not-allowed",
        pointerEvents: "none",
        opacity: 0.5,
    },
    divider: {
        height: 1,
        background: "#21262d",
        margin: "4px 12px",
        flexShrink: 0,
    },
    section: {
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    sectionLabel: {
        fontSize: "0.68rem",
        fontWeight: 600,
        color: "#8b949e",
        textTransform: "uppercase",
        letterSpacing: "0.8px",
        padding: "0 0 2px",
    },
    searchInput: {
        width: "100%",
        height: 34,
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#c9d1d9",
        fontSize: "0.82rem",
        padding: "0 10px",
        outline: "none",
        fontFamily: "'Inter', sans-serif",
        boxSizing: "border-box",
    },
    searchBtn: {
        width: "100%",
        height: 32,
        background: "#007BFF",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
    },
    searchBtnDisabled: {
        opacity: 0.6,
        cursor: "not-allowed",
    },
    clearBtn: {
        width: "100%",
        height: 30,
        background: "transparent",
        color: "#8b949e",
        border: "1px solid #30363d",
        borderRadius: 6,
        fontSize: "0.78rem",
        fontWeight: 500,
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
    },
    genresList: {
        display: "flex",
        flexDirection: "column",
        gap: 1,
    },
    genreBtn: {
        display: "flex",
        alignItems: "center",
        padding: "5px 10px",
        border: "none",
        borderRadius: 5,
        background: "transparent",
        color: "#8b949e",
        fontSize: "0.78rem",
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        textAlign: "left",
        outline: "none",
        WebkitAppearance: "none",
    },
    genreBtnActive: {
        background: "rgba(0, 123, 255, 0.1)",
        color: "#007BFF",
        fontWeight: 600,
    },
    periodList: {
        display: "flex",
        flexDirection: "column",
        gap: 1,
    },
    periodBtn: {
        display: "flex",
        alignItems: "center",
        padding: "5px 10px",
        border: "none",
        borderRadius: 5,
        background: "transparent",
        color: "#8b949e",
        fontSize: "0.78rem",
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        textAlign: "left",
        outline: "none",
        WebkitAppearance: "none",
    },
    periodBtnActive: {
        background: "rgba(0, 123, 255, 0.1)",
        color: "#007BFF",
        fontWeight: 600,
    },
    sortSelect: {
        width: "100%",
        padding: "6px 10px",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#c9d1d9",
        fontSize: "0.78rem",
        fontFamily: "'Inter', sans-serif",
        cursor: "pointer",
        outline: "none",
        boxSizing: "border-box",
    },
    sortOption: {
        background: "#0d1117",
        color: "#c9d1d9",
    },
    tabContentArea: {
        flex: 1,
        background: "#161b22",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        minWidth: 0,
    },
    searchTab: {
        minHeight: 220,
        padding: "20px 24px 0",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flex: 1,
    },
    searchList: {
        display: "flex",
        flexDirection: "column",
        borderRadius: 8,
        flex: 1,
    },
    searchListStatus: {
        minHeight: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "#8b949e",
        fontSize: "0.9rem",
        padding: "28px 0",
    },
    searchListError: {
        color: "#f85149",
    },
    searchSpinner: {
        width: 20,
        height: 20,
        border: "2px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
    torrentContainer: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
    },
    torrentHeader: {
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 4px 14px",
        flexWrap: "wrap",
    },
    backBtn: {
        background: "#21262d",
        border: "1px solid #30363d",
        color: "#c9d1d9",
        fontSize: "0.85rem",
        fontWeight: 500,
        fontFamily: "'Inter', sans-serif",
        padding: "5px 12px",
        borderRadius: 6,
        cursor: "pointer",
        whiteSpace: "nowrap",
    },
    torrentTitle: {
        fontSize: "0.95rem",
        color: "#8b949e",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    resultsContainer: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
    },
    resultsCount: {
        fontSize: "0.82rem",
        color: "#8b949e",
        padding: "6px 2px",
        letterSpacing: "0.3px",
    },
    movieGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 14,
    },
    browseLoading: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "20px 0",
        color: "#8b949e",
        fontSize: "0.82rem",
    },
    browseSpinner: {
        width: 18,
        height: 18,
        border: "2px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
    },
    browseSentinel: {
        height: 1,
    },
    libraryTab: {
        padding: "20px 24px 0",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        flex: 1,
    },
    libraryError: {
        color: "#f85149",
        fontSize: "0.88rem",
        background: "rgba(248, 81, 73, 0.1)",
        borderLeft: "3px solid #f85149",
        padding: "10px 14px",
        borderRadius: 6,
    },
    libraryEmpty: {
        minHeight: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#8b949e",
        fontSize: "0.9rem",
        borderRadius: 8,
        background: "#0d1117",
        border: "1px solid #21262d",
        padding: 28,
    },
    libraryDownloads: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    libraryCount: {
        fontSize: "0.82rem",
        color: "#8b949e",
        padding: "2px 0",
        letterSpacing: "0.3px",
        textTransform: "uppercase",
        fontWeight: 500,
    },
};
