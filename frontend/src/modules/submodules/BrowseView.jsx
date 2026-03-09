import { useState, useRef, useCallback, useEffect } from "react";
import { searchApi } from "../../api/search";
import MovieCard from "./MovieCard";

export default function BrowseView({ genre, period, sortBy, minRating, year, watchedImdbIds, filmStatusMap, onDownload, isLogged, onCardClick }) {
    const [results,  setResults]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [hasMore,  setHasMore]  = useState(true);
    const [initialLoaded, setInitialLoaded] = useState(false);

    const hasMoreRef = useRef(true);
    const pageRef    = useRef(1);

    /* Generation counter: incremented on every filter reset.
       Any in-flight or looping fetch from a previous generation is discarded. */
    const genRef = useRef(0);

    /* Store current filters in a ref for the infinite-scroll observer */
    const filtersRef = useRef({ genre, period, sortBy, year, minRating });
    filtersRef.current = { genre, period, sortBy, year, minRating };

    /* Debounce timer for slider-type filters (minRating) */
    const debounceRef = useRef(null);

    const sentinelRef = useRef(null);
    const observerRef = useRef(null);

    const fetchPage = useCallback(async (pageNum, append, filters, gen) => {
        const f = filters || filtersRef.current;
        const myGen = gen ?? genRef.current;

        const params = {
            genre:   f.genre,
            period:  f.period,
            sort_by: f.sortBy,
            page:    pageNum,
        };
        if (f.year) params.year = f.year;
        if (f.minRating && f.minRating > 0) params.min_rating = f.minRating;

        setLoading(true);
        try {
            const res = await searchApi.browseMedia(params);
            /* If a new reset happened while we were fetching, discard results */
            if (myGen !== genRef.current) return;
            const data = res.data;
            setResults(prev => append ? [...prev, ...data.results] : data.results);
            hasMoreRef.current = data.has_more;
            pageRef.current = pageNum;
            setHasMore(data.has_more);
        } catch (err) {
            if (myGen !== genRef.current) return;
            console.error("Browse error:", err);
        } finally {
            if (myGen === genRef.current) {
                setLoading(false);
                if (!append) setInitialLoaded(true);
            }
        }
    }, []);

    /* Reset helper — bumps generation, clears state, fetches page 1 */
    const resetAndFetch = useCallback((filters) => {
        const newGen = ++genRef.current;
        setInitialLoaded(false);
        setResults([]);
        hasMoreRef.current = true;
        setHasMore(true);
        pageRef.current = 1;
        fetchPage(1, false, filters, newGen);
    }, [fetchPage]);

    /* Reset and reload when discrete filters change */
    useEffect(() => {
        resetAndFetch({ genre, period, sortBy, year, minRating });
    }, [genre, period, sortBy, year, resetAndFetch]);

    /* Debounced reload for minRating slider (300ms) */
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            resetAndFetch({ genre, period, sortBy, year, minRating });
        }, 300);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [minRating, resetAndFetch]);

    useEffect(() => {
        if (!initialLoaded) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        observerRef.current?.disconnect();

        const observer = new IntersectionObserver(async ([entry]) => {
            if (!entry.isIntersecting || !hasMoreRef.current) return;
            const gen = genRef.current;
            // Keep loading pages until sentinel is pushed out of view or no more data
            while (hasMoreRef.current && gen === genRef.current) {
                await fetchPage(pageRef.current + 1, true, null, gen);
                if (gen !== genRef.current) break;
                // Check if sentinel is still visible
                const rect = sentinel.getBoundingClientRect();
                if (rect.top >= window.innerHeight + 200) break;
            }
        }, { rootMargin: "200px" });

        observer.observe(sentinel);
        observerRef.current = observer;

        return () => observer.disconnect();
    }, [initialLoaded, fetchPage]);

    return (
        <div style={styles.browseView}>
            {results.length === 0 && !loading && (
                <div style={styles.empty}>No results for these filters — try a different genre or period.</div>
            )}
            <div style={styles.movieGrid}>
                {results.map((result, idx) => (
                    <MovieCard
                        key={`${result.tmdb_id || result.imdbid || 'r'}-${idx}`}
                        result={result}
                        isWatched={!!(result.imdbid && watchedImdbIds.get(result.imdbid)?.is_completed)}
                        watchProgress={result.imdbid ? watchedImdbIds.get(result.imdbid) : undefined}
                        filmStatus={result.imdbid && filmStatusMap ? filmStatusMap.get(result.imdbid) : undefined}
                        onDownload={onDownload}
                        isLogged={isLogged}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>

            {loading && (
                <div style={styles.loading}>
                    <div style={styles.spinner} />
                    <span>Loading...</span>
                </div>
            )}

            <div ref={sentinelRef} style={styles.sentinel} />
        </div>
    );
}

const styles = {
    browseView: {
        padding: "0 0 32px",
    },
    movieGrid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: 14,
    },
    empty: {
        textAlign: "center",
        color: "#8b949e",
        fontSize: "0.85rem",
        padding: "36px 20px",
    },
    loading: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "20px 0",
        color: "#8b949e",
        fontSize: "0.82rem",
    },
    spinner: {
        width: 18,
        height: 18,
        border: "2px solid #30363d",
        borderTopColor: "#007BFF",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
    },
    sentinel: {
        height: 1,
    },
};
