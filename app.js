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
   FUNGSI SINKRONISASI STATUS (BARU)
   Mencegah error pada sekolah dengan PK=0 / PB=0
   ========================================= */
function syncStatus(d) {
  let pk = hitung(d.pk_val.i, d.pk_val.s);
  let pb = hitung(d.pb_val.i, d.pb_val.s);

  // Jika muatan 0, otomatis dianggap selesai untuk bagian tersebut
  if (pk === 0) d.pk_done = true;
  if (pb === 0) d.pb_done = true;

  if (d.status === "done") {
    d.pk_done = true;
    d.pb_done = true;
  } else {
    // Jika keduanya sudah true, ubah status utama jadi done
    if (d.pk_done && d.pb_done) {
      d.status = "done";
    } else {
      d.status = "pending";
    }
  }
}

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

/* =========================================
   MODAL RIT (SELESAI PK, PB, SEMUA)
   ========================================= */
function confirmRitDone(ritName) {
  const overlay = document.createElement("div");
  overlay.id = "ritConfirmOverlay";
  overlay.style.cssText =
    "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:9999;";

  const box = document.createElement("div");
  box.style.cssText =
    "background:white; padding:24px; border-radius:16px; width:85%; max-width:320px; text-align:center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);";

  box.innerHTML = `
      <div style="font-size:32px; margin-bottom:10px;">🚚</div>
      <h3 style="margin:0 0 5px 0; font-size:18px; color:var(--dark);">Selesaikan ${ritName.toUpperCase()}</h3>
      <p style="font-size:13px; color:#64748b; margin-bottom:20px;">Tandai bagian mana yang sudah selesai dikirim?</p>
      <div style="display:flex; flex-direction:column; gap:10px;">
          <button onclick="processRitDone('${ritName}', 'PK')" style="background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; padding:12px; border-radius:10px; font-weight:800; font-size:14px; cursor:pointer;">PK SELESAI</button>
          <button onclick="processRitDone('${ritName}', 'PB')" style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd; padding:12px; border-radius:10px; font-weight:800; font-size:14px; cursor:pointer;">PB SELESAI</button>
          <button onclick="processRitDone('${ritName}', 'ALL')" style="background:#22c55e; color:white; border:none; padding:12px; border-radius:10px; font-weight:800; font-size:14px; cursor:pointer; box-shadow:0 4px 6px rgba(34,197,94,0.2);">SELESAI SEMUA</button>
          <button onclick="document.getElementById('ritConfirmOverlay').remove()" style="background:transparent; color:#64748b; border:none; padding:10px; margin-top:5px; cursor:pointer; font-weight:700; font-size:14px;">Batal</button>
      </div>
  `;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function processRitDone(ritName, type) {
  let changedIndices = [];
  data.forEach((d, idx) => {
    if ((d.rit || "Rit 1") === ritName && d.status === "pending") {
      changedIndices.push(idx);
      if (type === "PK") d.pk_done = true;
      if (type === "PB") d.pb_done = true;
      if (type === "ALL") {
        d.pk_done = true;
        d.pb_done = true;
      }
      syncStatus(d); // Selaraskan status jika keduanya true otomatis done
    }
  });

  if (document.getElementById("ritConfirmOverlay")) {
    document.getElementById("ritConfirmOverlay").remove();
  }

  if (changedIndices.length > 0) {
    deletedItem = {
      type: "bulk_status",
      indices: changedIndices,
      content: "pending",
    };
    update();
    let msgType = type === "ALL" ? "SEMUA" : type;
    showSnackbar(`${ritName.toUpperCase()} - ${msgType} SELESAI`);
  }
}

/* =========================================
   HELPER BARU: HITUNG IKAT & DERETKAN SISA
   ========================================= */
function formatDetailPorsi(listData, tipe) {
  let ikatTerkumpul = 0;
  let deretSisa = [];

  listData.forEach((d) => {
    let porsi =
      tipe === "PK"
        ? hitung(d.pk_val.i, d.pk_val.s)
        : hitung(d.pb_val.i, d.pb_val.s);
    ikatTerkumpul += Math.floor(porsi / 5);
    let sisa = porsi % 5;
    if (sisa > 0) deretSisa.push(sisa);
  });

  let totalPorsiIkat = ikatTerkumpul * 5;
  let teksDetail = `${ikatTerkumpul} iket`;
  if (deretSisa.length > 0) teksDetail += ` + ${deretSisa.join(" + ")}`;

  return { totalPorsiIkat, teksDetail };
}

/* =========================================
   CORE LOGIC (UPDATE DASHBOARD & RIT GROUPING)
   ========================================= */
function update() {
  // Lakukan sinkronisasi ke seluruh data aktif terlebih dahulu
  data.forEach((d) => {
    if (d.status !== "holiday") syncStatus(d);
  });

  const readyVal = Math.max(
    0,
    parseInt(document.getElementById("readyInput")?.value || 0),
  );

  let aktif = data.filter((d) => d.status !== "holiday");
  let done = data.filter((d) => d.status === "done");

  setTxt("sekolahDoneCount", `${done.length} sekolah selesai`);

  let targetTotal = aktif.reduce((sum, d) => sum + d.total, 0);

  // FIX: Terdistribusi/Kirim Total kini berhitung parsial (PK/PB Saja ditambahkan)
  let kirimTotal = aktif.reduce((sum, d) => {
    let t = 0;
    let pkVal = hitung(d.pk_val.i, d.pk_val.s);
    let pbVal = hitung(d.pb_val.i, d.pb_val.s);
    if (d.status === "done" || d.pk_done) t += pkVal;
    if (d.status === "done" || d.pb_done) t += pbVal;
    return sum + t;
  }, 0);

  let pkTot = aktif.reduce((sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s), 0);
  let pbTot = aktif.reduce((sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s), 0);

  let pkDone = aktif.reduce(
    (sum, d) =>
      sum +
      (d.status === "done" || d.pk_done ? hitung(d.pk_val.i, d.pk_val.s) : 0),
    0,
  );
  let pbDone = aktif.reduce(
    (sum, d) =>
      sum +
      (d.status === "done" || d.pb_done ? hitung(d.pb_val.i, d.pb_val.s) : 0),
    0,
  );

  setTxt("targetView", targetTotal);
  setTxt("terdistribusiView", kirimTotal);
  setTxt("sisaTarget", Math.max(0, targetTotal - kirimTotal));

  // Ambil sisa PK dan PB yang BENAR-BENAR belum selesai
  let pkPendingData = aktif.filter((d) => d.status !== "done" && !d.pk_done);
  let pbPendingData = aktif.filter((d) => d.status !== "done" && !d.pb_done);

  let pkPending = formatDetailPorsi(pkPendingData, "PK");
  let pbPending = formatDetailPorsi(pbPendingData, "PB");

  setTxt("totalPKView", pkTot);
  setTxt("pkDoneView", pkDone);
  setTxt("pkSisaView", pkPending.totalPorsiIkat);
  setTxt("pkDetailIkat", pkPending.teksDetail);

  setTxt("totalPBView", pbTot);
  setTxt("pbDoneView", pbDone);
  setTxt("pbSisaView", pbPending.totalPorsiIkat);
  setTxt("pbDetailIkat", pbPending.teksDetail);

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
    elKurang.style.color = kurang > 0 ? "var(--danger)" : "var(--success)";
  }

  localStorage.setItem("ultra_v10_data", JSON.stringify(data));
  localStorage.setItem("ultra_v10_hist", JSON.stringify(historyData));
  render();
}

