"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createOrbScene, type OrbSceneApi } from "@/lib/orbScene";
import { HandTracker, type TrackerStatus } from "@/lib/handTracker";
import { hasWakeWord, openSafeTarget, parseVoiceCommand, speak, stripWakeWord } from "@/lib/voiceCommands";

type CameraState = "off" | "starting" | "on" | "error";
type VoiceState = "off" | "starting" | "waiting" | "active" | "error";
type SpeechEvent = { results: ArrayLike<{ 0: { transcript: string }; length: number }> };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: SpeechEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };
type RecognitionConstructor = new () => Recognition;

declare global { interface Window { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor } }

const MODE_LABEL: Record<TrackerStatus["mode"], string> = { idle: "STANDBY", spin: "SPIN", zoom: "ZOOM" };

export default function JarvisOrb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<OrbSceneApi | null>(null);
  const trackerRef = useRef<HandTracker | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const voiceRunningRef = useRef(false);
  const listeningForCommandRef = useRef(false);

  const [camera, setCamera] = useState<CameraState>("off");
  const [status, setStatus] = useState<TrackerStatus>({ hands: 0, mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceState>("off");
  const [lastTranscript, setLastTranscript] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scene = createOrbScene(container);
    sceneRef.current = scene;
    return () => { trackerRef.current?.stop(); recognitionRef.current?.stop(); scene.dispose(); };
  }, []);

  const stopGestures = useCallback(() => { trackerRef.current?.stop(); trackerRef.current = null; setCamera("off"); setStatus({ hands: 0, mode: "idle" }); }, []);
  const startGestures = useCallback(async () => {
    const video = videoRef.current; const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;
    setCamera("starting"); setError(null);
    const tracker = new HandTracker(video, overlay, { onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp), onZoom: factor => sceneRef.current?.zoomBy(factor), onStatus: setStatus });
    trackerRef.current = tracker;
    try { await tracker.start(); setCamera("on"); }
    catch (err) { trackerRef.current = null; tracker.stop(); setCamera("error"); setError(err instanceof DOMException && err.name === "NotAllowedError" ? "CAMERA ACCESS DENIED" : "TRACKING INIT FAILED"); }
  }, []);
  const toggleGestures = useCallback(() => { if (trackerRef.current) stopGestures(); else void startGestures(); }, [startGestures, stopGestures]);

  const runVoiceCommand = useCallback((transcript: string) => {
    const command = parseVoiceCommand(transcript);
    switch (command.type) {
      case "open": openSafeTarget(command.target); speak(`Opening ${command.target}.`); break;
      case "zoom-in": sceneRef.current?.zoomIn(); speak("Zooming in."); break;
      case "zoom-out": sceneRef.current?.zoomOut(); speak("Zooming out."); break;
      case "reset": sceneRef.current?.resetView(); speak("View reset."); break;
      case "gestures": if (command.enabled && !trackerRef.current) void startGestures(); if (!command.enabled && trackerRef.current) stopGestures(); speak(command.enabled ? "Gestures enabled." : "Gestures disabled."); break;
      case "help": speak("Say open Google, zoom in, zoom out, reset, or turn gestures on."); break;
      default: speak("I did not recognize that command.");
    }
  }, [startGestures, stopGestures]);

  const startVoice = useCallback(() => {
    if (voiceRunningRef.current) return;
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Constructor) { setVoice("error"); setError("VOICE RECOGNITION NEEDS CHROME OR EDGE"); return; }
    const recognition = new Constructor();
    recognition.continuous = true; recognition.interimResults = false; recognition.lang = "en-US";
    recognition.onresult = event => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      setLastTranscript(transcript);
      if (!listeningForCommandRef.current) {
        if (!hasWakeWord(transcript)) return;
        listeningForCommandRef.current = true; setVoice("active"); speak("Yes, I am listening.");
        const command = stripWakeWord(transcript); if (command) { runVoiceCommand(command); listeningForCommandRef.current = false; setVoice("waiting"); }
        return;
      }
      runVoiceCommand(transcript); listeningForCommandRef.current = false; setVoice("waiting");
    };
    recognition.onerror = event => { if (event.error !== "aborted" && event.error !== "no-speech") setError(`VOICE ERROR: ${event.error.toUpperCase()}`); };
    recognition.onend = () => { if (voiceRunningRef.current) { try { recognition.start(); } catch {} } };
    recognitionRef.current = recognition; voiceRunningRef.current = true; setVoice("starting"); setError(null);
    try { recognition.start(); setVoice("waiting"); speak("Ultron is ready. Say Ultron to activate me."); } catch { voiceRunningRef.current = false; setVoice("error"); setError("MICROPHONE START FAILED"); }
  }, [runVoiceCommand]);

  const stopVoice = useCallback(() => { voiceRunningRef.current = false; listeningForCommandRef.current = false; recognitionRef.current?.stop(); recognitionRef.current = null; setVoice("off"); setLastTranscript(""); }, []);

  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "=" || event.key === "+") sceneRef.current?.zoomIn(); else if (event.key === "-" || event.key === "_") sceneRef.current?.zoomOut(); else if (event.key.toLowerCase() === "r") sceneRef.current?.resetView(); else if (event.key.toLowerCase() === "g") toggleGestures(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [toggleGestures]);

  const cameraOn = camera === "on"; const voiceOn = voice !== "off" && voice !== "error";
  return <>
    <div ref={containerRef} className={`orb-root${voice === "active" ? " orb-awake" : ""}`} />
    <div className="overlay-vignette" /><div className="overlay-grain" /><div className="overlay-scanlines" />
    <div className="hud hud-title">U.L.T.R.O.N.</div>
    <div className="hud hud-hint"><div><span className="key">DRAG</span> spin&nbsp;&nbsp;<span className="key">SCROLL</span> zoom</div><div><span className="key">G</span> gestures&nbsp;&nbsp;<span className="key">R</span> reset&nbsp;&nbsp;<span className="key">+/−</span> zoom</div></div>
    <div className="hud hud-controls">
      <div className={`voice-panel${voiceOn ? " visible" : ""}`}><div className="voice-status">{voice === "active" ? "ULTRON ACTIVE · LISTENING" : voice === "starting" ? "INITIALIZING VOICE…" : "SAY ULTRON TO ACTIVATE"}</div>{lastTranscript && <div className="voice-transcript">“{lastTranscript}”</div>}</div>
      <div className={`camera-panel${cameraOn ? " visible" : ""}`}><video ref={videoRef} muted playsInline className="camera-video" /><canvas ref={overlayRef} width={208} height={156} className="camera-overlay" /><div className="camera-status">{status.hands > 0 ? `${status.hands} HAND${status.hands > 1 ? "S" : ""} · ${MODE_LABEL[status.mode]}` : "SHOW HANDS"}</div></div>
      {error && <div className="hud-error">{error}</div>}
      <div className="hud-row"><button type="button" className="hud-btn" aria-pressed={voiceOn} onClick={voiceOn ? stopVoice : startVoice}>{voiceOn ? "VOICE ON" : "ACTIVATE VOICE"}</button><button type="button" className="hud-btn" aria-pressed={cameraOn} onClick={toggleGestures} disabled={camera === "starting"}>{camera === "starting" ? "INITIALIZING…" : cameraOn ? "GESTURES ON" : "GESTURES OFF"}</button></div>
      <div className="hud-row"><button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomIn()}>+</button><button type="button" className="hud-btn" onClick={() => sceneRef.current?.zoomOut()}>−</button><button type="button" className="hud-btn" onClick={() => sceneRef.current?.resetView()}>RESET</button></div>
    </div>
  </>;
}
