export interface SetlistSettings {
  setlistFolder: string;
  songFolder: string;
  fontSize: number;
  theme: "dark" | "light";
  columns: 1 | 2;
  fitToScreen: boolean;
  tapZones: boolean;
  wakeLock: boolean;
}

export const DEFAULT_SETTINGS: SetlistSettings = {
  setlistFolder: "Setlists",
  songFolder: "Songs",
  fontSize: 28,
  theme: "dark",
  columns: 1,
  fitToScreen: false,
  tapZones: true,
  wakeLock: true,
};
