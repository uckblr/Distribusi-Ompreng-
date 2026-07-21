/* =========================================
   DATABASE & INITIALIZATION
   ========================================= */
let data = JSON.parse(localStorage.getItem("ultra_v10_data") || "[]");
let historyData = JSON.parse(localStorage.getItem("ultra_v10_hist") || "[]");

let deletedItem = null;
let deleteTimeout = null;

const setTxt = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
};
const hitung = (i, s) =>
  Math.max(0, parseInt(i) || 0) * 5 + Math.max(0, parseInt(s) || 0);

/* =========================================
   NAVIGASI HALAMAN
   ========================================= */
function showPage(pId, el) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const targetPage = document.getElementById(pId);
  if (targetPage) targetPage.classList.add("active");

  document
    .querySelectorAll(".nav-item")
    .forEach((i) => i.classList.remove("active"));
  if (el) {
    el.classList.add("active");
  } else {
    const navItems = document.querySelectorAll(".nav-item");
    if (pId === "dashboard") navItems[0].classList.add("active");
  }
  update();
}

function confirmRitDone(ritName) {
  openModal(
    "✅",
    "Selesaikan Rit",
    `Tandai semua sekolah di ${ritName.toUpperCase()} menjadi SELESAI?`,
    "#22c55e",
    () => {
      let changedIndices = [];
      data.forEach((d, idx) => {
        if ((d.rit || "Rit 1") === ritName && d.status === "pending") {
          changedIndices.push(idx);
          d.status = "done";
        }
      });

      if (changedIndices.length > 0) {
        deletedItem = {
          type: "bulk_status",
          indices: changedIndices,
          content: "pending",
        };
        update();
        showSnackbar(`${ritName.toUpperCase()}`);
      }
    },
  );
}

/* =========================================
   CORE LOGIC (UPDATE DASHBOARD & RIT GROUPING)
   ========================================= */
