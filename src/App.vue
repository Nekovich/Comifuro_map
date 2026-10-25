<script setup>
import panzoom from 'panzoom'; // untuk fitur zoom dan pan
import { onMounted, ref, nextTick, computed, watch } from 'vue'; 
import { supabase } from './supabase';

// --- DAFTAR VARIABLE ---
const GRID_SIZE = 400; // Ukuran kotak grid (sesuaikan jika jalur kurang detail)
let graphCache = null; // Ganti 'graph' jadi 'graphCache'
const currentUser = ref(null); // Untuk menyimpan data user yang sedang login
const svgContent = ref(''); //  untuk menyimpan konten SVG
const errorMessage = ref(''); // untuk menyimpan pesan error
const loading = ref(false); // untuk menandai status loading
const selectedBooth = ref(''); // untuk menyimpan ID meja yang dipilih
const infoCircle = ref(null); // untuk menyimpan data circle yang diambil
const showForm = ref(false); // untuk mengontrol tampilan form input
const inputNama = ref(''); // untuk input nama circle
const inputFandom = ref([]); // untuk input fandom (array)
const inputKatalog = ref(''); // untuk menampung link katalog
const allCirclesCache = ref([]); // Untuk menyimpan data lengkap agar pencarian cepat
const userCache = ref([]); // Untuk menyimpan daftar user (ID vs Nama)
const inputSearch = ref(''); // Untuk kotak pencarian global
const filterInput = ref(''); // Untuk kotak input filter karakter
const filterTags = ref([]); // Untuk menyimpan tag karakter yang dipilih sebagai filter
const selectedBooths = ref([]); // Menampung ID meja yang dipilih (untuk Blue Glow)
const autoPathMode = ref(false); // Switch untuk mengaktifkan mode pilih jalur
const filterSaran = computed(() => {
  const cari = filterInput.value.trim().toLowerCase();
  
  // Ambil karakter yang belum ada di filterTags
  const belumDipilih = daftarKarakterDB.value.filter(char => 
    !filterTags.value.some(tag => tag.character_name === char.character_name)
  );

  let hasilFilter = [];

  if (cari === '') {
    hasilFilter = isFilterFocused.value ? belumDipilih : [];
  } else {
    hasilFilter = belumDipilih.filter(char => {
      const namaChar = char.character_name || "";
      return namaChar.toLowerCase().includes(cari);
    });
  }

  // --- LOGIKA PENGURUTAN (SORTING) ---
  return hasilFilter.sort((a, b) => {
    if (sortMode.value === 'popular') {
      // Urutkan dari jumlah terbanyak (paling populer) ke yang paling sedikit
      const countA = characterFrequencyMap.value[a.id] || 0;
      const countB = characterFrequencyMap.value[b.id] || 0;
      if (countB !== countA) {
        return countB - countA; // Terbanyak di atas
      }
    }
    // Default / Jika mode 'alphabet': Urutkan berdasarkan nama A-Z
    return (a.character_name || "").localeCompare(b.character_name || "");
  });
});

const saranKarakter = computed(() => {
  const cari = inputSearchKarakter.value.trim().toLowerCase();
  
  // Jika kotak pencarian kosong, sembunyikan dropdown
  if (!cari) return [];

  return daftarKarakterDB.value.filter(char => {
    const namaChar = char.character_name || "";
    
    // 1. Cek apakah namanya cocok dengan yang diketik
    const cocokNama = namaChar.toLowerCase().includes(cari);
    
    // 2. KUNCI PERBAIKAN: Cek apakah ID karakter ini BELUM ada di selectedKarakter
    // Kita pakai .some() untuk mengecek keberadaan ID di dalam daftar terpilih
    const belumDipilih = !selectedKarakter.value.some(s => s.id === char.id);

    return cocokNama && belumDipilih;
  });
});

const lastSelectedElement = ref(null); // untuk menyimpan elemen SVG terakhir yang dipilih
const isFilterFocused = ref(false); // Penanda apakah kotak sedang diklik

// DAFTAR FANDOM === isi data fandom apa saja dsini
const daftarFandom = [
  'Arknights',
  'Arknights Endfield',
];

// DATA MASTER KARAKTER === isi data karakter apa saja disini
const inputSearchKarakter = ref(''); // Apa yang diketik user (misal: "wisa")
const selectedKarakter = ref([]);    // Apa yang sudah dipilih (misal: ['Wisadel'])


// variabel untuk touchscreen (mobile)
const touchStartX = ref(0);
const touchStartY = ref(0);

// --- SISTEM LOGIN DISCORD ---
async function loginWithDiscord() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
  });
  if (error) {
    console.error("Error login:", error.message);
    alert("Gagal menghubungkan ke Discord.");
  }
}

async function logout() {
  await supabase.auth.signOut();
  currentUser.value = null;
}
 
const isSidebarOpen = ref(false); 
const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};
const userRole = ref('user'); // Default adalah user biasa
const dataUsulanPending = ref(null);
const isAdmin = computed(() => {
  return userRole.value === 'admin';
});
const daftarKarakterDB = ref([]); // Penampung data mentah dari DB

async function fetchDaftarKarakter() {
  try {
    const { data, error } = await supabase
      .from('characters') 
      .select('id, character_name, image_url') // Tambahkan ID di sini
      .order('character_name', { ascending: true });

    if (error) throw error;
    daftarKarakterDB.value = data; 
  } catch (err) {
    console.error("Gagal load:", err.message);
  }
}

// --- STATE POP-UP PESAN CUSTOM ---
const showCustomAlert = ref(false);
const customAlertMessage = ref('');
const customAlertTitle = ref('Pemberitahuan');
const customAlertType = ref('success'); // 'success' atau 'info'

const ensureExternalLink = (url) => {
  if (!url) return '';
  // Cek apakah sudah diawali http:// atau https://
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Jika belum, tambahkan https:// di depannya
  return `https://${url}`;
};
// AKHIR DAFTAR VARIABEL --- IGNORE ------------------------

async function fetchUserRole() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) return;

  // 1. Ambil ID Discord Asli (Provider ID)
  const realId = user.user_metadata?.provider_id || 
                 user.identities?.find(i => i.provider === 'discord')?.provider_id;

  // 2. Ambil Nama (Global Name atau Full Name)
  const fullName = user.user_metadata?.custom_claims?.global_name || 
                   user.user_metadata?.full_name || 
                   'User Discord';

  if (!realId) return;

  try {
    // 3. SINKRONISASI (Tanpa menimpa Role)
    const { data, error } = await supabase
      .from('user')
      .upsert({ 
        discord_id: String(realId), 
        username: fullName
        // Role TIDAK dimasukkan di sini agar data di DB (Admin) tetap terjaga
      }, { onConflict: 'discord_id' })
      .select()
      .single();

    if (error) throw error;

    if (data) {
      // KUNCI: Jika di DB masih NULL (karena user baru), tampilkan sebagai 'user'
      // Jika di DB sudah 'admin', tampilkan 'admin'
      userRole.value = data.role || 'user'; 
      console.log("DEBUG: Role kamu saat ini:", userRole.value);
    }
  } catch (err) {
    console.error("Gagal sinkron user:", err.message);
    // Fallback jika database sedang bermasalah agar aplikasi tidak crash
    userRole.value = 'user'; 
  }
}

function onFilterBlur() {
  setTimeout(() => {
    isFilterFocused.value = false;
  }, 250);
}

function getMejaCenter(id) {
  const el = document.getElementById(id);
  if (!el) return { x: 0, y: 0 };
  
  // Mengambil bounding box elemen di dalam koordinat SVG
  const box = el.getBBox();
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
}

async function warnaiPeta() {
  console.log("Mencoba mewarnai peta...");
  try {
    const [resCircles, resNewCircles] = await Promise.all([
      supabase.from('circles').select('*'),
      supabase.from('new_circles').select('*')
    ]);

    const dataVerified = resCircles.data || [];
    const dataUsulan = resNewCircles.data || [];
    allCirclesCache.value = [...dataVerified, ...dataUsulan];

    const statusMap = new Map();

    dataVerified.forEach(item => {
      const fandomData = item.fandom || "";
      const isArknights = fandomData.includes('Arknights');
      statusMap.set(item.booth_id, {
        color: isArknights ? '#42b883' : '#9a9a9a',
        opacity: '0.8',
        stroke: 'none'
      });
    });

    dataUsulan.forEach(item => {
      statusMap.set(item.booth_id, {
        color: '#f7b731',
        opacity: '0.8',
        stroke: '#e67e22'
      });
    });

    const semuaMeja = document.querySelectorAll('svg rect, svg path, svg polygon');
    
    semuaMeja.forEach(meja => {
      if (!meja.id) return;
      const idMeja = meja.id;
      const instruksi = statusMap.get(idMeja);
      const isSelected = selectedBooths.value.includes(idMeja);

      // --- PEWARNAAN FANDOM ---
      if (instruksi) {
        meja.style.fill = instruksi.color;
        meja.style.fillOpacity = instruksi.opacity;
        meja.style.stroke = instruksi.stroke !== 'none' ? instruksi.stroke : 'none';
        if (instruksi.stroke !== 'none') meja.style.strokeWidth = '1px';
      } else {
        meja.style.fill = '#3498db'; 
        meja.style.fillOpacity = '0.05';
        meja.style.stroke = 'none';
      }

      // --- GLOW SELECTED ---
      if (isSelected) {
        meja.classList.add('meja-glow-blue');
        if (!instruksi) meja.style.fillOpacity = '0.3'; 
        if (meja.parentElement) meja.parentElement.appendChild(meja);
      } else {
        meja.classList.remove('meja-glow-blue');
      }
    });

    // --- LOGIKA JALUR PINTAR (A-STAR) ---
    const svg = document.querySelector('svg');
    if (svg) {
      const garisLama = document.getElementById('jalur-optimasi');
      if (garisLama) garisLama.remove();

      if (selectedBooths.value.length >= 2) {
        // Build graph jika belum ada
        if (!graphCache) graphCache = buildNavigationGraph();

        let smartPoints = [];

        for (let i = 0; i < selectedBooths.value.length - 1; i++) {
          const start = getMejaCenter(selectedBooths.value[i]);
          const end = getMejaCenter(selectedBooths.value[i+1]);

          // Konversi koordinat SVG ke koordinat Grid
          const startNode = graphCache.grid[Math.floor(start.y / GRID_SIZE)][Math.floor(start.x / GRID_SIZE)];
          const endNode = graphCache.grid[Math.floor(end.y / GRID_SIZE)][Math.floor(end.x / GRID_SIZE)];

          // Cari rute lewat lorong hijau
          const result = astar.search(graphCache, startNode, endNode);
          
          // Masukkan titik awal segmen
          smartPoints.push(`${start.x},${start.y}`);

          // Masukkan titik-titik lorong (A* mengembalikan [y][x] node)
          result.forEach(node => {
            const posX = node.y * GRID_SIZE + (GRID_SIZE / 2);
            const posY = node.x * GRID_SIZE + (GRID_SIZE / 2);
            smartPoints.push(`${posX},${posY}`);
          });

          // Jika ini segmen terakhir, masukkan titik meja terakhir
          if (i === selectedBooths.value.length - 2) {
            smartPoints.push(`${end.x},${end.y}`);
          }
        }

        const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        polyline.setAttribute('id', 'jalur-optimasi');
        polyline.setAttribute('points', smartPoints.join(' '));
        polyline.setAttribute('stroke', '#ff7c00'); 
        polyline.setAttribute('stroke-width', '150'); // Disesuaikan skala 57000
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke-dasharray', '400,200'); 
        polyline.setAttribute('style', 'pointer-events: none; opacity: 0.8; stroke-linejoin: round; stroke-linecap: round;');

        svg.appendChild(polyline);
      }
    }

    console.log("Pewarnaan & Smart Pathfinding selesai!");
  } catch (err) {
    console.error("Crash di warnaiPeta:", err.message);
  }
}

