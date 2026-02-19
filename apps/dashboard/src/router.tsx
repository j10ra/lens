import { createBrowserRouter } from "react-router";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <div className="p-4 text-lg font-semibold">Overview</div>,
  },
  {
    path: "/repos",
    element: <div className="p-4 text-lg font-semibold">Repos</div>,
  },
  {
    path: "/repos/:repoId",
    element: <div className="p-4 text-lg font-semibold">RepoDetail</div>,
  },
  {
    path: "/traces",
    element: <div className="p-4 text-lg font-semibold">Traces</div>,
  },
]);
