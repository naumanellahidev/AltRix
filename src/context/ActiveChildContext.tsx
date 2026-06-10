import { createContext, useContext, useMemo, useState, useEffect, ReactNode } from "react";
import { ChildInfo } from "@/hooks/useMyChildren";

interface ActiveChildContextValue {
  activeChild: ChildInfo | null;
  setActiveChild: (child: ChildInfo | null) => void;
  children: ChildInfo[];
}

const ActiveChildContext = createContext<ActiveChildContextValue | null>(null);

const STORAGE_KEY = "altrix_active_child_id";

interface ProviderProps {
  schoolId: string | null;
  childList: ChildInfo[];
  children: ReactNode;
}

export function ActiveChildProvider({ schoolId, childList, children }: ProviderProps) {
  const [activeChild, setActiveChildState] = useState<ChildInfo | null>(null);

  // Hydrate from localStorage / first child
  useEffect(() => {
    if (!childList.length) {
      setActiveChildState(null);
      return;
    }
    const storageKey = `${STORAGE_KEY}:${schoolId ?? "_"}`;
    let nextId: string | null = null;
    try {
      nextId = localStorage.getItem(storageKey);
    } catch {
      // ignore
    }
    const found = nextId ? childList.find((c) => c.student_id === nextId) : null;
    setActiveChildState(found ?? childList[0]);
  }, [childList, schoolId]);

  const setActiveChild = (child: ChildInfo | null) => {
    setActiveChildState(child);
    try {
      const storageKey = `${STORAGE_KEY}:${schoolId ?? "_"}`;
      if (child?.student_id) localStorage.setItem(storageKey, child.student_id);
      else localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  const value = useMemo<ActiveChildContextValue>(
    () => ({ activeChild, setActiveChild, children: childList }),
    [activeChild, childList],
  );

  return <ActiveChildContext.Provider value={value}>{children}</ActiveChildContext.Provider>;
}

export function useActiveChild() {
  const ctx = useContext(ActiveChildContext);
  if (!ctx) {
    return { activeChild: null, setActiveChild: () => {}, children: [] as ChildInfo[] };
  }
  return ctx;
}
