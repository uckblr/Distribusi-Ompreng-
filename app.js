/* =========================================
   DATABASE & INITIALIZATION
   ========================================= */
let data = JSON.parse(localStorage.getItem("ultra_v10_data") || "[]");
let historyData = JSON.parse(localStorage.getItem("ultra_v10_hist") || "[]");

let deletedItem = null;
let deleteTimeout = null;
let currentFilter = "Semua"; 

const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
const hitung = (i, s) => (Math.max(0, parseInt(i) || 0) * 5) + Math.max(0, parseInt(s) || 0);

/* =========================================
   NAVIGASI HALAMAN
   ========================================= */
function showPage(pId, el) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(pId);
    if (targetPage) targetPage.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (el) {
        el.classList.add('active');
    } else {
        const navItems = document.querySelectorAll('.nav-item');
        if (pId === 'dashboard') navItems[0].classList.add('active');
    }
    update();
}

/* =========================================
   CORE LOGIC (UPDATE DASHBOARD) - FIXED VERSION
   ========================================= */
/* =========================================
   CORE LOGIC (UPDATE DASHBOARD) - FIXED VERSION
   ========================================= */
function update() {
    const readyVal = Math.max(0, parseInt(document.getElementById("readyInput")?.value || 0));
    
    let aktif = data.filter(d => d.status !== "holiday");
    let pending = data.filter(d => d.status === "pending");
    let done = data.filter(d => d.status === "done");

    setTxt("sekolahDoneCount", `${done.length} sekolah selesai`);

    let targetTotal = aktif.reduce((sum, d) => sum + d.total, 0);
    let kirimTotal = done.reduce((sum, d) => sum + d.total, 0);

    // 1. Hitung Total Porsi Riil
    let pkTot = aktif.reduce((sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s), 0);
    let pkDone = done.reduce((sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s), 0);
    let pbTot = aktif.reduce((sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s), 0);
    let pbDone = done.reduce((sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s), 0);

    let sisaPK = pkTot - pkDone;
    let sisaPB = pbTot - pbDone;

    // 2. LOGIKA BARU: Hitung total eceran dari data pending untuk dikurangi dari sisa total
    const getSumEceran = (list, tipe) => {
        return list.reduce((sum, d) => sum + (parseInt(tipe === 'PK' ? d.pk_val.s : d.pb_val.s) || 0), 0);
    };

    // 3. LOGIKA DERET ECERAN (Format string eceran saja tanpa kata 'iket')
    const getDeretSisa = (list, tipe) => {
        let listSisa = list
            .map(d => parseInt(tipe === 'PK' ? d.pk_val.s : d.pb_val.s) || 0)
            .filter(s => s > 0);
        return listSisa.length > 0 ? " +" + listSisa.join("+") : "";
    };

    setTxt("targetView", targetTotal);
    setTxt("terdistribusiView", kirimTotal);
    setTxt("sisaTarget", Math.max(0, targetTotal - kirimTotal));

    // Perhitungan Angka Bersih (Sisa - Total Eceran Pending)
    let pkEceranTotal = getSumEceran(pending, 'PK');
    let pbEceranTotal = getSumEceran(pending, 'PB');
    let pkBersih = sisaPK - pkEceranTotal;
    let pbBersih = sisaPB - pbEceranTotal;

    // Update PK View - Angka Utama Tetap, di bawahnya angka bersih + deret eceran
    setTxt("totalPKView", pkTot); 
    setTxt("pkDoneView", pkDone);
    setTxt("pkSisaView", sisaPK); 
    setTxt("pkDetailIkat", `${pkBersih}${getDeretSisa(pending, 'PK')}`);

    // Update PB View - Angka Utama Tetap, di bawahnya angka bersih + deret eceran
    setTxt("totalPBView", pbTot); 
    setTxt("pbDoneView", pbDone);
    setTxt("pbSisaView", sisaPB); 
    setTxt("pbDetailIkat", `${pbBersih}${getDeretSisa(pending, 'PB')}`);

    // --- Sisa kode (Progress Bar & LocalStorage) tetap sama ---
    let pKirim = targetTotal > 0 ? (kirimTotal / targetTotal) * 100 : 0;
    let pSiap = targetTotal > 0 ? (readyVal / targetTotal) * 100 : 0;
    if (document.getElementById("progressBarDone")) document.getElementById("progressBarDone").style.width = pKirim + "%";
    if (document.getElementById("progressBarReady")) {
        document.getElementById("progressBarReady").style.left = pKirim + "%";
        document.getElementById("progressBarReady").style.width = Math.min(pSiap, 100 - pKirim) + "%";
    }
    setTxt("progressPercent", Math.round(pKirim) + "%");

    let kurang = (targetTotal - kirimTotal) - readyVal;
    const elKurang = document.getElementById("sisaReady");
    if (elKurang) {
        elKurang.innerText = kurang.toString();
        elKurang.style.color = kurang > 0 ? "#ef4444" : "#22c55e";
    }

    localStorage.setItem("ultra_v10_data", JSON.stringify(data));
    localStorage.setItem("ultra_v10_hist", JSON.stringify(historyData));
    render(); 
}



