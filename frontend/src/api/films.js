import api from "./client";

export const filmsApi = {
    /** All films on the server (downloading + completed), with can_watch info */
    getFilms: () => api.get("/films"),

    /** Video files for a specific film (by IMDb ID) */
    getFilmFiles: (imdbId) => api.get(`/films/${imdbId}/files`),

    getWatchedIds: () => api.get("/films/watched"),

    markWatched: (imdbId, stoppedAt = 0) =>
        api.post("/films/watched", { imdb_id: imdbId, stopped_at: stoppedAt }),

    updateProgress: (imdbId, stoppedAt) =>
        api.put("/films/watched/progress", { imdb_id: imdbId, stopped_at: stoppedAt }),

    unmarkWatched: (imdbId) => api.delete(`/films/watched/${imdbId}`),

    /** Comments */
    getComments: (imdbId) => api.get(`/films/${imdbId}/comments`),
    addComment: (imdbId, text) => api.post(`/films/${imdbId}/comments`, { text }),
    updateComment: (commentId, text) => api.patch(`/comments/${commentId}`, { text }),
    deleteComment: (commentId) => api.delete(`/comments/${commentId}`),
};
