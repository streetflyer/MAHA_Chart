import { usePrefs } from "../state/prefs";
import { useScope } from "../state/scope";
import { askChoice } from "./Dialog";

/**
 * Called before the first change of an edit session: says which charts it will change and
 * lets the user switch. Resolves false when the user cancels the change.
 */
export async function scopeGate(): Promise<boolean> {
  const sc = useScope.getState();
  if (sc.reminded || !usePrefs.getState().scopeRemind) return true;
  const all = sc.scope === "all";
  const pick = await askChoice(
    all ? "Changes apply to ALL charts" : "Changes apply to THIS CHART only",
    `${all ? "This change will show on every chart." : "This change will show on this chart only; the other charts keep theirs."} F8 switches to All charts, F9 to This chart only; the switch is also in the bar at the top of the sheet.`,
    [
      all ? "Apply to all charts" : "Apply to this chart only",
      all ? "Switch to this chart only" : "Switch to all charts",
      "Apply, and don't remind me again",
    ],
  );
  if (pick === null) return false;
  useScope.setState({ reminded: true });
  if (pick === 1) useScope.getState().set(all ? "chart" : "all");
  if (pick === 2) usePrefs.getState().setScopeRemind(false);
  return true;
}
