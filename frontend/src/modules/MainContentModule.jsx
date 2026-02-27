import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { downloadsApi } from "../api/downloads";
import { filmsApi } from "../api/films";
import MovieCard from "./submodules/MovieCard";
import BrowseView from "./submodules/BrowseView";
import SearchResultRow from "./submodules/SearchResultRow";
import WatchModal from "./submodules/WatchModal";

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

    const [libraryMovies, setLibraryMovies] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(false);

    const [watchedImdbIds, setWatchedImdbIds] = useState(new Map());

    /* Player state for watching from library */
    const [playerFile, setPlayerFile] = useState(null);
    const [playerTitle, setPlayerTitle] = useState("");
    const [playerAllFiles, setPlayerAllFiles] = useState([]);
    const [playerImdbId, setPlayerImdbId] = useState(null);

    /*  Load watched IDs from API  */
    const loadWatchedIds = useCallback(async () => {
        if (!isLogged) return;
        try {
            const res = await filmsApi.getWatchedIds();
            const map = new Map();
            (res.data || []).forEach(w => map.set(w.imdb_id, w));
            setWatchedImdbIds(map);
        } catch (err) {
            console.error("Failed to load watched IDs:", err);
        }
    }, [isLogged]);

    /*  Load ALL films from the server for library view  */
    const loadFilms = useCallback(async () => {
        setLibraryLoading(true);
        try {
            const res = await filmsApi.getFilms();
            const films = (res.data || []).map(f => ({
                imdbid: f.imdb_id,
                tmdb_id: f.tmdb_id,
                title: f.title,
                poster: f.poster,
                year: f.year,
                imdb_rating: f.imdb_rating,
                genre_tags: f.genre ? f.genre.split(", ") : [],
                created_at: f.created_at,
                /* download / watchability info */
                status: f.status,
                progress: f.progress,
                download_speed: f.download_speed,
                can_watch: f.can_watch,
                watch_ready_in: f.watch_ready_in,
                duration: f.duration,
                eta: f.eta,
            }));
            setLibraryMovies(films);
        } catch (err) {
            console.error("Failed to load films:", err);
        } finally {
            setLibraryLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isLogged) loadWatchedIds();
    }, [isLogged, loadWatchedIds]);

    /* Load films once on mount so filmStatusMap is available on all tabs */
    useEffect(() => { loadFilms(); }, [loadFilms]);

    /* While on the library tab, refresh every 5 s so progress stays live */
    useEffect(() => {
        if (currentTab !== "library") return;
        loadFilms();
        const iv = setInterval(loadFilms, 5000);
        return () => clearInterval(iv);
    }, [currentTab, loadFilms]);

    /*  Filtered / sorted library movies  */
    const filteredLibraryMovies = useMemo(() => {
        let movies = [...libraryMovies];
        const q = searchQuery.trim().toLowerCase();
        if (q) movies = movies.filter(m => (m.title || "").toLowerCase().includes(q));
        if (browseGenre) movies = movies.filter(m => m.genre_tags.some(g => g.toLowerCase() === browseGenre.toLowerCase()));
        if (browsePeriod !== "all") {
            const now = Date.now();
            const deltas = { day: 86400000, week: 604800000, month: 2592000000 };
            const delta = deltas[browsePeriod];
            if (delta) movies = movies.filter(m => m.created_at && (now - new Date(m.created_at).getTime()) <= delta);
        }
        if (browseSortBy === "rating") movies.sort((a, b) => (parseFloat(b.imdb_rating) || 0) - (parseFloat(a.imdb_rating) || 0));
        else if (browseSortBy === "year") movies.sort((a, b) => (b.year || "0").localeCompare(a.year || "0"));
        else if (browseSortBy === "name") movies.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        return movies;
    }, [libraryMovies, searchQuery, browseGenre, browseSortBy, browsePeriod]);

    const filmStatusMap = useMemo(() => {
        const m = new Map();
        for (const f of libraryMovies) {
            if (f.imdbid) m.set(f.imdbid, f.status);
        }
        return m;
    }, [libraryMovies]);

    const handleTabClick = (tab) => {
        setCurrentTab(tab);
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

    const handleDownload = useCallback(async (title, magnetLink, imdbId, torrentUrl) => {
        if (!title || (!magnetLink && !torrentUrl)) return;
        try {
            await downloadsApi.createDownload(title, magnetLink, imdbId, torrentUrl);
            // Refresh film list so filmStatusMap picks up the new download
            loadFilms();
        } catch (err) {
            console.error("Download error:", err?.response?.data?.detail || err?.message);
        }
    }, [loadFilms]);

    const handleMarkWatched = useCallback(async (imdbId) => {
        if (!isLogged || !imdbId) return;
        // If the user already has a watched entry, don't reset their progress
        if (watchedImdbIds.has(imdbId)) return;
        try {
            await filmsApi.markWatched(imdbId, 0);
            setWatchedImdbIds(prev => {
                const next = new Map(prev);
                next.set(imdbId, { imdb_id: imdbId, stopped_at: 0, is_completed: false });
                return next;
            });
        } catch (err) {
            console.error("Failed to mark watched:", err);
        }
    }, [isLogged, watchedImdbIds]);

    /** Report playback progress from the player — called periodically and on unmount */
    const handleTimeReport = useCallback(async (stoppedAt, duration) => {
        if (!isLogged || !playerImdbId) return;
        try {
            const res = await filmsApi.updateProgress(playerImdbId, stoppedAt);
            const d = res.data;
            setWatchedImdbIds(prev => {
                const next = new Map(prev);
                next.set(playerImdbId, {
                    imdb_id: playerImdbId,
                    stopped_at: d.stopped_at ?? stoppedAt,
                    is_completed: d.is_completed ?? false,
                });
                return next;
            });
        } catch (err) {
            console.error("Failed to update progress:", err);
        }
    }, [isLogged, playerImdbId]);

    /** Open the file picker for a film from the library */
    const handleWatchFilm = useCallback(async (movie) => {
        if (!movie?.imdbid) return;
        try {
            const res = await filmsApi.getFilmFiles(movie.imdbid);
            const files = res.data?.files || [];
            if (files.length === 0) {
                alert("No playable video files found yet.");
                return;
            }
            setPlayerAllFiles(files);
            setPlayerFile(null);           // don't auto-play; show picker first
            setPlayerTitle(movie.title || "");
            setPlayerImdbId(movie.imdbid); // remember for marking watched later
        } catch (err) {
            console.error("Failed to load film files:", err);
            alert("Could not load video files.");
        }
    }, []);

    /*  Computed sidebar style  */
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
                    {isLogged && (
                        <button
                            style={{
                                ...s.navBtn,
                                ...(currentTab === "library" ? s.navBtnActive : {}),
                            }}
                            onClick={() => handleTabClick("library")}
                        >
                            📚 Library
                        </button>
                    )}
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
                            <div style={s.sectionLabel}>Release Date</div>
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

                            {/*  Phase 2: torrent list for selected movie  */}
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
                                                    isLogged={isLogged}
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

                            {/*  Phase 1: TMDB thumbnail grid after search  */}
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
                                            isWatched={!!(result.imdbid && watchedImdbIds.get(result.imdbid)?.is_completed)}
                                            watchProgress={result.imdbid ? watchedImdbIds.get(result.imdbid) : undefined}
                                            filmStatus={result.imdbid ? filmStatusMap.get(result.imdbid) : undefined}
                                            onDownload={handleDownload}
                                            isLogged={isLogged}
                                            onCardClick={handleMovieCardClick}
                                        />
                                    ))}
                                </div>
                            )}

                            {/*  Browse view: shown when no search yet  */}
                            {!torrentMode && !tmdbLoading && !hasSearched && (
                                <BrowseView
                                    genre={browseGenre}
                                    period={browsePeriod}
                                    sortBy={browseSortBy}
                                    watchedImdbIds={watchedImdbIds}
                                    filmStatusMap={filmStatusMap}
                                    onDownload={handleDownload}
                                    isLogged={isLogged}
                                    onCardClick={handleMovieCardClick}
                                />
                            )}
                        </div>
                    </div>
                )}

                {currentTab === "library" && (
                    <div style={s.libraryTab}>
                        {/*  Library movie grid  */}
                        {libraryLoading && filteredLibraryMovies.length === 0 && (
                            <div style={s.searchListStatus}>
                                <div style={s.searchSpinner} />
                                <span>Loading library...</span>
                            </div>
                        )}
                        {!libraryLoading && filteredLibraryMovies.length === 0 && libraryMovies.length === 0 && (
                            <div style={s.libraryEmpty}>No films on the server yet. Browse and download a torrent to get started.</div>
                        )}
                        {!libraryLoading && filteredLibraryMovies.length === 0 && libraryMovies.length > 0 && (
                            <div style={s.libraryEmpty}>No movies match your filters.</div>
                        )}
                        {(() => {
                            const identified = filteredLibraryMovies.filter(m => !m.imdbid?.startsWith("noid-"));
                            const other = filteredLibraryMovies.filter(m => m.imdbid?.startsWith("noid-"));
                            return (
                                <>
                                    {identified.length > 0 && (
                                        <>
                                            <div style={s.libraryCount}>
                                                {identified.length} movie{identified.length > 1 ? "s" : ""}
                                            </div>
                                            <div style={s.movieGrid}>
                                                {identified.map((movie, idx) => (
                                                    <MovieCard
                                                        key={movie.imdbid || movie.title || idx}
                                                        result={movie}
                                                        isWatched={!!(movie.imdbid && watchedImdbIds.get(movie.imdbid)?.is_completed)}
                                                        watchProgress={movie.imdbid ? watchedImdbIds.get(movie.imdbid) : undefined}
                                                        isLogged={isLogged}
                                                        onCardClick={movie.can_watch ? () => handleWatchFilm(movie) : undefined}
                                                        libraryMode
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                    {other.length > 0 && (
                                        <>
                                            <div style={s.librarySectionHeader}>
                                                <span style={s.librarySectionTitle}>Other</span>
                                                <span style={s.librarySectionSubtitle}>{other.length} unidentified torrent{other.length > 1 ? "s" : ""}</span>
                                            </div>
                                            <div style={s.movieGrid}>
                                                {other.map((movie, idx) => (
                                                    <MovieCard
                                                        key={movie.imdbid || movie.title || idx}
                                                        result={movie}
                                                        isWatched={false}
                                                        isLogged={isLogged}
                                                        onCardClick={movie.can_watch ? () => handleWatchFilm(movie) : undefined}
                                                        libraryMode
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Player / file-picker modal (opened from library) */}
            {playerAllFiles.length > 0 && (
                <WatchModal
                    file={playerFile}
                    title={playerTitle}
                    allFiles={playerAllFiles}
                    onFileChange={(f) => {
                        setPlayerFile(f);
                        if (f && playerImdbId) handleMarkWatched(playerImdbId);
                    }}
                    onTimeReport={handleTimeReport}
                    initialTime={playerImdbId ? (watchedImdbIds.get(playerImdbId)?.stopped_at || 0) : 0}
                    onClose={() => { setPlayerFile(null); setPlayerAllFiles([]); setPlayerImdbId(null); }}
                />
            )}
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
    libraryCount: {
        fontSize: "0.82rem",
        color: "#8b949e",
        padding: "2px 0",
        letterSpacing: "0.3px",
        textTransform: "uppercase",
        fontWeight: 500,
    },
    librarySectionHeader: {
        display: "flex",
        alignItems: "baseline",
        gap: 10,
        padding: "18px 0 4px",
        marginTop: 12,
        borderTop: "1px solid #21262d",
    },
    librarySectionTitle: {
        fontSize: "0.92rem",
        fontWeight: 700,
        color: "#c9d1d9",
        letterSpacing: "0.3px",
    },
    librarySectionSubtitle: {
        fontSize: "0.76rem",
        color: "#484f58",
        fontWeight: 500,
    },
};