function update() {
  const readyVal = Math.max(
    0,
    parseInt(document.getElementById("readyInput")?.value || 0),
  );

  let aktif = data.filter((d) => d.status !== "holiday");
  let pending = data.filter((d) => d.status === "pending");
  let done = data.filter((d) => d.status === "done");

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
    return list.reduce(
      (sum, d) =>
        sum + (parseInt(tipe === "PK" ? d.pk_val.s : d.pb_val.s) || 0),
      0,
    );
  };

  const getDeretSisa = (list, tipe) => {
    let listSisa = list
      .map((d) => parseInt(tipe === "PK" ? d.pk_val.s : d.pb_val.s) || 0)
      .filter((s) => s > 0);
    return listSisa.length > 0 ? " +" + listSisa.join("+") : "";
  };

  setTxt("targetView", targetTotal);
  setTxt("terdistribusiView", kirimTotal);
  setTxt("sisaTarget", Math.max(0, targetTotal - kirimTotal));

  let pkEceranTotal = getSumEceran(pending, "PK");
  let pbEceranTotal = getSumEceran(pending, "PB");
  let pkBersih = sisaPK - pkEceranTotal;
  let pbBersih = sisaPB - pbEceranTotal;

  setTxt("totalPKView", pkTot);
  setTxt("pkDoneView", pkDone);
  setTxt("pkSisaView", sisaPK);

  let deretPkAtas = getDeretSisa(pending, "PK").trim();
  setTxt(
    "pkDetailIkat",
    deretPkAtas ? `${pkBersih} (${deretPkAtas})` : `${pkBersih}`,
  );

  setTxt("totalPBView", pbTot);
  setTxt("pbDoneView", pbDone);
  setTxt("pbSisaView", sisaPB);

  let deretPbAtas = getDeretSisa(pending, "PB").trim();
  setTxt(
    "pbDetailIkat",
    deretPbAtas ? `${pbBersih} (${deretPbAtas})` : `${pbBersih}`,
  );

  // LOGIKA DINAMIS PEMBAGIAN PER KELOMPOK RIT
  renderRitBreakdown(aktif);

  let pKirim = targetTotal > 0 ? (kirimTotal / targetTotal) * 100 : 0;
  let pSiap = targetTotal > 0 ? (readyVal / targetTotal) * 100 : 0;
  if (document.getElementById("progressBarDone"))
    document.getElementById("progressBarDone").style.width = pKirim + "%";
  if (document.getElementById("progressBarReady")) {
    document.getElementById("progressBarReady").style.left = pKirim + "%";
    document.getElementById("progressBarReady").style.width =
      Math.min(pSiap, 100 - pKirim) + "%";
  }
  setTxt("progressPercent", Math.round(pKirim) + "%");

  let kurang = targetTotal - kirimTotal - readyVal;
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
  // Tangkap apa yang diketik di pencarian Dasbor
  const dashSearch =
    document.getElementById("dashSearchInput")?.value.toLowerCase().trim() ||
    "";

  let listRitTersedia = [
    ...new Set(aktifList.map((d) => d.rit || "Rit 1")),
  ].sort();
  if (listRitTersedia.length === 0) return;

  listRitTersedia.forEach((ritName) => {
    let sekolahDiRitIni = aktifList.filter(
      (d) => (d.rit || "Rit 1") === ritName,
    );
    let sekolahPendingRit = sekolahDiRitIni.filter(
      (d) => d.status === "pending",
    );

    // LOGIKA PINTAR: Jika semua selesai, tampilkan total asli. Jika belum, tampilkan SISA.
    let isRitSelesai = sekolahPendingRit.length === 0;
    let dataHitung = isRitSelesai ? sekolahDiRitIni : sekolahPendingRit;

    let totalRit = dataHitung.reduce((sum, d) => sum + d.total, 0);

    let pkTotalPorsiAsli = dataHitung.reduce(
      (sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s),
      0,
    );
    let pkEceranList = dataHitung
      .map((d) => parseInt(d.pk_val.s) || 0)
      .filter((s) => s > 0);
    let pkTotalEceranRit = pkEceranList.reduce((sum, s) => sum + s, 0);
    let pkBersihRit = pkTotalPorsiAsli - pkTotalEceranRit;

    let pbTotalPorsiAsli = dataHitung.reduce(
      (sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s),
      0,
    );
    let pbEceranList = dataHitung
      .map((d) => parseInt(d.pb_val.s) || 0)
      .filter((s) => s > 0);
    let pbTotalEceranRit = pbEceranList.reduce((sum, s) => sum + s, 0);
    let pbBersihRit = pbTotalPorsiAsli - pbTotalEceranRit;

    let displayEceranPk =
      pkEceranList.length > 0
        ? `<span class="rit-summary-eceran"> + (${pkEceranList.join("+")})</span>`
        : "";
    let displayEceranPb =
      pbEceranList.length > 0
        ? `<span class="rit-summary-eceran"> + (${pbEceranList.join("+")})</span>`
        : "";

    let btnActionHTML = `
        <button onclick="shareRitSummary('${ritName}')" style="background:#e2e8f0; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:9px; font-weight:800; color:#475569;">SHARE</button>
    `;

    if (!isRitSelesai) {
      let spinnerStyle =
        "display:inline-block; width:10px; height:10px; border:2px solid rgba(255,255,255,0.4); border-top-color:white; border-radius:50%; animation: putar 1s linear infinite;";
      btnActionHTML += `
            <button onclick="confirmRitDone('${ritName}')" style="background: #f59e0b; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:9px; font-weight:800; color:white; box-shadow: 0 2px 4px rgba(59,130,246,0.3); display:flex; align-items:center; gap:4px;">
                <span style="${spinnerStyle}"></span> SELESAI
            </button>
        `;
    } else {
      btnActionHTML += `<span style="background:#d1fae5; color:#047857; border:1px solid #10b981; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900; letter-spacing:0.5px;">SELESAI</span>`;
    }
    let stylePK = isRitSelesai
      ? "background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;"
      : "background:#fef2f2; color:#ef4444; border:1px solid #fee2e2;";
    let stylePB = isRitSelesai
      ? "background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0;"
      : "background:#f0f9ff; color:#0284c7; border:1px solid #e0f2fe;";
    let cardStyle = isRitSelesai
      ? "background: #f8fafc; border: 1px solid #cbd5e1;"
      : "background: white; border: 1px solid #e2e8f0;";

    let listSekolahHTML = `<div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; border-top: 1px dashed #e2e8f0; padding-top: 8px;">`;
    sekolahDiRitIni.forEach((sek) => {
      let originalIdx = data.indexOf(sek);
      let cursorStyle = "cursor: pointer; transition: all 0.3s ease;";

      // CEK SOROTAN: Apakah nama sekolah cocok dengan yg dicari di Dasbor?
      let isHighlighted =
        dashSearch && sek.nama.toLowerCase().includes(dashSearch);
      let highlightClass = isHighlighted ? "highlight-school" : "";

      if (sek.status === "done") {
        listSekolahHTML += `<span onclick="showSchoolInfo(${originalIdx})" class="${highlightClass}" style="font-size: 10px; background: #f8fafc; color: #94a3b8; padding: 3px 6px; border-radius: 4px; text-decoration: line-through; border: 1px solid #e2e8f0; ${cursorStyle}">${sek.nama}</span>`;
      } else {
        listSekolahHTML += `<span onclick="showSchoolInfo(${originalIdx})" class="${highlightClass}" style="font-size: 10px; font-weight: 700; background: #eff6ff; color: #1d4ed8; padding: 3px 6px; border-radius: 4px; border: 1px solid #bfdbfe; ${cursorStyle}">${sek.nama}</span>`;
      }
    });

    listSekolahHTML += `</div>`;

    container.innerHTML += `
            <div class="rit-summary-card" style="${cardStyle}">
                <div class="rit-summary-title">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>${ritName.toUpperCase()}</span>
                        ${btnActionHTML}
                    </div>
                    <span style="font-size: 13px; font-weight: 900; color: ${isRitSelesai ? "#16a34a" : "#1e293b"};">
                        Total: ${totalRit}
                    </span>
                </div>
                <div class="rit-summary-row">
                    <!-- Gunakan variabel stylePK dan stylePB -->
                    <div class="rit-summary-item" style="${stylePK}">
                        PK ${pkBersihRit}${displayEceranPk}
                    </div>
                    <div class="rit-summary-item" style="${stylePB}">
                        PB ${pbBersihRit}${displayEceranPb}
                    </div>
                </div>
                ${listSekolahHTML}
            </div>
        `;
  });
}

