import { useEffect, useState, useRef } from "react";
import { Mic, MicOff, X, Sparkles, AlertCircle, Compass, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { matchVoiceCommand } from "@/utils/voiceCommands";

type VoiceControllerProps = {
  onCommand: (command: string) => void;
  onClose: () => void;
};

export function VoiceController({ onCommand, onClose }: VoiceControllerProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastMatched, setLastMatched] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isExplicitlyStoppedRef = useRef(false);

  // Restart SpeechRecognition helper
  const startRecognition = () => {
    if (!recognitionRef.current) return;
    try {
      isExplicitlyStoppedRef.current = false;
      recognitionRef.current.start();
      setListening(true);
      setErrorText(null);
    } catch (err) {
      console.warn("SpeechRecognition already started or error: ", err);
    }
  };

  const stopRecognition = () => {
    if (!recognitionRef.current) return;
    isExplicitlyStoppedRef.current = true;
    try {
      recognitionRef.current.stop();
      setListening(false);
    } catch (err) {
      console.warn("SpeechRecognition stop error: ", err);
    }
  };

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      import("sonner").then(({ toast }) => {
        toast.warning("Speech recognition is not supported in this browser.");
      });
      onClose();
      return;
    }

    const recognizer = new SpeechRecognition();
    recognizer.continuous = false; // Using false with auto-restart handles pauses better across systems
    recognizer.interimResults = true;
    recognizer.lang = "en-US";
    recognitionRef.current = recognizer;

    const handleResult = (event: any) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const activeText = finalTranscript || interimTranscript;
      setTranscript(activeText);

      if (finalTranscript.trim()) {
        const spoken = finalTranscript.trim();
        // Check for matching command
        const matchedKey = matchVoiceCommand(spoken);
        if (matchedKey) {
          setLastMatched(matchedKey);
          onCommand(spoken);
          // Show matched command toast
          import("sonner").then(({ toast }) => {
            toast.success(`Voice Command matched: "${matchedKey}"`, {
              description: `Spoken: "${spoken}"`,
              duration: 2500,
            });
          });
          // Clear matched state after a delay
          setTimeout(() => setLastMatched(null), 2500);
        } else {
          import("sonner").then(({ toast }) => {
            toast.error(`Unknown voice command: "${spoken}"`, {
              description: "Try saying: 'open attendance', 'go to ledger', or 'sign out'",
              duration: 3000,
            });
          });
        }
        // Reset transcript display
        setTimeout(() => setTranscript(""), 1200);
      }
    };

    const handleEnd = () => {
      // If not explicitly stopped by clicking the mic or close button, restart automatically
      if (!isExplicitlyStoppedRef.current) {
        startRecognition();
      } else {
        setListening(false);
      }
    };

    const handleError = (event: any) => {
      // Abort is fired when stopping explicitly or on quick restarts; ignore it
      if (event.error === "aborted") return;
      
      console.warn("Speech recognition error: ", event.error);
      if (event.error === "no-speech") {
        // Silently handle no-speech and let it restart naturally
        return;
      }
      
      setErrorText(`Error: ${event.error}`);
      import("sonner").then(({ toast }) => {
        toast.error(`Microphone error: ${event.error}`);
      });
    };

    recognizer.addEventListener("result", handleResult);
    recognizer.addEventListener("end", handleEnd);
    recognizer.addEventListener("error", handleError);

    // Initial start
    startRecognition();

    return () => {
      isExplicitlyStoppedRef.current = true;
      recognizer.removeEventListener("result", handleResult);
      recognizer.removeEventListener("end", handleEnd);
      recognizer.removeEventListener("error", handleError);
      try {
        recognizer.abort();
      } catch (err) {
        // Already aborted
      }
    };
  }, [onCommand, onClose]);

  const toggleMic = () => {
    if (listening) {
      stopRecognition();
    } else {
      startRecognition();
    }
  };

  const handleClose = () => {
    stopRecognition();
    onClose();
  };

  return (
    <div className="fixed bottom-24 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-350">
      <div className="w-80 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col text-slate-100 relative overflow-hidden">
        {/* Decorative Grid Effect */}
        <div className="absolute inset-0 bg-hero-grid opacity-5 pointer-events-none" />
        
        {/* Top Header */}
        <div className="flex items-center justify-between pb-2.5 border-b border-white/5 relative z-10">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4.5 w-4.5 text-indigo-400 animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              AltRix Pro Voice
            </span>
          </div>
          <button 
            onClick={handleClose} 
            className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-white/5 rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Pulsing Voice Sphere */}
        <div className="flex flex-col items-center justify-center py-6 relative z-10">
          <button
            onClick={toggleMic}
            className={`h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 relative border ${
              listening 
                ? "bg-indigo-500/25 border-indigo-500 text-indigo-400 shadow-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.4)]" 
                : "bg-slate-800/80 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
            }`}
          >
            {/* Visualizer Pulsing Rings */}
            {listening && (
              <>
                <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500/30 opacity-75" style={{ animationDuration: "1.8s" }} />
                <span className="absolute -inset-2 rounded-full animate-ping bg-cyan-500/10 opacity-50" style={{ animationDuration: "2.4s" }} />
              </>
            )}
            {listening ? <Mic className="h-7 w-7 text-indigo-400" /> : <MicOff className="h-7 w-7 text-slate-500" />}
          </button>

          <p className={`text-[11px] font-medium mt-3 tracking-wide ${listening ? "text-indigo-400" : "text-slate-400"}`}>
            {listening ? "MICROPHONE ACTIVE" : "MICROPHONE OFF"}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Click the button to toggle</p>
        </div>

        {/* Live Speech Feedback */}
        <div className="bg-slate-950/60 border border-white/5 rounded-xl p-3 min-h-[56px] flex flex-col justify-center relative z-10 font-sans text-xs">
          {transcript ? (
            <p className="text-slate-200 font-medium italic animate-pulse">
              "{transcript}"
            </p>
          ) : lastMatched ? (
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold uppercase tracking-wider text-[10px]">
              <Compass className="h-3.5 w-3.5" />
              Route: {lastMatched}
            </div>
          ) : errorText ? (
            <p className="text-rose-400 font-medium flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" /> {errorText}
            </p>
          ) : (
            <p className="text-slate-500 italic text-[11px] text-center">
              {listening ? "Speak a command..." : "Microphone muted. Enable to talk."}
            </p>
          )}
        </div>

        {/* Command Helper Sheet */}
        <div className="mt-3.5 pt-3 border-t border-white/5 relative z-10">
          <div className="flex items-center gap-1 mb-2 text-slate-400 font-medium text-[10px] uppercase tracking-wide">
            <HelpCircle className="h-3.5 w-3.5" />
            <span>Voice Guide</span>
          </div>
          <div className="text-[10px] text-slate-400 space-y-1.5 font-mono bg-white/5 p-2 rounded-lg">
            <p>• "Open Attendance"</p>
            <p>• "Go to Cash Ledger"</p>
            <p>• "Admissions Portal"</p>
            <p>• "Trigger Search Dialog"</p>
            <p>• "Sign out"</p>
          </div>
        </div>
      </div>
    </div>
  );
}
