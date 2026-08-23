import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: "#1A1A1A",
        body: "#4A4A4A",
        muted: "#8A8A8A",
        line: "#E5E5E3",
        "line-soft": "#EDEDEB",
        surface: "#F1F4F2",
        brand: "#14542E",
        "brand-soft": "#F1F4F2",
        danger: "#DC2626",
        // 역할 배지. .fig가 투자자와 운영자를 이 두 색으로 나눈다.
        "accent-investor": "#207349",
        "accent-operator": "#8C6114",
      },
      fontFamily: {
        num: ["Inter", "Pretendard Variable", "sans-serif"],
      },
      // Figma 실측 크기. rem이므로 루트 폰트 크기 하나로 전체를 조절한다.
      fontSize: {
        "11": ["0.6875rem", { lineHeight: "1rem" }],
        "12": ["0.75rem", { lineHeight: "1.125rem" }],
        "13": ["0.8125rem", { lineHeight: "1.25rem" }],
        "14": ["0.875rem", { lineHeight: "1.375rem" }],
        "15": ["0.9375rem", { lineHeight: "1.5rem" }],
        "16": ["1rem", { lineHeight: "1.5rem" }],
        "17": ["1.0625rem", { lineHeight: "1.625rem" }],
        "18": ["1.125rem", { lineHeight: "1.75rem" }],
        "20": ["1.25rem", { lineHeight: "1.75rem" }],
        "22": ["1.375rem", { lineHeight: "1.875rem" }],
        "24": ["1.5rem", { lineHeight: "2rem" }],
        "28": ["1.75rem", { lineHeight: "2.25rem" }],
      },
      borderRadius: {
        "4": "0.25rem",
        "6": "0.375rem",
        "8": "0.5rem",
        "10": "0.625rem",
        "12": "0.75rem",
        "14": "0.875rem",
      },
      maxWidth: {
        shell: "90rem", // 1440
        panel: "45.625rem", // 730
        modal: "29.0625rem", // 465
      },
    },
  },
  plugins: [],
};
export default config;