/* =========================================
   UI RENDER (LIST ACTIVE & HISTORY)
   ========================================= */

function render() {
  const listActive = document.getElementById("listActive");
  const listHist = document.getElementById("listHistory");
  if (!listActive || !listHist) return;

  listActive.innerHTML = "";
  listHist.innerHTML = "";

  // 1. Urutkan data secara global terlebih dahulu
  let sorted = [...data].sort((a, b) => {
    const urutanStatus = { pending: 1, done: 2, holiday: 3 };
    let compareStatus = urutanStatus[a.status] - urutanStatus[b.status];

    if (compareStatus === 0) {
      let ritA = a.rit || "Rit 1";
      let ritB = b.rit || "Rit 1";
      return ritA.localeCompare(ritB);
    }
    return compareStatus;
  });

  // 2. Tentukan status "SIAP" secara global (sebelum difilter) agar stok adil
  let stokCek = Math.max(
    0,
    parseInt(document.getElementById("readyInput")?.value || 0),
  );
  sorted.forEach((d) => {
    d._isSiap = false; // Reset properti sementara
    if (d.status === "pending") {
      if (stokCek >= d.total && stokCek > 0) {
        d._isSiap = true;
        stokCek -= d.total; // Kurangi stok secara global
      }
    }
  });

  // 3. Tangkap nilai dari form pencarian dan dropdown filter
  const search =
    document.getElementById("searchInput")?.value.toLowerCase().trim() || "";
  const fMobil = document.getElementById("filterMobilSel")?.value || "Semua";
  const fRit = document.getElementById("filterRitSel")?.value || "Semua";
  const fStatus = document.getElementById("filterStatusSel")?.value || "Semua";

  // 4. Lakukan filter berdasarkan Smart Search & Multi Dropdown
  let filtered = sorted.filter((d) => {
    // LOGIKA PENCARIAN PINTAR (Kata Kombinasi & Angka Muatan)
    let matchesSearch = true;
    if (search) {
      // Pecah kalimat menjadi beberapa kata
      const keywords = search.split(/\s+/);
      matchesSearch = keywords.every((kw) => {
        return (
          d.nama.toLowerCase().includes(kw) ||
          (d.rit || "rit 1").toLowerCase().includes(kw) ||
          d.status.toLowerCase().includes(kw) ||
          d.total.toString() === kw
        );
      });
    }

    // LOGIKA FILTER DROPDOWN
    const matchesMobil = fMobil === "Semua" || d.mobil === fMobil;
    const matchesRit = fRit === "Semua" || (d.rit || "Rit 1") === fRit;
    const matchesStatus = fStatus === "Semua" || d.status === fStatus;

    return matchesSearch && matchesMobil && matchesRit && matchesStatus;
  });

  // 5. Render Data Aktif (Dasbor / Sekolah) ke layar
  filtered.forEach((d) => {
    let originalIdx = data.findIndex((item) => item === d);
    let statusColor =
      d.status === "done"
        ? "#22c55e"
        : d.status === "holiday"
          ? "#64748b"
          : "#f59e0b";
    let pkT = hitung(d.pk_val.i, d.pk_val.s);
    let pbT = hitung(d.pb_val.i, d.pb_val.s);
    let mobilClass = d.mobil === "Mobil 1" ? "tag-m1" : "tag-m2";
    let ritLabel = d.rit || "Rit 1";

    let rekLabel = "";
    let borderStyle = "";

    // Cek properti _isSiap yang sudah dihitung di atas
    if (d._isSiap) {
      rekLabel = `<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900; margin-left:5px;">SIAP</span>`;
      borderStyle = "border: 2px solid #22c55e;";
    }

    listActive.innerHTML += `
            <div class="item ${d.status}" style="${borderStyle}">
                <div class="action">
                    <button class="smallbtn" style="background:#3b82f6" onclick="editSekolah(${originalIdx})">EDIT</button>
                    ${
                      d.status === "pending"
                        ? `<button class="smallbtn" style="background:#f59e0b" onclick="setStatus(${originalIdx}, 'holiday')">LBR</button>
                         <button class="smallbtn" style="background:#22c55e" onclick="setStatus(${originalIdx}, 'done')">DONE</button>`
                        : `<button class="smallbtn" style="background:#64748b" onclick="setStatus(${originalIdx}, 'pending')">REDO</button>`
                    }
                    <button class="smallbtn" style="background:#ef4444" onclick="confirmHapus(${originalIdx})">DEL</button>
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
                        <b>PK</b> <span>${pkT} (${Math.floor(pkT / 5)} iket + ${pkT % 5})</span>
                    </div>
                    <div style="background:#f0f9ff; padding:4px 8px; border-radius:6px; display:flex; justify-content:space-between; font-size:11px; color:#0369a1; border:1px solid #e0f2fe;">
                        <b>PB</b> <span>${pbT} (${Math.floor(pbT / 5)} iket + ${pbT % 5})</span>
                    </div>
                    <div style="background:#3b82f6; color:white; text-align:center; padding:3px; border-radius:6px; font-weight:900; font-size:11px;">
                        TOTAL: ${d.total}
                    </div>
                </div>
            </div>`;
  });

  // 6. Render Histori ke layar
  historyData.forEach((d, i) => {
    let pkT = hitung(d.pk_val.i, d.pk_val.s);
    let pbT = hitung(d.pb_val.i, d.pb_val.s);
    let mobilClass = d.mobil === "Mobil 1" ? "tag-m1" : "tag-m2";
    let ritLabel = d.rit || "Rit 1";

    listHist.innerHTML += `
            <div class="item holiday" style="opacity: 0.85;">
                <div class="action">
                    <button class="smallbtn" style="background:#10b981;" onclick="restore(${i})">RESTORE</button>
                    <button class="smallbtn" style="background:#ef4444;" onclick="confirmHapusHist(${i})">DEL</button>
                </div>
                <div style="margin-bottom:5px">
                    <span class="badge" style="background:#fee2e2; color:#ef4444; border:1px solid #fecaca;">TERHAPUS</span>
                    <span class="mobil-tag ${mobilClass}">${d.mobil}</span>
                    <span class="rit-tag">${ritLabel.toUpperCase()}</span>
                </div>
                <span class="item-title" style="display:block; font-weight:800; margin-bottom:8px; color:#475569;">${d.nama}</span>
                
                <div style="display:flex; flex-direction:column; gap:4px">
                    <div style="background:#fef2f2; padding:4px 8px; border-radius:6px; display:flex; justify-content:space-between; font-size:11px; color:#b91c1c; border:1px solid #fee2e2;">
                        <b>PK</b> <span>${pkT} (${Math.floor(pkT / 5)} iket + ${pkT % 5})</span>
                    </div>
                    <div style="background:#f0f9ff; padding:4px 8px; border-radius:6px; display:flex; justify-content:space-between; font-size:11px; color:#0369a1; border:1px solid #e0f2fe;">
                        <b>PB</b> <span>${pbT} (${Math.floor(pbT / 5)} iket + ${pbT % 5})</span>
                    </div>
                    <div style="background:#e2e8f0; color:#475569; text-align:center; padding:3px; border-radius:6px; font-weight:900; font-size:11px;">
                        TOTAL: ${d.total}
                    </div>
                </div>
            </div>`;
  });
}

