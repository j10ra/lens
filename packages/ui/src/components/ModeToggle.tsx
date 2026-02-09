import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "./ui/button";
import { SidebarMenuButton } from "./ui/sidebar";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, () => setDark((d) => !d)] as const;
}

export function ModeToggle({ variant = "sidebar" }: { variant?: "sidebar" | "button" }) {
  const [dark, toggle] = useDarkMode();

  if (variant === "button") {
    return (
      <Button variant="ghost" size="icon" className="size-7" onClick={toggle}>
        {dark ? <Sun /> : <Moon />}
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  return (
    <SidebarMenuButton onClick={toggle}>
      {dark ? <Sun /> : <Moon />}
      <span>{dark ? "Light mode" : "Dark mode"}</span>
    </SidebarMenuButton>
  );
}
