import axios from "axios";

const api = axios.create({
    baseURL: "/api/v1",
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem("token");
    console.log("[API] Token from localStorage:", token ? "✓ Present" : "✗ Missing");
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log("[API] Setting Authorization header");
    } else {
        console.warn("[API] No token found in localStorage!");
    }
    return config;
});

export default api;
