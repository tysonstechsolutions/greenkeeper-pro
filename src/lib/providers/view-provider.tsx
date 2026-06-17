"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

/**
 * App view ("hat"). The app has no roles anymore — what you see is driven by
 * the view you pick, not by who you are. Both views read/write the same data.
 *   - "super" → Superintendent: turf & crew operations (the original app)
 *   - "gm"    → General Manager: budget, purchase requests, reports, admin
 */
export type AppView = "super" | "gm";

const STORAGE_KEY = "gk_view";

interface ViewContextValue {
  /** Current view. Defaults to "super" until the user picks one. */
  view: AppView;
  /** Has the user chosen a view yet? (false → show the first-run picker) */
  chosen: boolean;
  /** Hydration finished — safe to render view-dependent UI without an SSR flash. */
  ready: boolean;
  setView: (v: AppView) => void;
  /** Home route for a given view ("/dashboard" vs "/gm"). */
  homeFor: (v: AppView) => string;
}

interface ViewState {
  view: AppView;
  chosen: boolean;
  ready: boolean;
}

function homeFor(v: AppView): string {
  return v === "gm" ? "/gm" : "/dashboard";
}

const ViewContext = createContext<ViewContextValue>({
  view: "super",
  chosen: false,
  ready: false,
  setView: () => {},
  homeFor,
});

export function ViewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewState>({
    view: "super",
    chosen: false,
    ready: false,
  });

  // One-time hydration of the persisted view from localStorage. Runs after
  // mount (SSR has no localStorage), so it must setState once here.
  useEffect(() => {
    let next: ViewState = { view: "super", chosen: false, ready: true };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "super" || stored === "gm") {
        next = { view: stored, chosen: true, ready: true };
      }
    } catch {
      // localStorage unavailable — fall back to the default (super), unchosen.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time localStorage hydration
    setState(next);
  }, []);

  const setView = useCallback((v: AppView) => {
    setState((s) => ({ ...s, view: v, chosen: true }));
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      // ignore — view still applies for this session
    }
  }, []);

  return (
    <ViewContext.Provider
      value={{
        view: state.view,
        chosen: state.chosen,
        ready: state.ready,
        setView,
        homeFor,
      }}
    >
      {children}
    </ViewContext.Provider>
  );
}

export function useView() {
  return useContext(ViewContext);
}
