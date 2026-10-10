import { create } from "zustand";
import { persist } from "zustand/middleware";

import { getModel, MODEL_REGISTRY } from "@/lib/llm/models";
import type { MasterResume } from "@/lib/types/resume";

interface GatewayState {
  /** `null` until the user picks one; the registry default applies. */
  activeModelId: string | null;
  setActiveModel: (modelId: string) => void;
}

/**
 * The model choice is kept in this browser's localStorage. Hydration is
 * deferred (`skipHydration`) so the first client render matches the server;
 * the top bar rehydrates once mounted.
 */
export const useGatewayStore = create<GatewayState>()(
  persist(
    (set) => ({
      activeModelId: null,
      setActiveModel: (modelId) => set({ activeModelId: modelId }),
    }),
    {
      name: "applyos:model",
      skipHydration: true,
      partialize: (state) => ({ activeModelId: state.activeModelId }),
      // A stored id may name a model that has since left the registry.
      merge: (persisted, current) => {
        const id = (persisted as { activeModelId?: unknown } | null)
          ?.activeModelId;
        return {
          ...current,
          activeModelId: typeof id === "string" && getModel(id) ? id : null,
        };
      },
    },
  ),
);

export interface ModelConfig {
  modelId: string;
  fallbackModelIds: string[];
}

/** The selected model, with every other registry model as a fallback. */
export function useModelConfig(): ModelConfig {
  const activeModelId = useGatewayStore((state) => state.activeModelId);
  const modelId = activeModelId ?? MODEL_REGISTRY.defaultModelId;
  return {
    modelId,
    fallbackModelIds: MODEL_REGISTRY.models
      .map((model) => model.id)
      .filter((id) => id !== modelId),
  };
}

/** A point in the draft's history. `null` means "the saved version". */
type DraftSnapshot = MasterResume | null;

const HISTORY_LIMIT = 100;
/** Keystrokes closer together than this are one undo step. */
const COALESCE_MS = 700;

interface ResumeDraftState {
  /** `master_resumes.id` the draft was started from. */
  baseId: string | null;
  /** Unsaved edits, or `null` when the editor shows the saved version. */
  draft: DraftSnapshot;
  past: DraftSnapshot[];
  future: DraftSnapshot[];
  lastEditAt: number;
  /**
   * Replaces the draft and records the previous state for undo. With
   * `coalesce`, edits made in quick succession share one undo step.
   */
  setDraft: (
    baseId: string,
    draft: DraftSnapshot,
    options?: { coalesce?: boolean },
  ) => void;
  undo: () => void;
  redo: () => void;
  /** Puts a draft in place without history, e.g. one restored after a reload. */
  restore: (baseId: string, draft: MasterResume) => void;
  /** Forgets the draft and its history, e.g. once a new version is saved. */
  clearDraft: () => void;
}

/**
 * Unsaved edits to the master resume, with undo and redo. Nothing is ever
 * thrown away by an edit, an import or a discard: each one pushes the
 * previous state onto `past`. Nothing here reaches the database until the
 * user saves a new version.
 */
export const useResumeDraftStore = create<ResumeDraftState>((set) => ({
  baseId: null,
  draft: null,
  past: [],
  future: [],
  lastEditAt: 0,
  setDraft: (baseId, draft, options) =>
    set((state) => {
      const now = Date.now();
      // A different saved version is a different document: start over.
      if (state.baseId !== baseId) {
        return { baseId, draft, past: [null], future: [], lastEditAt: now };
      }
      const coalesce =
        options?.coalesce === true &&
        state.past.length > 0 &&
        now - state.lastEditAt < COALESCE_MS;
      return {
        draft,
        past: coalesce
          ? state.past
          : [...state.past, state.draft].slice(-HISTORY_LIMIT),
        future: [],
        lastEditAt: now,
      };
    }),
  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      return {
        draft: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future],
        lastEditAt: 0,
      };
    }),
  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      return {
        draft: state.future[0],
        past: [...state.past, state.draft],
        future: state.future.slice(1),
        lastEditAt: 0,
      };
    }),
  restore: (baseId, draft) =>
    set({ baseId, draft, past: [null], future: [], lastEditAt: 0 }),
  clearDraft: () =>
    set({ baseId: null, draft: null, past: [], future: [], lastEditAt: 0 }),
}));

/** Where the unsaved draft is mirrored so a reload or crash does not lose it. */
export const resumeDraftStorageKey = (userId: string) => `applyos:draft:${userId}`;