/* =========================================
   ACTIONS (TAMBAH & EDIT DATA)
   ========================================= */

// --- 1. Fungsi Buka/Tutup Modal Tambah (Baru) ---
function openTambahModal() {
  document.getElementById("tambahModal").style.display = "flex";
  // Otomatis fokus ke input nama agar user bisa langsung mengetik
  setTimeout(() => document.getElementById("nama").focus(), 100);
}

function closeTambahModal() {
  document.getElementById("tambahModal").style.display = "none";
}

// --- 2. Fungsi Tambah (Sudah Diperbarui) ---
function tambah() {
  let nama = document.getElementById("nama").value.trim().toUpperCase();
  if (!nama) return;
  let mobil = document.querySelector('input[name="mobil"]:checked').value;
  let rit = document.querySelector('input[name="ritSelect"]:checked').value;

  let pki = document.getElementById("pk_i").value,
    pks = document.getElementById("pk_s").value;
  let pbi = document.getElementById("pb_i").value,
    pbs = document.getElementById("pb_s").value;
  let tendiki = document.getElementById("tendik_i").value;
  let tendiks = document.getElementById("tendik_s")
    ? document.getElementById("tendik_s").value
    : 0; // Jaga-jaga

  let mode = document.querySelector('input[name="inputMode"]:checked').value;

  let pkUtama = parseInt(pki) || 0;
  let pbUtama = parseInt(pbi) || 0;
  let tendikUtama = parseInt(tendiki) || 0;
  let pkTotalEceran = parseInt(pks) || 0;
  let pbTotalEceran = parseInt(pbs) || 0;

  let pkHitung, pbHitung;

  if (mode === "ikat") {
    pkHitung = pkUtama * 5 + pkTotalEceran;
    pbHitung = pbUtama * 5 + pbTotalEceran;
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
    nama,
    mobil,
    rit,
    status: "pending",
    total: pkHitung + pbHitung,
    pk_val: { i: pkUtama, s: pkTotalEceran },
    pb_val: { i: pbUtama, s: pbTotalEceran },
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

  // BUG FIX: tambahkan "tendik_s" ke dalam daftar reset form ini
  ["nama", "pk_i", "pk_s", "pb_i", "pb_s", "tendik_i", "tendik_s"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    },
  );

  update();

  // LOGIKA BARU: Tutup modal dan tampilkan pesan sukses
  closeTambahModal();
  showSnackbar("Data Sekolah Disimpan");
}

