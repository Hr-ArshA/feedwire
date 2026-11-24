import { onBeforeUnmount, ref } from 'vue';

/**
 * Listen mode. Uses the browser's own speech engine, so it works offline and
 * costs nothing; when the device has no voice for the text's language the
 * caller gets a clear "not available" state instead of silence.
 */
export function useSpeech() {
  const supported = ref(false);
  const speaking = ref(false);
  const paused = ref(false);
  const error = ref(null);

  let queue = [];
  let index = 0;
  let active = false;

  function reset() {
    queue = [];
    index = 0;
    active = false;
    speaking.value = false;
    paused.value = false;
  }

  if (import.meta.client) {
    supported.value =
      typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  function pickVoice(lang) {
    const voices = window.speechSynthesis.getVoices();
    const prefix = String(lang).slice(0, 2).toLowerCase();
    return (
      voices.find((voice) => voice.lang?.toLowerCase().startsWith(prefix)) ??
      voices.find((voice) => voice.default) ??
      null
    );
  }

  function chunkText(text) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    const parts = clean.match(/[^.!?؟]+[.!?؟]*\s*/g) ?? [clean];
    const chunks = [];
    let current = '';
    for (const part of parts) {
      if ((current + part).length > 220) {
        if (current.trim()) chunks.push(current.trim());
        current = part;
      } else {
        current += part;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  function speakNext() {
    if (!active) return;
    if (index >= queue.length) {
      reset();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(queue[index]);
    utterance.rate = 1;
    utterance.pitch = 1;
    const voice = pickVoice(utterance.lang || 'en');
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.onend = () => {
      index += 1;
      speakNext();
    };
    utterance.onerror = (event) => {
      // "interrupted" and "canceled" are our own stop() calls.
      if (!['interrupted', 'canceled'].includes(event.error)) {
        error.value = 'This device could not read the text aloud.';
      }
      reset();
    };
    window.speechSynthesis.speak(utterance);
  }

  function speak(text, lang = 'en') {
    if (!supported.value) {
      error.value = 'This browser has no speech engine.';
      return false;
    }
    window.speechSynthesis.cancel();
    error.value = null;
    queue = chunkText(text);
    if (!queue.length) {
      error.value = 'There is no text to read.';
      return false;
    }
    index = 0;
    active = true;
    speaking.value = true;
    paused.value = false;
    // Voices load asynchronously on some browsers; setting lang still works.
    const voice = pickVoice(lang);
    if (!voice) {
      error.value = `No ${lang} voice is installed on this device.`;
    }
    speakNext();
    return true;
  }

  function pause() {
    if (!speaking.value) return;
    window.speechSynthesis.pause();
    paused.value = true;
  }

  function resume() {
    if (!paused.value) return;
    window.speechSynthesis.resume();
    paused.value = false;
  }

  function stop() {
    if (!supported.value) return;
    window.speechSynthesis.cancel();
    reset();
  }

  function toggle(text, lang = 'en') {
    if (speaking.value && !paused.value) {
      pause();
      return;
    }
    if (paused.value) {
      resume();
      return;
    }
    speak(text, lang);
  }

  onBeforeUnmount(() => {
    if (import.meta.client && supported.value) {
      window.speechSynthesis.cancel();
    }
    active = false;
  });

  return { supported, speaking, paused, error, speak, pause, resume, stop, toggle };
}
