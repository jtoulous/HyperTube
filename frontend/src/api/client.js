import axios from "axios";

const api = axios.create({
    baseURL: "/api/v1",
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

//  Token refresh machinery
let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(newToken) {
    refreshSubscribers.forEach(cb => cb(newToken));
    refreshSubscribers = [];
}

function addRefreshSubscriber(cb) {
    refreshSubscribers.push(cb);
}

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Only attempt refresh on 401, and not for the refresh call itself
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes("/auth/refresh")
        ) {
            originalRequest._retry = true;

            const currentToken = localStorage.getItem("token");
            if (!currentToken) {
                window.dispatchEvent(new Event("auth-logout"));
                return Promise.reject(error);
            }

            if (isRefreshing) {
                // Another refresh is in-flight — queue this request
                return new Promise((resolve) => {
                    addRefreshSubscriber((newToken) => {
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        resolve(api(originalRequest));
                    });
                });
            }

            isRefreshing = true;

            try {
                const res = await axios.post("/api/v1/auth/refresh", { token: currentToken });
                const { access_token, expires_at } = res.data;

                localStorage.setItem("token", access_token);
                localStorage.setItem("token_expires_at", String(expires_at));
                window.dispatchEvent(new CustomEvent("auth-refreshed", { detail: { access_token, expires_at } }));

                isRefreshing = false;
                onRefreshed(access_token);

                // Retry the original request with the new token
                originalRequest.headers.Authorization = `Bearer ${access_token}`;
                return api(originalRequest);
            } catch {
                isRefreshing = false;
                refreshSubscribers = [];
                localStorage.removeItem("token");
                localStorage.removeItem("token_expires_at");
                window.dispatchEvent(new Event("auth-logout"));
                return Promise.reject(error);
            }
        }

        // Non-401 errors pass through
        return Promise.reject(error);
    }
);

export default api;
