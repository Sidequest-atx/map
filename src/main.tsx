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
const GetApp = lazy(() => import("./pages/GetApp"));
const SignIn = lazy(() => import("./pages/app/SignIn"));
const Portal = lazy(() => import("./pages/Portal"));

const S = (el: React.ReactNode) => <Suspense fallback={<PageLoading />}>{el}</Suspense>;

// Photos are captured in the iPhone app only; the website is the public map
// and the moderator portal. Old /app/report and /app/drive links land on /app.
const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: "/", element: S(<Mission />) },
      { path: "/map", element: S(<MapExplorer />) },
      { path: "/how", element: S(<How />) },
      { path: "/data", element: S(<Data />) },
      { path: "/app", element: S(<GetApp />) },
      { path: "/app/report", element: <Navigate to="/app" replace /> },
      { path: "/app/drive", element: <Navigate to="/app" replace /> },
    ],
  },
  {
    element: <AppLayout />,
    children: [
      { path: "/app/signin", element: S(<SignIn />) },
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
