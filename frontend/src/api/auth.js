import api from "./client";

export const authApi = {
    login: (data) => api.post("/auth/login", data),

    register: (data) => api.post("/auth/register", data),

    forgotPassword: (data) => api.post("/auth/forgot-password", data),

    resetPassword: (data) => api.post("/auth/reset-password", data),

    oauth42: () => {
        const clientId = import.meta.env.VITE_FORTYTWO_UID;
        const redirectUri = window.location.origin + '/oauth-callback/42';
        const apiUrl = 'https://api.intra.42.fr/oauth/authorize?client_id=' + clientId + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code';

        window.location.href = apiUrl;
    },

    oauthGithub: () => {
        const clientId = import.meta.env.VITE_GITHUB_UID;
        const redirectUri = window.location.origin + '/oauth-callback/github';
        const apiUrl = 'https://github.com/login/oauth/authorize?client_id=' + clientId + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&scope=user:email';

        window.location.href = apiUrl;
    },

    oauthDiscord: () => {
        const clientId = import.meta.env.VITE_DISCORD_UID;
        const redirectUri = window.location.origin + '/oauth-callback/discord';
        const apiUrl = 'https://discord.com/api/oauth2/authorize?client_id=' + clientId + '&redirect_uri=' + encodeURIComponent(redirectUri) + '&response_type=code&scope=identify%20email';

        window.location.href = apiUrl;
    },

    oauthCallback: (provider, data) => api.post(`/auth/oauth-callback/${provider}`, data),

    getMe: () => api.get("/users/me"),
};
