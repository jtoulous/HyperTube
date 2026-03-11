import MovieCard from "./MovieCard";

export default function LibraryView({libraryLoading, filteredLibraryMovies, libraryMoviesCount, watchedImdbIds, isLogged, onWatchFilm}) {
    return (
        <div style={s.libraryTab}>
            {libraryLoading && filteredLibraryMovies.length === 0 && (
                <div style={s.status}>
                    <div style={s.spinner} />
                    <span>Loading library...</span>
                </div>
            )}
            {!libraryLoading && filteredLibraryMovies.length === 0 && libraryMoviesCount === 0 && (
                <div style={s.libraryEmpty}>No films on the server yet. Browse and download a torrent to get started.</div>
            )}
            {!libraryLoading && filteredLibraryMovies.length === 0 && libraryMoviesCount > 0 && (
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
                                            onCardClick={() => onWatchFilm(movie)}
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
                                            onCardClick={() => onWatchFilm(movie)}
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
    );
}

const s = {
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
    movieGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 14,
    },
    status: {
        minHeight: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "#8b949e",
        fontSize: "0.9rem",
        padding: "28px 0",
    },
    spinner: {
        width: 20,
        height: 20,
        border: "2px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
    },
};
