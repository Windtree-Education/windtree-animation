// js/supabase.js — lightweight browser helpers for Supabase Storage (public bucket)
// NOTE: For POC use only. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY
//       (or replace the placeholders below).

import { createClient } from 'https://esm.sh/@supabase/supabase-js';

const SUPABASE_URL = (window.SUPABASE_URL || '').trim() || 'https://lyprksdsiqopdkafbnby.supabase.co'; // e.g. https://abc.supabase.co
const SUPABASE_ANON_KEY = (window.SUPABASE_ANON_KEY || '').trim() || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5cHJrc2RzaXFvcGRrYWZibmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMTY3NTIsImV4cCI6MjA3NTY5Mjc1Mn0.Nk4X2WYiRb3Yi4TfhQz5GLy2qZfAsFzkKe8ngM326Ls';

export const hasSupabaseConfig = SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY.length > 20;
export const supabase = hasSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export const SUPABASE_BUCKET = (window.SUPABASE_BUCKET || 'drawings');

export async function uploadPngDataUrl(bucket, sessionId, storyId, charId, dataUrl) {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase not configured');
  const cleanSession = String(sessionId || 'anon').replace(/[^\w-]/g, '');
  const cleanStory   = String(storyId   || 'story').replace(/[^\w-]/g, '');
  const cleanChar    = String(charId    || 'char').replace(/[^\w-]/g, '');
  const key = `sessions/${cleanSession}/${cleanStory}/${cleanChar}.png`;

  const blob = await (await fetch(dataUrl)).blob();
  const { data, error } = await supabase
    .storage
    .from(bucket)
    .upload(key, blob, { upsert: true, contentType: 'image/png', cacheControl: '0' });
  if (error) throw error;
  return key; // return storage key
}

export async function fileExists(bucket, key) {
  if (!hasSupabaseConfig || !supabase) return false;
  const parts = String(key).split('/');
  const name = parts.pop();
  const folder = parts.join('/');
  const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 100 });
  if (error) return false;
  return !!data?.find(o => o.name === name);
}

export function publicUrl(bucket, key) {
  if (!hasSupabaseConfig || !supabase) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(key);
  return data?.publicUrl || null;
}


