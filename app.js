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
   CORE LOGIC (UPDATE DASHBOARD & RIT GROUPING)
   ========================================= */
function update() {
    const readyVal = Math.max(0, parseInt(document.getElementById("readyInput")?.value || 0));
    
    let aktif = data.filter(d => d.status !== "holiday");
    let pending = data.filter(d => d.status === "pending");
    let done = data.filter(d => d.status === "done");

    setTxt("sekolahDoneCount", `${done.length} sekolah selesai`);

    let targetTotal = aktif.reduce((sum, d) => sum + d.total, 0);
    let kirimTotal = done.reduce((sum, d) => sum + d.total, 0);

    let pkTot = aktif.reduce((sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s), 0);
    let pkDone = done.reduce((sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s), 0);
    let pbTot = aktif.reduce((sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s), 0);
    let pbDone = done.reduce((sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s), 0);

    let sisaPK = pkTot - pkDone;
    let sisaPB = pbTot - pbDone;

    const getSumEceran = (list, tipe) => {
        return list.reduce((sum, d) => sum + (parseInt(tipe === 'PK' ? d.pk_val.s : d.pb_val.s) || 0), 0);
    };

    const getDeretSisa = (list, tipe) => {
        let listSisa = list
            .map(d => parseInt(tipe === 'PK' ? d.pk_val.s : d.pb_val.s) || 0)
            .filter(s => s > 0);
        return listSisa.length > 0 ? " +" + listSisa.join("+") : "";
    };

    setTxt("targetView", targetTotal);
    setTxt("terdistribusiView", kirimTotal);
    setTxt("sisaTarget", Math.max(0, targetTotal - kirimTotal));

    let pkEceranTotal = getSumEceran(pending, 'PK');
    let pbEceranTotal = getSumEceran(pending, 'PB');
    let pkBersih = sisaPK - pkEceranTotal;
    let pbBersih = sisaPB - pbEceranTotal;

    setTxt("totalPKView", pkTot); 
    setTxt("pkDoneView", pkDone);
    setTxt("pkSisaView", sisaPK); 
    
    // Penyelarasan format sisa utama atas menggunakan tanda kurung rapat serasi dengan card RIT
    let deretPkAtas = getDeretSisa(pending, 'PK').trim();
    setTxt("pkDetailIkat", deretPkAtas ? `${pkBersih} (${deretPkAtas})` : `${pkBersih}`);

    setTxt("totalPBView", pbTot); 
    setTxt("pbDoneView", pbDone);
    setTxt("pbSisaView", sisaPB); 
    
    let deretPbAtas = getDeretSisa(pending, 'PB').trim();
    setTxt("pbDetailIkat", deretPbAtas ? `${pbBersih} (${deretPbAtas})` : `${pbBersih}`);

    // LOGIKA DINAMIS PEMBAGIAN PER KELOMPOK RIT
    renderRitBreakdown(aktif);

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
   LOGIKA BARU: RENDER BREAKDOWN PER RIT (FIXED)
   ========================================= */
function renderRitBreakdown(aktifList) {
    const container = document.getElementById("ritContainer");
    if (!container) return;
    container.innerHTML = "";

    let listRitTersedia = [...new Set(aktifList.map(d => d.rit || "Rit 1"))].sort();

    if (listRitTersedia.length === 0) return;

    listRitTersedia.forEach(ritName => {
        let sekolahDiRitIni = aktifList.filter(d => (d.rit || "Rit 1") === ritName);
        let totalRit = sekolahDiRitIni.reduce((sum, d) => sum + d.total, 0);
        
        // Filter khusus sekolah status PENDING di RIT ini untuk hitung pengurangan eceran muatan sisa
        let sekolahPendingRit = sekolahDiRitIni.filter(d => d.status === "pending");

        // --- LOGIKA UNTUK PK RIT ---
        let pkTotalPorsiAsli = sekolahPendingRit.reduce((sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s), 0);
        let pkEceranList = sekolahPendingRit.map(d => parseInt(d.pk_val.s) || 0).filter(s => s > 0);
        let pkTotalEceranRit = pkEceranList.reduce((sum, s) => sum + s, 0);
        let pkBersihRit = pkTotalPorsiAsli - pkTotalEceranRit;

        // --- LOGIKA UNTUK PB RIT ---
        let pbTotalPorsiAsli = sekolahPendingRit.reduce((sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s), 0);
        let pbEceranList = sekolahPendingRit.map(d => parseInt(d.pb_val.s) || 0).filter(s => s > 0);
        let pbTotalEceranRit = pbEceranList.reduce((sum, s) => sum + s, 0);
        let pbBersihRit = pbTotalPorsiAsli - pbTotalEceranRit;

        // Format deret string tanpa spasi kosong berlebih di ujung kurung tutup
        let displayEceranPk = pkEceranList.length > 0 ? ` (+ ${pkEceranList.join(" + ")})` : "";
        let displayEceranPb = pbEceranList.length > 0 ? ` (+ ${pbEceranList.join(" + ")})` : "";

        container.innerHTML += `
            <div class="rit-summary-card">
                <div class="rit-summary-title">
                    <span>${ritName.toUpperCase()}</span>
                    <span>Total: ${totalRit}</span>
                </div>
                <div class="rit-summary-row">
                    <div class="rit-summary-item pk">
                        PK ${pkBersihRit}${displayEceranPk}
                    </div>
                    <div class="rit-summary-item pb">
                        PB ${pbBersihRit}${displayEceranPb}
                    </div>
                </div>
            </div>
        `;
    });
}

/* =========================================
   UI RENDER (LIST ACTIVE & HISTORY)
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
        let ritLabel = d.rit || "Rit 1";

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
                    <button class="smallbtn" style="background:#3b82f6" onclick="editSekolah(${originalIdx})">✏️</button>
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
                    <span class="mobil-tag ${mobilClass}">${d.mobil}</span>
                    <span class="rit-tag">${ritLabel.toUpperCase()}</span>
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
   ACTIONS (TAMBAH & EDIT DATA)
   ========================================= */
function tambah() {
    let nama = document.getElementById("nama").value.trim().toUpperCase();
    if (!nama) return;
    let mobil = document.querySelector('input[name="mobil"]:checked').value;
    let rit = document.querySelector('input[name="ritSelect"]:checked').value;
    
    let pki = document.getElementById("pk_i").value, pks = document.getElementById("pk_s").value;
    let pbi = document.getElementById("pb_i").value, pbs = document.getElementById("pb_s").value;
    let tendiki = document.getElementById("tendik_i").value;
    let mode = document.querySelector('input[name="inputMode"]:checked').value;
    
    let pkUtama = parseInt(pki) || 0;
    let pbUtama = parseInt(pbi) || 0;
    let tendikUtama = parseInt(tendiki) || 0;
    let pkTotalEceran = parseInt(pks) || 0;
    let pbTotalEceran = parseInt(pbs) || 0;

    let pkHitung, pbHitung;

    if (mode === "ikat") {
        pkHitung = (pkUtama * 5) + pkTotalEceran;
        pbHitung = (pbUtama * 5) + pbTotalEceran;
    } else {
        pkHitung = pkUtama; 
        pbHitung = pbUtama + tendikUtama;

        pkTotalEceran = pkUtama % 5;
        pkUtama = Math.floor(pkUtama / 5);

        pbTotalEceran = pbHitung % 5;
        pbUtama = Math.floor(pbHitung / 5);
    }
    
    let editIdxVal = document.getElementById("editIdx").value;
    
    let payload = { 
        nama, mobil, rit, status: "pending", 
        total: pkHitung + pbHitung,
        pk_val: { i: pkUtama, s: pkTotalEceran }, 
        pb_val: { i: pbUtama, s: pbTotalEceran } 
    };

    if (editIdxVal !== "") {
        let idx = parseInt(editIdxVal);
        payload.status = data[idx].status; 
        data[idx] = payload;
        document.getElementById("editIdx").value = "";
        document.getElementById("btnSimpan").innerText = "SIMPAN DATA";
    } else {
        data.unshift(payload);
    }
    
    ["nama", "pk_i", "pk_s", "pb_i", "pb_s", "tendik_i"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    
    update();
}

/* =========================================
   FUNGSI POP-UP MODAL EDIT SEKOLAH (BARU)
   ========================================= */
function editSekolah(idx) {
    let item = data[idx];
    
    document.getElementById("modalEditIdx").value = idx;
    document.getElementById("modalNama").value = item.nama;
    
    document.querySelectorAll('input[name="modalMobil"]').forEach(radio => {
        radio.checked = radio.value === item.mobil;
    });

    document.querySelectorAll('input[name="modalRitSelect"]').forEach(radio => {
        radio.checked = radio.value === (item.rit || "Rit 1");
    });

    document.querySelectorAll('input[name="modalStatus"]').forEach(radio => {
        radio.checked = radio.value === item.status;
    });

    document.getElementById("modalPk_i").value = item.pk_val.i;
    document.getElementById("modalPk_s").value = item.pk_val.s;
    document.getElementById("modalPb_i").value = item.pb_val.i;
    document.getElementById("modalPb_s").value = item.pb_val.s;

    document.getElementById("editSekolahModal").style.display = "flex";
}

function closeEditModal() {
    document.getElementById("editSekolahModal").style.display = "none";
}

function simpanPerubahanModal() {
    let idx = parseInt(document.getElementById("modalEditIdx").value);
    if (isNaN(idx)) return;

    let nama = document.getElementById("modalNama").value.trim().toUpperCase();
    if (!nama) return;

    let mobil = document.querySelector('input[name="modalMobil"]:checked').value;
    let rit = document.querySelector('input[name="modalRitSelect"]:checked').value;
    let status = document.querySelector('input[name="modalStatus"]:checked').value;
    
    let pki = parseInt(document.getElementById("modalPk_i").value) || 0;
    let pks = parseInt(document.getElementById("modalPk_s").value) || 0;
    let pbi = parseInt(document.getElementById("modalPb_i").value) || 0;
    let pbs = parseInt(document.getElementById("modalPb_s").value) || 0;

    let pkHitung = (pki * 5) + pks;
    let pbHitung = (pbi * 5) + pbs;

    data[idx] = {
        nama,
        mobil,
        rit,
        status,
        total: pkHitung + pbHitung,
        pk_val: { i: pki, s: pks },
        pb_val: { i: pbi, s: pbs }
    };

    closeEditModal();
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
   MODALS, UNDO & CLEAR HISTORIES
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

function confirmClearHistory() {
    openModal("🚨", "Hapus Semua", "Kosongkan semua riwayat permanen?", "#ef4444", () => {
        historyData = [];
        update();
        showSnackbar("Semua riwayat dibersihkan");
    });
}

document.addEventListener("touchstart", function() {}, true);

document.addEventListener('touchstart', function(e) {
    if (e.target.closest('.smallbtn')) {
        e.target.closest('.smallbtn').classList.add('tekan');
    }
}, {passive: true});

document.addEventListener('touchstart', function(e) {
    let el = e.target.closest('button, .smallbtn, .btn-primary-v2, .nav-item, .rit-select-box');
    if (el) {
        el.classList.add('tekan');
    }
}, {passive: true});

document.addEventListener('touchend', function(e) {
    let el = e.target.closest('button, .smallbtn, .btn-primary-v2, .nav-item, .rit-select-box');
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
    const eceranElements = document.querySelectorAll('#pk_s, #pb_s, #tendik_s, .plus-sign');
    
    if (mode === "porsi") {
        if(pkInput) pkInput.placeholder = "PK (Porsi)";
        if(pbInput) pbInput.placeholder = "PB (Porsi)";
        if(tendikInput) tendikInput.placeholder = "Tendik (Porsi)";
        eceranElements.forEach(el => el.style.display = 'none');
        if (rowTendik) rowTendik.style.display = 'flex';
    } else {
        if(pkInput) pkInput.placeholder = "PK (Ikat)";
        if(pbInput) pbInput.placeholder = "PB (Ikat)";
        eceranElements.forEach(el => el.style.display = 'inline-block');
        if (rowTendik) rowTendik.style.display = 'none';
    }
}

togglePlaceholder();

// Start
update();
