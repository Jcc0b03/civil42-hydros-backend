'use client';

import { useState, useRef, useCallback } from 'react';
import type { VoiceAction } from '@/lib/types';

const API_BASE = '/api/backend';

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking';

type Props = {
  onAction: (action: VoiceAction) => void;
};

export function VoiceController({ onAction }: Props) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
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
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

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
            body: formData,
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
    } catch {
      setState('idle');
      setTranscript('Brak dostępu do mikrofonu');
      setTimeout(() => setTranscript(null), 4000);
    }
  }, [onAction]);

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
              : 'bg-surface-variant text-on-surface-variant hover:bg-primary/10 hover:text-primary-dark active:scale-95',
        ].join(' ')}
        title={stateLabel}
      >
        {state === 'processing' || state === 'speaking' ? (
          <svg
            className="h-5 w-5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
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
