import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout.js";
import { Overview } from "./pages/Overview.js";
import { Repos } from "./pages/Repos.js";
import { Traces } from "./pages/Traces.js";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Overview />,
      },
      {
        path: "repos",
        element: <Repos />,
      },
      {
        path: "repos/:repoId",
        element: <div className="p-4 text-lg font-semibold">RepoDetail</div>,
      },
      {
        path: "traces",
        element: <Traces />,
      },
    ],
  },
]);
