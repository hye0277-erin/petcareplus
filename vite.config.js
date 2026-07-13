import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/petcareplus/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["images/logo.svg"],
      manifest: {
        name: "PetCare+",
        short_name: "PetCare+",
        description: "PetCare+ 반려동물 관리 앱",
        start_url: "/petcareplus/",
        scope: "/petcareplus/",
        display: "standalone",
        background_color: "#F4F6F2",
        theme_color: "#F4F6F2",
        icons: [
          {
            src: "images/logo.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
  },
});
