import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig(({ mode }) => ({
  base: process.env.GITHUB_PAGES === "true" ? "/photogram/" : "/",
  plugins: mode === "https" ? [react(), basicSsl()] : [react()],
}));
