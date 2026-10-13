// Shared HTTP client. Set VITE_API_URL in .env (see .env.example).
import axios from "axios";
import { getToken, signOut } from "../session.js";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

// attach the token to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// turn server errors into readable messages; log out on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && getToken()) {
      signOut();
      window.location.hash = "#/login";
    }
    const message =
      err.response?.data?.message ||
      (err.code === "ECONNABORTED" ? "The server took too long to respond." : null) ||
      (!err.response ? "Can't reach the server. Check the network connection." : "Something went wrong.");
    return Promise.reject(new Error(message));
  }
);
