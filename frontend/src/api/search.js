import api from "./client";

export const searchApi = {
    // Jackett torrent search
    search: (query, tmdbId) => api.get("/search", { params: { query, ...(tmdbId ? { tmdb_id: tmdbId } : {}) } }),

    // TMDB title search
    searchTmdb: (query, page = 1) => api.get("/search/tmdb", { params: { query, page } }),

    getMediaDetails: (imdbId) => api.get(`/search/media/${imdbId}`),

    browseMedia: (params) => api.get("/search/browse", { params }),
};
