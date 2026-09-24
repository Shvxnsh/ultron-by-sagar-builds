export const WAKE_WORD = "ultron";

export type VoiceCommand =
  | { type: "open"; target: "google" | "youtube" | "github" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "reset" }
  | { type: "gestures"; enabled: boolean }
  | { type: "help" }
  | { type: "unknown" };

const OPEN_TARGETS: Record<string, VoiceCommand> = {
  google: { type: "open", target: "google" },
  "google chrome": { type: "open", target: "google" },
  youtube: { type: "open", target: "youtube" },
  github: { type: "open", target: "github" },
};

export function hasWakeWord(transcript: string) {
  return new RegExp(`\\b${WAKE_WORD}\\b`, "i").test(transcript);
}

export function stripWakeWord(transcript: string) {
  return transcript
    .replace(new RegExp(`\\b${WAKE_WORD}\\b`, "gi"), "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseVoiceCommand(transcript: string): VoiceCommand {
  const text = stripWakeWord(transcript).toLowerCase();

  if (!text) return { type: "unknown" };

  for (const [target, command] of Object.entries(OPEN_TARGETS)) {
    if (text.includes(`open ${target}`) || text === target) return command;
  }

  if (/\b(zoom in|zoom up|bigger)\b/.test(text)) return { type: "zoom-in" };
  if (/\b(zoom out|zoom down|smaller)\b/.test(text)) return { type: "zoom-out" };
  if (/\b(reset|reset view|home view)\b/.test(text)) return { type: "reset" };
  if (/\b(turn|switch|enable|start) (on )?(gestures|gesture control)\b/.test(text)) {
    return { type: "gestures", enabled: true };
  }
  if (/\b(turn|switch|disable|stop) (off )?(gestures|gesture control)\b/.test(text)) {
    return { type: "gestures", enabled: false };
  }
  if (/\b(help|what can you do|commands)\b/.test(text)) return { type: "help" };
  return { type: "unknown" };
}

export function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function openSafeTarget(target: "google" | "youtube" | "github") {
  if (typeof window === "undefined") return;
  const urls = {
    google: "https://www.google.com",
    youtube: "https://www.youtube.com",
    github: "https://github.com",
  } as const;
  window.open(urls[target], "_blank", "noopener,noreferrer");
}