/* =========================================
   LOGIKA BARU: RENDER BREAKDOWN PER RIT
   ========================================= */
/* =========================================
   LOGIKA BARU: RENDER BREAKDOWN PER RIT
   ========================================= */
function renderRitBreakdown(aktifList) {
  const container = document.getElementById("ritContainer");
  if (!container) return;
  container.innerHTML = "";

  const dashSearch =
    document.getElementById("dashSearchInput")?.value.toLowerCase().trim() ||
    "";

  let listRitTersedia = [
    ...new Set(aktifList.map((d) => d.rit || "Rit 1")),
  ].sort();

  // TAMPILAN JIKA DATA KOSONG DI DASBOR
  if (listRitTersedia.length === 0) {
    container.innerHTML = `
        <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            <h4>Belum Ada Jadwal Rit</h4>
            <p>Daftar kiriman per rit akan otomatis muncul di sini setelah Anda menambahkan sekolah.</p>
        </div>
      `;
    return;
  }

  listRitTersedia.forEach((ritName) => {
    let sekolahDiRitIni = aktifList.filter(
      (d) => (d.rit || "Rit 1") === ritName,
    );
    let isRitSelesai = sekolahDiRitIni.every((d) => d.status === "done");

    let isRitPkDone = sekolahDiRitIni.every(
      (d) => d.status === "done" || d.pk_done,
    );
    let isRitPbDone = sekolahDiRitIni.every(
      (d) => d.status === "done" || d.pb_done,
    );

    // Hitung persentase progress Rit
    let ritTargetTotal = sekolahDiRitIni.reduce((sum, d) => sum + d.total, 0);
    let ritKirimTotal = sekolahDiRitIni.reduce((sum, d) => {
      let t = 0;
      let pkVal = hitung(d.pk_val.i, d.pk_val.s);
      let pbVal = hitung(d.pb_val.i, d.pb_val.s);
      if (d.status === "done" || d.pk_done) t += pkVal;
      if (d.status === "done" || d.pb_done) t += pbVal;
      return sum + t;
    }, 0);
    let ritProgressPct =
      ritTargetTotal > 0
        ? Math.round((ritKirimTotal / ritTargetTotal) * 100)
        : 0;

    let totalRit = 0;
    if (isRitSelesai) {
      totalRit = ritTargetTotal;
    } else {
      sekolahDiRitIni.forEach((d) => {
        if (d.status !== "done") {
          if (!d.pk_done) totalRit += hitung(d.pk_val.i, d.pk_val.s);
          if (!d.pb_done) totalRit += hitung(d.pb_val.i, d.pb_val.s);
        }
      });
    }

    let dataHitungPK = isRitPkDone
      ? sekolahDiRitIni
      : sekolahDiRitIni.filter((d) => d.status === "pending" && !d.pk_done);
    let dataHitungPB = isRitPbDone
      ? sekolahDiRitIni
      : sekolahDiRitIni.filter((d) => d.status === "pending" && !d.pb_done);

    let pkRitData = formatDetailPorsi(dataHitungPK, "PK");
    let pbRitData = formatDetailPorsi(dataHitungPB, "PB");

    let btnActionHTML = `<button onclick="shareRitSummary('${ritName}')" style="background:#e2e8f0; border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:10px; font-weight:800; color:#475569;">SHARE</button>`;

    if (!isRitSelesai) {
      let spinnerStyle =
        "display:inline-block; width:10px; height:10px; border:2px solid rgba(255,255,255,0.4); border-top-color:white; border-radius:50%; animation: putar 1s linear infinite;";
      btnActionHTML += `<button onclick="confirmRitDone('${ritName}')" style="background: var(--warning); border:none; border-radius:6px; padding:4px 10px; cursor:pointer; font-size:10px; font-weight:800; color:#713f12; display:flex; align-items:center; gap:4px;"><span style="${spinnerStyle}"></span> Proses</button>`;
    } else {
      btnActionHTML += `<span style="background:#d1fae5; color:var(--success); border:1px solid #10b981; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:900; letter-spacing:0.5px;">SELESAI</span>`;
    }

    let stylePK = isRitPkDone
      ? "background:#f0fdf4; color:var(--success); border:1px solid #bbf7d0; text-decoration:line-through;"
      : "background:#fef2f2; color:var(--danger); border:1px solid #fee2e2;";
    let stylePB = isRitPbDone
      ? "background:#f0fdf4; color:var(--success); border:1px solid #bbf7d0; text-decoration:line-through;"
      : "background:#f0f9ff; color:#0284c7; border:1px solid #e0f2fe;";

    let cardStyle = isRitSelesai
      ? "background: #f8fafc; border: 1px solid #cbd5e1;"
      : "background: white; border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.03);";

    // Progress Bar HTML
    let progressHTML = `
      <div style="width: 100%; background: #e2e8f0; border-radius: 4px; height: 6px; margin: 8px 0; overflow: hidden;">
          <div style="width: ${ritProgressPct}%; background: #10b981; height: 100%; transition: width 0.3s ease;"></div>
      </div>
      <div style="font-size: 10px; color: #64748b; text-align: right; margin-top: -4px; margin-bottom: 8px; font-weight: bold;">${ritProgressPct}% Selesai</div>
    `;

    let listSekolahHTML = `<div style="margin-top: 12px; display: flex; flex-wrap: wrap; gap: 6px; border-top: 1px dashed #e2e8f0; padding-top: 10px;">`;

    sekolahDiRitIni.forEach((sek) => {
      let originalIdx = data.indexOf(sek);
      let cursorStyle = "cursor: pointer; transition: all 0.3s ease;";
      let isHighlighted =
        dashSearch && sek.nama.toLowerCase().includes(dashSearch);
      let highlightClass = isHighlighted ? "highlight-school" : "";

      let pkVal = hitung(sek.pk_val.i, sek.pk_val.s);
      let pbVal = hitung(sek.pb_val.i, sek.pb_val.s);

      if (sek.status === "done") {
        listSekolahHTML += `<span onclick="showSchoolInfo(${originalIdx})" class="${highlightClass}" style="font-size: 11px; background: #f1f5f9; color: #9FA6B0; padding: 4px 8px; border-radius: 6px; text-decoration: line-through; border: 1px solid #e2e8f0; ${cursorStyle}">${sek.nama}</span>`;
      } else {
        let pkInd =
          sek.pk_done && pkVal > 0
            ? ` <span style="color:#166534; font-size:10px; font-weight:900;">✓PK</span>`
            : "";
        let pbInd =
          sek.pb_done && pbVal > 0
            ? ` <span style="color:#166534; font-size:10px; font-weight:900;">✓PB</span>`
            : "";

        listSekolahHTML += `<span onclick="showSchoolInfo(${originalIdx})" class="${highlightClass}" style="font-size: 11px; font-weight: 700; background: #eff6ff; color: #1d4ed8; padding: 4px 8px; border-radius: 6px; border: 1px solid #bfdbfe; ${cursorStyle}">${sek.nama}${pkInd}${pbInd}</span>`;
      }
    });

    listSekolahHTML += `</div>`;

    container.innerHTML += `
            <div class="rit-summary-card" style="${cardStyle}">
                <div class="rit-summary-title" style="margin-bottom: 10px;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 14px; font-weight: 900;">${ritName.toUpperCase()}</span>
                        ${btnActionHTML}
                    </div>
                    <span style="font-size: 13px; font-weight: 900; color: ${isRitSelesai ? "var(--success)" : "var(--dark)"};">
                        Total Sisa: ${totalRit}
                    </span>
                </div>
                ${progressHTML}
                <div class="rit-summary-row">
                    <div class="rit-summary-item" style="${stylePK}">
                        PK ${pkRitData.totalPorsiIkat} <span class="rit-summary-eceran" style="opacity: 0.85;">(${pkRitData.teksDetail})</span>
                    </div>
                    <div class="rit-summary-item" style="${stylePB}">
                        PB ${pbRitData.totalPorsiIkat} <span class="rit-summary-eceran" style="opacity: 0.85;">(${pbRitData.teksDetail})</span>
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

  let sorted = [...data].sort((a, b) => {
    const urutanStatus = { pending: 1, done: 2, holiday: 3 };
    let compareStatus = urutanStatus[a.status] - urutanStatus[b.status];
    if (compareStatus === 0) {
      return (a.rit || "Rit 1").localeCompare(b.rit || "Rit 1");
    }
    return compareStatus;
  });

  let stokCek = Math.max(
    0,
    parseInt(document.getElementById("readyInput")?.value || 0),
  );
  sorted.forEach((d) => {
    d._isSiap = false;
    if (d.status === "pending") {
      if (stokCek >= d.total && stokCek > 0) {
        d._isSiap = true;
        stokCek -= d.total;
      }
    }
  });

  const search =
    document.getElementById("searchInput")?.value.toLowerCase().trim() || "";
  const fMobil = document.getElementById("filterMobilSel")?.value || "Semua";
  const fRit = document.getElementById("filterRitSel")?.value || "Semua";
  const fStatus = document.getElementById("filterStatusSel")?.value || "Semua";

  let filtered = sorted.filter((d) => {
    let matchesSearch = true;
    if (search) {
      const keywords = search.split(/\s+/);
      matchesSearch = keywords.every(
        (kw) =>
          d.nama.toLowerCase().includes(kw) ||
          (d.rit || "rit 1").toLowerCase().includes(kw) ||
          d.status.toLowerCase().includes(kw) ||
          d.total.toString() === kw,
      );
    }
    return (
      matchesSearch &&
      (fMobil === "Semua" || d.mobil === fMobil) &&
      (fRit === "Semua" || (d.rit || "Rit 1") === fRit) &&
      (fStatus === "Semua" || d.status === fStatus)
    );
  });

  // TAMPILAN JIKA HALAMAN SEKOLAH KOSONG
  if (filtered.length === 0) {
    listActive.innerHTML = `
        <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4>Data Tidak Ditemukan</h4>
            <p>Belum ada sekolah yang ditambahkan atau kata kunci tidak cocok.</p>
        </div>
      `;
  } else {
    filtered.forEach((d) => {
      let originalIdx = data.findIndex((item) => item === d);
      let statusColor =
        d.status === "done"
          ? "var(--success)"
          : d.status === "holiday"
            ? "#64748b"
            : "var(--warning)";

      let pkT = hitung(d.pk_val.i, d.pk_val.s);
      let pbT = hitung(d.pb_val.i, d.pb_val.s);
      let mobilClass = d.mobil === "Mobil 1" ? "tag-m1" : "tag-m2";
      let ritLabel = d.rit || "Rit 1";

      let rekLabel = d._isSiap
        ? `<span style="background:var(--success); color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900; margin-left:5px;">SIAP</span>`
        : "";

      let itemBg = "#f8fafc";
      let itemBorder = d._isSiap ? "var(--success)" : "#e2e8f0";
      let boxStyle = `background-color: ${itemBg}; border: 2px solid ${itemBorder};`;

      let totalBgColor =
        d.status === "done"
          ? "var(--success)"
          : d.status === "holiday"
            ? "#64748b"
            : "#fef08a";
      let totalTextColor = d.status === "pending" ? "#713f12" : "#ffffff";

      let actionHTML = `
          <div class="action-dropdown-container">
              <button class="btn-action-trigger" onclick="toggleItemMenu(this)">⋮</button>
              <div class="item-dropdown-menu">
                  <div class="item-dropdown-btn" style="color: #64748b;" onclick="editSekolah(${originalIdx})">Edit</div>
                  ${
                    d.status === "pending"
                      ? `<div class="item-dropdown-btn" style="color: #64748b;" onclick="setStatus(${originalIdx}, 'done')">Selesai</div>
                         <div class="item-dropdown-btn" style="color: #64748b;" onclick="setStatus(${originalIdx}, 'holiday')">Libur</div>`
                      : `<div class="item-dropdown-btn" style="color: #64748b;" onclick="setStatus(${originalIdx}, 'pending')">Proses</div>`
                  }
                  <div class="item-dropdown-btn delete" style="color: var(--danger);" onclick="confirmHapus(${originalIdx})">Hapus</div>
              </div>
          </div>
        `;

      let labelStatus = "PROSES";
      if (d.status === "done") labelStatus = "SELESAI";
      else if (d.status === "holiday") labelStatus = "LIBUR";

      let badgeHTML =
        d.status === "pending"
          ? `<span class="badge" style="background:${statusColor}; color: white; display: inline-flex; align-items: center; gap: 4px;"><span style="display:inline-block; width:8px; height:8px; border:2px solid rgba(255,255,255,0.4); border-top-color:white; border-radius:50%; animation: putar 1s linear infinite;"></span>${labelStatus}</span>`
          : `<span class="badge" style="background:${statusColor}; color: white;">${labelStatus}</span>`;

      let isPkDone = d.status === "done" || d.pk_done;
      let isPbDone = d.status === "done" || d.pb_done;

      // Hitung persentase progres untuk masing-masing sekolah
      let doneItems = 0;
      if (isPkDone) doneItems += pkT;
      if (isPbDone) doneItems += pbT;
      let schoolProgressPct =
        d.total > 0 ? Math.round((doneItems / d.total) * 100) : 0;

      let schoolProgressBarHTML = `
          <div style="width: 100%; background: #e2e8f0; border-radius: 4px; height: 5px; margin: 6px 0 4px 0; overflow: hidden; display: flex;">
              <div style="width: ${schoolProgressPct}%; background: #10b981; height: 100%; transition: width 0.3s ease;"></div>
          </div>
          <div style="font-size: 9px; color: #64748b; text-align: right; margin-bottom: 8px; font-weight: bold;">
              ${schoolProgressPct}% Selesai
          </div>
        `;

      let pkBoxStyle = isPkDone
        ? "background:#f0fdf4; color:#166534;"
        : "background:#fef2f2; color:#b91c1c;";
      let pkTextStrike =
        isPkDone && pkT > 0 ? "text-decoration:line-through;" : "";
      let pbBoxStyle = isPbDone
        ? "background:#f0fdf4; color:#166534;"
        : "background:#f0f9ff; color:#0369a1;";
      let pbTextStrike =
        isPbDone && pbT > 0 ? "text-decoration:line-through;" : "";

      listActive.innerHTML += `
                <div class="item ${d.status}" style="${boxStyle}">
                    <div class="action">${actionHTML}</div>
                    <div style="margin-bottom:5px; padding-right: 25px;">
                        ${badgeHTML}
                        <span class="mobil-tag ${mobilClass}">${d.mobil}</span>
                        <span class="rit-tag">${ritLabel.toUpperCase()}</span>
                        ${rekLabel}
                    </div>
                    <span class="item-title" style="display:block; font-weight:800; padding-right: 20px;">${d.nama}</span>
                    ${schoolProgressBarHTML}
                    <div style="display:flex; flex-direction:column; gap:4px">
                        <div style="${pkBoxStyle} padding:6px 10px; border-radius:8px; display:flex; justify-content:space-between; font-size:11px;">
                            <b style="${pkTextStrike}">PK</b> <span style="${pkTextStrike}">${pkT} (${Math.floor(pkT / 5)} iket + ${pkT % 5})</span>
                        </div>
                        <div style="${pbBoxStyle} padding:6px 10px; border-radius:8px; display:flex; justify-content:space-between; font-size:11px;">
                            <b style="${pbTextStrike}">PB</b> <span style="${pbTextStrike}">${pbT} (${Math.floor(pbT / 5)} iket + ${pbT % 5})</span>
                        </div>
                        <div style="background:${totalBgColor}; color:${totalTextColor}; text-align:center; padding:5px; border-radius:8px; font-weight:900; font-size:11px;">
                            TOTAL: ${d.total}
                        </div>
                    </div>
                </div>`;
    });
  }

  // TAMPILAN JIKA HALAMAN HISTORI KOSONG
  if (historyData.length === 0) {
    listHist.innerHTML = `
        <div class="empty-state">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
            <h4>Riwayat Bersih</h4>
            <p>Belum ada data sekolah yang Anda hapus.</p>
        </div>
      `;
  } else {
    historyData.forEach((d, i) => {
      let pkT = hitung(d.pk_val.i, d.pk_val.s);
      let pbT = hitung(d.pb_val.i, d.pb_val.s);
      let mobilClass = d.mobil === "Mobil 1" ? "tag-m1" : "tag-m2";
      let ritLabel = d.rit || "Rit 1";
      let totalVal = d.total || pkT + pbT; // Memastikan total selalu dihitung

      let actionHTML = `
          <div class="action-dropdown-container">
              <button class="btn-action-trigger" onclick="toggleItemMenu(this)">⋮</button>
              <div class="item-dropdown-menu">
                  <div class="item-dropdown-btn" style="color: var(--success);" onclick="restore(${i})">Restore Data</div>
                  <div class="item-dropdown-btn delete" onclick="confirmHapusHist(${i})">Hapus Permanen</div>
              </div>
          </div>
        `;

      listHist.innerHTML += `
                <div class="item holiday" style="opacity: 0.85;">
                    <div class="action">${actionHTML}</div>
                    <div style="margin-bottom:5px">
                        <span class="badge" style="background:#fee2e2; color:var(--danger); border:1px solid #fecaca;">TERHAPUS</span>
                        <span class="mobil-tag ${mobilClass}">${d.mobil}</span>
                        <span class="rit-tag">${ritLabel.toUpperCase()}</span>
                    </div>
                    <span class="item-title" style="display:block; font-weight:800; margin-bottom:8px; color:#475569;">${d.nama}</span>
                    <div style="display:flex; flex-direction:column; gap:4px">
                        <div style="background:#fef2f2; padding:6px 10px; border-radius:8px; display:flex; justify-content:space-between; font-size:11px; color:#b91c1c;">
                            <b>PK</b> <span>${pkT} (${Math.floor(pkT / 5)} iket + ${pkT % 5})</span>
                        </div>
                        <div style="background:#f0f9ff; padding:6px 10px; border-radius:8px; display:flex; justify-content:space-between; font-size:11px; color:#0369a1;">
                            <b>PB</b> <span>${pbT} (${Math.floor(pbT / 5)} iket + ${pbT % 5})</span>
                        </div>
                        <div style="background:#e2e8f0; color:#475569; text-align:center; padding:5px; border-radius:8px; font-weight:900; font-size:11px;">
                            TOTAL: ${totalVal}
                        </div>
                    </div>
                </div>`;
    });
  }
}

/* =========================================
   ACTIONS (TAMBAH & EDIT DATA)
   ========================================= */
function openTambahModal() {
  document.getElementById("tambahModal").style.display = "flex";
  setTimeout(() => document.getElementById("nama").focus(), 100);
}
function closeTambahModal() {
  document.getElementById("tambahModal").style.display = "none";
}

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
    : 0;
  let mode = document.querySelector('input[name="inputMode"]:checked').value;

  let pkUtama = parseInt(pki) || 0,
    pbUtama = parseInt(pbi) || 0,
    tendikUtama = parseInt(tendiki) || 0;
  let pkTotalEceran = parseInt(pks) || 0,
    pbTotalEceran = parseInt(pbs) || 0;
  let pkHitung, pbHitung;

  if (mode === "ikat") {
    pkHitung = pkUtama * 5 + pkTotalEceran;
    pbHitung = pbUtama * 5 + pbTotalEceran;
  } else {
    pkHitung = pkUtama;
    pbHitung = pbUtama + tendikUtama;
    pkTotalEceran = pkHitung % 5;
    pkUtama = Math.floor(pkHitung / 5);
    pbTotalEceran = pbHitung % 5;
    pbUtama = Math.floor(pbHitung / 5);
  }

  let editIdxVal = document.getElementById("editIdx").value;
  let payload = {
    nama,
    mobil,
    rit,
    status: "pending",
    pk_done: false,
    pb_done: false,
    total: pkHitung + pbHitung,
    pk_val: { i: pkUtama, s: pkTotalEceran },
    pb_val: { i: pbUtama, s: pbTotalEceran },
  };

  if (editIdxVal !== "") {
    let idx = parseInt(editIdxVal);
    payload.status = data[idx].status;
    payload.pk_done = data[idx].pk_done;
    payload.pb_done = data[idx].pb_done;
    data[idx] = payload;
    document.getElementById("editIdx").value = "";
    document.getElementById("btnSimpan").innerText = "SIMPAN DATA";
  } else {
    data.unshift(payload);
  }

  ["nama", "pk_i", "pk_s", "pb_i", "pb_s", "tendik_i", "tendik_s"].forEach(
    (id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    },
  );

  update();
  closeTambahModal();
  showSnackbar("Data Sekolah Disimpan");
}

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
    if (item && item.pk_val) {
      pkInput.value = item.pk_val.i * 5 + parseInt(item.pk_val.s || 0);
      pbInput.value = item.pb_val.i * 5 + parseInt(item.pb_val.s || 0);
    }
  } else {
    pkInput.placeholder = "PK (Ikat)";
    pbInput.placeholder = "PB (Ikat)";
    eceranElements.forEach((el) => (el.style.display = "inline-block"));
    if (item && item.pk_val) {
      pkInput.value = item.pk_val.i;
      document.getElementById("modalPk_s").value = item.pk_val.s;
      pbInput.value = item.pb_val.i;
      document.getElementById("modalPb_s").value = item.pb_val.s;
    }
  }
}

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

  let modeRadios = document.querySelectorAll('input[name="modalInputMode"]');
  if (modeRadios.length > 0) modeRadios[0].checked = true;

  document.getElementById("modalPk_i").value = item.pk_val.i;
  document.getElementById("modalPk_s").value = item.pk_val.s;
  document.getElementById("modalPb_i").value = item.pb_val.i;
  document.getElementById("modalPb_s").value = item.pb_val.s;

  toggleModalPlaceholder();
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
  let rit = document.querySelector(
    'input[name="modalRitSelect"]:checked',
  ).value;
  let status = document.querySelector(
    'input[name="modalStatus"]:checked',
  ).value;
  let modeNode = document.querySelector('input[name="modalInputMode"]:checked');
  let mode = modeNode ? modeNode.value : "ikat";

  let pki = parseInt(document.getElementById("modalPk_i").value) || 0,
    pks = parseInt(document.getElementById("modalPk_s").value) || 0;
  let pbi = parseInt(document.getElementById("modalPb_i").value) || 0,
    pbs = parseInt(document.getElementById("modalPb_s").value) || 0;

  let pkHitung, pbHitung, pkUtama, pkTotalEceran, pbUtama, pbTotalEceran;
  if (mode === "ikat") {
    pkHitung = pki * 5 + pks;
    pbHitung = pbi * 5 + pbs;
    pkUtama = pki;
    pkTotalEceran = pks;
    pbUtama = pbi;
    pbTotalEceran = pbs;
  } else {
    pkHitung = pki;
    pbHitung = pbi;
    pkTotalEceran = pkHitung % 5;
    pkUtama = Math.floor(pkHitung / 5);
    pbTotalEceran = pbHitung % 5;
    pbUtama = Math.floor(pbHitung / 5);
  }

  let prev = data[idx];

  // PERBAIKAN LOGIKA PENANGANAN STATUS
  let new_pk_done = prev.pk_done;
  let new_pb_done = prev.pb_done;

  if (status === "done") {
    new_pk_done = true;
    new_pb_done = true;
  } else if (status === "pending" && prev.status !== "pending") {
    // Jika diubah kembali ke PENDING, reset status parsial PK & PB
    // (Jika memang muatannya 0, fungsi syncStatus() akan otomatis membenarkannya)
    new_pk_done = false;
    new_pb_done = false;
  }

  data[idx] = {
    nama,
    mobil,
    rit,
    status,
    pk_done: new_pk_done,
    pb_done: new_pb_done,
    total: pkHitung + pbHitung,
    pk_val: { i: pkUtama, s: pkTotalEceran },
    pb_val: { i: pbUtama, s: pbTotalEceran },
  };

  closeEditModal();
  update();
}

function setStatus(i, s) {
  let oldStatus = data[i].status,
    oldPk = data[i].pk_done,
    oldPb = data[i].pb_done;
  data[i].status = s;

  if (s === "done") {
    data[i].pk_done = true;
    data[i].pb_done = true;
  } else if (s === "pending") {
    // Direset ke false dulu, tapi nanti syncStatus di update() akan benerin jika ada yang muatan 0
    data[i].pk_done = false;
    data[i].pb_done = false;
  }

  deletedItem = {
    type: "status",
    index: i,
    content: { status: oldStatus, pk: oldPk, pb: oldPb },
  };
  update();
  let txt = s === "done" ? "SELESAI" : s === "holiday" ? "LIBUR" : "PENDING";
  showSnackbar(`${txt}`);
}

function restore(i) {
  data.unshift({
    ...historyData[i],
    status: "pending",
    pk_done: false,
    pb_done: false,
  });
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
      data.splice(deletedItem.index, 0, deletedItem.content);
      historyData.shift();
    } else if (deletedItem.type === "status") {
      data[deletedItem.index].status = deletedItem.content.status;
      data[deletedItem.index].pk_done = deletedItem.content.pk;
      data[deletedItem.index].pb_done = deletedItem.content.pb;
    } else if (deletedItem.type === "bulk_status") {
      deletedItem.indices.forEach((i) => {
        data[i].status = deletedItem.content;
        data[i].pk_done = false;
        data[i].pb_done = false;
      });
    } else {
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
    if (e.target.closest(".smallbtn"))
      e.target.closest(".smallbtn").classList.add("tekan");
  },
  { passive: true },
);
document.addEventListener(
  "touchstart",
  function (e) {
    let el = e.target.closest(
      "button, .smallbtn, .btn-primary-v2, .nav-item, .rit-select-box",
    );
    if (el) el.classList.add("tekan");
  },
  { passive: true },
);
document.addEventListener(
  "touchend",
  function (e) {
    let el = e.target.closest(
      "button, .smallbtn, .btn-primary-v2, .nav-item, .rit-select-box",
    );
    if (el)
      setTimeout(() => {
        el.classList.remove("tekan");
      }, 100);
  },
  { passive: true },
);

function togglePlaceholder() {
  let mode = document.querySelector('input[name="inputMode"]:checked').value;
  const pkInput = document.getElementById("pk_i"),
    pbInput = document.getElementById("pb_i"),
    tendikInput = document.getElementById("tendik_i");
  const rowTendik = document.getElementById("row_tendik"),
    eceranElements = document.querySelectorAll(
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
  let sekolahDiRitIni = data.filter((d) => (d.rit || "Rit 1") === ritName);
  let text = `*Jadwal Pengiriman: ${ritName.toUpperCase()}*\n\n`;

  sekolahDiRitIni.forEach((s) => {
    let pk = hitung(s.pk_val.i, s.pk_val.s),
      pb = hitung(s.pb_val.i, s.pb_val.s);
    let statusTag = s.status === "done" ? "(✅ Selesai)" : "";
    if (s.status !== "done") {
      if (s.pk_done && pk > 0 && (!s.pb_done || pb === 0))
        statusTag = "(✅ PK Selesai)";
      if (!s.pk_done && s.pb_done && pb > 0) statusTag = "(✅ PB Selesai)";
    }
    text += `• ${s.nama} ${statusTag}\n  PK: ${pk} | PB: ${pb}\n`;
  });

  let totPK = sekolahDiRitIni.reduce(
    (sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s),
    0,
  );
  let totPB = sekolahDiRitIni.reduce(
    (sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s),
    0,
  );
  text += `\n-----------------------\n*TOTAL MUATAN:*\nPK: ${totPK}\nPB: ${totPB}`;

  if (navigator.share) {
    navigator
      .share({ title: "Jadwal Kirim", text: text })
      .catch(() => console.log("Batal share"));
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }
}

/* =========================================
   MODAL INFO SEKOLAH & TOMBOL SELESAI PARSIAL
   ========================================= */
function showSchoolInfo(idx) {
  let s = data[idx];
  if (!s) return;

  let pkT = hitung(s.pk_val.i, s.pk_val.s);
  let pbT = hitung(s.pb_val.i, s.pb_val.s);
  let statusColor =
    s.status === "done"
      ? "#22c55e"
      : s.status === "holiday"
        ? "#64748b"
        : "#f59e0b";
  let isPkDone = s.status === "done" || s.pk_done;
  let isPbDone = s.status === "done" || s.pb_done;

  // Render Box PK (Abaikan style selesai jika pkT = 0)
  let pkStatusMark =
    isPkDone && pkT > 0
      ? `<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900; margin-left:6px;">✅ SELESAI</span>`
      : "";
  let pkBg = isPkDone && pkT > 0 ? "#f0fdf4" : "#fff1f2";
  let pkBorder = isPkDone && pkT > 0 ? "#bbf7d0" : "#fecaca";
  let pkColorText = isPkDone && pkT > 0 ? "#166534" : "#b91c1c";
  let pkStrike = isPkDone && pkT > 0 ? "text-decoration: line-through;" : "";

  // Render Box PB
  let pbStatusMark =
    isPbDone && pbT > 0
      ? `<span style="background:#22c55e; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:900; margin-left:6px;">✅ SELESAI</span>`
      : "";
  let pbBg = isPbDone && pbT > 0 ? "#f0fdf4" : "#f0f9ff";
  let pbBorder = isPbDone && pbT > 0 ? "#bbf7d0" : "#bae6fd";
  let pbColorText = isPbDone && pbT > 0 ? "#166534" : "#0369a1";
  let pbStrike = isPbDone && pbT > 0 ? "text-decoration: line-through;" : "";

  let btnSelesaiHTML = "";
  if (s.status !== "done") {
    btnSelesaiHTML = `<div style="display: flex; gap: 8px; margin-top: 15px;">`;
    // Tombol hanya muncul jika PK/PB nya lebih dari 0
    if (!s.pk_done && pkT > 0)
      btnSelesaiHTML += `<button onclick="setSchoolStatusFromModal(${idx}, 'PK')" style="flex:1; padding:10px; background:#ef4444; color:white; border:none; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer;">PK SELESAI</button>`;
    if (!s.pb_done && pbT > 0)
      btnSelesaiHTML += `<button onclick="setSchoolStatusFromModal(${idx}, 'PB')" style="flex:1; padding:10px; background:#0ea5e9; color:white; border:none; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer;">PB SELESAI</button>`;

    btnSelesaiHTML += `<button onclick="setSchoolStatusFromModal(${idx}, 'ALL')" style="flex:1; padding:10px; background:#22c55e; color:white; border:none; border-radius:8px; font-weight:800; font-size:12px; cursor:pointer; box-shadow:0 4px 6px rgba(34,197,94,0.2);">SELESAI</button>
    </div>`;
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

        <div style="background: ${pkBg}; padding: 12px; border-radius: 12px; border: 1px solid ${pkBorder}; margin-bottom: 10px; position:relative;">
            <div style="font-size: 10px; font-weight: 800; color: ${pkColorText}; margin-bottom: 4px; text-transform: uppercase;">PK ${pkStatusMark}</div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 20px; font-weight: 900; color: ${pkColorText}; ${pkStrike}">${pkT}</span>
                <span style="font-size: 12px; font-weight: 600; color: ${pkColorText}; ${pkStrike}">${s.pk_val.i} ikat + ${s.pk_val.s}</span>
            </div>
        </div>

        <div style="background: ${pbBg}; padding: 12px; border-radius: 12px; border: 1px solid ${pbBorder}; margin-bottom: 10px; position:relative;">
            <div style="font-size: 10px; font-weight: 800; color: ${pbColorText}; margin-bottom: 4px; text-transform: uppercase;">PB ${pbStatusMark}</div>
            <div style="display: flex; justify-content: space-between; align-items: baseline;">
                <span style="font-size: 20px; font-weight: 900; color: ${pbColorText}; ${pbStrike}">${pbT}</span>
                <span style="font-size: 12px; font-weight: 600; color: ${pbColorText}; ${pbStrike}">${s.pb_val.i} ikat + ${s.pb_val.s}</span>
            </div>
        </div>

        <div style="padding: 12px; background: #1e293b; border-radius: 12px; text-align: center; color: white;">
            <div style="font-size: 10px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Total Keseluruhan</div>
            <div style="font-size: 32px; font-weight: 900; color: #f8fafc; margin-top: 2px;">${s.total}</div>
        </div>
        ${btnSelesaiHTML}
    `;
  document.getElementById("infoModal").style.display = "flex";
}

function setSchoolStatusFromModal(idx, type) {
  let s = data[idx];

  // 1. REKAM STATUS LAMA SEBELUM DIUBAH (UNTUK UNDO)
  let oldStatus = s.status;
  let oldPk = s.pk_done;
  let oldPb = s.pb_done;

  // 2. UBAH STATUS SESUAI TOMBOL YANG DIKLIK
  if (type === "PK") s.pk_done = true;
  if (type === "PB") s.pb_done = true;
  if (type === "ALL") {
    s.pk_done = true;
    s.pb_done = true;
  }

  // 3. SIMPAN KE MEMORI UNDO
  deletedItem = {
    type: "status",
    index: idx,
    content: { status: oldStatus, pk: oldPk, pb: oldPb },
  };

  update(); // Otomatis memeriksa apakah keduanya true lalu diset done lewat fungsi syncStatus()
  closeInfoModal();

  let msg = type === "ALL" ? "SEMUA" : type;
  showSnackbar(`${s.nama} - ${msg} Selesai`);
}

function closeInfoModal() {
  document.getElementById("infoModal").style.display = "none";
}

/* =========================================
   CUSTOM DROPDOWN & ACTION MENU LOGIC
   ========================================= */
function toggleDropdown(el) {
  document.querySelectorAll(".dropdown-list").forEach((list) => {
    if (list !== el.nextElementSibling) list.classList.remove("show");
  });
  el.nextElementSibling.classList.toggle("show");
}
function setDropdownValue(item, val, labelText) {
  let dropdown = item.closest(".custom-dropdown");
  dropdown.querySelector("input").value = val;
  dropdown.querySelector(".dd-label").innerText = labelText;
  dropdown.querySelector(".dropdown-list").classList.remove("show");
  render();
}
function toggleItemMenu(btn) {
  document.querySelectorAll(".item-dropdown-menu").forEach((m) => {
    if (m !== btn.nextElementSibling) m.classList.remove("show");
  });
  btn.nextElementSibling.classList.toggle("show");
}

document.addEventListener("click", function (e) {
  if (!e.target.closest(".custom-dropdown"))
    document
      .querySelectorAll(".dropdown-list")
      .forEach((list) => list.classList.remove("show"));
  if (!e.target.closest(".action-dropdown-container"))
    document
      .querySelectorAll(".item-dropdown-menu")
      .forEach((m) => m.classList.remove("show"));
});

togglePlaceholder();
update();