/* =========================================
   FUNGSI POP-UP MODAL EDIT SEKOLAH (BARU & DIPERBAIKI)
   ========================================= */

// 1. Fungsi untuk mengganti placeholder (Ikat / Porsi) di dalam Modal Edit
function toggleModalPlaceholder() {
  let modeNode = document.querySelector('input[name="modalInputMode"]:checked');
  if (!modeNode) return;
  let mode = modeNode.value;

  const pkInput = document.getElementById("modalPk_i");
  const pbInput = document.getElementById("modalPb_i");
  const eceranElements = document.querySelectorAll(
    "#modalPk_s, #modalPb_s, .modal-plus-sign",
  );

  let idx = document.getElementById("modalEditIdx").value;
  let item = data[idx];

  if (mode === "porsi") {
    pkInput.placeholder = "PK (Total Porsi)";
    pbInput.placeholder = "PB (Total Porsi)";
    eceranElements.forEach((el) => (el.style.display = "none"));

    // Konversi otomatis ke total porsi saat tombol ditekan
    if (item && item.pk_val) {
      pkInput.value = item.pk_val.i * 5 + parseInt(item.pk_val.s || 0);
      pbInput.value = item.pb_val.i * 5 + parseInt(item.pb_val.s || 0);
    }
  } else {
    pkInput.placeholder = "PK (Ikat)";
    pbInput.placeholder = "PB (Ikat)";
    eceranElements.forEach((el) => (el.style.display = "inline-block"));

    // Kembalikan ke format Ikat + Sisa asli
    if (item && item.pk_val) {
      pkInput.value = item.pk_val.i;
      document.getElementById("modalPk_s").value = item.pk_val.s;
      pbInput.value = item.pb_val.i;
      document.getElementById("modalPb_s").value = item.pb_val.s;
    }
  }
}

// 2. Fungsi untuk membuka modal Edit
function editSekolah(idx) {
  let item = data[idx];

  document.getElementById("modalEditIdx").value = idx;
  document.getElementById("modalNama").value = item.nama;

  document.querySelectorAll('input[name="modalMobil"]').forEach((radio) => {
    radio.checked = radio.value === item.mobil;
  });

  document.querySelectorAll('input[name="modalRitSelect"]').forEach((radio) => {
    radio.checked = radio.value === (item.rit || "Rit 1");
  });

  document.querySelectorAll('input[name="modalStatus"]').forEach((radio) => {
    radio.checked = radio.value === item.status;
  });

  // Reset radio button ke mode Ikat secara default
  let modeRadios = document.querySelectorAll('input[name="modalInputMode"]');
  if (modeRadios.length > 0) modeRadios[0].checked = true;

  document.getElementById("modalPk_i").value = item.pk_val.i;
  document.getElementById("modalPk_s").value = item.pk_val.s;
  document.getElementById("modalPb_i").value = item.pb_val.i;
  document.getElementById("modalPb_s").value = item.pb_val.s;

  // Pastikan UI menyesuaikan state mode Ikat
  toggleModalPlaceholder();

  document.getElementById("editSekolahModal").style.display = "flex";
}

