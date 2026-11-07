import * as React from "react";

type ThemeContextValue = {
  theme?: string;
  resolvedTheme?: string;
  setTheme: (theme: string) => void;
};

const ThemeContext = React.createContext<ThemeContextValue>({ setTheme() {} });

export function ThemeProvider({ children, defaultTheme = "system" }: { children: React.ReactNode; attribute?: string; defaultTheme?: string; enableSystem?: boolean; disableTransitionOnChange?: boolean }) {
  const [theme, setTheme] = React.useState(defaultTheme);
  const [systemDark, setSystemDark] = React.useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  React.useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  }, [resolvedTheme]);

  const value = React.useMemo(() => ({ theme, resolvedTheme, setTheme }), [resolvedTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
