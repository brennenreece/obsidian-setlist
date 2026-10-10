export interface SetlistSettings {
  setlistFolder: string;
  fontSize: number;
  theme: "dark" | "light";
  tapZones: boolean;
  wakeLock: boolean;
}

export const DEFAULT_SETTINGS: SetlistSettings = {
  setlistFolder: "Setlists",
  fontSize: 28,
  theme: "dark",
  tapZones: true,
  wakeLock: true,
};
