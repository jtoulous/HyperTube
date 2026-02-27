import api from "./client";

export const downloadsApi = {
    createDownload: (title, magnetLink, imdbId, torrentUrl = null) =>
        api.post("/downloads", {
            title,
            magnet_link: magnetLink || null,
            torrent_url: torrentUrl || null,
            imdb_id: imdbId,
        }),

    getDownloads: () => api.get("/downloads"),

    getDownloadProgress: (downloadId) => api.get(`/downloads/${downloadId}/progress`),

    getDownloadFiles: (downloadId) => api.get(`/downloads/${downloadId}/files`),
};
