import type { ReactNode } from "react";
import { Nav } from "./Nav";
import { Footer } from "./Footer";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="pt-16">{children}</main>
      <Footer />
    </>
  );
}
