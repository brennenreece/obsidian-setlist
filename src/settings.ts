export interface SetlistSettings {
  setlistFolder: string;
  songFolder: string;
  fontSize: number;
  theme: "dark" | "light";
  columns: 1 | 2;
  fitToScreen: boolean;
  geminiApiKey: string;
  geminiModel: string;
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
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash",
  tapZones: true,
  wakeLock: true,
};