// 1. Load Peta SVG dan Inisialisasi Zoom
onMounted(async () => {
  console.log("--- MEMULAI PROSES LOAD (SINGLE MOUNTED) ---");
  
  try {
    // 1. MUAT DATA MASTER TERLEBIH DAHULU
    // Kita pakai await agar kode di bawahnya tidak jalan sebelum data karakter siap
    await fetchDaftarKarakter(); 
    console.log("1. Daftar Karakter Siap.");

    // 2. CEK SESI LOGIN
    const { data: sessionData } = await supabase.auth.getSession();
    const initialUser = sessionData.session?.user || null;
    currentUser.value = initialUser;
    
    if (initialUser) {
      await fetchUserRole(initialUser.id);
      console.log("2. Sesi Login & Role Siap.");
    }

    // 3. LOAD PETA SVG
    const namaFile = '/peta_comifuro23_revisi_final_ini.svg';
    const response = await fetch(namaFile);
    if (!response.ok) throw new Error(`Gagal load SVG! Status: ${response.status}`);
    const text = await response.text();
    svgContent.value = text;

    await nextTick(); // Tunggu DOM SVG merender

    // 4. AKTIFKAN ZOOM
    const elementPeta = document.getElementById('peta-scene');
    if (elementPeta) {
      panzoom(elementPeta, {
        maxZoom: 13,
        minZoom: 1,
        bounds: true,
        boundsPadding: 0.5
      });
      console.log("3. Fitur Zoom Aktif.");
    }

    // 5. WARNAI PETA (Terakhir)
    await warnaiPeta();
    console.log("4. Peta Berhasil Diwarnai.");

  } catch (error) {
    console.error("ERROR FATAL SAAT MOUNTED:", error);
    errorMessage.value = "Gagal memuat aplikasi: " + error.message;
  }
});

// Saat jari diangkat dari layar (untuk reset posisi awal pada mobile)
function onTouchStart(event) {
  if (event.touches && event.touches.length > 0) {
    touchStartX.value = event.touches[0].clientX;
    touchStartY.value = event.touches[0].clientY;
  }
}
// Saat jari diangkat dari layar
function onTouchEnd(event) {
  if (event.changedTouches && event.changedTouches.length > 0) {
    const touchEndX = event.changedTouches[0].clientX;
    const touchEndY = event.changedTouches[0].clientY;
    
    // Hitung seberapa jauh jari bergeser (dalam pixel)
    const deltaX = Math.abs(touchEndX - touchStartX.value);
    const deltaY = Math.abs(touchEndY - touchStartY.value);
    
    // Jika pergeseran kurang dari 10 pixel, ini murni TAP (Klik), bukan GESER
    if (deltaX < 10 && deltaY < 10) {
      // Karena event pada touch kadang tidak membawa target yang presisi untuk SVG,
      // kita gunakan document.elementFromPoint untuk mencari elemen apa yang persis ada di bawah jari
      const targetElement = document.elementFromPoint(touchEndX, touchEndY);
      
      // Buat event bohongan yang isinya elemen target, lalu kirim ke fungsi klik asli kita
      const fakeEvent = { target: targetElement };
      onPetaClick(fakeEvent);
    }
  }
}

// 2. Klik Meja 
async function onPetaClick(event) {
  const panelEl = document.querySelector('.info-panel');
  if (panelEl) panelEl.classList.remove('expanded');
  // 1. Reset awal
  loading.value = false;
  errorMessage.value = '';
  
  let target = event.target;

  // Normalisasi target SVG
  if (target && !target.classList && target.id) {
    target = document.getElementById(target.id);
  }

  const idMeja = target?.id;

  // --- LOGIKA 1: JALUR OTOMATIS (CEGATAN AWAL) ---
  if (autoPathMode.value && idMeja && idMeja !== "") {
    if (selectedBooths.value.includes(idMeja)) {
      // DESELECT
      selectedBooths.value = selectedBooths.value.filter(id => id !== idMeja);
      target.classList.remove('meja-glow-blue');
    } else {
      // SELECT
      selectedBooths.value.push(idMeja);
      target.classList.add('meja-glow-blue');
      if (target.parentElement) target.parentElement.appendChild(target);
    }
    // KUNCI: Panggil warnaiPeta() agar warna hijau/oranye tetap terjaga 
    // dan tidak "terhapus" oleh state klik.
    warnaiPeta(); 
    return;
  }

  // --- LOGIKA 2: DESELECT (KLIK LANTAI / LUAR MEJA) ---
  if (!target || !idMeja || idMeja === "") {
    if (lastSelectedElement.value) {
      lastSelectedElement.value.classList.remove('meja-selected');
      // Glow biru JANGAN dihapus di sini sesuai permintaanmu tadi
      lastSelectedElement.value = null;
    }
    selectedBooth.value = '';
    infoCircle.value = null;
    dataUsulanPending.value = null;
    showForm.value = false;
    return; 
  }

  // --- LOGIKA 3: KLIK BIASA (LIHAT DETAIL BOOTH) ---
  selectedBooth.value = idMeja;
  loading.value = true; 
  infoCircle.value = null;
  dataUsulanPending.value = null;
  showForm.value = false;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Visual Highlight Normal
    if (lastSelectedElement.value) {
      lastSelectedElement.value.classList.remove('meja-selected');
    }
    target.classList.add('meja-selected');
    lastSelectedElement.value = target;

    // AMBIL DATA
    const [resUtama, resUsulan] = await Promise.all([
      supabase.from('circles').select('*').eq('booth_id', idMeja).maybeSingle(),
      supabase.from('new_circles').select('*').eq('booth_id', idMeja).order('created_at', { ascending: false })
    ]);

    clearTimeout(timeoutId);

    const dataUtama = resUtama.data;
    const listUsulan = resUsulan.data;

    if (isAdmin.value) {
      dataUsulanPending.value = listUsulan || [];
    }

    if (dataUtama) {
      infoCircle.value = dataUtama;
      const f = dataUtama.fandom;
      inputFandom.value = typeof f === 'string' ? f.split(', ') : (Array.isArray(f) ? f : []);
    } else if (listUsulan && listUsulan.length > 0) {
      infoCircle.value = { ...listUsulan[0], status: 'pending' };
      const f = listUsulan[0].fandom;
      inputFandom.value = typeof f === 'string' ? f.split(', ') : (Array.isArray(f) ? f : []);
    } else {
      showForm.value = true;
      inputNama.value = '';
      inputFandom.value = [];
      selectedKarakter.value = [];
      inputKatalog.value = '';
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      errorMessage.value = "Koneksi lambat, coba klik lagi.";
    } else {
      console.error("Error Detail di onPetaClick:", err);
      errorMessage.value = "Gagal memuat data meja.";
    }
  } finally {
    loading.value = false;
    clearTimeout(timeoutId);
  }
}

// 3. Submit Data Form (VERSI PERBAIKAN)
async function submitData() {
  if (!inputNama.value) {
    alert("Nama circle wajib diisi!");
    return;
  }

  loading.value = true;
  
  // Ambil hanya angka ID saja dari array object selectedKarakter
  const idKarakterSaja = selectedKarakter.value.map(c => c.id);
  const realDiscordId = currentUser.value?.user_metadata?.provider_id || 
                        currentUser.value?.identities?.[0]?.provider_id || 
                        currentUser.value?.id; // Fallback jika tidak ketemu
  const updateData = {
    booth_id: selectedBooth.value,
    circle_name: inputNama.value,
    fandom: inputFandom.value.join(', '),
    link_katalog: inputKatalog.value,
    discord_id: realDiscordId, // Mengirim angka 266217...
    character_ids: idKarakterSaja,
  };

  try {
    const { error } = await supabase
      .from('new_circles')
      .insert(updateData);

    if (error) throw error;

    tampilkanPesan('Sukses Kirim!', 'Perubahan dikirim! Data akan ditinjau Admin.', 'success');
    showForm.value = false;
    await warnaiPeta();

    setTimeout(() => {
      onPetaClick({ target: { id: selectedBooth.value } });
    }, 300);

  } catch (err) {
    alert("Gagal mengirim data: " + err.message);
  } finally {
    loading.value = false;
  }
}


async function verifikasiData(itemUsulan) {
  loading.value = true;
  
  try {
    // 1. AMBIL KONTRIBUTOR LAMA (yang sudah terverifikasi di meja itu)
    const { data: dataLama } = await supabase
      .from('circles')
      .select('discord_id')
      .eq('booth_id', itemUsulan.booth_id)
      .maybeSingle();

    // 2. AMBIL SEMUA PENGUSUL LAIN (Udin dkk yang masih di antrean/pending)
    const { data: paraPengusul } = await supabase
      .from('new_circles')
      .select('discord_id')
      .eq('booth_id', itemUsulan.booth_id);

    // 3. PROSES PENGGABUNGAN (Merge & Unique)
    const listLama = Array.isArray(dataLama?.discord_id) ? dataLama.discord_id : [];
    
    // Ambil semua ID dari antrean new_circles (termasuk milik Udin dan Joko)
    const listBaru = paraPengusul ? paraPengusul.map(p => p.discord_id) : [];

    // Gabung semuanya: (Lama + Semua Antrean Saat Ini)
    // Set akan otomatis membuang duplikat jika orang yang sama input berkali-kali
    const gabunganKontributor = [...new Set([...listLama, ...listBaru])].filter(Boolean);

    // 4. UPSERT KE TABEL UTAMA
    const { error: insertError } = await supabase
      .from('circles')
      .upsert({
        booth_id: itemUsulan.booth_id,
        circle_name: itemUsulan.circle_name,
        fandom: itemUsulan.fandom,
        link_katalog: itemUsulan.link_katalog,
        character_ids: itemUsulan.character_ids,
        discord_id: gabunganKontributor, // <--- Udin & Joko masuk sini
        status: 'verified'
      }, { onConflict: 'booth_id' });

    if (insertError) throw insertError;

    // 5. HAPUS SEMUA ANTREAN UNTUK BOOTH INI
    // Karena meja sudah terupdate dengan data terbaik (Joko), usulan Udin dkk dihapus
    await supabase
      .from('new_circles')
      .delete()
      .eq('booth_id', itemUsulan.booth_id);

    tampilkanPesan('Verifikasi Berhasil!', 'Semua kontributor telah tercatat.', 'success');

    await warnaiPeta();
    onPetaClick({ target: { id: itemUsulan.booth_id } });

  } catch (err) {
    console.error("Gagal verifikasi:", err);
    alert("Error: " + err.message);
  } finally {
    loading.value = false;
  }
}

async function tolakPerubahan(idDatabase) {
  if (!confirm("Hapus usulan ini?")) return;
  loading.value = true;
  
  const { error } = await supabase
    .from('new_circles')
    .delete()
    .eq('booth_id', itemUsulan.booth_id);

  if (deleteError) {
      console.error("Gagal menghapus data usulan:", deleteError.message);
      alert("Data masuk ke tabel Utama, tapi gagal menghapus usulan lama.");
    } else {
      alert("Data Berhasil Diverifikasi! Meja sekarang resmi.");
    }
    await warnaiPeta(); 
    onPetaClick({ target: { id: itemUsulan.booth_id } });
  loading.value = false;
}