// 3. Fungsi untuk menutup modal Edit (tidak berubah)
function closeEditModal() {
  document.getElementById("editSekolahModal").style.display = "none";
}

// 4. Fungsi menyimpan perubahan dari Modal
function simpanPerubahanModal() {
  let idx = parseInt(document.getElementById("modalEditIdx").value);
  if (isNaN(idx)) return;

  let nama = document.getElementById("modalNama").value.trim().toUpperCase();
  if (!nama) return;

  let mobil = document.querySelector('input[name="modalMobil"]:checked').value;
  let rit = document.querySelector(
    'input[name="modalRitSelect"]:checked',
  ).value;
  let status = document.querySelector(
    'input[name="modalStatus"]:checked',
  ).value;

  let modeNode = document.querySelector('input[name="modalInputMode"]:checked');
  let mode = modeNode ? modeNode.value : "ikat";

  let pki = parseInt(document.getElementById("modalPk_i").value) || 0;
  let pks = parseInt(document.getElementById("modalPk_s").value) || 0;
  let pbi = parseInt(document.getElementById("modalPb_i").value) || 0;
  let pbs = parseInt(document.getElementById("modalPb_s").value) || 0;

  let pkHitung, pbHitung;
  let pkUtama, pkTotalEceran, pbUtama, pbTotalEceran;

  if (mode === "ikat") {
    // Jika input format ikat
    pkHitung = pki * 5 + pks;
    pbHitung = pbi * 5 + pbs;

    pkUtama = pki;
    pkTotalEceran = pks;
    pbUtama = pbi;
    pbTotalEceran = pbs;
  } else {
    // Jika input format porsi langsung (dari input pertama, nilai sisa tidak dihiraukan)
    pkHitung = pki;
    pbHitung = pbi;

    // Sistem otomatis memecahnya menjadi format ikat untuk database
    pkTotalEceran = pkHitung % 5;
    pkUtama = Math.floor(pkHitung / 5);

    pbTotalEceran = pbHitung % 5;
    pbUtama = Math.floor(pbHitung / 5);
  }

  data[idx] = {
    nama,
    mobil,
    rit,
    status,
    total: pkHitung + pbHitung,
    pk_val: { i: pkUtama, s: pkTotalEceran },
    pb_val: { i: pbUtama, s: pbTotalEceran },
  };

  closeEditModal();
  update();
}

function closeEditModal() {
  document.getElementById("editSekolahModal").style.display = "none";
}

function setStatus(i, s) {
  let oldStatus = data[i].status;
  data[i].status = s;

  // Simpan jejak status lama untuk tombol UNDO
  deletedItem = { type: "status", index: i, content: oldStatus };
  update();

  // Munculkan pop up snackbar
  let txt = s === "done" ? "SELESAI" : s === "holiday" ? "LIBUR" : "PENDING";
  showSnackbar(`${txt}`);
}

function restore(i) {
  data.unshift({ ...historyData[i], status: "pending" });
  historyData.splice(i, 1);
  update();
}

/* =========================================
   MODALS, UNDO & CLEAR HISTORIES
   ========================================= */
function showSnackbar(msg) {
  const sb = document.getElementById("snackbar");
  if (!sb) return;
  sb.querySelector("span").innerText = msg;
  sb.className = "snackbar show";
  clearTimeout(deleteTimeout);
  deleteTimeout = setTimeout(() => {
    sb.className = "snackbar";
    deletedItem = null;
  }, 5000);
}

function undoAction() {
  if (deletedItem) {
    if (deletedItem.type === "active") {
      // Pembatalan Hapus Sekolah
      data.splice(deletedItem.index, 0, deletedItem.content);
      historyData.shift();
    } else if (deletedItem.type === "status") {
      // Pembatalan 1 Sekolah Selesai
      data[deletedItem.index].status = deletedItem.content;
    } else if (deletedItem.type === "bulk_status") {
      // Pembatalan 1 Rit Penuh Selesai
      deletedItem.indices.forEach((i) => {
        data[i].status = deletedItem.content;
      });
    } else {
      // Pembatalan Hapus Permanen di Histori
      historyData.splice(deletedItem.index, 0, deletedItem.content);
    }

    document.getElementById("snackbar").className = "snackbar";
    deletedItem = null;
    update();
  }
}

