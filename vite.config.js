import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/petcareplus/",
  plugins: [react()],
  server: {
    host: true,
  },
});
