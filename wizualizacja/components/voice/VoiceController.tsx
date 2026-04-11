'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { VoiceAction } from '@/lib/types';

const API_BASE = '/api/backend';

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

const SILENCE_THRESHOLD = 0.015; // RMS below this = silence
const SILENCE_DURATION_MS = 1800; // 1.8s of silence → auto-stop
const VAD_INTERVAL_MS = 100; // check every 100ms

type Props = {
  onAction: (action: VoiceAction) => void;
};

export function VoiceController({ onAction }: Props) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpokenRef = useRef(false);

  const stopRecording = useCallback(() => {
    // Stop VAD
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    silenceStartRef.current = null;
    hasSpokenRef.current = false;

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
      analyserRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000
        }
      });
      streamRef.current = stream;
      // Set up VAD via Web Audio API
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;
      silenceStartRef.current = null;
      hasSpokenRef.current = false;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];

      recorder.ondataavailable = e => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        setState('processing');
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

        try {
          const formData = new FormData();
          formData.append('file', blob, 'recording.webm');

          const response = await fetch(`${API_BASE}/voice-control`, {
            method: 'POST',
            body: formData
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();

          if (data.error) {
            setTranscript(data.error);
            setState('idle');
            setTimeout(() => setTranscript(null), 4000);
            return;
          }

          if (data.transcript) {
            setTranscript(data.transcript);
          }

          // Dispatch action to app state
          if (data.action) {
            onAction(data.action);
          }

          // Play ElevenLabs audio confirmation
          if (data.audio) {
            setState('speaking');
            const audio = new Audio(`data:audio/mpeg;base64,${data.audio}`);
            audio.onended = () => {
              setState('idle');
              setTimeout(() => setTranscript(null), 3000);
            };
            audio.onerror = () => {
              setState('idle');
              setTimeout(() => setTranscript(null), 3000);
            };
            await audio.play().catch(() => {
              setState('idle');
              setTimeout(() => setTranscript(null), 3000);
            });
          } else {
            // No TTS audio – show confirmation text briefly
            if (data.action?.confirmation_text) {
              setTranscript(data.action.confirmation_text);
            }
            setState('idle');
            setTimeout(() => setTranscript(null), 3000);
          }
        } catch (err) {
          console.error('Voice control error:', err);
          setState('idle');
          setTranscript('Błąd połączenia z serwerem');
          setTimeout(() => setTranscript(null), 4000);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setState('recording');

      // Start VAD: auto-stop after silence following speech
      const dataArray = new Float32Array(analyser.fftSize);
      vadIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);
        // Compute RMS
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        if (rms > SILENCE_THRESHOLD) {
          // User is speaking
          hasSpokenRef.current = true;
          silenceStartRef.current = null;
        } else if (hasSpokenRef.current) {
          // Silence after speech
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (
            Date.now() - silenceStartRef.current >=
            SILENCE_DURATION_MS
          ) {
            // Silence long enough → auto-stop
            stopRecording();
          }
        }
      }, VAD_INTERVAL_MS);
    } catch {
      setState('idle');
      setTranscript('Brak dostępu do mikrofonu');
      setTimeout(() => setTranscript(null), 4000);
    }
  }, [onAction, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
      if (audioContextRef.current)
        audioContextRef.current.close().catch(() => {});
    };
  }, []);

  const toggleRecording = useCallback(() => {
    if (state === 'recording') {
      stopRecording();
    } else if (state === 'idle') {
      startRecording();
    }
  }, [state, startRecording, stopRecording]);

  const stateLabel =
    state === 'recording'
      ? 'Kliknij aby zakończyć'
      : state === 'processing'
        ? 'Przetwarzam…'
        : state === 'speaking'
          ? 'Odtwarzam…'
          : 'Sterowanie głosowe';

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={toggleRecording}
        disabled={state === 'processing' || state === 'speaking'}
        className={[
          'relative flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200',
          state === 'recording'
            ? 'bg-critical text-white shadow-lg shadow-critical/40 scale-110'
            : state === 'processing' || state === 'speaking'
              ? 'bg-primary/20 text-primary-dark cursor-wait'
              : 'bg-surface-variant text-on-surface-variant hover:bg-primary/10 hover:text-primary-dark active:scale-95'
        ].join(' ')}
        title={stateLabel}
      >
        {state === 'processing' || state === 'speaking' ? (
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray="30 60"
            />
          </svg>
        ) : (
          <span className="material-symbols-outlined text-xl">mic</span>
        )}

        {/* Pulsing ring while recording */}
        {state === 'recording' && (
          <span className="absolute inset-0 animate-ping rounded-full bg-critical/40" />
        )}
      </button>

      {/* Floating transcript bubble */}
      {transcript && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-outline bg-white px-3 py-2 shadow-xl z-[60]">
          <p className="font-headline text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
            {state === 'processing'
              ? 'Przetwarzam…'
              : state === 'speaking'
                ? 'Asystent mówi'
                : 'Rozpoznano'}
          </p>
          <p className="mt-0.5 font-body text-xs text-on-surface leading-relaxed">
            {transcript}
          </p>
        </div>
      )}
    </div>
  );
}
