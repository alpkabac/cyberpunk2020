-- Remove LLM/STT/TTS session artifacts for the human-GM table app.

DROP TABLE IF EXISTS session_voice_turn_fragments;
DROP TABLE IF EXISTS session_voice_turns;

UPDATE sessions
SET settings = COALESCE(settings, '{}'::jsonb)
  - 'ttsEnabled'
  - 'ttsVoice'
  - 'narrationTts'
  - 'voiceInputMode'
  - 'sessionRecordingStartedBy'
  - 'sttLanguage'
  - 'aiLanguage'
  - 'gmOpenRouterModel';

DELETE FROM storage.objects WHERE bucket_id = 'narration-tts';
DELETE FROM storage.buckets WHERE id = 'narration-tts';
