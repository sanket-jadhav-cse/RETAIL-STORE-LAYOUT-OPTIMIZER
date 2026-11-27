import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResource } from "./queries";
import {
  destinations,
  screenFromUrl,
  selectionFromUrl,
  routeHash,
} from "./routes";
import { runPath } from "./api";
import Sidebar from "./Sidebar";
import Icon from "./Icon";
import { UserMenu } from "./UserMenu";
import { useTheme } from "./theme";
import { PageSkeleton, QueryError } from "./ui";
// These small, frequently used workspace pages share the initial private chunk.
// This removes a measured catalog → module-loading waterfall.
import WorkspacePage from "./WorkspacePages";
const DatasetUpload = lazy(() => import("./DatasetUpload"));
const AnalyticsPage = lazy(() => import("./AnalyticsPage"));
const Account = lazy(() => import("./Account"));

export default function App() {
  // AuthProvider remounts this tree for each account. No private cache survives it.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30000,
            retryDelay: 200,
            gcTime: 300000,
            refetchOnWindowFocus: false,
            retry: (n, e) =>
              n < 1 &&
              e.code !== "INVALID_RUN_ID" &&
              (!e.response || e.response.status >= 500),
          },
        },
      }),
  );
  const cleanup = useRef();
  useEffect(() => {
    clearTimeout(cleanup.current);
    return () => {
      cleanup.current = setTimeout(() => {
        client.cancelQueries();
        client.clear();
      }, 0);
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <AppShell />
    </QueryClientProvider>
  );
}
function AppShell() {
  const [screen, setScreen] = useState(screenFromUrl);
  const [datasetId, setDatasetId] = useState(() => selectionFromUrl("dataset"));
  const [runId, setRunId] = useState(() => selectionFromUrl("run"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setPreference] = useState(() => {
    try {
      return localStorage.getItem("retailSidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });
  const [theme, toggleTheme] = useTheme();
  const heading = useRef(null);
  const [focusPage, setFocusPage] = useState(false);
  const needsCatalog = [0, 1, 3, 4].includes(screen);
  const catalog = useResource(["datasets"], "/datasets", undefined, {
    enabled: needsCatalog,
  });
  const datasets = catalog.data || [];
  const selectedDatasetId = datasetId || datasets[0]?.dataset_id || "";
  const needsRun = [0, 4, 5, 6, 7].includes(screen);
  const initialHistory = useResource(
    ["runs", "recent", screen === 0 ? selectedDatasetId : "all"],
    "/runs",
    {
      page: 1,
      page_size: screen === 0 ? 5 : 1,
      dataset_id: screen === 0 ? selectedDatasetId || undefined : undefined,
    },
    {
      enabled:
        needsRun &&
        (screen === 0
          ? !!selectedDatasetId
          : !runId &&
            !datasets.find((d) => d.dataset_id === selectedDatasetId)
              ?.latest_run_id),
    },
  );
  const effectiveRunId =
    runId ||
    datasets.find((d) => d.dataset_id === selectedDatasetId)?.latest_run_id ||
    "" ||
    initialHistory.data?.items?.[0]?.run_id ||
    "";
  const runQuery = useResource(
    ["run", effectiveRunId],
    () => runPath(effectiveRunId),
    undefined,
    {
      enabled: needsRun && !!effectiveRunId,
      refetchInterval: (q) =>
        screen === 4 && ["Queued", "Running"].includes(q.state.data?.status)
          ? 1000
          : false,
    },
  );
  const run =
    screen === 0 &&
    runQuery.data?.dataset_id &&
    runQuery.data.dataset_id !== selectedDatasetId
      ? null
      : runQuery.data;
  useEffect(() => {
    if (runId && !datasetId && runQuery.data?.dataset_id)
      setDatasetId(runQuery.data.dataset_id);
  }, [runId, datasetId, runQuery.data?.dataset_id]);
  useEffect(() => {
    const restore = () => {
      setScreen(screenFromUrl());
      setDatasetId(selectionFromUrl("dataset"));
      setRunId(selectionFromUrl("run"));
      setMenuOpen(false);
      setFocusPage(true);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);
  useEffect(() => {
    document.title = `${destinations[screen][0]} · RetailAtlas`;
    if (focusPage) {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo?.({ top: 0, behavior: "instant" });
      setFocusPage(false);
    }
  }, [screen, focusPage]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function setCollapsed(value) {
    setPreference(value);
    try {
      localStorage.setItem("retailSidebarCollapsed", String(value));
    } catch {
      /* Optional preference. */
    }
  }
  function navigate(index, selection) {
    setScreen(index);
    history.pushState(
      null,
      "",
      routeHash(
        index,
        selection?.dataset_id ||
          selectionFromUrl("dataset") ||
          selectedDatasetId,
        selection?.run_id || selectionFromUrl("run") || effectiveRunId,
      ),
    );
    setMenuOpen(false);
    setFocusPage(true);
  }
  function chooseDataset(id) {
    setDatasetId(id);
    setRunId("");
    history.replaceState(null, "", routeHash(screen, id, ""));
  }
  function chooseRun(next) {
    setRunId(next.run_id);
    setDatasetId(next.dataset_id);
    history.replaceState(
      null,
      "",
      routeHash(screen, next.dataset_id, next.run_id),
    );
  }
  const dataset = datasets.find((d) => d.dataset_id === selectedDatasetId);
  const [name, , , title] = destinations[screen];
  const newRun = () => navigate(3);
  const action =
    screen === 1
      ? ["Upload Dataset", "upload", () => navigate(2)]
      : screen === 2
        ? ["Back to Datasets", "database", () => navigate(1)]
        : [0, 4].includes(screen)
          ? ["New Mining Run", "activity", newRun]
          : null;
  const catalogError = needsCatalog && catalog.isError;
  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Sidebar
        pages={destinations.map((d) => d[0])}
        icons={destinations.map((d) => d[2])}
        screen={screen}
        onNavigate={navigate}
        collapsed={collapsed}
        open={menuOpen}
        onOpenChange={setMenuOpen}
      />
      <div className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="icon-button desktop-sidebar-toggle"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-actions">
            <div className="breadcrumb">
              <span>Workspace</span>
              <span aria-hidden="true">/</span>
              <strong>{name}</strong>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
              onClick={toggleTheme}
            >
              <Icon name={theme === "light" ? "moon" : "sun"} />
            </button>
            <UserMenu onAccount={() => navigate(8)} />
          </div>
        </header>
        <main
          id="main-content"
          className={`main-content page-${destinations[screen][1].replaceAll("/", "-")}`}
        >
          <header className="page-header">
            <div>
              <h1 ref={heading} tabIndex="-1">
                {title}
              </h1>
            </div>
            {action && (
              <button
                key={screen}
                type="button"
                className={`button ${screen === 2 ? "secondary" : "primary"}`}
                onClick={action[2]}
              >
                <Icon name={action[1]} />
                {action[0]}
              </button>
            )}
          </header>
          <div className="page-content">
            {screen === 0 && runQuery.isError && (
              <QueryError query={runQuery} />
            )}
            {catalogError ? (
              <QueryError query={catalog} />
            ) : (
              <Suspense fallback={<PageSkeleton />}>
                {[0, 1, 3, 4].includes(screen) &&
                  (catalog.isPending ? (
                    <PageSkeleton />
                  ) : (
                    <WorkspacePage
                      screen={screen}
                      datasets={datasets}
                      dataset={dataset}
                      datasetId={selectedDatasetId}
                      onDataset={chooseDataset}
                      run={run}
                      runQuery={runQuery}
                      runId={effectiveRunId}
                      recent={initialHistory}
                      onRun={chooseRun}
                      onNavigate={navigate}
                    />
                  ))}
                {screen === 2 && (
                  <DatasetUpload
                    onReady={(d) => {
                      chooseDataset(d.dataset_id);
                    }}
                    onNavigate={navigate}
                  />
                )}
                {[5, 6, 7].includes(screen) && (
                  <AnalyticsPage
                    key={screen}
                    screen={screen}
                    run={run}
                    runId={effectiveRunId}
                    runQuery={runQuery}
                    historyQuery={initialHistory}
                    onRun={chooseRun}
                    onNavigate={navigate}
                  />
                )}
                {screen === 8 && (
                  <Account
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                    theme={theme}
                    toggleTheme={toggleTheme}
                  />
                )}
              </Suspense>
            )}
          </div>
          <footer className="page-footer">
            <span>RetailAtlas · Retail Store Layout Optimizer</span>
            <span>
              <Icon name="shield" />
              Evidence-based planning
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
