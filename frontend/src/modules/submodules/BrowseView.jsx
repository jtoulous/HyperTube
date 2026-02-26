import { useState, useRef, useCallback, useEffect } from "react";
import { searchApi } from "../../api/search";
import MovieCard from "./MovieCard";

export default function BrowseView({ genre, period, sortBy, watchedImdbIds, onDownload, isLogged, onCardClick }) {
    const [page,   setPage]   = useState(1);
    const [results,  setResults]  = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [hasMore,  setHasMore]  = useState(true);
    const [initialLoaded, setInitialLoaded] = useState(false);

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

    useEffect(() => {
        setInitialLoaded(false);
        setPage(1);
        setResults([]);
        hasMoreRef.current = true;
        setHasMore(true);
        pageRef.current = 1;
        fetchPage(1, false);
    }, [genre, period, sortBy, fetchPage]);

    useEffect(() => {
        if (!initialLoaded) return;
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

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
        <div style={styles.browseView}>
            {results.length === 0 && !loading && (
                <div style={styles.empty}>No results for these filters — try a different genre or period.</div>
            )}
            <div style={styles.movieGrid}>
                {results.map((result, idx) => (
                    <MovieCard
                        key={result.tmdb_id || result.imdbid || idx}
                        result={result}
                        isWatched={!!(result.imdbid && watchedImdbIds.has(result.imdbid))}
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
