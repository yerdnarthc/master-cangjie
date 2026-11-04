"use client";

import { createContext, useContext, useSyncExternalStore, type CSSProperties } from "react";

export type ChoiceboxTheme = "dark" | "light";
const ThemeContext = createContext<ChoiceboxTheme | undefined>(undefined);

function getThemeSnapshot(): ChoiceboxTheme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function useThemeContext(): ChoiceboxTheme {
  const provided = useContext(ThemeContext);
  const current = useSyncExternalStore(subscribeTheme, getThemeSnapshot, (): ChoiceboxTheme => "dark");
  return provided ?? current;
}

export function ChoiceboxThemeProvider({
  value,
  children,
}: {
  value: ChoiceboxTheme;
  children: React.ReactNode;
}) {
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function usePal(_theme: ChoiceboxTheme) {
  return {
    accent: "var(--primary)",
    accentBg: "color-mix(in oklch, var(--primary) 12%, var(--card))",
    bgSubtle: "var(--card)",
    text: "var(--foreground)",
    textSecondary: "var(--muted-foreground)",
    textTertiary: "var(--muted-foreground)",
    textMuted: "var(--muted-foreground)",
    border: "var(--border)",
  } as const;
}

export const tokens = {
  radius: { md: "var(--radius-md)" },
  type: {
    sm: { fontFamily: "var(--font-sans)", fontSize: "0.875rem", lineHeight: 1.45 } satisfies CSSProperties,
    xs: { fontFamily: "var(--font-sans)", fontSize: "0.75rem", lineHeight: 1.4 } satisfies CSSProperties,
  },
  weight: { medium: 550 },
  font: { mono: "var(--font-mono)" },
} as const;

export const motion = {
  normal: "180ms",
  smooth: "140ms",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
} as const;

export const interactiveBase: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  minHeight: 44,
  border: "1px solid transparent",
  margin: 0,
  color: "var(--foreground)",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