function openModal(icon, title, msg, color, onConfirm) {
  const m = document.getElementById("customModal");
  if (!m) return confirm(msg) && onConfirm();
  document.getElementById("modalIcon").innerText = icon;
  document.getElementById("modalTitle").innerText = title;
  document.getElementById("modalMessage").innerText = msg;
  const btn = document.getElementById("modalConfirmBtn");
  btn.style.backgroundColor = color;
  btn.onclick = () => {
    onConfirm();
    closeModal();
  };
  m.style.display = "flex";
}

function closeModal() {
  const m = document.getElementById("customModal");
  if (m) m.style.display = "none";
}

function confirmHapus(i) {
  openModal("🗑️", "Hapus", "Hapus sekolah ini?", "#ef4444", () => {
    deletedItem = { type: "active", index: i, content: data[i] };
    historyData.unshift(data[i]);
    data.splice(i, 1);
    update();
    showSnackbar("Sekolah dihapus");
  });
}

function confirmHapusHist(i) {
  openModal("🔥", "Hapus", "Hapus permanen?", "#ef4444", () => {
    deletedItem = { type: "history", index: i, content: historyData[i] };
    historyData.splice(i, 1);
    update();
    showSnackbar("Riwayat dihapus");
  });
}

function confirmClearHistory() {
  openModal(
    "🚨",
    "Hapus Semua",
    "Kosongkan semua riwayat permanen?",
    "#ef4444",
    () => {
      historyData = [];
      update();
      showSnackbar("Semua riwayat dibersihkan");
    },
  );
}

document.addEventListener("touchstart", function () {}, true);

