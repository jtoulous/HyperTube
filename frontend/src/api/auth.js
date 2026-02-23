import api from "./client";

export const authApi = {
  login: (data) => api.post("/auth/login", data),

  register: (data) => api.post("/auth/register", data),

  forgotPassword: (data) => api.post("/auth/forgot-password", data),

  resetPassword: (data) => api.post("/auth/reset-password", data),

  oauth42: () => {
    // TODO: redirect to 42 OAuth authorization URL
    window.location.href = "/auth/42/authorize";
  },

  oauthGithub: () => {
    // TODO: redirect to Google OAuth authorization URL
    window.location.href = "/auth/github/authorize";
  },

  getMe: () => api.get("/users/me"),
};
