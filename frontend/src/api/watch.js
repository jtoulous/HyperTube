import api from "./client";

export const watchApi = {
    /**
     * Save the user's current watch position for a film.
     * If near the end (last 5 min), backend marks it as completed.
     */
    saveProgress: (downloadId, position, duration) =>
        api.post("/watch/progress", {
            download_id: downloadId,
            position,
            duration,
        }),

    /**
     * Get the current user's watch progress for a specific film.
     */
    getProgress: (downloadId) =>
        api.get(`/watch/progress/${downloadId}`),

    /**
     * Get the user's full watch history (dict mapping download_id → progress info).
     */
    getHistory: () => api.get("/watch/history"),
};
