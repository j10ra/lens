import { createBrowserRouter } from "react-router";
import { RootLayout } from "./components/RootLayout.js";
import { Overview } from "./pages/Overview.js";

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
        element: <div className="p-4 text-lg font-semibold">Repos</div>,
      },
      {
        path: "repos/:repoId",
        element: <div className="p-4 text-lg font-semibold">RepoDetail</div>,
      },
      {
        path: "traces",
        element: <div className="p-4 text-lg font-semibold">Traces</div>,
      },
    ],
  },
]);
