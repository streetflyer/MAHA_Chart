import { create } from "zustand";

export type Scope = "all" | "chart";

/**
 * "Changes apply to: All charts | This chart only" (F8 / F9). All charts unless the user
 * switches; back to All charts whenever an edit mode ends. `reminded` is set once the user
 * has been told which one is on during this edit session.
 */
export const useScope = create<{
  scope: Scope;
  reminded: boolean;
  set(scope: Scope): void;
  reset(): void;
}>((set) => ({
  scope: "all",
  reminded: false,
  set: (scope) => set({ scope }),
  reset: () => set({ scope: "all", reminded: false }),
}));
