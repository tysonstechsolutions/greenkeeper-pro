"use client";

import { useState, useRef } from "react";
import { Mic, CheckCircle2, ClipboardList, Eye, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

type Step = "record" | "edit" | "pick-hole" | "success";

// Web Speech API types — not all browsers ship these.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionConstructor = any;

interface SpeechEvent {
  resultIndex: number;
  results: { length: number; item(i: number): { item(j: number): { transcript: string } }; [index: number]: { isFinal: boolean; item(j: number): { transcript: string }; [index: number]: { transcript: string } } };
}

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function VoiceLogPage() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("record");
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successType, setSuccessType] = useState<"task" | "observation" | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");

  const supported = !!getSpeechRecognition();

  function startRecording() {
    const SR = getSpeechRecognition();
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    recognitionRef.current = r;
    transcriptRef.current = transcript;

    r.onresult = (e: SpeechEvent) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          transcriptRef.current += (transcriptRef.current ? " " : "") + t;
          setTranscript(transcriptRef.current);
        } else {
          interim += t;
        }
      }
      setInterimText(interim);
    };
    r.onerror = () => { setIsRecording(false); };
    r.onend = () => { setIsRecording(false); };
    r.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimText("");
    if (transcriptRef.current.trim()) setStep("edit");
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function createTask() {
    if (!user || !transcript.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: transcript.trim().slice(0, 200),
        category: "other",
        priority: "normal",
        status: "pending",
        due_date: today,
        assigned_by: user.id,
        description: transcript.trim().length > 200 ? transcript.trim() : null,
        hole_numbers: [],
        equipment_needed: [],
        materials_needed: [],
        checklist: [],
        photos: [],
        requires_photo_before: false,
        requires_photo_after: false,
        weather_dependent: false,
      })
      .select("id")
      .single();
    setSaving(false);
    if (!error && data) {
      setSuccessType("task");
      setSuccessId(data.id);
      setStep("success");
    }
  }

  async function createObservation(hole: number) {
    if (!user || !transcript.trim()) return;
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("hole_observations")
      .insert({
        hole_number: hole,
        title: transcript.trim().slice(0, 200),
        description: transcript.trim().length > 200 ? transcript.trim() : null,
        issue_type: "other",
        priority: "normal",
        status: "open",
        reported_by: user.id,
      })
      .select("id")
      .single();
    setSaving(false);
    if (!error && data) {
      setSuccessType("observation");
      setSuccessId(data.id);
      setStep("success");
    }
  }

  function reset() {
    setStep("record");
    setTranscript("");
    setInterimText("");
    setSuccessType(null);
    setSuccessId(null);
    transcriptRef.current = "";
  }

  // Unsupported browser fallback
  if (!supported) {
    return (
      <div className="p-4 pb-24 max-w-lg mx-auto">
        <PageHeader title="Voice Log" icon={Mic} description="Quick-log voice notes" />
        <Card><CardContent className="pt-6">
          <p className="text-sm text-muted-foreground mb-4">
            Voice input not supported in this browser -- use Chrome on mobile for best results.
          </p>
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Type your note here..."
            rows={4}
            className="mb-4"
          />
          {transcript.trim() && (
            <div className="flex gap-2">
              <Button onClick={createTask} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ClipboardList className="w-4 h-4 mr-1" />}
                Create Task
              </Button>
              <Button onClick={() => setStep("pick-hole")} variant="outline" className="flex-1">
                <Eye className="w-4 h-4 mr-1" /> Create Observation
              </Button>
            </div>
          )}
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 max-w-lg mx-auto">
      <PageHeader title="Voice Log" icon={Mic} description="Quick-log voice notes" />

      {/* Recording step */}
      {step === "record" && (
        <div className="flex flex-col items-center gap-6 mt-8">
          <button
            onClick={toggleRecording}
            className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-lg ${
              isRecording
                ? "bg-red-500 text-white animate-pulse scale-110"
                : "bg-primary text-primary-foreground hover:scale-105"
            }`}
          >
            <Mic className="w-10 h-10" />
          </button>
          <p className="text-sm text-muted-foreground">
            {isRecording ? "Tap to stop recording" : "Tap to start recording"}
          </p>
          {(transcript || interimText) && (
            <Card className="w-full">
              <CardContent className="pt-4">
                <p className="text-sm">
                  {transcript}
                  {interimText && <span className="text-muted-foreground italic"> {interimText}</span>}
                </p>
              </CardContent>
            </Card>
          )}
          {transcript.trim() && !isRecording && (
            <Button onClick={() => setStep("edit")} className="w-full">Review & Save</Button>
          )}
        </div>
      )}

      {/* Edit step */}
      {step === "edit" && (
        <div className="space-y-4">
          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={5}
            className="text-base"
          />
          <div className="flex gap-2">
            <Button onClick={createTask} disabled={saving || !transcript.trim()} className="flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ClipboardList className="w-4 h-4 mr-1" />}
              Create Task
            </Button>
            <Button onClick={() => setStep("pick-hole")} variant="outline" className="flex-1" disabled={saving || !transcript.trim()}>
              <Eye className="w-4 h-4 mr-1" /> Observation
            </Button>
          </div>
          <Button variant="ghost" onClick={reset} className="w-full text-muted-foreground">
            Start Over
          </Button>
        </div>
      )}

      {/* Pick hole step */}
      {step === "pick-hole" && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-center">Select hole number</p>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((h) => (
              <Button
                key={h}
                variant="outline"
                className="h-12 text-base font-semibold"
                onClick={() => createObservation(h)}
                disabled={saving}
              >
                {h}
              </Button>
            ))}
          </div>
          <Button variant="ghost" onClick={() => setStep("edit")} className="w-full text-muted-foreground">
            Back
          </Button>
        </div>
      )}

      {/* Success step */}
      {step === "success" && (
        <div className="flex flex-col items-center gap-4 mt-8">
          <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <p className="text-lg font-medium">
            {successType === "task" ? "Task Created" : "Observation Created"}
          </p>
          {successType === "task" && successId && (
            <Link href="/tasks" className="text-sm text-primary underline">View Tasks</Link>
          )}
          {successType === "observation" && successId && (
            <Link href="/course-map" className="text-sm text-primary underline">View Course Map</Link>
          )}
          <Button onClick={reset} className="w-full mt-4">Record Another</Button>
        </div>
      )}
    </div>
  );
}
