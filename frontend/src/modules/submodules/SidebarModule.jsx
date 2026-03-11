const BROWSE_GENRES = ["", "Action", "Comedy", "Drama", "Horror", "Thriller", "Sci-Fi", "Animation", "Romance", "Crime", "Adventure", "Documentary", "Family"];
const BROWSE_PERIODS = [
    { key: "all", label: "All Time" },
    { key: "month", label: "This Month" },
    { key: "week", label: "This Week" },
    { key: "day", label: "Today" },
];
const BROWSE_SORTS = [
    { key: "popular", label: "Most Popular" },
    { key: "rating", label: "Top Rated" },
    { key: "year", label: "Newest" },
    { key: "name", label: "A-Z" },
];

export default function SidebarModule({
    currentTab,
    onTabClick,
    isLogged,
    searchQuery,
    onSearchQueryChange,
    onSearch,
    tmdbLoading,
    hasSearched,
    onClearSearch,
    browseSortBy,
    onSortByChange,
    cleanupRunning,
    onForceCleanup,
    browseRating,
    onRatingChange,
    browseYear,
    onYearChange,
    browseGenre,
    onGenreChange,
    browsePeriod,
    onPeriodChange,
    isMobile,
    sidebarOpen,
    onCloseSidebar,
}) {
    const sidebarStyle = isMobile
        ? { ...s.sidebar, ...s.sidebarMobile, ...(sidebarOpen ? {} : s.sidebarMobileClosed) }
        : { ...s.sidebar, ...(sidebarOpen ? s.sidebarOpen : s.sidebarClosed) };

    return (
        <>
            {isMobile && sidebarOpen && <div style={s.sidebarOverlay} onClick={onCloseSidebar} />}
            <aside style={sidebarStyle}>
              <div style={s.sidebarInner}>
                <nav style={s.sidebarNav}>
                    <button
                        style={{ ...s.navBtn, ...(currentTab === "browse" ? s.navBtnActive : {}) }}
                        onClick={() => onTabClick("browse")}
                    >
                        🔍 Browse
                    </button>
                    {isLogged && (
                        <button
                            style={{ ...s.navBtn, ...(currentTab === "library" ? s.navBtnActive : {}) }}
                            onClick={() => onTabClick("library")}
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
                        onChange={(e) => onSearchQueryChange(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && currentTab === "browse") onSearch(); }}
                    />
                    {currentTab === "browse" && (
                        <button
                            style={{ ...s.searchBtn, ...(tmdbLoading ? s.searchBtnDisabled : {}) }}
                            onClick={onSearch}
                            disabled={tmdbLoading}
                        >
                            {tmdbLoading ? "Searching..." : "Search"}
                        </button>
                    )}
                    {currentTab === "browse" && hasSearched && (
                        <button style={s.clearBtn} onClick={onClearSearch}>
                            ← Browse
                        </button>
                    )}
                </div>

                {currentTab === "library" && isLogged && (
                    <>
                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={s.sectionLabel}>Maintenance</div>
                            <button
                                style={{ ...s.cleanupBtn, ...(cleanupRunning ? s.cleanupBtnDisabled : {}) }}
                                onClick={onForceCleanup}
                                disabled={cleanupRunning}
                            >
                                {cleanupRunning ? "Cleaning up…" : "Force Cleanup"}
                            </button>
                            <span style={s.cleanupHint}>Force removing films not watched by anyone in 30+ days</span>
                        </div>
                    </>
                )}

                <div style={s.divider} />

                <div style={s.section}>
                    <div style={s.sectionLabel}>Sort by</div>
                    <select style={s.sortSelect} value={browseSortBy} onChange={e => onSortByChange(e.target.value)}>
                        {BROWSE_SORTS.map(opt => (
                            <option key={opt.key} value={opt.key} style={s.sortOption}>{opt.label}</option>
                        ))}
                    </select>
                </div>

                {(currentTab === "library" || (currentTab === "browse" && !hasSearched)) && (
                    <>
                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={s.sectionLabel}>Min Rating</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: browseRating > 0 ? '#007BFF' : '#484f58' }}>
                                    {browseRating > 0 ? `★ ${parseFloat(browseRating).toFixed(1)}+` : 'All'}
                                </div>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="10"
                                step="0.1"
                                value={browseRating}
                                onChange={(e) => onRatingChange(e.target.value)}
                                style={s.slider}
                            />
                        </div>

                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={s.sectionLabel}>Year</div>
                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: browseYear ? '#007BFF' : '#484f58' }}>
                                    {browseYear || 'Any'}
                                </div>
                            </div>
                            <input
                                type="number"
                                min="1950"
                                max={new Date().getFullYear()}
                                placeholder="Any year"
                                value={browseYear}
                                onChange={(e) => onYearChange(e.target.value)}
                                style={s.yearInput}
                            />
                        </div>

                        <div style={s.divider} />
                        <div style={s.section}>
                            <div style={s.sectionLabel}>Genre</div>
                            <div style={s.genresList}>
                                {BROWSE_GENRES.map(g => (
                                    <button
                                        key={g || "all"}
                                        style={{ ...s.genreBtn, ...(browseGenre === g ? s.genreBtnActive : {}) }}
                                        onClick={() => onGenreChange(g)}
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
                                        onClick={() => onPeriodChange(p.key)}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={s.divider} />
                    </>
                )}
              </div>
            </aside>
        </>
    );
}

const s = {
    sidebarInner: {
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
    },
    sidebar: {
        position: "fixed",
        left: 0,
        top: "60px",
        height: "calc(100vh - 60px - 36px)",
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
        zIndex: 100,
    },
    sidebarOpen: {
        width: 220,
        minWidth: 220,
        marginLeft: 0,
        overflowY: "auto",
        overflowX: "hidden",
    },
    sidebarClosed: {
        width: 0,
        minWidth: 0,
        overflowY: "hidden",
        overflowX: "hidden",
        borderRight: "none",
        marginLeft: "-220px",
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
    cleanupBtn: {
        width: "100%",
        height: 34,
        background: "#da3633",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: "0.8rem",
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
    },
    cleanupBtnDisabled: {
        opacity: 0.5,
        cursor: "not-allowed",
    },
    cleanupHint: {
        fontSize: "0.68rem",
        color: "#484f58",
        lineHeight: 1.3,
        fontFamily: "'Inter', sans-serif",
    },
    yearInput: {
        width: "100%",
        padding: "6px 10px",
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#c9d1d9",
        fontSize: "0.78rem",
        fontFamily: "'Inter', sans-serif",
        outline: "none",
        boxSizing: "border-box",
    },
    slider: {
        width: "100%",
        height: 10,
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
};