/* =========================================
   UI RENDER (LIST & MULTI-MOBIL)
   ========================================= */
function filterMobil(m) {
    currentFilter = m;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(m));
    });
    render();
}

function render() {
    const listActive = document.getElementById("listActive");
    const listHist = document.getElementById("listHistory");
    if (!listActive || !listHist) return;

    const search = document.getElementById("searchInput")?.value.toLowerCase() || "";
    let stokCek = Math.max(0, parseInt(document.getElementById("readyInput")?.value || 0));

    listActive.innerHTML = ""; listHist.innerHTML = "";

    let sorted = [...data].sort((a, b) => {
        const urutan = { "pending": 1, "done": 2, "holiday": 3 };
        return urutan[a.status] - urutan[b.status];
    });

    let filtered = sorted.filter(d => {
        const matchesSearch = d.nama.toLowerCase().includes(search);
        const matchesMobil = currentFilter === "Semua" || d.mobil === currentFilter;
        return matchesSearch && matchesMobil;
    });

    filtered.forEach((d) => {
        let originalIdx = data.findIndex(item => item === d);
        let statusColor = d.status === 'done' ? "#22c55e" : (d.status === 'holiday' ? "#64748b" : "#f59e0b");
        let pkT = hitung(d.pk_val.i, d.pk_val.s);
        let pbT = hitung(d.pb_val.i, d.pb_val.s);
        let mobilClass = d.mobil === "Mobil 1" ? "tag-m1" : "tag-m2";

        let rekLabel = "";
        let borderStyle = "";
        if (d.status === "pending") {
            if (stokCek >= d.total && stokCek > 0) {
                rekLabel = `<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900; margin-left:5px;">SIAP</span>`;
                borderStyle = "border: 2px solid #22c55e;";
                stokCek -= d.total;
            }
        }

        listActive.innerHTML += `
            <div class="item ${d.status}" style="${borderStyle}">
                <div class="action">
                    ${d.status === 'pending' ? 
                        `<button class="smallbtn" style="background:#8b5cf6" onclick="naikkanPrioritas(${originalIdx})">🔼</button>
                         <button class="smallbtn" style="background:#f59e0b" onclick="setStatus(${originalIdx}, 'holiday')">🏠</button>
                         <button class="smallbtn" style="background:#22c55e" onclick="setStatus(${originalIdx}, 'done')">✔</button>` : 
                        `<button class="smallbtn" style="background:#64748b" onclick="setStatus(${originalIdx}, 'pending')">↺</button>`
                    }
                    <button class="smallbtn" style="background:#ef4444" onclick="confirmHapus(${originalIdx})">✕</button>
                </div>
                <div style="margin-bottom:5px">
                    <span class="badge" style="background:${statusColor}">${d.status.toUpperCase()}</span>
                    <span class="mobil-tag ${mobilClass}" style="font-size:9px; font-weight:900; padding:2px 6px; border-radius:4px; margin-left:5px;">${d.mobil}</span>
                    ${rekLabel}
                </div>
                <span class="item-title" style="display:block; font-weight:800; margin-bottom:8px;">${d.nama}</span>
                <div style="display:flex; flex-direction:column; gap:4px">
                    <div style="background:#fef2f2; padding:4px 8px; border-radius:6px; display:flex; justify-content:space-between; font-size:11px; color:#b91c1c; border:1px solid #fee2e2;">
                        <b>PK</b> <span>${pkT} (${Math.floor(pkT/5)} iket + ${pkT%5})</span>
                    </div>
                    <div style="background:#f0f9ff; padding:4px 8px; border-radius:6px; display:flex; justify-content:space-between; font-size:11px; color:#0369a1; border:1px solid #e0f2fe;">
                        <b>PB</b> <span>${pbT} (${Math.floor(pbT/5)} iket + ${pbT%5})</span>
                    </div>
                    <div style="background:#3b82f6; color:white; text-align:center; padding:3px; border-radius:6px; font-weight:900; font-size:11px;">
                        TOTAL: ${d.total}
                    </div>
                </div>
            </div>`;
    });

    historyData.forEach((d, i) => {
        listHist.innerHTML += `
            <div class="item done" style="padding:10px">
                <span style="font-weight:700; font-size:12px;">${d.nama}</span>
                <div class="action">
                    <button class="smallbtn" style="background:#3b82f6; width:25px; height:25px" onclick="restore(${i})">↺</button>
                    <button class="smallbtn" style="background:#ef4444; width:25px; height:25px" onclick="confirmHapusHist(${i})">✕</button>
                </div>
            </div>`;
    });
}