async function fetchAllUsers() {
  const { data } = await supabase.from('user').select('discord_id, username');
  if (data) userCache.value = data;
}

// Tambahkan fetchAllUsers() di dalam onMounted kamu agar jalan saat start
onMounted(async () => {
  // ... kode lainnya ...
  await fetchAllUsers(); 
  // ... kode lainnya ...
});

function getNameFromId(id) {
  const found = userCache.value.find(u => u.discord_id === String(id));
  // Jika nama ketemu, tampilkan. Jika tidak, tampilkan ID-nya saja (sebagai fallback)
  return found ? found.username : id;
}

function getNamaKarakterDariIds(ids) {
  if (!ids || !Array.isArray(ids)) return '-';
  
  const daftarNama = ids.map(id => {
    const found = daftarKarakterDB.value.find(char => char.id === id);
    return found ? found.character_name : 'Unknown';
  });

  // Tambahkan .sort() di sini agar urut abjad di tampilan detail
  return daftarNama.sort().join(', ');
}


// 4. FUNGSI TAMBAH & HAPUS karakter di form (filter)
function tambahKarakter(objKarakter) {
  // 1. Cek apakah ID karakter ini sudah ada di dalam daftar terpilih
  const sudahAda = selectedKarakter.value.some(item => item.id === objKarakter.id);

  if (!sudahAda) {
    // 2. Jika belum ada, masukkan SELURUH object-nya ke array
    selectedKarakter.value.push(objKarakter);
    console.log("Karakter ditambahkan:", objKarakter.character_name);
  } else {
    console.warn("Karakter sudah dipilih sebelumnya.");
  }

  // 3. Reset kolom input pencarian agar kosong kembali
  inputSearchKarakter.value = ''; 
}

function hapusKarakter(objKarakter) {
  selectedKarakter.value = selectedKarakter.value.filter(item => item.id !== objKarakter.id);
}
function addFilterTag(karakterObj) {
  // Cek duplikat berdasarkan ID
  if (!filterTags.value.some(t => t.id === karakterObj.id)) {
    filterTags.value.push(karakterObj);
  }
  filterInput.value = '';
  jalankanFilter(); // Jalankan filter warna
}
function removeFilterTag(nama) {
  filterTags.value = filterTags.value.filter(tag => tag !== nama);
  jalankanFilter();       // Langsung update peta
}
// LOGIKA FILTER SPOTLIGHT (VERSI BERSIH)
function jalankanFilter() {
  const tags = filterTags.value; // Berisi array object {id, character_name}

  if (tags.length === 0) {
    warnaiPeta();
    return;
  }

  // Ambil daftar ID yang sedang difilter (ubah ke Number agar pasti cocok)
  const filterIds = tags.map(t => Number(t.id));

  allCirclesCache.value.forEach(item => {
    const elemenMeja = document.getElementById(item.booth_id);
    if (!elemenMeja) return;

    // --- LOGIKA BARU (Cek Berdasarkan ID) ---
    // Kita cek di kolom 'character_ids' (database baru)
    const boothCharIds = item.character_ids || [];
    const isMatch = boothCharIds.some(id => filterIds.includes(Number(id)));

    if (isMatch) {
      // --- MATCH (Warna sesuai kode lawasmu) ---
      if (item.status === 'verified') {
        elemenMeja.style.fill = '#42b883'; // Hijau Verified
      } else {
        elemenMeja.style.fill = '#f7b731'; // Oranye Pending
      }
      elemenMeja.style.fillOpacity = '0.8';
      elemenMeja.style.stroke = 'none'; // Sesuai style lawas
      
    } else {
      // --- TIDAK MATCH (Abu-abu sesuai kode lawasmu) ---
      elemenMeja.style.fill = '#9a9a9a'; 
      elemenMeja.style.fillOpacity = '0.8'; 
      elemenMeja.style.stroke = 'none';
    }
  });
}

function siapkanEditData() {
  if (!infoCircle.value) return;

  // 1. Isi Nama Circle
  inputNama.value = infoCircle.value.circle_name || '';

  // 2. Isi Fandom (Pastikan formatnya array)
  const f = infoCircle.value.fandom;
  inputFandom.value = typeof f === 'string' ? f.split(', ') : (Array.isArray(f) ? f : []);

  // 3. Isi Link Katalog
  inputKatalog.value = infoCircle.value.link_katalog || '';

  // 4. Isi Karakter (Mapping ID ke Object agar tag muncul)
  if (infoCircle.value.character_ids && Array.isArray(infoCircle.value.character_ids)) {
    selectedKarakter.value = infoCircle.value.character_ids.map(id => {
      return daftarKarakterDB.value.find(char => char.id == id);
    }).filter(item => item !== undefined); // Hapus jika ada ID yang tidak ditemukan
  } else {
    selectedKarakter.value = [];
  }

  // 5. Tampilkan Form
  showForm.value = true;
}

function batalEdit() {
  showForm.value = false;
  // Opsional: reset isian jika ingin benar-benar bersih
  inputNama.value = '';
  inputFandom.value = [];
  selectedKarakter.value = [];
  inputKatalog.value = '';
}

function getObjKarakterDariIds(ids) {
  if (!ids || !ids.length) return [];
  
  // 1. Ambil data lengkap objeknya
  const daftarObj = ids.map(id => {
    // Pakai == agar fleksibel BigInt/Number
    return daftarKarakterDB.value.find(char => char.id == id);
  }).filter(obj => obj !== undefined);

  // 2. TAMBAHKAN SORTIR DI SINI
  // Logikanya: Bandingkan nama A dan nama B secara alfabetis
  return daftarObj.sort((a, b) => {
    return a.character_name.localeCompare(b.character_name);
  });
}

function getUsernameFromId(id) {
  if (!id) return 'Unknown';
  
  // Kita asumsikan kamu punya cache data user, atau kita gunakan ID itu sendiri 
  // sebagai fallback jika nama belum sempat di-load.
  // Tapi untuk saat ini, mari kita buat Link-nya dulu agar fungsional.
  return id; 
}

// --- FUNGSI HELPER TAMPILKAN PESAN ---
function tampilkanPesan(judul, pesan, tipe = 'info') {
  customAlertTitle.value = judul;
  customAlertMessage.value = pesan;
  customAlertType.value = tipe;
  showCustomAlert.value = true;
}

function tutupPesan() {
  showCustomAlert.value = false;
}

watch(selectedBooths, () => {
  warnaiPeta();
}, { deep: true });

function toggleAutoPathMode() {
  autoPathMode.value = !autoPathMode.value;
  isSidebarOpen.value = false; // Tutup sidebar otomatis setelah diklik
  
  if (autoPathMode.value) {
    tampilkanPesan("Mode Jalur Aktif", "Silakan klik meja-meja di peta untuk menandai rute kamu.", "info");
  } else {
    // Jika dimatikan, kita bersihkan glow-nya (opsional)
    // selectedBooths.value = []; 
    warnaiPeta();
  }
}

function resetJalur() {
  // 1. Bersihkan Array data
  selectedBooths.value = [];
  
  // 2. Bersihkan Visual Glow di Peta
  const glowingMeja = document.querySelectorAll('.meja-glow-blue');
  glowingMeja.forEach(m => m.classList.remove('meja-glow-blue'));
  
  tampilkanPesan("Rute Dihapus", "Semua tanda jalur telah dibersihkan.", "info");
}

function generateShortestPath() {
  if (selectedBooths.value.length < 2) return;

  const originalList = [...selectedBooths.value];
  const sortedList = [];
  
  // Kita mulai dari booth pertama yang diklik user sebagai titik awal
  let currentId = originalList.shift();
  sortedList.push(currentId);

  while (originalList.length > 0) {
    let currentPos = getMejaCenter(currentId);
    let closestIdx = -1;
    let minDistance = Infinity;

    // Cari mana yang paling dekat dari posisi sekarang
    for (let i = 0; i < originalList.length; i++) {
      let targetPos = getMejaCenter(originalList[i]);
      // Rumus Pythagoras: a^2 + b^2 = c^2
      let dist = Math.sqrt(
        Math.pow(targetPos.x - currentPos.x, 2) + 
        Math.pow(targetPos.y - currentPos.y, 2)
      );

      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = i;
      }
    }
    // Pindah ke meja terdekat tersebut
    currentId = originalList.splice(closestIdx, 1)[0];
    sortedList.push(currentId);
    console.log("Urutan Baru:", sortedList);
    selectedBooths.value = sortedList;
  }

  // Update daftar pilihan dengan urutan yang sudah dioptimasi
  selectedBooths.value = sortedList;
  // Opsional: Jalankan warnaiPeta jika ingin ada efek visual urutan
  warnaiPeta();
}

function isWalkable(x, y) {
  const jalanEl = document.getElementById('jalan');
  if (!jalanEl) return true; // Fallback jika objek tidak ditemukan

  const svg = jalanEl.ownerSVGElement;
  const point = svg.createSVGPoint();
  point.x = x;
  point.y = y;

  // Mengecek apakah titik (x,y) berada di dalam shape 'jalan'
  return jalanEl.isPointInFill(point);
}

function buildNavigationGraph() {
  console.log("Membangun navigasi jalan...");
  const svg = document.querySelector('svg');
  const jalanEl = document.getElementById('jalan');
  if (!jalanEl) return null; // Beri return null jika gagal

  const width = 57000;
  const height = 30000;
  const rows = Math.ceil(height / GRID_SIZE);
  const cols = Math.ceil(width / GRID_SIZE);
  
  let matrix = [];
  const pt = svg.createSVGPoint();

  for (let y = 0; y < rows; y++) {
    let row = [];
    for (let x = 0; x < cols; x++) {
      pt.x = x * GRID_SIZE + (GRID_SIZE / 2);
      pt.y = y * GRID_SIZE + (GRID_SIZE / 2);
      
      const isWalkable = jalanEl.isPointInFill(pt);
      row.push(isWalkable ? 1 : 0); 
    }
    matrix.push(row);
  }
  
  console.log("Navigasi siap!");
  // Kembalikan objek Graph-nya
  return new Graph(matrix); 
}

function findSmartPath(startId, endId) {
  if (!graph) buildNavigationGraph();

  const startPos = getMejaCenter(startId);
  const endPos = getMejaCenter(endId);

  // Konversi koordinat SVG ke index Grid
  const startNode = graph.grid[Math.floor(startPos.y / GRID_SIZE)][Math.floor(startPos.x / GRID_SIZE)];
  const endNode = graph.grid[Math.floor(endPos.y / GRID_SIZE)][Math.floor(endPos.x / GRID_SIZE)];

  // Hitung rute dengan algoritma A*
  const result = astar.search(graph, startNode, endNode);
  
  // Kembalikan koordinat asli SVG
  return result.map(node => ({
    x: node.y * GRID_SIZE + (GRID_SIZE / 2), // Library astar pakai [y][x]
    y: node.x * GRID_SIZE + (GRID_SIZE / 2)
  }));
}

