import { useState } from 'react';
import { supabase } from '../../utils/supabase.js';

export default function SaveAudio({ recording, user, topic, difficulty, onSaved }) {
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  function download() {
    const url = URL.createObjectURL(recording.blob), link = document.createElement('a');
    const type = recording.blob.type;
    link.href = url; link.download = `simplyarticulate-${recording.draftId || 'take'}.${type.includes('wav') ? 'wav' : type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function save() {
    if (busy || saved || !user) return;
    setBusy(true); setError('');
    const blob = recording.storageBlob || recording.blob, type = blob.type.split(';')[0];
    const ext = type.includes('wav') ? 'wav' : type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
    const path = `${user.id}/${recording.draftId || crypto.randomUUID()}.${ext}`;
    try {
      // Stable path makes recovery from a lost upload response safe.
      const upload = await supabase.storage.from('speech-recordings').upload(path, blob, { contentType: type, upsert: false });
      if (upload.error && !['409','Duplicate'].includes(String(upload.error.statusCode)) && !/already exists/i.test(upload.error.message || '')) throw upload.error;
      const existing = await supabase.from('speech_recordings').select('id').eq('user_id',user.id).eq('audio_path',path).maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        const result = await supabase.from('speech_recordings').insert({user_id:user.id,audio_path:path,mime_type:type,duration_seconds:Math.max(1,Math.min(300,Math.ceil(recording.durationSeconds))),topic,difficulty:difficulty || 'medium'});
        if (result.error) throw result.error;
      }
      setSaved(true); onSaved?.();
    } catch { setError('Audio could not be saved to your account. Your local take is retained; download it or retry.'); }
    finally { setBusy(false); }
  }
  return <section className="save-audio"><h3>Keep your audio</h3><p role="status">Audio: {saved?'saved privately to your account':'on this device only'}. Other devices need a separate download for local copies.</p><div className="analysis-actions"><button className="secondary-button" onClick={download}>Download audio</button>{user && <button className="secondary-button" disabled={busy || saved} onClick={save}>{saved ? 'Audio saved to your account' : busy ? 'Saving audio…' : 'Save audio to my account'}</button>}</div>{error && <p role="alert">{error}</p>}</section>;
}
