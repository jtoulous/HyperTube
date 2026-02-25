import api from "./client";

export const usersApi = {
    getMe: () => api.get("/users/me"),

    getUser: (userId) => api.get(`/users/${userId}`),

    searchUser: (username) => api.get(`/users/search/${username}`),

    updateProfile: (data) => api.put("/users/me", data),

    changePassword: (data) => api.put("/users/me/password", data),
};