// --- LOGIKA PENCARIAN (SEARCH ENGINE) ---
watch(inputSearch, (keywordBaru) => {
  const keyword = keywordBaru.toLowerCase();

  // 1. Jika kotak pencarian KOSONG -> Reset Peta ke warna asli
  if (keyword === '') {
    warnaiPeta(); // Panggil ulang fungsi pewarna normal
    return;
  }

  // 2. Jika ada ketikan -> Lakukan Pencarian
  const hasilCari = allCirclesCache.value.filter(item => {
    // Cek Nama Circle
    const cekNama = item.circle_name && item.circle_name.toLowerCase().includes(keyword);
    
    // Cek Fandom (Array)
    const cekFandom = item.fandom && item.fandom.some(f => f.toLowerCase().includes(keyword));
    
    // Cek Karakter (Array)
    const cekChar = item.characters && item.characters.some(c => c.toLowerCase().includes(keyword));

    return cekNama || cekFandom || cekChar;
  });

  // Ambil daftar ID yang ketemu
  const idKetemu = hasilCari.map(item => item.booth_id);

  // 3. Update Tampilan Peta
  //loop semua elemen SVG yang punya ID (meja)
  const semuaMeja = document.querySelectorAll('svg rect, svg path, svg polygon');
  
  semuaMeja.forEach(meja => {
    if (meja.id) {
      if (idKetemu.includes(meja.id)) {
        // JIKA KETEMU: Tambah kelas Highlight
        meja.classList.add('search-match');
        meja.style.fillOpacity = '1'; // Paksa solid
      } else {
        // JIKA TIDAK KETEMU: Redupkan (Ghost Mode)
        meja.classList.remove('search-match');
        meja.style.fill = '#000'; // Jadi hitam pudar
        meja.style.fillOpacity = '0.1'; // Sangat transparan
      }
    }
  });
});

// Menghitung jumlah kemunculan setiap karakter berdasarkan ID di semua circles & new_circles
const characterFrequencyMap = computed(() => {
  const map = {};
  allCirclesCache.value.forEach(circle => {
    const cIds = circle.character_ids;
    if (Array.isArray(cIds)) {
      cIds.forEach(id => {
        map[id] = (map[id] || 0) + 1;
      });
    }
  });
  return map;
});

function getCharacterCount(charId) {
  return characterFrequencyMap.value[charId] || 0;
}

watch(autoPathMode, (baru) => {
  if (!baru) {
    // Kita tidak menghapus .meja-glow-blue di sini
    // Agar user tetap bisa melihat pilihan jalurnya sambil berinteraksi biasa
    tampilkanPesan("Mode Jalur Mati", "Kembali ke mode info biasa. Glow tetap tersimpan.", "info");
  } else {
    tampilkanPesan("Mode Jalur Aktif", "Klik meja untuk menambah/menghapus dari rute.", "info");
  }
});

const panelTouchStartY = ref(0);

function onPanelTouchStart(event) {
  if (event.touches && event.touches.length > 0) {
    panelTouchStartY.value = event.touches[0].clientY;
  }
}

function onPanelTouchEnd(event, panelElement) {
  if (event.changedTouches && event.changedTouches.length > 0) {
    const touchEndY = event.changedTouches[0].clientY;
    const deltaY = panelTouchStartY.value - touchEndY;

    // Cari elemen tombol toggle di dalam panel untuk mengupdate teks/ikonnya secara otomatis
    const btnText = panelElement.querySelector('.toggle-text');
    const btnIcon = panelElement.querySelector('.toggle-icon');

    // Jika digeser ke atas > 40px, buka/expand panel
    if (deltaY > 40) {
      panelElement.classList.add('expanded');
      isPanelExpanded.value = true; // KUNCI: Ubah status ke true (Full State)
      if (btnText) btnText.textContent = 'Perkecil';
      if (btnIcon) btnIcon.innerHTML = '&#9660;'; // Panah ke bawah
    } 
    // Jika digeser ke bawah < -40px, kembalikan ke mode ringkas (minimize)
    else if (deltaY < -40) {
      panelElement.classList.remove('expanded');
      isPanelExpanded.value = false; // KUNCI: Ubah status ke false (Partial State)
      if (btnText) btnText.textContent = 'Perbesar';
      if (btnIcon) btnIcon.innerHTML = '&#9650;'; // Panah ke atas
    }
  }
}

function closeFilterDropdown() {
  filterInput.value = ''; // Mengosongkan teks pencarian
  isFilterFocused.value = false; // Menutup dropdown fokus
}

// Fungsi untuk menutup panel info sepenuhnya
function closeInfoPanel() {
  const panelEl = document.querySelector('.info-panel');
  if (panelEl) {
    panelEl.classList.remove('expanded');
  }
  isPanelExpanded.value = false; // Reset status
  selectedBooth.value = null;
}

function togglePanelState(event) {
  const panelEl = document.querySelector('.info-panel');
  if (!panelEl) return;

  const isExpanded = panelEl.classList.contains('expanded');
  const btnText = event.currentTarget.querySelector('.toggle-text');
  const btnIcon = event.currentTarget.querySelector('.toggle-icon');

  if (isExpanded) {
    panelEl.classList.remove('expanded');
    isPanelExpanded.value = false; // Kembali ke mode partial (1 baris scroll)
    if (btnText) btnText.textContent = 'Perbesar';
    if (btnIcon) btnIcon.innerHTML = '&#9650;';
  } else {
    panelEl.classList.add('expanded');
    isPanelExpanded.value = true;  // Berubah ke full state (grid penuh)
    if (btnText) btnText.textContent = 'Perkecil';
    if (btnIcon) btnIcon.innerHTML = '&#9660;';
  }
}

const isPanelExpanded = ref(false);
const sortMode = ref('alphabet'); // Pilihan: 'alphabet' atau 'popular'

// Fungsi untuk mengganti mode urutan saat tombol diklik
function toggleSortMode() {
  sortMode.value = sortMode.value === 'alphabet' ? 'popular' : 'alphabet';
}
const dropdownList = ref(null); // Tambahkan ref ini di daftar variabel atas jika belum ad
const focusedIndex = ref(-1); // Untuk melacak posisi sorotan keyboard di dropdown
async function handleKeydown(event) {
  if (saranKarakter.value.length === 0) return;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    focusedIndex.value = (focusedIndex.value + 1) % saranKarakter.value.length;
    await scrollToFocused();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    focusedIndex.value = (focusedIndex.value - 1 + saranKarakter.value.length) % saranKarakter.value.length;
    await scrollToFocused();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (focusedIndex.value >= 0 && focusedIndex.value < saranKarakter.value.length) {
      tambahKarakter(saranKarakter.value[focusedIndex.value]);
      focusedIndex.value = -1;
    }
  }
}
async function scrollToFocused() {
  await nextTick();
  if (!dropdownList.value) return;
  const items = dropdownList.value.querySelectorAll('li');
  if (items[focusedIndex.value]) {
    items[focusedIndex.value].scrollIntoView({
      block: 'nearest',
      behavior: 'smooth'
    });
  }
}

// Reset index saat input berubah
watch(inputSearchKarakter, () => {
  focusedIndex.value = -1;
});
</script>

<template>

<nav class="navbar">
  <div class="navbar-container">
    <button class="menu-toggle" @click="toggleSidebar">
      <div class="bar"></div>
      <div class="bar"></div>
      <div class="bar"></div>
    </button>
    <h1 class="navbar-logo">
       Comifuro 23 Arknights Map
    </h1>
  </div>
</nav>

<div class="navbar-spacer"></div>

<div class="sidebar-overlay" v-if="isSidebarOpen" @click="toggleSidebar"></div>

<aside class="sidebar" :class="{ 'is-open': isSidebarOpen }">
  <div class="sidebar-header">
    <h2>Menu</h2>
    <button class="close-btn" @click="toggleSidebar">&times;</button>
  </div>
  
  <div class="sidebar-content">
    <p>dibuat oleh: Nekovich dari Arknights Indonesia (AKID)</p>
    <hr>
    
    <div class="menu-item"> Leaderboard Kontributor</div>
    <div class="menu-item"> Statistik Karakter</div>
    <a href="https://linktr.ee/ArknightsIndonesiaAKID" target="_blank" class="menu-item link-no-style">
    Link Komunitas
    </a>
    <div class="menu-item"> About</div>
  </div>
