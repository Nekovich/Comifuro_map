import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// DIAGNOSA: Muncul di Console (F12)
console.log("Cek Koneksi Supabase...");
console.log("URL Terdeteksi:", supabaseUrl); 

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ ERROR: Vite gagal membaca file .env! Pastikan file .env ada di folder utama dan server sudah di-restart.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)