document.addEventListener(
  "touchstart",
  function (e) {
    if (e.target.closest(".smallbtn")) {
      e.target.closest(".smallbtn").classList.add("tekan");
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchstart",
  function (e) {
    let el = e.target.closest(
      "button, .smallbtn, .btn-primary-v2, .nav-item, .rit-select-box",
    );
    if (el) {
      el.classList.add("tekan");
    }
  },
  { passive: true },
);

document.addEventListener(
  "touchend",
  function (e) {
    let el = e.target.closest(
      "button, .smallbtn, .btn-primary-v2, .nav-item, .rit-select-box",
    );
    if (el) {
      setTimeout(() => {
        el.classList.remove("tekan");
      }, 100);
    }
  },
  { passive: true },
);

function togglePlaceholder() {
  let mode = document.querySelector('input[name="inputMode"]:checked').value;
  const pkInput = document.getElementById("pk_i");
  const pbInput = document.getElementById("pb_i");
  const tendikInput = document.getElementById("tendik_i");
  const rowTendik = document.getElementById("row_tendik");
  const eceranElements = document.querySelectorAll(
    "#pk_s, #pb_s, #tendik_s, .plus-sign",
  );

  if (mode === "porsi") {
    if (pkInput) pkInput.placeholder = "PK (Porsi)";
    if (pbInput) pbInput.placeholder = "PB (Porsi)";
    if (tendikInput) tendikInput.placeholder = "Tendik (Porsi)";
    eceranElements.forEach((el) => (el.style.display = "none"));
    if (rowTendik) rowTendik.style.display = "flex";
  } else {
    if (pkInput) pkInput.placeholder = "PK (Ikat)";
    if (pbInput) pbInput.placeholder = "PB (Ikat)";
    eceranElements.forEach((el) => (el.style.display = "inline-block"));
    if (rowTendik) rowTendik.style.display = "none";
  }
}

function shareRitSummary(ritName) {
  // Ambil data sekolah berdasarkan Rit yang dipilih
  let sekolahDiRitIni = data.filter((d) => (d.rit || "Rit 1") === ritName);

  let text = `*Jadwal Pengiriman: ${ritName.toUpperCase()}*\n\n`;

  sekolahDiRitIni.forEach((s) => {
    let pk = hitung(s.pk_val.i, s.pk_val.s);
    let pb = hitung(s.pb_val.i, s.pb_val.s);
    let statusTag = s.status === "done" ? "(✅ Selesai)" : "";
    text += `• ${s.nama} ${statusTag}\n  PK: ${pk} | PB: ${pb}\n`;
  });

  // Hitung total untuk Rit ini
  let totPK = sekolahDiRitIni.reduce(
    (sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s),
    0,
  );
  let totPB = sekolahDiRitIni.reduce(
    (sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s),
    0,
  );

  text += `\n-----------------------\n*TOTAL MUATAN:*\nPK: ${totPK}\nPB: ${totPB}`;

  // Fungsi Share (Native HP atau WhatsApp)
  if (navigator.share) {
    navigator
      .share({
        title: "Jadwal Kirim",
        text: text,
      })
      .catch((err) => console.log("Batal share"));
  } else {
    // Fallback untuk browser yang tidak mendukung share API
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }
}
function showSchoolInfo(idx) {
  let s = data[idx];
  if (!s) return;

  let pkT = hitung(s.pk_val.i, s.pk_val.s);
  let pbT = hitung(s.pb_val.i, s.pb_val.s);

  // Warna badge status
  let statusColor =
    s.status === "done"
      ? "#22c55e"
      : s.status === "holiday"
        ? "#64748b"
        : "#f59e0b";

  let btnSelesaiHTML = "";
  if (s.status !== "done") {
    btnSelesaiHTML = `
      <button onclick="setSchoolDoneFromModal(${idx})" style="width: 100%; margin-top: 15px; padding: 12px; background: #22c55e; color: white; border: none; border-radius: 12px; font-weight: 800; font-size: 14px; cursor: pointer; box-shadow: 0 4px 6px rgba(34, 197, 94, 0.2);">
          SELESAI
      </button>
    `;
  }

  document.getElementById("infoModalTitle").innerText = s.nama;
  document.getElementById("infoModalContent").innerHTML = `
        <div style="text-align: center; margin-bottom: 15px;">
            <span style="background: ${statusColor}; color: white; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 900; letter-spacing: 0.5px;">
                ${s.status.toUpperCase()}
            </span>
            <div style="display: flex; justify-content: center; gap: 15px; margin-top: 10px; font-size: 12px; color: #64748b; font-weight: 700;">
                <span>📍 ${s.mobil}</span>
                <span>🚚 ${s.rit || "Rit 1"}</span>
            </div>
        </div>

        <!-- Box PK -->
        <div style="background: #fff1f2; padding: 12px; border-radius: 12px; border: 1px solid #fecaca; margin-bottom: 10px;">
            <div style="font-size: 10px; font-weight: 800; color: #991b1b; margin-bottom: 4px; text-transform: uppercase;">PK</div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 20px; font-weight: 900; color: #b91c1c;">${pkT}</span>
                <span style="font-size: 12px; font-weight: 600; color: #b91c1c;">${s.pk_val.i} ikat + ${s.pk_val.s}</span>
            </div>
        </div>

        <!-- Box PB -->
        <div style="background: #f0f9ff; padding: 12px; border-radius: 12px; border: 1px solid #bae6fd; margin-bottom: 10px;">
            <div style="font-size: 10px; font-weight: 800; color: #075985; margin-bottom: 4px; text-transform: uppercase;">PB</div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 20px; font-weight: 900; color: #0369a1;">${pbT}</span>
                <span style="font-size: 12px; font-weight: 600; color: #0369a1;">${s.pb_val.i} ikat + ${s.pb_val.s}</span>
            </div>
        </div>

        <!-- Box Total -->
        <div style="padding: 12px; background: #1e293b; border-radius: 12px; text-align: center; color: white;">
            <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Total Keseluruhan</div>
            <div style="font-size: 32px; font-weight: 900; color: #f8fafc; margin-top: 2px;">${s.total}</div>
        </div>
        
        <!-- TOMBOL SELESAI (Akan muncul jika belum selesai) -->
        ${btnSelesaiHTML}
    `;

  document.getElementById("infoModal").style.display = "flex";
}

// Tambahkan fungsi pembantunya di bawahnya
function setSchoolDoneFromModal(idx) {
  setStatus(idx, "done"); // Menggunakan fungsi setStatus yang sudah Anda buat
  closeInfoModal(); // Tutup pop-up
}

function closeInfoModal() {
  document.getElementById("infoModal").style.display = "none";
}
/* =========================================
   CUSTOM DROPDOWN LOGIC
   ========================================= */
function toggleDropdown(el) {
  // Tutup semua dropdown lain agar tidak tumpang tindih
  document.querySelectorAll(".dropdown-list").forEach((list) => {
    if (list !== el.nextElementSibling) list.classList.remove("show");
  });
  // Buka/tutup dropdown yang sedang diklik
  el.nextElementSibling.classList.toggle("show");
}

function setDropdownValue(item, val, labelText) {
  let dropdown = item.closest(".custom-dropdown");
  // 1. Ubah nilai input tersembunyinya
  dropdown.querySelector("input").value = val;
  // 2. Ubah teks tombol dropdown-nya
  dropdown.querySelector(".dd-label").innerText = labelText;
  // 3. Tutup daftar dropdown-nya
  dropdown.querySelector(".dropdown-list").classList.remove("show");
  // 4. Jalankan ulang pencarian (render)
  render();
}

// Tutup dropdown otomatis jika layar (di luar area dropdown) diklik
document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown")) {
    document.querySelectorAll(".dropdown-list").forEach((list) => {
      list.classList.remove("show");
    });
  }
});

togglePlaceholder();

// Start
update();