</aside>

  <div class="container">

    <div class="layout">
      
      <div class="col-left">

        <div id="peta-container" class="map-window">
          <div id="peta-scene">
            <div 
              class="peta-box" 
              v-html="svgContent"
              @click="onPetaClick"
              @touchstart="onTouchStart"
              @touchend="onTouchEnd"
            ></div>
          </div>
          <div v-if="autoPathMode" class="floating-path-controls">
            <div class="path-status">
              <span class="pulse-icon">📍</span> 
              <strong>{{ selectedBooths.length }} Booth Terpilih</strong>
            </div>
            
            <div class="path-actions">
              <div v-for="(id, index) in selectedBooths" :key="id">
                {{ index + 1 }}. Booth {{ id }}
              </div>
              <button @click="generateShortestPath" class="btn-float-action optimize" v-if="selectedBooths.length > 1">
                ⚡ Urutkan
              </button>
              <button @click="resetJalur" class="btn-float-action reset" v-if="selectedBooths.length > 0">
                🧹 Reset
              </button>
              <button @click="autoPathMode = false" class="btn-float-action stop">
                🛑 Selesai
              </button>
            </div>
          </div>
        </div>

        <div class="zoom-controls">
          <div class="map-legend-mini">
            <div class="legend-row">
              <div class="legend-item"><span class="dot green"></span> AK (Verif)</div>
              <div class="legend-item"><span class="dot orange"></span> Unverif</div>
              <div class="legend-item"><span class="dot grey"></span> Non-AK</div>
              <div class="legend-item"><span class="dot blue-translucent"></span> No Data</div>
            </div>
          </div>
        </div>

        

      </div>
      <!-- PANEL INFORMASI BAWAH (Bottom Sheet) -->
      <div class="info-panel" :class="{ 'expanded': showForm || isPanelExpanded }"
        @touchstart="onPanelTouchStart" 
        @touchend="(e) => onPanelTouchEnd(e, e.currentTarget)">

        <!-- KONDISI A: BOOTH BELUM ADA DATA (FORM KOSONG) -> HANYA ADA TOMBOL CLOSE -->
        <div v-if="showForm" style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 8px; width: 100%; position: relative;">
          <!-- Tombol Close Panel Saja -->
          <button @click="closeInfoPanel" title="Tutup Panel" style="background: #f1f5f9; border: none; width: 28px; height: 28px; border-radius: 50%; font-size: 1rem; font-weight: bold; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            &times;
          </button>
        </div>

        <!-- KONDISI B: BOOTH SUDAH ADA DATA / NORMAL -> ADA TOMBOL TOGGLE & CLOSE -->
        <div v-else-if="infoCircle" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; width: 100%; position: relative;">
          <div style="width: 32px;"></div>

          <!-- Tombol Toggle Partial / Full State -->
          <button @click="togglePanelState($event)" title="Ubah Ukuran Panel" style="background: #f1f5f9; border: none; padding: 4px 12px; border-radius: 14px; font-size: 0.8rem; font-weight: bold; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 4px;">
            <span class="toggle-icon">&#9650;</span> <span class="toggle-text">Perbesar</span>
          </button>

          <!-- Tombol Close Panel -->
          <button @click="closeInfoPanel" title="Tutup Panel" style="background: #f1f5f9; border: none; width: 28px; height: 28px; border-radius: 50%; font-size: 1rem; font-weight: bold; color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;">
            &times;
          </button>
        </div>

        <!-- PLACEHOLDER SAAT BELUM KLIK BOOTH -->
        <div v-if="!selectedBooth" class="placeholder-text">
          <p>Klik salah satu kotak meja di peta untuk melihat detail info</p>
        </div>

        <!-- STATUS LOADING -->
        <div v-else-if="loading">
          <p>Sedang memuat data...</p>
        </div>

        <!-- KARTU DETAIL CIRCLE (Hanya muncul jika ada data & form tidak aktif) -->
        <div v-else-if="infoCircle && !showForm" class="card">

          <div v-if="isAdmin && dataUsulanPending && Array.isArray(dataUsulanPending)" 
              style="background: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 8px; margin-bottom: 15px;">
            <strong style="color: #856404;">⚠️ Ada {{ dataUsulanPending.length }} Usulan di Meja Ini:</strong>
            
            <div v-for="(usulan, index) in dataUsulanPending" :key="usulan.id" 
                style="background: white; margin-top: 10px; padding: 10px; border-radius: 6px; border: 1px dashed #ffc107;">
              <small style="color: #666;">Usulan #{{ dataUsulanPending.length - index }} ({{ new Date(usulan.created_at).toLocaleTimeString() }})</small>
              <p style="margin: 5px 0;"><strong>{{ usulan.circle_name }}</strong></p>
              <small style="display: block; margin-top: 5px;">
                <strong>Fandom:</strong> {{ usulan.fandom }}
              </small>
              
              <small style="display: block; margin-top: 5px;">
                <strong>Karakter:</strong>
                <span>{{ getNamaKarakterDariIds(infoCircle.character_ids) }}</span>
              </small>

              <small style="display: block; margin-top: 5px;">
                <strong>Katalog:</strong> 
                <a v-if="usulan.link_katalog" :href="usulan.link_katalog" target="_blank" style="color: #3498db;">Lihat Katalog ↗</a>
                <span v-else style="color: #999;">(Kosong)</span>
              </small>

              <div style="display: flex; gap: 5px; margin-top: 8px;">
                <button @click="verifikasiData(usulan)" style="flex: 2; background: #2ecc71; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 0.8em; font-weight: bold;">
                  Terima Yang Ini
                </button>
                <button @click="tolakPerubahan(usulan.id)" style="flex: 1; background: #eb4d4b; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 0.8em;">
                  Hapus
                </button>
              </div>
            </div>
          </div>

          <h3>Meja: {{ infoCircle.booth_id }}</h3>
          <p><strong>Nama:</strong> {{ infoCircle.circle_name }}</p>
          <p>
            <strong>Fandom:</strong>
            <span>
              {{ 
                Array.isArray(infoCircle.fandom) 
                ? infoCircle.fandom.join(', ') 
                : (infoCircle.fandom || '-') 
              }}
            </span>
          </p>

          <!-- BAGIAN KARAKTER YANG DIJUAL -->
          <div class="character-preview-section" v-if="getObjKarakterDariIds(infoCircle.character_ids).length > 0">
            <strong>Karakter yang Dijual:</strong>
            
            <div :class="['portrait-container', { 'is-partial': !isPanelExpanded }]">
              <div v-for="char in getObjKarakterDariIds(infoCircle.character_ids)" 
                  :key="char.id" 
                  class="portrait-card"
                  :title="char.character_name"> 
                <img :src="char.image_url" 
                    :alt="char.character_name" 
                    class="portrait-img"
                    onerror="this.src='/src/assets/avatar_placeholder.png';"> 
                <span class="portrait-name">{{ char.character_name }}</span>
              </div>
            </div>
          </div>

          <p v-else>
            <strong>Karakter:</strong> <span style="color: grey;">-</span>
          </p>
         
          <!-- KATALOG MODERN -->
          <div style="margin: 12px 0; display: flex; flex-direction: column; gap: 6px;">
            <strong>Katalog:</strong> 
            <div>
              <a v-if="infoCircle.link_katalog" 
                :href="ensureExternalLink(infoCircle.link_katalog)" 
                target="_blank" 
                class="btn-katalog-modern">
                <span>📖 Lihat Katalog</span>
                <span class="katalog-arrow">↗</span>
              </a>
              <span v-else style="color: grey; font-style: italic;">
                tidak ada katalog
              </span>
            </div>
          </div>
          
          <div style="margin-top: 15px;">
            <div v-if="infoCircle.status === 'verified'" class="status-badge verified">
              Terverifikasi
            </div>
            
            <div v-else class="status-badge pending">
              Menunggu Verifikasi
            </div>
          </div>

          <!-- BAGIAN PENYUMBANG INFO (Rata Kiri) -->
          <div v-if="infoCircle.discord_id" class="contributor-section">
            <small class="contributor-label">🤝 Penyumbang Info:</small>
            <div class="contributor-list">
              
              <template v-if="Array.isArray(infoCircle.discord_id)">
                <a v-for="id in infoCircle.discord_id" 
                  :key="id" 
                  :href="'https://discord.com/users/' + id" 
                  target="_blank" 
                  class="discord-badge">
                  <span>{{ getNameFromId(id) }}</span>
                </a>
              </template>
              
              <a v-else 
                :href="'https://discord.com/users/' + infoCircle.discord_id" 
                target="_blank" 
                class="discord-badge">
                <span>{{ getNameFromId(infoCircle.discord_id) }}</span>
              </a>

            </div>
          </div>

          <div v-if="!isAdmin && infoCircle.new_circle_name" 
              style="margin-top: 10px; background: #e3f2fd; padding: 8px; border-radius: 4px; font-size: 0.8em; color: #1976d2;">
            ℹ️ Perubahan data untuk meja ini sedang ditinjau oleh Admin.
          </div>

          <div v-if="infoCircle.contributor_name" style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
            <small style="color: grey;">✍️ Data disumbangkan oleh:</small> <br>
            
            <strong style="color: #2c3e50; font-size: 1.1em;">
              <a 
                v-if="infoCircle.contributor_uid && /^\d+$/.test(infoCircle.contributor_uid)"
                :href="'https://discord.com/users/' + infoCircle.contributor_uid" 
                target="_blank" 
                class="discord-link"
                title="Lihat profil Discord"
              >
                {{ infoCircle.contributor_name }}
              </a>
              
              <span v-else>{{ infoCircle.contributor_name }}</span>
            </strong>
          </div>
          
          <div style="margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
  
            <div v-if="!isAdmin && infoCircle.new_circle_name" style="margin-bottom: 10px;">
              <button @click="verifikasiData(infoCircle.booth_id)" 
                      style="background: #2ecc71; color: white; border: none; padding: 8px; border-radius: 4px; width: 100%; font-weight: bold; cursor: pointer;">
                ✅ Verifikasi Meja Ini (Admin)
              </button>
            </div>

            <span style="color: grey; font-size: 0.75em;">Data salah? </span>
            <button @click="siapkanEditData" class="btn-small">Edit Data</button>

          </div>
        </div>

        <!-- FORM INPUT / EDIT DATA (FULL STATE OTOMATIS) -->
        <div v-if="showForm" class="form-card">
          
          <div v-if="!currentUser" style="text-align: center; padding: 20px 0;">
            <h3>Data Meja {{ selectedBooth }} Masih Kosong</h3>
            <p style="color: grey; margin-bottom: 20px;">Ingin bantu kami dengan mengisi data atau mengeditnya? Silahkan login menggunakan Discord terlebih dahulu. demi keamanan.</p>
            
            <button @click="loginWithDiscord" style="background: #5865F2; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 10px;">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M13.545 2.907a13.227 13.227 0 0 0-3.257-1.011.05.05 0 0 0-.052.025c-.141.25-.297.577-.406.833a12.19 12.19 0 0 0-3.658 0 8.258 8.258 0 0 0-.412-.833.051.051 0 0 0-.052-.025c-1.125.194-2.22.534-3.257 1.011a.041.041 0 0 0-.021.018C.356 6.024-.213 9.047.066 12.032c.001.014.01.028.021.037a13.276 13.276 0 0 0 3.995 2.02.05.05 0 0 0 .056-.019c.308-.42.582-.863.818-1.329a.05.05 0 0 0-.01-.059.051.051 0 0 0-.018-.011 8.875 8.875 0 0 1-1.248-.595.05.05 0 0 1-.02-.066.051.051 0 0 1 .015-.019c.084-.063.168-.129.248-.195a.05.05 0 0 1 .051-.007c2.619 1.196 5.454 1.196 8.041 0a.052.052 0 0 1 .053.007c.08.066.164.132.248.195a.051.051 0 0 1-.004.085 8.254 8.254 0 0 1-1.249.594.05.05 0 0 0-.03.03.052.052 0 0 0 .003.041c.24.465.515.909.817 1.329a.05.05 0 0 0 .056.019 13.235 13.235 0 0 0 4.001-2.02.049.049 0 0 0 .021-.037c.334-3.451-.559-6.449-2.366-9.106a.034.034 0 0 0-.02-.019Zm-8.198 7.307c-.789 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.45.73 1.438 1.613 0 .888-.637 1.612-1.438 1.612Zm5.316 0c-.788 0-1.438-.724-1.438-1.612 0-.889.637-1.613 1.438-1.613.807 0 1.451.73 1.438 1.613 0 .888-.631 1.612-1.438 1.612Z"/>
              </svg>
              Login dengan Discord
            </button>
            <button @click="showForm = false" class="btn-cancel">Batal</button>
          </div>

          <div v-else>
            <h3>Isi Data Circle ({{ selectedBooth }})</h3>
            
            <div style="background: #e8f5e9; padding: 8px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9em; display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #2e7d32;">
                👤 Login sebagai: <strong>{{ currentUser?.user_metadata?.custom_claims?.global_name || currentUser?.user_metadata?.full_name || 'User' }}</strong>
              </span>
              <button @click="logout" style="background:none; border:none; color: red; cursor: pointer; text-decoration: underline; font-size: 0.9em;">Logout</button>
            </div>

            <p class="hint">Data baru akan berstatus "Pending" sampai diverifikasi admin.</p>
            
            <div class="form-group">
              <label>Nama Circle:</label>
              <input v-model="inputNama" type="text" placeholder="Contoh: SSR Cloth">
            </div>
            
            <div class="form-group">
              <label>Fandom yang dijual:</label>
              <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 5px;">
                <label v-for="item in daftarFandom" :key="item" style="font-weight: normal; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                  <input type="checkbox" :value="item" v-model="inputFandom">
                  {{ item }}
                </label>
              </div>
              <small style="color: grey;">Terpilih: {{ inputFandom.join(', ') }}</small>
            </div>

            <div class="form-group">
              <label>Link Katalog (Google Drive / X/ Instagram):</label>
              <input v-model="inputKatalog" type="url" placeholder="https://drive.google.com/...">
            </div>

            <div class="form-group" style="position: relative;">
              <label>Karakter (Ketik untuk cari):</label>
              
              <div class="tags-container">
                <span v-for="char in selectedKarakter" :key="char.id" class="tag-karakter">
                  {{ char.character_name }} <button @click="hapusKarakter(char)" title="Hapus karakter">&times;</button>
                </span>
              </div>

              <input 
                type="text" 
                v-model="inputSearchKarakter" 
                placeholder="Ketik nama operator...(Gunakan Panah & Enter)" 
                class="input-form"
                @keydown="handleKeydown"
              >

              <ul ref="dropdownList" v-if="saranKarakter.length > 0" class="dropdown-sugesti" style="max-height: 350px; overflow-y: auto;">
                <li v-for="(saran, index) in saranKarakter" 
                    :key="saran.character_name" 
                    @click="tambahKarakter(saran); focusedIndex = -1;" 
                    :style="{ display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: index === focusedIndex ? '#e0f2f1' : 'transparent' }"
                    @mouseenter="focusedIndex = index">
                  <img :src="saran.image_url" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover;" onerror="this.style.display='none'">
                  {{ saran.character_name }}
                </li>
              </ul>
            </div>

            <button @click="submitData" class="btn-submit">Simpan Data</button>
            <button @click="showForm = false" v-if="infoCircle" class="btn-cancel">Batal</button>
          </div>

        </div>

      </div>
    </div>

    <div class="search-box" style="background: white; padding: 12px 15px; border-radius: 24px; border: 1px solid #e2e8f0; margin-top: 0px; position: relative; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
      
      <!-- 1. BARIS INPUT PENCARIAN & TOMBOL KEMBALI (Paling Atas) -->
      <div style="display: flex; align-items: center; gap: 6px; width: 100%; margin-bottom: 6px; position: relative; z-index: 10;">
        <!-- Tombol Kembali / Tutup Dropdown -->
        <button @click="closeFilterDropdown" title="Tutup" style="background: transparent; border: none; font-size: 1.2rem; font-weight: bold; color: #64748b; cursor: pointer; padding: 0 4px; display: flex; align-items: center; justify-content: center;">
          &#8592;
        </button>

        <!-- Input Pencarian -->
        <!-- Input Pencarian (Hapus @blur="onFilterBlur") -->
