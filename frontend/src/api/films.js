import api from "./client";

export const filmsApi = {
    getFilms: () => api.get("/films"), // All films in the library

    getFilmFiles: (imdbId) => api.get(`/films/${encodeURIComponent(imdbId)}/files`), // Video files for a specific film

    getFilmTorrents: (imdbId) => api.get(`/films/${encodeURIComponent(imdbId)}/torrents`), // All torrents for a film, with live qBittorrent status

    getWatchedIds: () => api.get("/films/watched"),

    markWatched: (imdbId, stoppedAt = 0) =>
        api.post("/films/watched", { imdb_id: imdbId, stopped_at: stoppedAt }),

    updateProgress: (imdbId, stoppedAt) =>
        api.put("/films/watched/progress", { imdb_id: imdbId, stopped_at: stoppedAt }),

    unmarkWatched: (imdbId) => api.delete(`/films/watched/${encodeURIComponent(imdbId)}`),

    // Comments
    getComments: (imdbId) => api.get(`/films/${imdbId}/comments`),
    addComment: (imdbId, text) => api.post(`/films/${imdbId}/comments`, { text }),
    updateComment: (commentId, text) => api.patch(`/comments/${commentId}`, { text }),
    deleteComment: (commentId) => api.delete(`/comments/${commentId}`),
};