/* =========================================
   ACTIONS
   ========================================= */
function tambah() {
    let nama = document.getElementById("nama").value.trim().toUpperCase();
    if (!nama) return;
    let mobil = document.querySelector('input[name="mobil"]:checked').value;
    let pki = document.getElementById("pk_i").value, pks = document.getElementById("pk_s").value;
    let pbi = document.getElementById("pb_i").value, pbs = document.getElementById("pb_s").value;
    
    // Ambil input tambahan untuk Tendik
    let tendiki = document.getElementById("tendik_i").value;
    
    // Ambil mode input yang sedang aktif (ikat atau porsi)
    let mode = document.querySelector('input[name="inputMode"]:checked').value;
    
    let pkUtama = parseInt(pki) || 0;
    let pbUtama = parseInt(pbi) || 0;
    let tendikUtama = parseInt(tendiki) || 0;
    
    let pkTotalEceran = parseInt(pks) || 0;
    let pbTotalEceran = parseInt(pbs) || 0;

    let pkHitung, pbHitung;

    if (mode === "ikat") {
        // JIKA MODE IKAT: Tendik tidak ada, gunakan rumus asli bawaan Anda
        pkHitung = (pkUtama * 5) + pkTotalEceran;
        pbHitung = (pbUtama * 5) + pbTotalEceran;
    } else {
        // JIKA MODE PORSI LANGSUNG: Angka utama dihitung murni porsi langsung
        pkHitung = pkUtama; 
        
        // Gabungkan nilai Tendik langsung ke total PB porsi mentah sebelum dipecah
        pbHitung = pbUtama + tendikUtama;

        // Pecah otomatis nilai PK ke format basis 5 (Ikat + Sisa)
        pkTotalEceran = pkUtama % 5;
        pkUtama = Math.floor(pkUtama / 5);

        // Pecah otomatis nilai PB (yang sudah digabung Tendik) ke format basis 5 (Ikat + Sisa)
        pbTotalEceran = pbHitung % 5;
        pbUtama = Math.floor(pbHitung / 5);
    }
    
    data.unshift({ 
        nama, mobil, status: "pending", 
        total: pkHitung + pbHitung,
        pk_val: { i: pkUtama, s: pkTotalEceran }, 
        pb_val: { i: pbUtama, s: pbTotalEceran } 
    });
    
    // Bersihkan semua form input termasuk input tendik setelah tombol simpan diklik
    ["nama", "pk_i", "pk_s", "pb_i", "pb_s", "tendik_i"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    
    update();
}



function naikkanPrioritas(idx) {
    if (idx > 0) {
        const item = data.splice(idx, 1)[0];
        data.unshift(item);
        update();
    }
}

function setStatus(i, s) { data[i].status = s; update(); }
function restore(i) { data.unshift({...historyData[i], status:"pending"}); historyData.splice(i, 1); update(); }

/* =========================================
   MODALS & UNDO
   ========================================= */
function showSnackbar(msg) {
    const sb = document.getElementById("snackbar");
    if(!sb) return;
    sb.querySelector('span').innerText = msg;
    sb.className = "snackbar show";
    clearTimeout(deleteTimeout);
    deleteTimeout = setTimeout(() => { sb.className = "snackbar"; deletedItem = null; }, 5000);
}

function undoAction() {
    if (deletedItem) {
        if (deletedItem.type === 'active') data.splice(deletedItem.index, 0, deletedItem.content);
        else historyData.splice(deletedItem.index, 0, deletedItem.content);
        document.getElementById("snackbar").className = "snackbar";
        deletedItem = null;
        update();
    }
}

function openModal(icon, title, msg, color, onConfirm) {
    const m = document.getElementById('customModal');
    if (!m) return confirm(msg) && onConfirm();
    document.getElementById('modalIcon').innerText = icon;
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalMessage').innerText = msg;
    const btn = document.getElementById('modalConfirmBtn');
    btn.style.backgroundColor = color;
    btn.onclick = () => { onConfirm(); closeModal(); };
    m.style.display = 'flex';
}

function closeModal() { 
    const m = document.getElementById('customModal');
    if (m) m.style.display = 'none'; 
}

function confirmHapus(i) {
    openModal("🗑️", "Hapus", "Hapus sekolah ini?", "#ef4444", () => {
        deletedItem = { type: 'active', index: i, content: data[i] };
        data.splice(i, 1);
        update();
        showSnackbar("Sekolah dihapus");
    });
}

function confirmHapusHist(i) {
    openModal("🔥", "Hapus", "Hapus permanen?", "#ef4444", () => {
        deletedItem = { type: 'history', index: i, content: historyData[i] };
        historyData.splice(i, 1);
        update();
        showSnackbar("Riwayat dihapus");
    });
}

function confirmReset() {
    openModal("🚨", "Reset", "Hapus semua data dasbor?", "#ef4444", () => {
        data = [];
        update();
    });
}

function confirmArchive() {
    let s = data.filter(d => d.status === 'done' || d.status === 'holiday');
    if(!s.length) return alert("Tidak ada data selesai");
    openModal("📦", "Arsip", `Arsip ${s.length} sekolah?`, "#22c55e", () => {
        historyData = [...s, ...historyData];
        data = data.filter(d => d.status === 'pending');
        update();
    });
}

document.addEventListener("touchstart", function() {}, true);

document.addEventListener('touchstart', function(e) {
    // Jika yang disentuh adalah tombol (smallbtn)
    if (e.target.closest('.smallbtn')) {
        e.target.closest('.smallbtn').classList.add('tekan');
    }
}, {passive: true});

/* Efek Tekan untuk SEMUA Tombol */
document.addEventListener('touchstart', function(e) {
    // Cari apakah yang ditekan adalah button, atau punya class yang mengandung kata 'btn'
    let el = e.target.closest('button, .smallbtn, .btn-primary-v2, .btn-reset, .btn-archive, .nav-item');
    
    if (el) {
        el.classList.add('tekan');
    }
}, {passive: true});

document.addEventListener('touchend', function(e) {
    let el = e.target.closest('button, .smallbtn, .btn-primary-v2, .btn-reset, .btn-archive, .nav-item');
    
    if (el) {
        setTimeout(() => {
            el.classList.remove('tekan');
        }, 100);
    }
}, {passive: true});
function togglePlaceholder() {
    let mode = document.querySelector('input[name="inputMode"]:checked').value;
    const pkInput = document.getElementById("pk_i");
    const pbInput = document.getElementById("pb_i");
    const tendikInput = document.getElementById("tendik_i");
    const rowTendik = document.getElementById("row_tendik");
    
    // Ambil semua elemen input eceran dan tanda plus-nya
    const eceranElements = document.querySelectorAll('#pk_s, #pb_s, #tendik_s, .plus-sign');
    
    if (mode === "porsi") {
        if(pkInput) pkInput.placeholder = "PK (Porsi)";
        if(pbInput) pbInput.placeholder = "PB (Porsi)";
        if(tendikInput) tendikInput.placeholder = "Tendik (Porsi)";
        
        // Sembunyikan kolom eceran S dan tanda "+"
        eceranElements.forEach(el => el.style.display = 'none');
        
        // MUNCULKAN baris Tendik saat mode porsi langsung
        if (rowTendik) rowTendik.style.display = 'flex';
    } else {
        if(pkInput) pkInput.placeholder = "PK (Ikat)";
        if(pbInput) pbInput.placeholder = "PB (Ikat)";
        
        // Munculkan kembali kolom eceran S dan tanda "+" untuk PK & PB
        eceranElements.forEach(el => el.style.display = 'inline-block');
        
        // SEMBUNYIKAN baris Tendik secara total saat mode ikat
        if (rowTendik) rowTendik.style.display = 'none';
    }
}

// Jalankan fungsi ini sekali di paling bawah script agar saat pertama kali dimuat kondisinya langsung menyesuaikan
togglePlaceholder();



// Start
update();