<input type="text" v-model="filterInput" placeholder="Cari operator..." style="width: 100%; padding: 6px 4px; border: none; outline: none; font-size: 0.95rem; background: transparent;" @focus="isFilterFocused = true">

        <!-- TOMBOL SORT (Ubah Mode Urutan di Kanan) -->
        <button @click.stop.prevent="toggleSortMode" :title="sortMode === 'alphabet' ? 'Mode: Abjad (A-Z)' : 'Mode: Terpopuler'" style="background: #f1f5f9; border: none; padding: 6px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 4px; white-space: nowrap; flex-shrink: 0;">
          <span v-if="sortMode === 'alphabet'">🔤 A-Z</span>
          <span v-else>🔥 Populer</span>
        </button>
      </div>

      <!-- 2. BARIS TAG/CHIPS OPERATOR YANG SUDAH DIPILIH -->
      <div style="display: flex; flex-direction: row; overflow-x: auto; overflow-y: hidden; gap: 6px; margin-bottom: 6px; padding-bottom: 4px; align-items: center; position: relative; z-index: 10;" v-if="filterTags.length > 0">
        <span v-for="tag in filterTags" :key="tag.character_name" style="position: relative; display: inline-flex; align-items: center; flex-shrink: 0;" :title="tag.character_name">
          <!-- Foto Avatar Bulat -->
          <img :src="tag.image_url" alt="" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: white; border: 2px solid #3498db; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" onerror="this.style.display='none'" />
          
          <!-- Tombol Silang Kecil di Pojok Kanan Atas Avatar -->
          <button @click="removeFilterTag(tag)" style="position: absolute; top: -2px; right: -2px; background: #e74c3c; border: 2px solid white; color: white; border-radius: 50%; width: 16px; height: 16px; cursor: pointer; font-weight: bold; font-size: 0.65rem; display: flex; align-items: center; justify-content: center; padding: 0; line-height: 1;">
            &times;
          </button>
        </span>
      </div>

      <!-- 3. DROPDOWN SARAN KARAKTER -->
      <ul v-if="filterSaran.length > 0" class="filter-dropdown-menu" style="position: relative; z-index: 10; list-style: none; margin: 4px 0 0 0; padding: 6px 0 0 0; max-height: 240px; overflow-y: auto; display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; border-top: 1px solid #f1f5f9;">
        <li v-for="saran in filterSaran" :key="saran.character_name" @click="addFilterTag(saran)" style="aspect-ratio: 1 / 1; height: auto; display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; background: #f8f9fa; border: 1px solid #eee; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 0.75em; color: #444; transition: all 0.2s; overflow: hidden; padding: 3px; box-sizing: border-box;" onmouseover="this.style.background='#3498db'; this.style.color='white'; this.style.borderColor='#3498db';" onmouseout="this.style.background='#f8f9fa'; this.style.color='#444'; this.style.borderColor='#eee';">
          
          <!-- Container Gambar & Badge Counter -->
          <div style="position: relative; width: 100%; height: 65%; display: flex; align-items: center; justify-content: center;">
            <img :src="saran.image_url" alt="" style="max-width: 100%; height: 100%; object-fit: contain;" onerror="this.style.display='none'" />
            
            <!-- Badge Angka Kecil di Pojok Kanan Atas Gambar -->
            <span :style="{
              position: 'absolute',
              bottom: '0px',
              right: '0px',
              backgroundColor: getCharacterCount(saran.id) > 0 ? '#2ecc71' : '#e74c3c',
              color: 'white',
              fontSize: '0.75em',
              fontWeight: 'bold',
              padding: '1px 4px',
              borderRadius: '8px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }">
                {{ getCharacterCount(saran.id) }}
            </span>
          </div>

          <!-- Nama Karakter -->
          <span style="width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.65rem;">
            {{ saran.character_name }}
          </span>
        </li>
      </ul>

      <!-- 4. OVERLAY TRANSPARAN DI LUAR KOTAK (Ditaruh di Paling Bawah agar tidak menutupi tombol) -->
      <div v-if="filterSaran.length > 0" @click="closeFilterDropdown" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: transparent; z-index: 1;"></div>
    </div>

  </div>

<div v-if="showCustomAlert" class="custom-alert-overlay" @click.self="tutupPesan">
  <div class="custom-alert-content" :class="customAlertType">
    
    <div class="alert-header" style="padding: 30px 25px 10px; text-align: center;">
      <h3 class="alert-title" style="margin: 0; font-size: 1.6rem; font-weight: 800; color: #2c3e50;">
        {{ customAlertTitle }}
      </h3>
    </div>

    <div class="alert-body" style="padding: 10px 25px 25px; text-align: center; color: #4a5568;">
      <p>{{ customAlertMessage }}</p>
    </div>

    <div class="alert-footer" style="padding: 15px 25px 25px; display: flex; justify-content: center;">
      <button @click="tutupPesan" class="btn-alert-ok">OK, Meong</button>
    </div>

  </div>
</div>

</template>






<style>
:root {
  color-scheme: light;
}

h1 {
  color: #2c3e50 !important; /* Paksa jadi biru gelap/hitam */
  text-shadow: 1px 1px 2px white; /* Tambah bayangan putih tipis agar kontras dengan BG */
}

body {
  /* Ganti URL sesuai nama file gambar Anda */
  background-image: url('/bg.png'); 
  
  /* Ini kunci agar gambar tidak ikut ter-scroll */
  background-attachment: fixed; 
  
  /* Agar gambar menutupi seluruh layar dengan rapi */
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  
  margin: 0;
  padding: 0;
}

.filter-dropdown-menu {
  position: absolute !important;
  top: 100% !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 3005 !important;
  background: white !important;
  border: 1px solid #ddd !important;
  border-radius: 0 0 12px 12px !important;
  box-shadow: 0 8px 20px rgba(0,0,0,0.15) !important;
  max-height: 250px !important; /* Batasi tinggi di desktop/general */
  overflow-y: auto !important;
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)) !important;
  gap: 8px !important;
  padding: 10px !important;
  list-style: none !important;
  margin: 0 !important;
}

@media (max-width: 768px) {
  h1 {
    font-size: 1.1rem !important; 
    line-height: 1.1; 
    margin: 5px auto !important;
    max-width: 80%; 
    font-weight: 800;
    text-align: center;
  }

  .container {
    padding: 0 !important;
    width: 100vw !important;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .layout {
    display: block !important;
  }

  .col-left {
    width: 100% !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: center !important;
    margin: 0 !important;
  }

  /* --- PANEL INFORMASI BAWAH (Bottom Sheet) --- */
  .info-panel {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    width: 100% !important;
    max-height: 65vh !important; /* Dinaikkan dari 52vh ke 65vh agar muat sampai karakter */
    height: auto !important;
    text-align: left !important;
    overflow-y: hidden !important; /* Sembunyikan scroll vertikal di mode partial */
    z-index: 1005 !important;
    background-color: #ffffff !important;
    box-shadow: 0 -4px 30px rgba(0,0,0,0.2) !important;
    border-radius: 24px 24px 0 0 !important;
    padding: 15px 20px 25px 20px !important;
    box-sizing: border-box;
    transition: max-height 0.3s cubic-bezier(0.25, 1, 0.5, 1) !important;
    display: flex !important;
    flex-direction: column !important;
  }
  
  .info-panel.expanded {
    max-height: 85vh !important;
    overflow-y: auto !important; /* Aktifkan scroll penuh saat ditekan Perbesar */
    z-index: 2000 !important;
  }

  .info-panel::before {
    content: '';
    display: block;
    width: 40px;
    height: 4px;
    background-color: #cbd5e1;
    border-radius: 2px;
    margin: 0 auto 12px auto;
    cursor: grab;
  }

  .info-panel .placeholder-text {
    display: none !important; 
  }

  /* --- TAMBAHAN KODE KAMU DI SINI --- */
  .info-panel .btn-submit,  
  .info-panel .btn-small {
    border-radius: 14px !important;
    padding: 12px 20px !important;
    font-size: 1rem !important;
    font-weight: bold;
  }
  .info-panel p,
  .info-panel div,
  .info-panel span {
    margin-top: 2px !important;
    margin-bottom: 4px !important;
  }

  /* Jika teks tersebut menggunakan elemen heading seperti h2, h3, h4 */
  .info-panel h2,
  .info-panel h3,
  .info-panel h4 {
    margin-top: 4px !important;
    margin-bottom: 4px !important;
    line-height: 1.2 !important;
  }
  /* ---------------------------------- */

  .navbar-logo {
    font-size: 0.95rem;
  }
  
  .navbar {
    height: 50px;
  }
  
  .navbar-spacer {
    height: 50px;
  }
}
  
.container {
   font-family: sans-serif; 
   max-width: 100%; 
   margin: 0 auto; 
   padding: 0px;
   padding-bottom: 300px;
  }

/* Layout Utama Flexbox */
.layout { 
  display: flex; 
  gap: 10px; 
  margin-top: 20px; 
  flex-wrap: wrap; /* Agar responsif di HP turun ke bawah */
}

/* Kolom Kiri (Peta) - Mengambil 2 bagian layar */
.col-left { 
  flex: 3; 
  min-width: 300px; 
}

/* Kolom Kanan (Info) - Mengambil 1 bagian layar */
.info-panel {
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    top: auto !important;
    width: 100% !important;
    /* Tinggi default saat tertutup / belum ada info atau baru klik (menampilkan sebagian info) */
    max-height: 320px !important; 
    height: auto !important;
    overflow-y: hidden !important; /* Sengaja disembunyikan scrollnya saat mode ringkas */
    z-index: 1005 !important;
    background-color: #ffffff !important;
    box-shadow: 0 -4px 30px rgba(0,0,0,0.2) !important;
    border-radius: 24px 24px 0 0 !important;
    padding: 12px 20px 20px 20px !important;
    box-sizing: border-box;
    transition: max-height 0.3s cubic-bezier(0.25, 1, 0.5, 1), transform 0.3s ease !important;
  }
  .info-panel.expanded {
    max-height: 78vh !important;
    overflow-y: auto !important; /* Aktifkan scroll saat ditarik penuh */
    z-index: 2000 !important;
  }
  .info-panel::before {
    content: '';
    display: block;
    width: 40px;
    height: 4px;
    background-color: #cbd5e1;
    border-radius: 2px;
    margin: 0 auto 10px auto;
    cursor: grab;
  }
  .info-panel .placeholder-text {
    text-align: left;
    color: #64748b;
    font-size: 0.9rem;
    padding: 5px 0;
    display: block !important; /* Tetap dimunculkan sebagai info ringkas di bawah */
  }
/* 2. Kotak Pencarian & Filter Karakter (Di pojok kiri bawah / melayang) */
.search-box {
  position: fixed !important;
  top: 70px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: 90% !important;
  max-width: 420px !important;
  height: auto !important;
  max-height: none !important;
  z-index: 3000 !important;
  background-color: #ffffff !important;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
  border-radius: 24px !important; /* Bentuk pil / kapsul */
  padding: 10px 15px !important;
  display: flex !important;
  flex-direction: column !important;
  border: 1px solid #e2e8f0 !important;
  box-sizing: border-box !important;
}
.search-box input {
  width: 100% !important;
  font-size: 0.95rem !important;
  padding: 6px 10px !important;
  border: none !important;
  background: transparent !important;
  box-sizing: border-box;
}

.search-box ul,
.filter-dropdown-menu {
  grid-template-columns: repeat(5, 1fr) !important;
  gap: 4px !important;
  padding: 4px !important;
  max-height: 500px !important;
}
/* Dropdown saran karakter di dalam search box */
/* Memaksa setiap kotak kartu karakter menjadi PERSEGI SEMPURNA (1:1) */
.search-box ul li,
.filter-dropdown-menu li {
  height: unset !important;
  min-height: unset !important;
  max-height: unset !important;
  aspect-ratio: 1 / 1 !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 4px !important;
  box-sizing: border-box !important;
}

/* Memperbaiki container gambar di dalamnya */
.search-box ul li div,
.filter-dropdown-menu li div {
  height: 70% !important;
  min-height: unset !important;
  width: 100% !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  margin-bottom: 0 !important;
}

/* Memperbaiki ukuran gambar agar proporsional di dalam kotak persegi */
.search-box ul li img,
.filter-dropdown-menu li img {
  width: auto !important;
  max-width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}

/* Tambahkan ini di bawahnya untuk mengunci warna semua teks di dalam panel */
.info-panel h2, 
.info-panel h3, 
.info-panel p, 
.info-panel strong, 
.info-panel span,
.info-panel label {
  color: #2c3e50 !important; /* Mencegah teks jadi putih di mode gelap */
}

/* Khusus untuk teks kecil atau hint agar tidak hilang */
.info-panel .hint, 
.info-panel small {
  color: #666666 !important;
}

/* Pastikan card di dalam panel juga tetap putih */
.info-panel .card, 
.info-panel .form-card {
  background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
    margin: 0 !important;
}

/* --- KODE ZOOM (Tetap sama seperti sebelumnya) --- */
.map-window {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 1 !important; /* Di lapisan paling bawah latar belakang */
  border: none !important;
  border-radius: 0 !important;
  margin: 0 !important;
  overflow: hidden;
  background-color: #f9f9f9;
  cursor: grab;
}
.map-window:active { cursor: grabbing; }

#peta-scene {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.peta-box { 
  width: 100%;
  height: 100%;
}

