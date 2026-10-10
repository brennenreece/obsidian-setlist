export interface SetlistSettings {
  setlistFolder: string;
  songFolder: string;
  fontSize: number;
  theme: "dark" | "light";
  tapZones: boolean;
  wakeLock: boolean;
}

export const DEFAULT_SETTINGS: SetlistSettings = {
  setlistFolder: "Setlists",
  songFolder: "Songs",
  fontSize: 28,
  theme: "dark",
  tapZones: true,
  wakeLock: true,
};
