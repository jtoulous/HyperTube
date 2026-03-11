import { useState } from "react";
import SearchResultRow from "./SearchResultRow";

export default function TorrentListModule({
    torrentTitle,
    torrentLoading,
    torrentError,
    torrentResults,
    processedTorrentResults,
    torrentSortBy,
    onSortByChange,
    torrentFilterMatch,
    onFilterMatchChange,
    torrentFilterMinSeed,
    onFilterMinSeedChange,
    torrentFilterSeason,
    onFilterSeasonChange,
    torrentFilterEpisode,
    onFilterEpisodeChange,
    torrentSEData,
    onBack,
    onDownload,
    isLogged,
}) {
    const [expandedIndex, setExpandedIndex] = useState(null);

    const resetExpanded = () => setExpandedIndex(null);

    return (
        <div style={s.torrentContainer}>
            <div style={s.torrentHeader}>
                <button style={s.backBtn} onClick={onBack}>
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
                    {/* Sort and Filter bar */}
                    <div style={s.torrentControls}>
                        <div style={s.torrentControlGroup}>
                            <span style={s.torrentControlLabel}>Sort</span>
                            <select
                                style={s.torrentSelect}
                                value={torrentSortBy}
                                onChange={e => { onSortByChange(e.target.value); resetExpanded(); }}
                            >
                                <option value="match_then_seeders">Default (exact first + most seeders)</option>
                                <option value="seeders_desc">Most seeders</option>
                                <option value="seeders_asc">Least seeders</option>
                                <option value="size_desc">Size (largest)</option>
                                <option value="size_asc">Size (smallest)</option>
                                <option value="date_desc">Newest first</option>
                                <option value="name_asc">A → Z</option>
                            </select>
                        </div>
                        <div style={s.torrentControlGroup}>
                            <span style={s.torrentControlLabel}>Match</span>
                            <select
                                style={s.torrentSelect}
                                value={torrentFilterMatch}
                                onChange={e => { onFilterMatchChange(e.target.value); resetExpanded(); }}
                            >
                                <option value="all">All</option>
                                <option value="exact">Exact match</option>
                                <option value="identified">Has ID</option>
                                <option value="different">Different</option>
                                <option value="noid">No ID</option>
                            </select>
                        </div>
                        <div style={s.torrentControlGroup}>
                            <span style={s.torrentControlLabel}>Min seeds</span>
                            <select
                                style={s.torrentSelect}
                                value={torrentFilterMinSeed}
                                onChange={e => { onFilterMinSeedChange(Number(e.target.value)); resetExpanded(); }}
                            >
                                <option value={0}>Any</option>
                                <option value={1}>1+</option>
                                <option value={5}>5+</option>
                                <option value={10}>10+</option>
                                <option value={25}>25+</option>
                                <option value={50}>50+</option>
                            </select>
                        </div>
                        {torrentSEData.hasSeries && torrentSEData.seasons.length > 0 && (
                            <div style={s.torrentControlGroup}>
                                <span style={s.torrentControlLabel}>Season</span>
                                <select
                                    style={s.torrentSelect}
                                    value={torrentFilterSeason}
                                    onChange={e => { onFilterSeasonChange(e.target.value); resetExpanded(); }}
                                >
                                    <option value="all">All</option>
                                    {torrentSEData.seasons.map(n => (
                                        <option key={n} value={n}>S{String(n).padStart(2, "0")}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {torrentSEData.hasSeries && torrentSEData.episodes.length > 0 && (
                            <div style={s.torrentControlGroup}>
                                <span style={s.torrentControlLabel}>Episode</span>
                                <select
                                    style={s.torrentSelect}
                                    value={torrentFilterEpisode}
                                    onChange={e => { onFilterEpisodeChange(e.target.value); resetExpanded(); }}
                                >
                                    <option value="all">All</option>
                                    <option value="full">Full season</option>
                                    {torrentSEData.episodes.map(n => (
                                        <option key={n} value={n}>E{String(n).padStart(2, "0")}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <span style={s.torrentControlCount}>
                            {processedTorrentResults.length} / {torrentResults.length}
                        </span>
                    </div>

                    {processedTorrentResults.length === 0 && (
                        <div style={s.searchListStatus}>No torrents match the current filters.</div>
                    )}
                    {processedTorrentResults.map((result, idx) => (
                        <SearchResultRow
                            key={idx}
                            result={result}
                            isExpanded={expandedIndex === idx}
                            onToggle={() => setExpandedIndex(expandedIndex === idx ? null : idx)}
                            onDownload={onDownload}
                            isLogged={isLogged}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

const s = {
    torrentContainer: {
        display: "flex",
        flexDirection: "column",
        gap: 0,
    },
    torrentHeader: {
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 4px 10px",
        flexWrap: "wrap",
    },
    torrentControls: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "6px 2px 10px",
        borderBottom: "1px solid #21262d",
        marginBottom: 4,
    },
    torrentControlGroup: {
        display: "flex",
        alignItems: "center",
        gap: 5,
    },
    torrentControlLabel: {
        fontSize: "0.72rem",
        fontWeight: 600,
        color: "#8b949e",
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        whiteSpace: "nowrap",
    },
    torrentSelect: {
        background: "#0d1117",
        border: "1px solid #30363d",
        borderRadius: 5,
        color: "#c9d1d9",
        fontSize: "0.76rem",
        fontFamily: "'Inter', sans-serif",
        padding: "3px 7px",
        cursor: "pointer",
        outline: "none",
    },
    torrentControlCount: {
        marginLeft: "auto",
        fontSize: "0.76rem",
        color: "#484f58",
        whiteSpace: "nowrap",
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
};
