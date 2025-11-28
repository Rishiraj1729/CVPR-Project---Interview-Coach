import tailwindcss from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#111827",
        panel: "#1f2937",
        accent: "#38bdf8"
      }
    }
  },
  plugins: []
};

