import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { GlobalState } from "../State";
import { searchApi } from "../api/search";
import { downloadsApi } from "../api/downloads";
import { filmsApi } from "../api/films";
import MovieCard from "./submodules/MovieCard";
import BrowseView from "./submodules/BrowseView";
import SidebarModule from "./submodules/SidebarModule";
import TorrentListModule from "./submodules/TorrentListModule";
import LibraryView from "./submodules/LibraryView";
import WatchModule from "./submodules/WatchModule";
import PlayerViewModule from "./PlayerViewModule";

export default function MainContentModule() {
    const { isLogged, sidebarOpen, setSidebarOpen, language } = GlobalState();
    const navigate = useNavigate();
    const location = useLocation();

    const [isMobile, setIsMobile] = useState(
        typeof window !== "undefined" && window.matchMedia("(max-width: 768px)").matches
    );

    useEffect(() => {
        const mq = window.matchMedia("(max-width: 768px)");
        const handler = (e) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    const [currentTab, setCurrentTab] = useState(
        location.state?.tab || "browse"
    );
    const [searchQuery, setSearchQuery] = useState("");

    const [tmdbResults, setTmdbResults] = useState([]);
    const [tmdbLoading, setTmdbLoading] = useState(false);
    const [tmdbError, setTmdbError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);

    const [torrentMode, setTorrentMode] = useState(false);
    const [torrentTitle, setTorrentTitle] = useState("");
    const [torrentResults, setTorrentResults] = useState([]);
    const [torrentLoading, setTorrentLoading] = useState(false);
    const [torrentError,   setTorrentError]   = useState(null);

    const [torrentSortBy,       setTorrentSortBy]       = useState("match_then_seeders");
    const [torrentFilterMatch,  setTorrentFilterMatch]  = useState("all");
    const [torrentFilterMinSeed, setTorrentFilterMinSeed] = useState(0);
    const [torrentFilterSeason,   setTorrentFilterSeason]  = useState("all");
    const [torrentFilterEpisode,  setTorrentFilterEpisode] = useState("all");

    const [browseGenre, setBrowseGenre] = useState("");
    const [browsePeriod, setBrowsePeriod] = useState("all");
    const [browseSortBy, setBrowseSortBy] = useState("popular");
    const [cleanupRunning, setCleanupRunning] = useState(false);
    const [browseRating, setBrowseRating] = useState(0);
    const [browseYear, setBrowseYear] = useState("");

    const [libraryMovies, setLibraryMovies] = useState([]);
    const [libraryLoading, setLibraryLoading] = useState(false);

    const [watchedImdbIds, setWatchedImdbIds] = useState(new Map());

    /* Player state for watching from library */
    const [playerFile, setPlayerFile] = useState(null);
    const [playerTitle, setPlayerTitle] = useState("");
    const [playerAllFiles, setPlayerAllFiles] = useState([]);
    const [playerImdbId, setPlayerImdbId] = useState(null);
    const [playerMovie, setPlayerMovie] = useState(null);
    const [playerTorrents, setPlayerTorrents] = useState([]);

    /*  Load watched IDs from API  */
    const loadWatchedIds = useCallback(async () => {
        if (!isLogged) 
            return;

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
                availability: f.availability,
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

    /* While on the library tab or while the Module is open, refresh every 5 s so progress stays live */
    useEffect(() => {
        if (currentTab !== "library" && !playerMovie) return;
        loadFilms();
        const iv = setInterval(loadFilms, 5000);
        return () => clearInterval(iv);
    }, [currentTab, loadFilms, !!playerMovie]);

    /* Keep playerMovie in sync with live library data + refresh torrent list */
    useEffect(() => {
        if (!playerMovie) return;
        const fresh = libraryMovies.find(m => m.imdbid === playerMovie.imdbid);
        if (fresh) setPlayerMovie(fresh);
        // Also refresh torrents on each library poll
        filmsApi.getFilmTorrents(playerMovie.imdbid)
            .then(res => setPlayerTorrents(res.data?.torrents || []))
            .catch(() => { });
    }, [libraryMovies]);

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
        if (browseRating > 0) movies = movies.filter(m => (parseFloat(m.imdb_rating) || 0) >= parseFloat(browseRating));
        if (browseSortBy === "rating") movies.sort((a, b) => (parseFloat(b.imdb_rating) || 0) - (parseFloat(a.imdb_rating) || 0));
        else if (browseSortBy === "year") movies.sort((a, b) => (b.year || "0").localeCompare(a.year || "0"));
        else if (browseSortBy === "name") movies.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        return movies;
    }, [libraryMovies, searchQuery, browseGenre, browseSortBy, browsePeriod, browseRating]);

    /** Season/episode options derived from backend-provided guessit fields */
    const torrentSEData = useMemo(() => {
        const seasons = new Set();
        const episodes = new Set();
        let hasSeries = false;
        for (const r of torrentResults) {
            if (r.season != null) { seasons.add(r.season); hasSeries = true; }
            if (r.episode != null) { episodes.add(r.episode); hasSeries = true; }
            if (r.is_full_season) hasSeries = true;
        }
        return {
            hasSeries,
            seasons: [...seasons].sort((a, b) => a - b),
            episodes: [...episodes].sort((a, b) => a - b),
        };
    }, [torrentResults]);

    const processedTorrentResults = useMemo(() => {
        let items = [...torrentResults];

        // Filter by match quality
        if (torrentFilterMatch === "exact") {
            items = items.filter(r => r.match_quality === "exact");
        } else if (torrentFilterMatch === "different") {
            items = items.filter(r => r.match_quality === "different");
        } else if (torrentFilterMatch === "noid") {
            items = items.filter(r => !r.imdbid && !r.guessed_imdbid);
        } else if (torrentFilterMatch === "identified") {
            items = items.filter(r => r.imdbid || r.guessed_imdbid);
        }

        // Filter by minimum seeders
        if (torrentFilterMinSeed > 0) {
            items = items.filter(r => (r.seeders || 0) >= torrentFilterMinSeed);
        }

        // Filter by season
        if (torrentFilterSeason !== "all") {
            const wantSeason = parseInt(torrentFilterSeason, 10);
            items = items.filter(r => r.season === wantSeason);
        }

        // Filter by episode
        if (torrentFilterEpisode !== "all") {
            if (torrentFilterEpisode === "full") {
                // Full season packs only (no specific episode)
                items = items.filter(r => r.is_full_season);
            } else {
                const wantEp = parseInt(torrentFilterEpisode, 10);
                items = items.filter(r => r.episode === wantEp || r.is_full_season);
            }
        }

        // Sort
        const matchRank = (r) => (r.match_quality === "exact" ? 0 : 1);
        switch (torrentSortBy) {
            case "match_then_seeders":
                items.sort((a, b) => matchRank(a) - matchRank(b) || (b.seeders || 0) - (a.seeders || 0));
                break;
            case "seeders_desc": items.sort((a, b) => (b.seeders || 0) - (a.seeders || 0)); break;
            case "seeders_asc":  items.sort((a, b) => (a.seeders || 0) - (b.seeders || 0)); break;
            case "size_desc":    items.sort((a, b) => (b.size || 0) - (a.size || 0)); break;
            case "size_asc":     items.sort((a, b) => (a.size || 0) - (b.size || 0)); break;
            case "date_desc":    items.sort((a, b) => new Date(b.pub_date || 0) - new Date(a.pub_date || 0)); break;
            case "name_asc":     items.sort((a, b) => (a.title || "").localeCompare(b.title || "")); break;
            default: break;
        }

        return items;
    }, [torrentResults, torrentSortBy, torrentFilterMatch, torrentFilterMinSeed, torrentFilterSeason, torrentFilterEpisode]);

    const filmStatusMap = useMemo(() => {
        const m = new Map();
        for (const f of libraryMovies) {
            if (f.imdbid) m.set(f.imdbid, f.status);
        }
        return m;
    }, [libraryMovies]);

    const handleTabClick = (tab) => {
        setCurrentTab(tab);
        // Close the player view if open so the tab content is visible
        if (playerFile) {
            setPlayerFile(null); setPlayerAllFiles([]); setPlayerImdbId(null); setPlayerMovie(null); setPlayerTorrents([]);
        }
    };

    const clearSearch = () => {
        setSearchQuery("");
        setTmdbResults([]);
        setHasSearched(false);
        setTmdbError(null);
        setTorrentMode(false);
        setTorrentResults([]);
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
        setTorrentSortBy("match_then_seeders");
        setTorrentFilterMatch("all");
        setTorrentFilterMinSeed(0);
        setTorrentFilterSeason("all");
        setTorrentFilterEpisode("all");
        try {
            const res = await searchApi.search(title, tmdbId);
            setTorrentResults(res.data.results || []);
        } catch {
            setTorrentError("Torrent search failed — try again.");
        } finally {
            setTorrentLoading(false);
        }
    }, []);

    const handleBackFromTorrents = useCallback(() => {
        setTorrentMode(false);
        setTorrentResults([]);
        setTorrentError(null);
    }, []);

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

    /** Open the film detail / player Module from the library */
    const handleWatchFilm = useCallback(async (movie) => {
        if (!movie?.imdbid) return;
        setPlayerMovie(movie);
        setPlayerTitle(movie.title || "");
        setPlayerImdbId(movie.imdbid);
        setPlayerFile(null);
        setPlayerTorrents([]);
        try {
            const [filesRes, torrentsRes] = await Promise.all([
                filmsApi.getFilmFiles(movie.imdbid).catch(() => ({ data: { files: [] } })),
                filmsApi.getFilmTorrents(movie.imdbid).catch(() => ({ data: { torrents: [] } })),
            ]);
            setPlayerAllFiles(filesRes.data?.files || []);
            setPlayerTorrents(torrentsRes.data?.torrents || []);
        } catch {
            setPlayerAllFiles([]);
            setPlayerTorrents([]);
        }
    }, []);

    /** Reload torrents + files for the currently open Module */
    const refreshModule = useCallback(async () => {
        if (!playerImdbId) return;
        try {
            const [filesRes, torrentsRes] = await Promise.all([
                filmsApi.getFilmFiles(playerImdbId).catch(() => ({ data: { files: [] } })),
                filmsApi.getFilmTorrents(playerImdbId).catch(() => ({ data: { torrents: [] } })),
            ]);
            setPlayerAllFiles(filesRes.data?.files || []);
            setPlayerTorrents(torrentsRes.data?.torrents || []);
        } catch { /* ignore */ }
        // Also refresh library so playerMovie.can_watch stays current
        loadFilms();
    }, [playerImdbId, loadFilms]);

    /** Per-torrent control handlers — accept hash from WatchModule */
    const handleTorrentPause = useCallback(async (hash) => {
        try { await downloadsApi.pauseTorrent(hash); loadFilms(); refreshModule(); } catch (e) { console.error(e); }
    }, [loadFilms, refreshModule]);
    const handleTorrentResume = useCallback(async (hash) => {
        try { await downloadsApi.resumeTorrent(hash); loadFilms(); refreshModule(); } catch (e) { console.error(e); }
    }, [loadFilms, refreshModule]);
    const handleTorrentDelete = useCallback(async (hash) => {
        if (!confirm("Delete this torrent and all its data?")) return;
        try {
            await downloadsApi.deleteTorrent(hash);
            // Refresh library first so the film disappears if it was removed server-side
            await loadFilms();
            // Re-fetch torrents for the current film to see what's left
            if (playerImdbId) {
                try {
                    const torrentsRes = await filmsApi.getFilmTorrents(playerImdbId);
                    const remaining = torrentsRes.data?.torrents || [];
                    if (remaining.length === 0) {
                        // Film was deleted server-side — close Module
                        setPlayerMovie(null); setPlayerFile(null); setPlayerAllFiles([]); setPlayerImdbId(null); setPlayerTorrents([]);
                    } else {
                        setPlayerTorrents(remaining);
                        const filesRes = await filmsApi.getFilmFiles(playerImdbId).catch(() => ({ data: { files: [] } }));
                        setPlayerAllFiles(filesRes.data?.files || []);
                    }
                } catch {
                    // Film no longer exists on server — close Module
                    setPlayerMovie(null); setPlayerFile(null); setPlayerAllFiles([]); setPlayerImdbId(null); setPlayerTorrents([]);
                }
            }
        } catch (e) { console.error(e); }
    }, [loadFilms, playerImdbId]);
    const handleTorrentRecheck = useCallback(async (hash) => {
        try { await downloadsApi.recheckTorrent(hash); refreshModule(); } catch (e) { console.error(e); }
    }, [refreshModule]);
    const handleTorrentReannounce = useCallback(async (hash) => {
        try { await downloadsApi.reannounceTorrent(hash); refreshModule(); } catch (e) { console.error(e); }
    }, [refreshModule]);

    const handleForceCleanup = useCallback(async () => {
        if (cleanupRunning) return;
        setCleanupRunning(true);
        try {
            await downloadsApi.forceCleanup();
            await loadFilms();
        } catch (e) {
            console.error("Cleanup failed:", e);
        } finally {
            setCleanupRunning(false);
        }
    }, [cleanupRunning, loadFilms]);

    const closePlayer = () => {
        setPlayerFile(null); setPlayerAllFiles([]); setPlayerImdbId(null); setPlayerMovie(null); setPlayerTorrents([]);
    };

    /*  Computed tab content area style — adjust margin-left based on sidebar state on desktop  */
    const tabContentAreaStyle = isMobile
        ? s.tabContentArea
        : { ...s.tabContentArea, marginLeft: sidebarOpen ? 220 : 0 };

    return (
        <div style={{ ...s.container, ...(isMobile ? s.containerMobile : {}) }}>
            <SidebarModule
                currentTab={currentTab}
                onTabClick={handleTabClick}
                isLogged={isLogged}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                onSearch={runNewSearch}
                tmdbLoading={tmdbLoading}
                hasSearched={hasSearched}
                onClearSearch={clearSearch}
                browseSortBy={browseSortBy}
                onSortByChange={setBrowseSortBy}
                cleanupRunning={cleanupRunning}
                onForceCleanup={handleForceCleanup}
                browseRating={browseRating}
                onRatingChange={setBrowseRating}
                browseYear={browseYear}
                onYearChange={setBrowseYear}
                browseGenre={browseGenre}
                onGenreChange={setBrowseGenre}
                browsePeriod={browsePeriod}
                onPeriodChange={setBrowsePeriod}
                isMobile={isMobile}
                sidebarOpen={sidebarOpen}
                onCloseSidebar={() => setSidebarOpen(false)}
            />

            <div style={tabContentAreaStyle}>
                {/* PlayerViewModule: replaces tab content when a file is playing */}
                {playerFile && playerImdbId ? (
                    <PlayerViewModule
                        imdbId={playerImdbId}
                        selectedFile={playerFile}
                        onTimeReport={handleTimeReport}
                        initialTime={playerImdbId ? (watchedImdbIds.get(playerImdbId)?.stopped_at || 0) : 0}
                        onBack={closePlayer}
                    />
                ) : currentTab === "browse" ? (
                    <div style={s.searchTab}>
                        <div style={s.searchList}>
                            {/* Torrent list for selected movie */}
                            {torrentMode && (
                                <TorrentListModule
                                    torrentTitle={torrentTitle}
                                    torrentLoading={torrentLoading}
                                    torrentError={torrentError}
                                    torrentResults={torrentResults}
                                    processedTorrentResults={processedTorrentResults}
                                    torrentSortBy={torrentSortBy}
                                    onSortByChange={setTorrentSortBy}
                                    torrentFilterMatch={torrentFilterMatch}
                                    onFilterMatchChange={setTorrentFilterMatch}
                                    torrentFilterMinSeed={torrentFilterMinSeed}
                                    onFilterMinSeedChange={setTorrentFilterMinSeed}
                                    torrentFilterSeason={torrentFilterSeason}
                                    onFilterSeasonChange={setTorrentFilterSeason}
                                    torrentFilterEpisode={torrentFilterEpisode}
                                    onFilterEpisodeChange={setTorrentFilterEpisode}
                                    torrentSEData={torrentSEData}
                                    onBack={handleBackFromTorrents}
                                    onDownload={handleDownload}
                                    isLogged={isLogged}
                                />
                            )}

                            {/* TMDB thumbnail grid after search */}
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
                                    {tmdbResults
                                        .filter(r => browseRating <= 0 || (parseFloat(r.imdb_rating) || parseFloat(r.vote_average) || 0) >= parseFloat(browseRating))
                                        .map((result, idx) => (
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
                            {!torrentMode && !tmdbLoading && !hasSearched && (
                                <BrowseView
                                    genre={browseGenre}
                                    period={browsePeriod}
                                    sortBy={browseSortBy}
                                    minRating={parseFloat(browseRating)}
                                    year={browseYear}
                                    watchedImdbIds={watchedImdbIds}
                                    filmStatusMap={filmStatusMap}
                                    onDownload={handleDownload}
                                    isLogged={isLogged}
                                    onCardClick={handleMovieCardClick}
                                />
                            )}
                        </div>
                    </div>
                ) : currentTab === "library" ? (
                    <LibraryView
                        libraryLoading={libraryLoading}
                        filteredLibraryMovies={filteredLibraryMovies}
                        libraryMoviesCount={libraryMovies.length}
                        watchedImdbIds={watchedImdbIds}
                        isLogged={isLogged}
                        onWatchFilm={handleWatchFilm}
                    />
                ) : null}
            </div>

            {/* WatchModule overlay */}
            {playerMovie && !playerFile && (
                <WatchModule
                    file={playerFile}
                    title={playerTitle}
                    allFiles={playerAllFiles}
                    torrents={playerTorrents}
                    movie={playerMovie}
                    imdbId={playerImdbId}
                    userLang={language}
                    onFileChange={(f) => {
                        setPlayerFile(f);
                        if (f && playerImdbId) handleMarkWatched(playerImdbId);
                    }}
                    onTimeReport={handleTimeReport}
                    initialTime={playerImdbId ? (watchedImdbIds.get(playerImdbId)?.stopped_at || 0) : 0}
                    onClose={closePlayer}
                    onPause={handleTorrentPause}
                    onResume={handleTorrentResume}
                    onDelete={handleTorrentDelete}
                    onRecheck={handleTorrentRecheck}
                    onReannounce={handleTorrentReannounce}
                    onRefresh={refreshModule}
                />
            )}
        </div>
    );
}

const s = {
    container: {
        width: "100%",
        height: "calc(100vh - 60px - 36px)",
        display: "flex",
        flexDirection: "row",
        background: "#161b22",
        overflow: "hidden",
        marginTop: "60px",
    },
    containerMobile: {
        flexDirection: "column",
        position: "relative",
    },
    tabContentArea: {
        flex: 1,
        height: "100%",
        background: "#161b22",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        minWidth: 0,
        transition: "margin-left 0.25s cubic-bezier(0.4,0,0.2,1)",
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
    movieGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 14,
    },
};
