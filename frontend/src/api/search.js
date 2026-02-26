import api from "./client";

export const searchApi = {
    // Jackett torrent search — use after user picks a movie from TMDB thumbnails
    search: (query) => api.get("/search", { params: { query } }),

    // TMDB title search — returns thumbnail-ready cards (poster, title, year, rating)
    searchTmdb: (query, page = 1) => api.get("/search/tmdb", { params: { query, page } }),

    getMediaDetails: (imdbId) => api.get(`/search/media/${imdbId}`),

    browseMedia: (params) => api.get("/search/browse", { params }),
};
