import api from "./client";

export const searchApi = {
    search: (query) => api.get("/search", { params: { query } }),

    getMediaDetails: (imdbId) => api.get(`/search/media/${imdbId}`),
};