/* Styling Kartu Info */
.card { background: white; padding: 15px; color: #2c3e50 !important; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
.status-badge { display: inline-block; padding: 5px 12px; border-radius: 15px; font-size: 0.8em; color: white; margin-top: 10px; font-weight: bold;}
.status-badge.verified { background-color: #42b883; } /* Hijau */
.status-badge.pending { background-color: #f7b731; }  /* Oranye */

/* Styling Form */
.form-card { background: white; padding: 15px; border-radius: 8px; border: 2px solid #3498db; margin-top: 10px; }
.form-group { margin-bottom: 10px; }
.form-group label { color: #2c3e50 !important; display: block; margin-bottom: 5px; font-weight: bold; font-size: 0.9em; }
.form-group input {background-color: white !important; color: #2c3e50 !important; width: 100%; padding: 8px; border: 1px solid #ddd !important; border-radius: 4px; box-sizing: border-box; }
.hint { font-size: 0.8em; color: #666; margin-bottom: 15px; }
::placeholder {
  color: #999 !important;
  opacity: 1; 
}

/* Tombol */
.btn-submit { background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; width: 100%; font-weight: bold; }
.btn-submit:hover { background: #2980b9; }
.btn-small { background-color: #f0f0f0 !important; color: #2c3e50 !important; background: none; border: 1px solid #ccc; padding: 2px 8px; cursor: pointer; font-size: 0.8em; border-radius: 4px; }
.btn-cancel { background: none; border: none; color: red; margin-top: 10px; cursor: pointer; width: 100%; }

/* SVG Responsif */
.peta-box svg { width: 100%; height: auto; }
.peta-box rect:hover, .peta-box path:hover { opacity: 1; cursor: pointer; fill: #3498db !important; transition: 0.2s; }

/* Target semua elemen kotak (rect), garis (path), atau polygon di dalam SVG */
svg rect, svg path, svg polygon {
  fill: #3498db;       /* Warna dasar */
  fill-opacity: 0.10;  /* Transparansi */
  stroke: none !important;     /* Hilangkan garis pinggir */
  cursor: pointer;  /* Ubah kursor jadi tangan */
  transition: all 0.2s ease; /* Animasi halus saat berubah warna */
}

/* Efek saat mouse diarahkan ke meja kosong */
svg rect:hover, svg path:hover, svg polygon:hover {
  fill: #3498db !important; /* Biru Transparan */
  fill-opacity: 0.8 !important; /* Jadi agak hitam sedikit saat di-hover */
}

/* Kanvas (Yang bergerak) */
#peta-scene {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Pastikan SVG menyesuaikan diri */
.peta-box svg {
  width: 100%;
  height: 100%;
  pointer-events: auto; /* Agar tetap bisa diklik */
}

/* 3. CLASS BARU: Meja Terpilih (Active State) */
/* Ini akan membuat meja tetap berwarna walaupun mouse pergi */
.meja-selected {
  fill: #3498db !important;  /* Hijau Terang */
  fill-opacity: 0.8 !important; /* Solid tapi agak tembus dikit */
  stroke: #fff !important;   /* Beri garis putih biar jelas terpilih */
  stroke-width: 2px !important;
}

/* EFEK PENCARIAN */

/* 1. Meja yang COCOK (Highlihgt) */
.search-match {
  fill: #3498db !important;   /* Warna Biru Terang */
  fill-opacity: 0.8 !important; /* Solid */
  stroke: white !important;
  stroke-width: 3px !important;
  z-index: 100; /* Agar muncul di atas */
  transition: all 0.2s;
}

/* 2. Animasi Berdenyut (Opsional, biar keren) */
@keyframes denyut {
  0% { fill-opacity: 1; }
  50% { fill-opacity: 0.6; }
  100% { fill-opacity: 1; }
}
.search-match {
  animation: denyut 1.5s infinite;
}
.discord-link {
  color: #5865f2 !important;
  text-decoration: none;
  transition: 0.2s;
}
.discord-link:hover {
  color: #404eed;
  text-decoration: underline;
}
/* Untuk input pencarian dan semua input di dalam form */
input[type="text"], 
input[type="url"],
.search-box input {
  background-color: #ffffff !important; /* Paksa background putih */
  color: #2c3e50 !important;           /* Paksa teks hitam */
  border: 1px solid #ddd !important;
  opacity: 1 !important;
}

.hamburger-btn {
  position: fixed;
  top: 20px;
  left: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  width: 50px;
  height: 45px;
  background: white; /* Beri background putih agar kontras dengan peta */
  border: 2px solid #2c3e50;
  border-radius: 8px;
  cursor: pointer;
  padding: 8px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.3); /* Shadow lebih dalam */
  transition: all 0.2s ease; /* Efek transisi saat ditekan */
}

.hamburger-btn span {
  width: 100%;
  height: 4px;
  background-color: #333;
  transition: 0.3s;
}

.hamburger-btn:active {
  transform: scale(0.9); /* Sedikit mengecil saat diklik */
  background-color: #f0f0f0;
}

/* Sidebar Styling */
.sidebar {
  position: fixed;
  top: 0;
  left: -300px; /* Sembunyi di kiri */
  width: 280px;
  height: 100%;
  background: white;
  z-index: 1001;
  transition: 0.4s ease; /* Animasi geser */
  box-shadow: 2px 0 10px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}

.sidebar.is-open {
  left: 0; /* Muncul ke layar */
}

/* Overlay Gelap */
.sidebar-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

/* Header & Content Sidebar */
.sidebar-header {
  padding: 20px;
  background: #2c3e50;
  color: white;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-content {
  padding: 20px;
  overflow-y: auto;
}

.menu-item {
  padding: 12px 0;
  border-bottom: 1px solid #eee;
  cursor: pointer;
  font-weight: bold;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
}

/* Container tag yang sudah dipilih */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px; /* Jarak antar kotak */
  margin-bottom: 10px;
  margin-top: 5px;
}

.tag-karakter {
  background-color: #e0f2f1; /* Hijau pudar lembut */
  color: #00695c; /* Teks hijau gelap */
  padding: 6px 12px;
  border-radius: 20px; /* Membuat sudutnya sangat membulat (oval) */
  font-size: 0.9em;
  display: flex;
  align-items: center;
  gap: 8px; /* Jarak teks dengan tombol 'x' */
  border: 1px solid #b2dfdb; /* Garis tepi tipis agar lebih tegas */
  box-shadow: 0 1px 3px rgba(0,0,0,0.05); /* Bayangan sangat tipis */
  transition: all 0.2s ease;
}
.tag-karakter:hover {
  background-color: #b2dfdb;
  border-color: #80cbc4;
}

.tag-karakter button {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: #d32f2f; /* Warna merah cerah untuk tanda silang */
  font-size: 1.2em;
  font-weight: bold;
  line-height: 1;
  margin-left: 2px;
  opacity: 0.7; /* Sedikit pudar saat normal */
  transition: opacity 0.2s;
}

.tag-karakter button:hover {
  opacity: 1;
  transform: scale(1.1); /* Sedikit membesar */
}
/* Dropdown yang melayang */
.dropdown-sugesti {
  position: absolute;
  bottom: 100%; 
  top: auto !important;
  left: 0;
  right: 0;
  z-index: 999; /* Pastikan paling depan */
  background: white;
  border: 1px solid #ddd;
  border-radius: 8px 8px 0 0 !important; /* Sudut tumpul di bagian atas */
  list-style: none;
  padding: 0;
  margin: 0 0 4px 0 !important;
  max-height: 300px !important;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.dropdown-sugesti li {
  padding: 10px 15px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
  transition: background 0.2s;
  color: #333;
}

.dropdown-sugesti li:last-child {
  border-bottom: none;
}

.dropdown-sugesti li:hover {
  background-color: #f5f5f5;
  color: #42b883; /* Warna hijau khas Vue/Arknights */
}

.input-form {
  width: 100%;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
}

.filter-dropdown-grid {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  background: white;
  border: 1px solid #ddd;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
  padding: 15px;
  max-height: 400px;
  overflow-y: auto;
  box-shadow: 0 8px 16px rgba(0,0,0,0.2);
}

.filter-dropdown-grid li {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 8px;
  cursor: pointer;
  transition: 0.2s;
}

.filter-dropdown-grid li:hover {
  background: #3498db;
  color: white;
  transform: scale(1.05);
}

.filter-dropdown-grid img {
  width: 100%;
  height: 80px;
  object-fit: contain; /* Agar gambar tidak terpotong */
  margin-bottom: 5px;
}

.tag-karakter-filter {
  background: #3498db;
  color: white;
  padding: 5px 12px 5px 5px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}

.tag-karakter-filter img {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: white;
}

.character-preview-section {
  margin-top: 15px;
  border-top: 1px solid #eee;
  padding-top: 10px;
}

/* Container untuk deretan foto (Flexbox agar responsif) */
.portrait-container {
  display: flex;
  flex-wrap: wrap; /* Turun ke bawah jika tidak muat */
  gap: 10px; /* Jarak antar foto */
  margin-top: 8px;
}

.portrait-container.is-partial {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important; /* KUNCI UTAMA: Mencegah elemen turun ke baris bawah */
  overflow-x: auto !important;
  overflow-y: hidden !important;
  gap: 8px !important;
  padding-bottom: 6px !important;
  scroll-snap-type: x mandatory;
}

.portrait-container.is-partial .portrait-card {
  flex: 0 0 65px !important;
  scroll-snap-align: start;
}

/* Kotak untuk satu foto + nama */
.portrait-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 60px; /* Lebar kotak foto */
  text-align: center;
}

/* Styling Foto agar Bulat */
.portrait-img {
  width: 50px;
  height: 50px;
  object-fit: cover; /* Agar gambar tidak gepeng */
  border-radius: 50%; /* Membuat jadi bulat sempurna */
  border: 2px solid #ddd; /* Beri garis tepi tipis */
  box-shadow: 0 2px 5px rgba(0,0,0,0.1); /* Shadow tipis */
  background-color: white; /* Background agar jika transparan tidak aneh */
}

/* Styling Nama Kecil di Bawah Foto (Opsional) */
.portrait-name {
  font-size: 0.7em;
  color: #666;
  margin-top: 4px;
  /* Agar teks panjang terpotong rapi dengan ellipsis (...) */
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contributor-section {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px dashed #ddd;
  text-align: left;
}

.contributor-label {
  display: block;
  color: #7f8c8d;
  font-size: 0.75rem;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.contributor-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: left;
  gap: 8px;
}

.discord-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center; /* Tambahkan ini agar teks benar-benar di tengah */
  background-color: #5865F2; /* Warna khas Discord */
  color: white !important;
  padding: 6px 16px; /* Padding lebih seimbang tanpa ikon */
  border-radius: 20px;
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: bold;
  transition: all 0.2s ease;
  border: none;
}

.discord-badge:hover {
  background-color: #4752c4;
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(88, 101, 242, 0.3);
}

/* Rapikan bagian teksnya */
.discord-badge span {
  color: white !important;
  display: inline-block;
  line-height: 1; /* Biar teksnya pas di tengah secara vertikal */
  padding: 0;
  margin: 0;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Pastikan Ikon tidak ikut berantakan */
.discord-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0; /* Agar ikon tidak gepeng saat teks panjang */
  fill: white !important;
  color: white !important;
}

/* --- CSS POP-UP PESAN CUSTOM --- */

/* Overlay Gelap Latar Belakang */
.custom-alert-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6); /* Gelap transparan */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 20000; /* Pastikan di atas segalanya */
  backdrop-filter: blur(4px); /* Efek blur modern */
  transition: all 0.3s ease;
}

/* Kotak Konten Pop-up */
.custom-alert-content {
  background-color: #ffffff;
  width: 90%;
  max-width: 400px;
  border-radius: 16px; /* Sudut tumpul */
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: alertPopIn 0.3s ease-out; /* Animasi muncul */
  display: flex;
  flex-direction: column;
}

/* Animasi Muncul */
@keyframes alertPopIn {
  from { opacity: 0; transform: scale(0.8); }
  to { opacity: 1; transform: scale(1); }
}

/* Header Pop-up */
.alert-header {
  padding: 25px 25px 15px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}

/* Judul Pesan */
.alert-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: -0.5px;
}


/* Body Pesan */
.alert-body {
  padding: 0 25px 25px;
  text-align: center;
  color: #4a5568;
  font-size: 1rem;
  line-height: 1.5;
}
.alert-body p { margin: 0; }

/* Footer & Tombol */
.alert-footer {
  padding: 15px 25px 25px;
  display: flex;
  justify-content: center;
}

/* Tombol OK Modern (vibe Arknights sedikit) */
.btn-alert-ok {
  background-color: #2c3e50; /* Warna gelap */
  color: #ffffff;
  border: none;
  padding: 12px 30px;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.btn-alert-ok:hover {
  background-color: #1a252f;
  transform: translateY(-2px);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
}

.btn-alert-ok:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.menu-item {
  text-decoration: none; /* Hapus garis bawah */
  color: inherit;       /* Paksa warna teks ikut warna menu lainnya */
  display: block;       /* Agar satu baris menu bisa diklik semua area-nya */
}


/* Animasi agar glow-nya sedikit bernapas/berdenyut */
@keyframes neonBreathe {
  0%, 100% { filter: drop-shadow(0 0 6px #00e5ff) drop-shadow(0 0 2px #ffffff); }
  50% { filter: drop-shadow(0 0 10px #00e5ff) drop-shadow(0 0 4px #ffffff); }
}

.meja-glow-blue {
  /* 2. Outline Tipis & Neon */
  stroke: #e100ff !important;
  /* Turunkan angka ini sampai teks ID meja terlihat jelas */
  stroke-width: 50px !important; 
  stroke-opacity: 1 !important;
  
  /* 3. Animasi Garis Berjalan */
  stroke-dasharray: 300, 200;
  stroke-linecap: square;
  animation: tacticalMarchingAnts 1s linear infinite;

  /* 4. Filter Shadow (Kecilkan angkanya agar tidak menutupi teks) */
  z-index: 1000;
  pointer-events: all !important;
}

@keyframes tacticalMarchingAnts {
  from { stroke-dashoffset: 0; }
  to { stroke-dashoffset: 500; } /* 2x dari dasharray */
}

/* Tambahkan efek hover agar user tahu area tersebut bisa di-klik */
.meja-glow-blue:hover {
  fill: rgba(0, 229, 255, 0.2) !important;
  stroke-width: 1px !important;
  filter: drop-shadow(0 0 12px #00e5ff) !important;
}

.active-mode {
  background-color: #e3f2fd;
  color: #1976d2 !important;
  border-left: 4px solid #1976d2;
}

.path-summary {
  padding: 10px;
  background: #f8f9fa;
  border-radius: 8px;
  margin-top: 10px;
}

.btn-optimize {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
  margin-top: 5px;
  width: 100%;
}

.floating-path-controls {
  position: absolute;
  bottom: 20px;
  right: 20px;
  z-index: 100;
  background: rgba(255, 255, 255, 0.9);
  padding: 12px;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 2px solid #00e5ff; /* Samakan dengan warna glow biru */
  backdrop-filter: blur(8px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: slideInUp 0.3s ease-out;
}

.path-status {
  font-size: 0.9em;
  color: #2c3e50;
  text-align: center;
}

.path-actions {
  display: flex;
  gap: 8px;
}

.btn-float-action {
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s;
}

.btn-float-action.optimize {
  background: #2c3e50;
  color: #00e5ff;
}

.btn-float-action.stop {
  background: #eb4d4b;
  color: white;
}

.btn-float-action:hover {
  transform: scale(1.05);
}

/* Animasi icon agar user sadar mode aktif */
.pulse-icon {
  display: inline-block;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes slideInUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}


@keyframes blueGlitch {
  0% { opacity: 0.5; stroke-width: 8px; }
  50% { opacity: 1; stroke-width: 2px; }
  100% { opacity: 1; stroke-width: 4px; }
}

#jalur-optimasi {
  animation: jalurBerjalan 1s linear infinite;
}

@keyframes jalurBerjalan {
  from { stroke-dashoffset: 300; } /* Angka ini harus total dari dasharray (15+10) */
  to { stroke-dashoffset: 0; }
}

#jalan, [id^="jalan"] {
  fill: transparent !important;
  stroke: none !important;
  pointer-events: none; /* Agar tidak mengganggu klik pada meja */
}

.map-legend {
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 20px;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
  margin: 10px 0;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}
.map-legend-mini {
  background: white;
  border-radius: 8px;
  padding: 8px;
  margin: 5px auto;
  border: 1px solid #eee;
  max-width: 95%;
}

.legend-title {
  text-align: center;
  margin: 0 0 10px 0;
  font-size: 0.9rem;
  font-weight: bold;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem; /* Ukuran font kecil tapi terbaca */
  font-weight: bold;
  white-space: nowrap;
}
.legend-item span {
  font-size: 0.65rem; /* Perkecil ukuran font */
}
.legend-wrapper {
  display: flex;
  justify-content: space-evenly; /* Sebarkan rata secara horizontal */
  align-items: center;
  flex-wrap: nowrap; /* Paksa satu baris */
  overflow-x: auto; /* Jika layar terlalu kecil, bisa di-swipe */
  padding-bottom: 5px;
}
.legend-row {
  display: flex;
  justify-content: space-between;
  gap: 5px;
}

/* Lingkaran Warna */
.dot {
  width: 8px;
  height: 8px;
  border-radius: 2px; /* Kotak sedikit rounded agar senada dengan pixel art */
}

.green { background-color: #42b883; }
.orange { background-color: #f7b731; border: 1px solid #e67e22; }
.grey { background-color: #9a9a9a; }
.blue-translucent { 
  background-color: rgba(52, 152, 219, 0.3); 
  border: 1px dashed #3498db;
}

.landscape-hint {
  text-align: center;
  margin-top: 10px;
  font-size: 0.7rem;
  color: #999;
  border-top: 1px solid #f0f0f0;
  padding-top: 5px;
}
/* Navbar Utama */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 60px;
  background-color: #ffffff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000; /* Pastikan di atas segalanya */
  display: flex;
  align-items: center;
}

.navbar-container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.navbar-logo {
  font-size: 1.1rem;
  font-weight: 800;
  color: #2c3e50;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Tombol Hamburger untuk HP */
.menu-toggle {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
}

.menu-toggle .bar {
  width: 22px;
  height: 3px;
  background-color: #333;
  border-radius: 2px;
}

/* Spacer agar konten tidak "tenggelam" di bawah navbar */
.navbar-spacer {
  height: 60px;
}

/* Styling Tombol Katalog Modern */
.btn-katalog-modern {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #3498db, #2980b9);
  color: white !important;
  padding: 6px 14px;
  border-radius: 20px;
  text-decoration: none;
  font-weight: bold;
  font-size: 0.9rem;
  box-shadow: 0 3px 10px rgba(52, 152, 219, 0.3);
  transition: all 0.2s ease;
}

.btn-katalog-modern:hover {
  background: linear-gradient(135deg, #2980b9, #1f618d);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(52, 152, 219, 0.4);
}

.btn-katalog-modern:active {
  transform: translateY(0);
  box-shadow: 0 2px 5px rgba(52, 152, 219, 0.3);
}

.katalog-arrow {
  font-size: 1rem;
  transition: transform 0.2s ease;
}

.btn-katalog-modern:hover .katalog-arrow {
  transform: translate(2px, -2px); /* Efek panah sedikit bergerak keluar saat di-hover */
}
.btn-katalog-modern,
.btn-katalog-modern span,
.btn-katalog-modern strong {
  color: #ffffff !important; /* Paksa semua teks dan ikon di dalam tombol menjadi putih bersih */
}
</style>
