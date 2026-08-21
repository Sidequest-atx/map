import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { NotFound, PageLoading } from "./components/Bits";
import { RequireRole } from "./components/RequireRole";
import { AppLayout } from "./layouts/AppLayout";
import { SiteLayout } from "./layouts/SiteLayout";
import "./styles/global.css";

const Mission = lazy(() => import("./pages/Mission"));
const MapExplorer = lazy(() => import("./pages/MapExplorer"));
const How = lazy(() => import("./pages/How"));
const Data = lazy(() => import("./pages/Data"));
const AppHome = lazy(() => import("./pages/app/Home"));
const SignIn = lazy(() => import("./pages/app/SignIn"));
const Report = lazy(() => import("./pages/app/Report"));
const Drive = lazy(() => import("./pages/app/Drive"));
const Portal = lazy(() => import("./pages/Portal"));

const S = (el: React.ReactNode) => <Suspense fallback={<PageLoading />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: "/", element: import.meta.env.VITE_SURFACE === "app" ? <Navigate to="/app" replace /> : S(<Mission />) },
      { path: "/map", element: S(<MapExplorer />) },
      { path: "/how", element: S(<How />) },
      { path: "/data", element: S(<Data />) },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: "/app", element: S(<AppHome />) },
      { path: "/app/signin", element: S(<SignIn />) },
      {
        path: "/app/report",
        element: S(
          <RequireRole role="reporter">
            <Report />
          </RequireRole>,
        ),
      },
      {
        path: "/app/drive",
        element: S(
          <RequireRole role="drive-captain">
            <Drive />
          </RequireRole>,
        ),
      },
      {
        path: "/portal",
        element: S(
          <RequireRole role="moderator">
            <Portal />
          </RequireRole>,
        ),
      },
    ],
  },
  { path: "*", element: <SiteLayout />, children: [{ path: "*", element: <NotFound /> }] },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* offline shell is an enhancement */
    });
  });
}
