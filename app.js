/* =========================================
   DATABASE & INITIALIZATION
   ========================================= */
let data = JSON.parse(localStorage.getItem("ultra_v10_data") || "[]");
let historyData = JSON.parse(localStorage.getItem("ultra_v10_hist") || "[]");
let archiveData = JSON.parse(localStorage.getItem("ultra_v10_arsip") || "[]");
if (!Array.isArray(archiveData)) archiveData = [];

let deletedItem = null;
let deleteTimeout = null;
let riwayatTabAktif = null;

const setTxt = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.innerText = val;
};
const hitung = (i, s) =>
  Math.max(0, parseInt(i) || 0) * 5 + Math.max(0, parseInt(s) || 0);
const angka = (v) => Math.max(0, parseInt(v) || 0);

let absensiData = muatAbsensi();

function formatDateTime(iso) {
  if (!iso) return "";
  let d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
      if (!d.done_at) d.done_at = new Date().toISOString();
    } else {
      d.status = "pending";
      d.done_at = null;
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

  const fab = document.querySelector(".fab-add");
  if (fab) fab.hidden = pId === "absensi";

  update();
  if (pId === "absensi") renderAbsensi();
  if (pId === "historis") {
    if (!riwayatTabAktif) {
      riwayatTabAktif =
        archiveData.length === 0 && historyData.length > 0
          ? "history"
          : "arsip";
    }
    showRiwayatTab(riwayatTabAktif);
  }
}

function showRiwayatTab(tab) {
  riwayatTabAktif = tab === "history" ? "history" : "arsip";
  const isArsip = riwayatTabAktif === "arsip";
  const arsipSection = document.getElementById("arsipSection");
  const historySection = document.getElementById("historySection");
  const tabArsip = document.getElementById("tabArsip");
  const tabHistory = document.getElementById("tabHistory");

  if (arsipSection) arsipSection.hidden = !isArsip;
  if (historySection) historySection.hidden = isArsip;
  if (tabArsip) {
    tabArsip.classList.toggle("active", isArsip);
    tabArsip.setAttribute("aria-selected", String(isArsip));
  }
  if (tabHistory) {
    tabHistory.classList.toggle("active", !isArsip);
    tabHistory.setAttribute("aria-selected", String(!isArsip));
  }
}

/* =========================================
   MODAL RIT (SELESAI PK, PB, SEMUA)
   ========================================= */
function confirmRitDone(ritName) {
  const overlay = document.createElement("div");
  overlay.id = "ritConfirmOverlay";
  overlay.className = "modal-overlay";
  overlay.style.display = "flex";

  const box = document.createElement("div");
  box.className = "modal-box";

  const svgTruk = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="color: var(--muted);"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25v5.25m0-5.25a4.5 4.5 0 0 1 4.5 4.5m-4.5-4.5h-9a2.25 2.25 0 0 0-2.25 2.25v7.5" /></svg>`;

  box.innerHTML = `
      <div class="modal-icon">${svgTruk}</div>
      <h3>Selesaikan ${ritName.toUpperCase()}</h3>
      <p>Tandai bagian mana yang sudah selesai dikirim?</p>
      <div class="modal-choices">
          <button class="btn-choice pb" onclick="processRitDone('${ritName}', 'PB')">PORSI BESAR SELESAI</button>
          <button class="btn-choice pk" onclick="processRitDone('${ritName}', 'PK')">PORSI KECIL SELESAI</button>
          <button class="btn-choice all" onclick="processRitDone('${ritName}', 'ALL')">SELESAI SEMUA</button>
          <button class="btn-link" onclick="document.getElementById('ritConfirmOverlay').remove()">Batal</button>
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
    let msgType =
      type === "PB" ? "PORSI BESAR" : type === "PK" ? "PORSI KECIL" : "SEMUA";
    showSnackbar(`${ritName.toUpperCase()} - ${msgType} SELESAI`, true);
  }
}

/* =========================================
   HITUNG IKAT & DERETKAN SISA
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
  let totalSemuaPorsi = totalPorsiIkat + deretSisa.reduce((a, b) => a + b, 0); // Total mutlak

  let teksDetail = `${ikatTerkumpul} iket`;
  if (deretSisa.length > 0) teksDetail += ` + ${deretSisa.join(" + ")}`;

  // Kembalikan juga status apakah ini kosong/habis
  return { totalPorsiIkat, teksDetail, isHabis: totalSemuaPorsi === 0 };
}

function hitungTerdistribusi(listData) {
  return listData.reduce((sum, d) => {
    let pkVal = hitung(d.pk_val.i, d.pk_val.s);
    let pbVal = hitung(d.pb_val.i, d.pb_val.s);
    if (d.status === "done" || d.pk_done) sum += pkVal;
    if (d.status === "done" || d.pb_done) sum += pbVal;
    return sum;
  }, 0);
}

function sisaMuatan(d) {
  let pk = hitung(d.pk_val.i, d.pk_val.s);
  let pb = hitung(d.pb_val.i, d.pb_val.s);
  let sisa = 0;
  if (!d.pk_done) sisa += pk;
  if (!d.pb_done) sisa += pb;
  return sisa;
}

function stokPerMobil() {
  return {
    "Mobil 1": angka(document.getElementById("readyInputM1")?.value),
    "Mobil 2": angka(document.getElementById("readyInputM2")?.value),
  };
}

/* =========================================
   CORE LOGIC (UPDATE DASHBOARD & RIT GROUPING)
   ========================================= */
function update() {
  // Lakukan sinkronisasi ke seluruh data aktif terlebih dahulu
  data.forEach((d) => {
    if (d.status !== "holiday") syncStatus(d);
  });

  const stok = stokPerMobil();
  const readyVal = stok["Mobil 1"] + stok["Mobil 2"];
  // --- ALOKASI STOK BERDASARKAN RIT ---
  let stokCek = { ...stok };

  // Urutkan data khusus untuk pembagian stok (Pending didahulukan, lalu urut Rit 1, 2, dst)
  let urutanPembagian = [...data].sort((a, b) => {
    const statA = a.status === "pending" ? 1 : 2;
    const statB = b.status === "pending" ? 1 : 2;
    if (statA !== statB) return statA - statB;
    // Jika status sama, urutkan berdasarkan rit
    return (a.rit || "Rit 1").localeCompare(b.rit || "Rit 1");
  });

  // Bagikan stok
  urutanPembagian.forEach((d) => {
    d._isSiap = false;
    if (d.status === "pending") {
      let butuh = sisaMuatan(d);
      let sisaStok = stokCek[d.mobil] ?? 0;
      if (butuh > 0 && sisaStok >= butuh) {
        d._isSiap = true;
        stokCek[d.mobil] = sisaStok - butuh;
      }
    }
  });
  // --- HITUNG JUMLAH SEKOLAH YANG SIAP DIKIRIM ---
  let jumlahSekolahSiap = 0;
  const siapPerMobil = { "Mobil 1": 0, "Mobil 2": 0 };
  data.forEach((d) => {
    if (d._isSiap && d.status === "pending") {
      jumlahSekolahSiap++;
      if (siapPerMobil[d.mobil] !== undefined) siapPerMobil[d.mobil]++;
    }
  });
  const elRingkasanSiap = document.getElementById("ringkasanSiap");
  const elRingkasanMobil = document.getElementById("ringkasanMobil");

  if (elRingkasanSiap) {
    if (!readyVal) {
      elRingkasanSiap.innerText = ""; // Sembunyikan jika input kosong/0
    } else if (jumlahSekolahSiap > 0) {
      elRingkasanSiap.innerText = `Total ${readyVal} · ${jumlahSekolahSiap} sekolah siap`;
      elRingkasanSiap.style.color = "var(--success)";
    } else {
      elRingkasanSiap.innerText = `Total ${readyVal} · belum cukup untuk sekolah berikutnya`;
      elRingkasanSiap.style.color = "var(--danger)";
    }
  }

  if (elRingkasanMobil) {
    elRingkasanMobil.innerText = readyVal
      ? `Mobil 1: ${siapPerMobil["Mobil 1"]} siap · Mobil 2: ${siapPerMobil["Mobil 2"]} siap`
      : "";
  }

  let aktif = data.filter((d) => d.status !== "holiday");
  let pending = data.filter((d) => d.status === "pending");
  let done = data.filter((d) => d.status === "done");
  let siap = data.filter((d) => d._isSiap).length;

  const dashRingkasan = document.getElementById("dashRingkasan");
  if (dashRingkasan) {
    const adaSekolah = pending.length + done.length > 0;
    dashRingkasan.innerText = adaSekolah
      ? `${pending.length} proses · ${done.length} selesai · ${siap} siap`
      : "";
    dashRingkasan.parentElement.hidden = !adaSekolah;
  }

  const btnRecap = document.getElementById("btnRecap");
  if (btnRecap) btnRecap.hidden = aktif.length === 0;

  let targetTotal = aktif.reduce((sum, d) => sum + d.total, 0);

  // Terdistribusi/Kirim Total kini berhitung parsial (PK/PB Saja ditambahkan)
  let kirimTotal = hitungTerdistribusi(aktif);

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
  setTxt("targetView", targetTotal);
  setTxt("terdistribusiView", kirimTotal);

  // --- LOGIKA DINAMIS UNTUK SISA TARGET (VERSI LABEL) ---
  let sisaAngka = Math.max(0, targetTotal - kirimTotal);
  const elSisaTarget = document.getElementById("sisaTarget");
  const elLabelSisaTarget = document.getElementById("labelSisaTarget"); // Ambil elemen label

  if (elSisaTarget) {
    if (targetTotal > 0 && sisaAngka === 0) {
      // Jika semua sudah terkirim
      if (elLabelSisaTarget) {
        elLabelSisaTarget.innerText = "Semua Terdistribusi";
        elLabelSisaTarget.style.color = "var(--success)"; // Label jadi hijau
      }
      elSisaTarget.innerText = ""; // Sembunyikan angka 0 agar tidak dobel
    } else {
      // Jika masih ada sisa atau belum ada target
      if (elLabelSisaTarget) {
        elLabelSisaTarget.innerText = "Belum Terdistribusi";
        elLabelSisaTarget.style.color = ""; // Reset warna ke bawaan
      }
      elSisaTarget.innerText = sisaAngka; // Tampilkan sisa angka
    }
  }

  // Ambil sisa PK dan PB yang BENAR-BENAR belum selesai
  let pkPendingData = aktif.filter((d) => d.status !== "done" && !d.pk_done);
  let pbPendingData = aktif.filter((d) => d.status !== "done" && !d.pb_done);

  let pkPending = formatDetailPorsi(pkPendingData, "PK");
  let pbPending = formatDetailPorsi(pbPendingData, "PB");

  // --- TAMPILAN VIEW PK ---
  setTxt("totalPKView", pkTot);
  setTxt("pkDoneView", pkDone);

  if (pkPending.isHabis && pkTot > 0) {
    setTxt("pkSisaView", "SELESAI");
    setTxt("pkDetailIkat", "Semua Porsi Kecil terkirim");
  } else {
    setTxt("pkSisaView", pkPending.totalPorsiIkat);
    setTxt("pkDetailIkat", pkPending.teksDetail);
  }

  // --- TAMPILAN VIEW PB ---
  setTxt("totalPBView", pbTot);
  setTxt("pbDoneView", pbDone);

  if (pbPending.isHabis && pbTot > 0) {
    setTxt("pbSisaView", "SELESAI");
    setTxt("pbDetailIkat", "Semua Porsi Besar terkirim");
  } else {
    setTxt("pbSisaView", pbPending.totalPorsiIkat);
    setTxt("pbDetailIkat", pbPending.teksDetail);
  }

  renderRitBreakdown(aktif);

  let pKirim = targetTotal > 0 ? (kirimTotal / targetTotal) * 100 : 0;
  let pSiap = targetTotal > 0 ? (readyVal / targetTotal) * 100 : 0;

  if (document.getElementById("progressBarDone"))
    document.getElementById("progressBarDone").style.width = pKirim + "%";
  if (document.getElementById("progressBarReady")) {
    document.getElementById("progressBarReady").style.left = pKirim + "%";
    document.getElementById("progressBarReady").style.width =
      Math.max(0, Math.min(pSiap, 100 - pKirim)) + "%";
  }

  // --- LEGEND PROGRESS: HANYA TAMPIL JIKA ADA DATA ---
  const elDistributedPercent = document.getElementById("distributedPercent");
  const elAvailablePercent = document.getElementById("availablePercent");
  const elLegendDistributed = document.getElementById("legendDistributed");
  const elLegendAvailable = document.getElementById("legendAvailable");
  const elProgressLegend = document.getElementById("progressLegend");

  const hasDistributed = kirimTotal > 0;
  const hasAvailable = targetTotal > 0 && readyVal > 0;

  if (elDistributedPercent)
    elDistributedPercent.innerText = Math.round(pKirim) + "%";
  if (elAvailablePercent)
    elAvailablePercent.innerText = Math.round(pSiap) + "%";
  if (elLegendDistributed) elLegendDistributed.hidden = !hasDistributed;
  if (elLegendAvailable) elLegendAvailable.hidden = !hasAvailable;
  if (elProgressLegend)
    elProgressLegend.hidden = !hasDistributed && !hasAvailable;

  // --- LOGIKA DINAMIS UNTUK STATUS TERSEDIA ---
  let sisaTargetReal = targetTotal - kirimTotal;
  let selisih = sisaTargetReal - readyVal;

  const elKurang = document.getElementById("sisaReady");
  const elLabel = document.getElementById("labelSisaReady");

  // Menangkap nilai input asli (untuk mengecek apakah benar-benar kosong)
  let rawM1 = document.getElementById("readyInputM1")?.value;
  let rawM2 = document.getElementById("readyInputM2")?.value;
  let adaInput = [rawM1, rawM2].some((v) => v && v.trim() !== "");

  if (elKurang) {
    if (!adaInput || readyVal === 0) {
      // 1. Kondisi Kosong / Belum Diisi
      if (elLabel) elLabel.innerText = "Belum Tersedia";
      elKurang.innerText = ""; // Sembunyikan angka
      elKurang.style.color = "var(--muted)";
    } else if (selisih < 0) {
      // 2. Kondisi Lebih (Tersedia > Belum Terdistribusi)
      if (elLabel) elLabel.innerText = "Lebih";
      // Math.abs() mengubah angka negatif menjadi positif
      elKurang.innerText = Math.abs(selisih).toString();
      elKurang.style.color = "var(--success)";
    } else {
      // 3. Kondisi Kurang (Tersedia < Belum Terdistribusi)
      if (elLabel) elLabel.innerText = "Kurang";
      elKurang.innerText = selisih.toString();
      elKurang.style.color = "var(--danger)";
    }
  }

  localStorage.setItem("ultra_v10_data", JSON.stringify(data));
  localStorage.setItem("ultra_v10_hist", JSON.stringify(historyData));
  localStorage.setItem("ultra_v10_arsip", JSON.stringify(archiveData));
  localStorage.setItem("ultra_v10_absensi", JSON.stringify(absensiData));
  renderBadges();
  renderBackupNote();
  render();
}

/* =========================================
   RENDER BREAKDOWN PER RIT
   ========================================= */
function renderRitBreakdown(aktifList) {
  const container = document.getElementById("ritContainer");
  if (!container) return;
  container.innerHTML = "";

  const dashSearch =
    document.getElementById("dashSearchInput")?.value.toLowerCase().trim() ||
    "";

  // 1. Ambil daftar nama Rit yang unik
  let uniqueRits = [...new Set(aktifList.map((d) => d.rit || "Rit 1"))];

  // 2. Urutkan berdasarkan status "Selesai" lalu berdasarkan Abjad
  let listRitTersedia = uniqueRits.sort((a, b) => {
    // Cek apakah semua sekolah di Rit A sudah selesai
    let ritA_sekolah = aktifList.filter((d) => (d.rit || "Rit 1") === a);
    let ritA_selesai =
      ritA_sekolah.length > 0 && ritA_sekolah.every((d) => d.status === "done");

    // Cek apakah semua sekolah di Rit B sudah selesai
    let ritB_sekolah = aktifList.filter((d) => (d.rit || "Rit 1") === b);
    let ritB_selesai =
      ritB_sekolah.length > 0 && ritB_sekolah.every((d) => d.status === "done");

    // Jika status selesainya berbeda, pindahkan yang sudah selesai ke bawah (return 1)
    if (ritA_selesai !== ritB_selesai) {
      return ritA_selesai ? 1 : -1;
    }

    // Jika statusnya sama (sama-sama belum atau sama-sama selesai), urutkan sesuai abjad
    return a.localeCompare(b);
  });

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

    let btnActionHTML = `<button class="btn-chip btn-chip-share" onclick="event.stopPropagation(); shareRitSummary('${ritName}')">SHARE</button>`;

    if (!isRitSelesai) {
      btnActionHTML += `<button class="btn-chip btn-chip-process" onclick="event.stopPropagation(); confirmRitDone('${ritName}')"><span class="spinner"></span> Proses</button>`;
    } else {
      btnActionHTML += `<span class="badge badge-done">Selesai</span>`;
    }

    let stylePK = isRitPkDone ? "is-done" : "";
    let stylePB = isRitPbDone ? "is-done" : "";
    let cardClass = isRitSelesai
      ? "rit-summary-card is-done"
      : "rit-summary-card";
    let cardClick = isRitSelesai
      ? ""
      : `onclick="confirmRitDone('${ritName}')"`;

    // Progress Bar HTML
    let progressHTML = `
      <div class="bar">
          <span class="bar-fill" style="width: ${ritProgressPct}%;"></span>
      </div>
      <div class="rit-progress-label">${ritProgressPct}% Selesai</div>
    `;

    let listSekolahHTML = `<div class="school-chips">`;

    sekolahDiRitIni.forEach((sek) => {
      let originalIdx = data.indexOf(sek);
      let isHighlighted =
        dashSearch && sek.nama.toLowerCase().includes(dashSearch);
      let highlightClass = isHighlighted ? "highlight-school" : "";

      let pkVal = hitung(sek.pk_val.i, sek.pk_val.s);
      let pbVal = hitung(sek.pb_val.i, sek.pb_val.s);

      if (sek.status === "done") {
        listSekolahHTML += `<span onclick="event.stopPropagation(); showSchoolInfo(${originalIdx})" class="school-chip is-done ${highlightClass}">${sek.nama}</span>`;
      } else {
        let pkInd =
          sek.pk_done && pkVal > 0
            ? ` <span class="chip-check">✓ Porsi Kecil</span>`
            : "";
        let pbInd =
          sek.pb_done && pbVal > 0
            ? ` <span class="chip-check">✓ Porsi Besar</span>`
            : "";

        // LOGIKA HIGHLIGHT SIAP
        let readyClass = sek._isSiap ? "is-ready" : "";

        listSekolahHTML += `<span onclick="event.stopPropagation(); showSchoolInfo(${originalIdx})" class="school-chip ${readyClass} ${highlightClass}">${sek.nama}${pbInd}${pkInd}</span>`;
      }
    });

    listSekolahHTML += `</div>`;

    container.innerHTML += `
            <div class="${cardClass}" ${cardClick}>
                <div class="rit-summary-title">
                    <div class="rit-title-left">
                        <span class="rit-name">${ritName.toUpperCase()}</span>
                        ${btnActionHTML}
                    </div>
                    <span class="rit-total${isRitSelesai ? " is-done" : ""}">
                        Total: ${totalRit}
                    </span>
                </div>
                ${progressHTML}
                <div class="rit-summary-row">
                    <div class="rit-summary-item pb ${stylePB}">
                        Porsi Besar ${pbRitData.totalPorsiIkat} <span class="rit-summary-eceran">(${pbRitData.teksDetail})</span>
                    </div>
                    <div class="rit-summary-item pk ${stylePK}">
                        Porsi Kecil ${pkRitData.totalPorsiIkat} <span class="rit-summary-eceran">(${pkRitData.teksDetail})</span>
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

  const listCount = document.getElementById("listCount");
  if (listCount) {
    const adaFilter =
      search !== "" ||
      fMobil !== "Semua" ||
      fRit !== "Semua" ||
      fStatus !== "Semua";
    const tampil = adaFilter && data.length > 0;
    listCount.hidden = !tampil;
    if (tampil)
      listCount.innerText = `Menampilkan ${filtered.length} dari ${data.length} sekolah`;
  }

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

      let pkT = hitung(d.pk_val.i, d.pk_val.s);
      let pbT = hitung(d.pb_val.i, d.pb_val.s);
      let mobilClass = d.mobil === "Mobil 1" ? "tag-m1" : "tag-m2";
      let ritLabel = d.rit || "Rit 1";

      let rekLabel = d._isSiap
        ? `<span class="badge badge-ready">SIAP</span>`
        : "";

      let actionHTML = `
          <div class="action-dropdown-container">
              <button class="btn-action-trigger" onclick="toggleItemMenu(this)">⋮</button>
              <div class="item-dropdown-menu">
                  <div class="item-dropdown-btn" onclick="editSekolah(${originalIdx})">Edit</div>
                  ${
                    d.status === "pending"
                      ? `<div class="item-dropdown-btn" onclick="setStatus(${originalIdx}, 'done')">Selesai</div>
                         <div class="item-dropdown-btn" onclick="setStatus(${originalIdx}, 'holiday')">Libur</div>`
                      : `<div class="item-dropdown-btn" onclick="setStatus(${originalIdx}, 'pending')">Proses</div>`
                  }
                  <div class="item-dropdown-btn delete" onclick="confirmHapus(${originalIdx})">Hapus</div>
              </div>
          </div>
        `;

      let labelStatus = "PROSES";
      let badgeClass = "badge-pending";
      if (d.status === "done") {
        labelStatus = "SELESAI";
        badgeClass = "badge-done";
      } else if (d.status === "holiday") {
        labelStatus = "LIBUR";
        badgeClass = "badge-holiday";
      }

      let pendingSpinner =
        d.status === "pending" ? `<span class="spinner"></span>` : "";
      let badgeHTML = `<span class="badge ${badgeClass}">${pendingSpinner}${labelStatus}</span>`;

      let isPkDone = d.status === "done" || d.pk_done;
      let isPbDone = d.status === "done" || d.pb_done;

      // Hitung persentase progres untuk masing-masing sekolah
      let doneItems = 0;
      if (isPkDone) doneItems += pkT;
      if (isPbDone) doneItems += pbT;
      let schoolProgressPct =
        d.total > 0 ? Math.round((doneItems / d.total) * 100) : 0;

      let schoolProgressBarHTML = `
          <div class="bar">
              <span class="bar-fill" style="width: ${schoolProgressPct}%;"></span>
          </div>
          <div class="bar-label">
              ${schoolProgressPct}% Selesai
          </div>
        `;

      let doneAtHTML =
        d.status === "done" && d.done_at
          ? `<span class="item-done-at">Selesai ${formatDateTime(d.done_at)}</span>`
          : "";

      let pkClass = isPkDone && pkT > 0 ? "kv-row pk is-done" : "kv-row pk";
      let pbClass = isPbDone && pbT > 0 ? "kv-row pb is-done" : "kv-row pb";

      listActive.innerHTML += `
                <div class="item ${d.status}${d._isSiap ? " is-ready" : ""}">
                    <div class="action">${actionHTML}</div>
                    <div class="item-meta">
                        ${badgeHTML}
                        <span class="mobil-tag ${mobilClass}">${d.mobil}</span>
                        <span class="rit-tag">${ritLabel.toUpperCase()}</span>
                        ${rekLabel}
                        ${doneAtHTML}
                    </div>
                    <span class="item-title">${d.nama}</span>
                    ${schoolProgressBarHTML}
                    <div class="kv-list">
                        <div class="${pbClass}">
                            <b>Porsi Besar</b> <span>${pbT} (${Math.floor(pbT / 5)} iket + ${pbT % 5})</span>
                        </div>
                        <div class="${pkClass}">
                            <b>Porsi Kecil</b> <span>${pkT} (${Math.floor(pkT / 5)} iket + ${pkT % 5})</span>
                        </div>
                        <div class="total-row">
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
                  <div class="item-dropdown-btn restore" onclick="restore(${i})">Restore Data</div>
                  <div class="item-dropdown-btn delete" onclick="confirmHapusHist(${i})">Hapus Permanen</div>
              </div>
          </div>
        `;

      listHist.innerHTML += `
                <div class="item holiday history-item">
                    <div class="action">${actionHTML}</div>
                    <div class="item-meta">
                        <span class="badge badge-deleted">TERHAPUS</span>
                        <span class="mobil-tag ${mobilClass}">${d.mobil}</span>
                        <span class="rit-tag">${ritLabel.toUpperCase()}</span>
                    </div>
                    <span class="item-title">${d.nama}</span>
                    <div class="kv-list">
                        <div class="kv-row pb">
                            <b>Porsi Besar</b> <span>${pbT} (${Math.floor(pbT / 5)} iket + ${pbT % 5})</span>
                        </div>
                        <div class="kv-row pk">
                            <b>Porsi Kecil</b> <span>${pkT} (${Math.floor(pkT / 5)} iket + ${pkT % 5})</span>
                        </div>
                        <div class="total-row">
                            TOTAL: ${totalVal}
                        </div>
                    </div>
                </div>`;
    });
  }

  renderArsip();
}

/* =========================================
   ARSIP HARIAN
   ========================================= */
function formatTanggal(tanggal) {
  const [y, m, d] = (tanggal || "").split("-").map(Number);
  if (!y || !m || !d) return tanggal || "";
  return new Date(y, m - 1, d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function tanggalLokal(iso) {
  let d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function arsipkanSekolah(school) {
  const tanggal = tanggalLokal(school.done_at);
  let entry = archiveData.find((a) => a.tanggal === tanggal);
  if (!entry) {
    entry = { tanggal, dibuat: new Date().toISOString(), items: [] };
    archiveData.unshift(entry);
  }
  entry.dibuat = new Date().toISOString();
  entry.items.push(JSON.parse(JSON.stringify(school)));
}

function arsipJikaBatalSelesai(prev, status) {
  if (prev.status === "done" && status !== "done") {
    const before = JSON.parse(JSON.stringify(archiveData));
    arsipkanSekolah(prev);
    return before;
  }
  return null;
}

function arsipkanSelesai() {
  data.filter((d) => d.status === "done").forEach(arsipkanSekolah);
}

function confirmClearArchive() {
  openModal(
    SVG_ALERT,
    "Hapus Arsip",
    "Kosongkan semua arsip harian?",
    "var(--danger)",
    () => {
      deletedItem = { type: "archive_clear", content: archiveData };
      archiveData = [];
      update();
      showSnackbar("Arsip dibersihkan", true);
    },
  );
}

function renderArsip() {
  const list = document.getElementById("listArsip");
  if (!list) return;

  if (archiveData.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <h4>Arsip Kosong</h4>
        <p>Belum ada arsip harian.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = [...archiveData]
    .sort((a, b) => (b.tanggal || "").localeCompare(a.tanggal || ""))
    .map((a) => {
      const items = Array.isArray(a.items) ? a.items : [];
      let total = 0;
      const rows = items
        .map((d) => {
          const pk = hitung(d.pk_val.i, d.pk_val.s);
          const pb = hitung(d.pb_val.i, d.pb_val.s);
          total += Number(d.total) || pk + pb;
          return `<div class="arsip-row"><span class="arsip-nama">${d.nama}</span><span class="arsip-porsi">PB ${pb} · PK ${pk}</span></div>`;
        })
        .join("");

      return `<details class="arsip-card">
        <summary>
          <span class="arsip-main">
            <span class="arsip-tanggal">${formatTanggal(a.tanggal)}</span>
            <span class="arsip-jumlah">${items.length} sekolah · ${total} porsi</span>
          </span>
          <span class="arsip-caret">▾</span>
        </summary>
        <div class="arsip-list">${rows || '<div class="arsip-empty">Tidak ada data</div>'}</div>
      </details>`;
    })
    .join("");
}

/* =========================================
   ABSENSI & REKAP GAJI
   ========================================= */
const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

function absensiKosong() {
  return {
    peserta: [],
    catatan: {},
    pengaturan: { uangIzin: 5000 },
    periode: null,
  };
}

function parseTanggal(tanggal) {
  const [y, m, d] = String(tanggal || "").split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function tanggalValid(tanggal) {
  if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal))
    return false;
  const d = parseTanggal(tanggal);
  const [y, m, day] = tanggal.split("-").map(Number);
  return (
    !isNaN(d.getTime()) &&
    d.getFullYear() === y &&
    d.getMonth() === m - 1 &&
    d.getDate() === day
  );
}

function tanggalStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tambahHari(tanggal, jumlah) {
  const d = parseTanggal(tanggal);
  if (isNaN(d.getTime())) return tanggal;
  d.setDate(d.getDate() + jumlah);
  return tanggalStr(d);
}

function hariKerja(tanggal) {
  const d = parseTanggal(tanggal);
  if (isNaN(d.getTime())) return false;
  const hari = d.getDay();
  return hari >= 1 && hari <= 5;
}

function labelTanggal(tanggal) {
  const d = parseTanggal(tanggal);
  if (isNaN(d.getTime())) return tanggal || "";
  return `${NAMA_HARI[d.getDay()]}, ${formatTanggal(tanggal)}`;
}

function rupiah(nilai) {
  return "Rp" + Math.round(Number(nilai) || 0).toLocaleString("id-ID");
}

function escHtml(nilai) {
  return String(nilai ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

function normalisasiAbsensi(raw) {
  const out = absensiKosong();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;

  const idDipakai = new Set();
  (Array.isArray(raw.peserta) ? raw.peserta : []).forEach((p) => {
    if (!p || typeof p !== "object") return;
    const nama = typeof p.nama === "string"
      ? p.nama.trim().replace(/\s+/g, " ").toUpperCase()
      : "";
    if (!nama || /[<>]/.test(nama)) return;
    let id =
      typeof p.id === "string" &&
      /^(?!__proto__$)[A-Za-z0-9_-]{1,40}$/.test(p.id)
        ? p.id
        : "";
    if (!id || idDipakai.has(id))
      id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    idDipakai.add(id);
    out.peserta.push({
      id,
      nama,
      tarif: angka(p.tarif),
      aktif: p.aktif !== false,
    });
  });

  const setting =
    raw.pengaturan && typeof raw.pengaturan === "object" ? raw.pengaturan : {};
  out.pengaturan.uangIzin =
    setting.uangIzin === undefined ? 5000 : angka(setting.uangIzin);

  const catatan =
    raw.catatan && typeof raw.catatan === "object" && !Array.isArray(raw.catatan)
      ? raw.catatan
      : {};
  Object.keys(catatan).forEach((tanggal) => {
    if (!tanggalValid(tanggal)) return;
    const harian = catatan[tanggal];
    if (!harian || typeof harian !== "object" || Array.isArray(harian)) return;
    const bersih = {};
    Object.keys(harian).forEach((id) => {
      if (!idDipakai.has(id)) return;
      const e = harian[id];
      if (!e || typeof e !== "object") return;
      if (e.status !== "hadir" && e.status !== "izin") return;
      bersih[id] = {
        status: e.status,
        tarif: angka(e.tarif),
        izinPay:
          e.status === "izin"
            ? angka(
                e.izinPay === undefined ? out.pengaturan.uangIzin : e.izinPay,
              )
            : 0,
      };
    });
    if (Object.keys(bersih).length) out.catatan[tanggal] = bersih;
  });

  const periode = raw.periode;
  if (
    periode &&
    tanggalValid(periode.mulai) &&
    tanggalValid(periode.selesai) &&
    periode.mulai <= periode.selesai
  ) {
    out.periode = { mulai: periode.mulai, selesai: periode.selesai };
  }

  return out;
}

function muatAbsensi() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem("ultra_v10_absensi") || "null");
  } catch {
    raw = null;
  }
  return normalisasiAbsensi(raw);
}

function simpanAbsensi() {
  localStorage.setItem("ultra_v10_absensi", JSON.stringify(absensiData));
}

function cariPeserta(id) {
  return absensiData.peserta.find((p) => p.id === id);
}

function periodeDefault() {
  const now = new Date();
  const hari = now.getDay();
  const geser = hari === 0 ? 1 : hari === 6 ? 2 : 1 - hari;
  const mulai = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + geser,
  );
  const selesai = new Date(
    mulai.getFullYear(),
    mulai.getMonth(),
    mulai.getDate() + 11,
  );
  return { mulai: tanggalStr(mulai), selesai: tanggalStr(selesai) };
}

function pastikanPeriode() {
  if (!absensiData.periode) {
    absensiData.periode = periodeDefault();
    simpanAbsensi();
  }
  return absensiData.periode;
}

function hariKerjaList(mulai, selesai) {
  const out = [];
  if (!tanggalValid(mulai) || !tanggalValid(selesai) || mulai > selesai)
    return out;
  let tanggal = mulai;
  // shortcut: rekap dibatasi 730 hari agar salah isi periode tidak membekukan UI
  for (let i = 0; i < 730 && tanggal <= selesai; i++) {
    if (hariKerja(tanggal)) out.push(tanggal);
    tanggal = tambahHari(tanggal, 1);
  }
  return out;
}

function akhirNHariKerja(mulai, n) {
  let tanggal = tanggalValid(mulai) ? mulai : tanggalStr(new Date());
  let jumlah = 0;
  for (let i = 0; i < 400; i++) {
    if (hariKerja(tanggal)) {
      jumlah++;
      if (jumlah === n) return tanggal;
    }
    tanggal = tambahHari(tanggal, 1);
  }
  return tanggal;
}

function tanggalGajian(selesai) {
  const d = parseTanggal(selesai);
  if (isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return tanggalStr(d);
}

function tanggalAbsensi() {
  const el = document.getElementById("absensiTanggal");
  const tanggal = el && el.value ? el.value : tanggalLokal();
  if (el && !el.value) el.value = tanggal;
  return tanggal;
}

function hitungUpahHarian(tanggal) {
  const catatan = absensiData.catatan[tanggal] || {};
  const hadir = [];
  const izin = [];

  Object.keys(catatan).forEach((id) => {
    const p = cariPeserta(id);
    if (!p) return;
    const rec = catatan[id];
    if (rec.status === "hadir") {
      hadir.push({
        id,
        nama: p.nama,
        tarif: angka(rec.tarif),
        bonus: 0,
        total: angka(rec.tarif),
      });
    } else if (rec.status === "izin") {
      izin.push({
        id,
        nama: p.nama,
        tarif: angka(rec.tarif),
        izinPay: angka(rec.izinPay),
        total: angka(rec.izinPay),
      });
    }
  });

  const urutNama = (a, b) =>
    a.nama.localeCompare(b.nama, "id") || a.id.localeCompare(b.id);
  hadir.sort(urutNama);
  izin.sort(urutNama);

  const pool = izin.reduce(
    (total, r) => total + Math.max(0, r.tarif - r.izinPay),
    0,
  );
  const takTerbagi = hadir.length ? 0 : pool;
  if (hadir.length) {
    const dasar = Math.floor(pool / hadir.length);
    const sisa = pool % hadir.length;
    hadir.forEach((r, i) => {
      r.bonus = dasar + (i < sisa ? 1 : 0);
      r.total = r.tarif + r.bonus;
    });
  }

  const totalHadir = hadir.reduce((total, r) => total + r.total, 0);
  const totalIzin = izin.reduce((total, r) => total + r.total, 0);
  return {
    tanggal,
    hadir,
    izin,
    pool,
    takTerbagi,
    hadirCount: hadir.length,
    izinCount: izin.length,
    totalHadir,
    totalIzin,
    total: totalHadir + totalIzin,
  };
}

function hitungRekapPeriode() {
  const periode = pastikanPeriode();
  const tanggalKerja = hariKerjaList(periode.mulai, periode.selesai);
  const map = Object.create(null);
  let takTerbagi = 0;

  const baris = (id) => {
    const p = cariPeserta(id);
    if (!p) return null;
    if (!map[id])
      map[id] = {
        id,
        nama: p.nama,
        aktif: p.aktif,
        hadir: 0,
        izin: 0,
        uangIzin: 0,
        bonus: 0,
        total: 0,
      };
    return map[id];
  };

  absensiData.peserta.forEach((p) => {
    if (p.aktif) baris(p.id);
  });

  tanggalKerja.forEach((tanggal) => {
    const harian = hitungUpahHarian(tanggal);
    takTerbagi += harian.takTerbagi;
    harian.hadir.forEach((r) => {
      const row = baris(r.id);
      if (row) {
        row.hadir++;
        row.bonus += r.bonus;
        row.total += r.total;
      }
    });
    harian.izin.forEach((r) => {
      const row = baris(r.id);
      if (row) {
        row.izin++;
        row.uangIzin += r.izinPay;
        row.total += r.total;
      }
    });
  });

  const rows = Object.values(map).sort(
    (a, b) => a.nama.localeCompare(b.nama, "id") || a.id.localeCompare(b.id),
  );
  return { periode, tanggalKerja, rows, takTerbagi };
}

function detailPeserta(id) {
  const periode = pastikanPeriode();
  const hadir = [];
  const izin = [];
  let tarifHadir = 0;
  let bonus = 0;
  let uangIzin = 0;
  let potongan = 0;

  hariKerjaList(periode.mulai, periode.selesai).forEach((tanggal) => {
    const harian = hitungUpahHarian(tanggal);
    const h = harian.hadir.find((r) => r.id === id);
    if (h) {
      hadir.push({
        tanggal,
        tarif: h.tarif,
        bonus: h.bonus,
        total: h.total,
      });
      tarifHadir += h.tarif;
      bonus += h.bonus;
    }
    const i = harian.izin.find((r) => r.id === id);
    if (i) {
      const pot = Math.max(0, i.tarif - i.izinPay);
      izin.push({
        tanggal,
        tarif: i.tarif,
        izinPay: i.izinPay,
        potongan: pot,
        total: i.total,
      });
      uangIzin += i.izinPay;
      potongan += pot;
    }
  });

  return {
    periode,
    hadir,
    izin,
    tarifHadir,
    bonus,
    uangIzin,
    potongan,
    total: tarifHadir + bonus + uangIzin,
  };
}

function pesertaHarian(tanggal) {
  const catatan = absensiData.catatan[tanggal] || {};
  return absensiData.peserta
    .filter((p) => p.aktif || catatan[p.id])
    .sort((a, b) => a.nama.localeCompare(b.nama, "id") || a.id.localeCompare(b.id));
}

function tandaiAbsensi(id, status) {
  const tanggal = tanggalAbsensi();
  if (!hariKerja(tanggal)) {
    showSnackbar("Gagal: akhir pekan bukan hari kerja", false);
    return;
  }
  const p = cariPeserta(id);
  if (!p) return;

  const catatan = absensiData.catatan[tanggal] || {};
  if (catatan[id] && catatan[id].status === status) {
    delete catatan[id];
    if (Object.keys(catatan).length) absensiData.catatan[tanggal] = catatan;
    else delete absensiData.catatan[tanggal];
    simpanAbsensi();
    renderAbsensi();
    showSnackbar("Absensi dibatalkan", false);
    return;
  }

  absensiData.catatan[tanggal] = catatan;
  catatan[id] = {
    status,
    tarif: angka(p.tarif),
    izinPay: status === "izin" ? angka(absensiData.pengaturan.uangIzin) : 0,
  };
  simpanAbsensi();
  renderAbsensi();
  showSnackbar(status === "izin" ? "Izin dicatat" : "Hadir dicatat", false);
}

function bukaPesertaModal(id) {
  const modal = document.getElementById("pesertaModal");
  if (!modal) return;
  const p = id ? cariPeserta(id) : null;

  document.getElementById("pesertaId").value = p ? p.id : "";
  document.getElementById("pesertaNama").value = p ? p.nama : "";
  document.getElementById("pesertaTarif").value = p ? p.tarif : "";
  document.getElementById("pesertaModalTitle").innerText = p
    ? "Edit Peserta"
    : "Tambah Peserta";
  const btn = document.getElementById("btnNonaktifPeserta");
  if (btn) btn.hidden = !p || !p.aktif;

  modal.style.display = "flex";
}

function closePesertaModal() {
  const modal = document.getElementById("pesertaModal");
  if (modal) modal.style.display = "none";
  const idEl = document.getElementById("pesertaId");
  if (idEl) idEl.value = "";
}

function bukaDetailPeserta(id) {
  const modal = document.getElementById("pesertaDetailModal");
  const p = cariPeserta(id);
  if (!modal || !p) return;

  const d = detailPeserta(id);
  const hadirHtml = d.hadir.length
    ? d.hadir
        .map(
          (r) => `<div class="detail-day">
            <div class="detail-day-main">
              <div class="detail-day-date">${labelTanggal(r.tanggal)}</div>
              <div class="detail-day-meta">Hadir &middot; ${rupiah(r.tarif)}${
                r.bonus > 0 ? ` + bonus ${rupiah(r.bonus)}` : ""
              }</div>
            </div>
            <div class="detail-day-total">${rupiah(r.total)}</div>
          </div>`,
        )
        .join("")
    : '<div class="detail-empty">Belum ada hari Hadir.</div>';
  const izinHtml = d.izin.length
    ? d.izin
        .map(
          (r) => `<div class="detail-day">
            <div class="detail-day-main">
              <div class="detail-day-date">${labelTanggal(r.tanggal)}</div>
              <div class="detail-day-meta">Izin &middot; Uang izin ${rupiah(r.izinPay)}${
                r.potongan > 0 ? ` &middot; ${rupiah(r.potongan)} dialihkan` : ""
              }</div>
            </div>
            <div class="detail-day-total">${rupiah(r.total)}</div>
          </div>`,
        )
        .join("")
    : '<div class="detail-empty">Belum ada hari Izin.</div>';

  document.getElementById("pesertaDetailTitle").innerText = p.nama;
  document.getElementById("pesertaDetailContent").innerHTML = `
    <div class="detail-head">
      <span class="detail-tarif">Tarif saat ini ${rupiah(p.tarif)} / hari</span>
      ${p.aktif ? "" : ' <span class="absensi-badge">Nonaktif</span>'}
    </div>
    <div class="detail-period">Periode ${formatTanggal(d.periode.mulai)} &ndash; ${formatTanggal(d.periode.selesai)}</div>
    <div class="detail-summary">
      <div class="detail-summary-row"><span>Hadir (${d.hadir.length} hari)</span><strong>${rupiah(d.tarifHadir)}</strong></div>
      <div class="detail-summary-row"><span>Izin (${d.izin.length} hari)</span><strong>${rupiah(d.uangIzin)}</strong></div>
      <div class="detail-summary-row"><span>Bonus izin</span><strong>${rupiah(d.bonus)}</strong></div>
      <div class="detail-summary-row warning"><span>Potongan izin</span><strong>${rupiah(d.potongan)}</strong></div>
      <div class="detail-summary-row total"><span>Pendapatan</span><strong>${rupiah(d.total)}</strong></div>
    </div>
    <div class="detail-note">Potongan izin adalah tarif hari izin yang tidak dibayarkan.</div>
    <div class="detail-section">
      <div class="detail-section-title">Tanggal Hadir</div>
      ${hadirHtml}
    </div>
    <div class="detail-section">
      <div class="detail-section-title">Tanggal Izin</div>
      ${izinHtml}
    </div>`;
  modal.style.display = "flex";
}

function closePesertaDetail() {
  const modal = document.getElementById("pesertaDetailModal");
  if (modal) modal.style.display = "none";
}

function simpanPeserta() {
  const idEl = document.getElementById("pesertaId");
  const id = idEl ? idEl.value : "";
  const nama = (document.getElementById("pesertaNama").value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  const tarif = angka(document.getElementById("pesertaTarif").value);

  if (!nama) {
    showSnackbar("Gagal: Nama peserta harus diisi", false);
    return;
  }
  if (/[<>]/.test(nama)) {
    showSnackbar("Gagal: Nama peserta tidak valid", false);
    return;
  }
  if (absensiData.peserta.some((p) => p.id !== id && p.nama === nama)) {
    showSnackbar("Gagal: Nama peserta sudah ada", false);
    return;
  }

  if (id) {
    const p = cariPeserta(id);
    if (!p) return;
    p.nama = nama;
    p.tarif = tarif;
    showSnackbar("Peserta diperbarui", false);
  } else {
    absensiData.peserta.push({
      id:
        "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      nama,
      tarif,
      aktif: true,
    });
    showSnackbar("Peserta ditambahkan", false);
  }

  simpanAbsensi();
  closePesertaModal();
  renderAbsensi();
}

function nonaktifkanPeserta() {
  const idEl = document.getElementById("pesertaId");
  const p = cariPeserta(idEl ? idEl.value : "");
  if (!p) return;
  p.aktif = false;
  simpanAbsensi();
  closePesertaModal();
  renderAbsensi();
  showSnackbar("Peserta dinonaktifkan", false);
}

function aktifkanPeserta(id) {
  const p = cariPeserta(id);
  if (!p) return;
  p.aktif = true;
  simpanAbsensi();
  renderAbsensi();
  showSnackbar("Peserta diaktifkan kembali", false);
}

function ubahPeriode() {
  const mulai = document.getElementById("periodeMulai").value;
  const selesai = document.getElementById("periodeSelesai").value;
  if (!mulai || !selesai) {
    renderAbsensi();
    return;
  }
  if (mulai > selesai) {
    showSnackbar("Gagal: Mulai harus sebelum Selesai", false);
    renderAbsensi();
    return;
  }
  absensiData.periode = { mulai, selesai };
  simpanAbsensi();
  renderAbsensi();
}

function periode10Hari() {
  const mulai = pastikanPeriode().mulai;
  absensiData.periode = { mulai, selesai: akhirNHariKerja(mulai, 10) };
  simpanAbsensi();
  renderAbsensi();
}

function geserPeriode(hari) {
  const periode = pastikanPeriode();
  absensiData.periode = {
    mulai: tambahHari(periode.mulai, hari),
    selesai: tambahHari(periode.selesai, hari),
  };
  simpanAbsensi();
  renderAbsensi();
}

function simpanUangIzin() {
  const el = document.getElementById("uangIzinInput");
  if (!el) return;
  const nilai = el.value === "" ? 5000 : angka(el.value);
  absensiData.pengaturan.uangIzin = nilai;
  el.value = nilai;
  simpanAbsensi();
  renderAbsensi();
  showSnackbar("Uang izin disimpan", false);
}

function renderBadges() {
  const sekolahPending = data.filter((d) => d.status === "pending").length;
  const totalArsip = archiveData.reduce(
    (sum, a) => sum + (Array.isArray(a.items) ? a.items.length : 0),
    0,
  );
  const pesertaAktif = absensiData.peserta.filter((p) => p.aktif).length;
  const badges = {
    dashBadge: sekolahPending,
    navDashBadge: sekolahPending,
    sekolahBadge: data.length,
    navSekolahBadge: data.length,
    arsipBadge: totalArsip,
    historyBadge: historyData.length,
    riwayatBadge: totalArsip + historyData.length,
    navRiwayatBadge: totalArsip + historyData.length,
    absensiPesertaBadge: pesertaAktif,
    navAbsensiBadge: pesertaAktif,
  };
  Object.entries(badges).forEach(([id, jumlah]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = jumlah;
    el.hidden = jumlah === 0;
  });
}

function renderAbsensi() {
  if (!document.getElementById("listAbsensi")) return;

  const periode = pastikanPeriode();

  const mulaiEl = document.getElementById("periodeMulai");
  const selesaiEl = document.getElementById("periodeSelesai");
  if (mulaiEl && document.activeElement !== mulaiEl)
    mulaiEl.value = periode.mulai;
  if (selesaiEl && document.activeElement !== selesaiEl)
    selesaiEl.value = periode.selesai;

  const uangEl = document.getElementById("uangIzinInput");
  if (uangEl && document.activeElement !== uangEl)
    uangEl.value = absensiData.pengaturan.uangIzin;

  const tanggal = tanggalAbsensi();
  const info = document.getElementById("absensiInfo");
  const list = document.getElementById("listAbsensi");
  const ringkasan = document.getElementById("ringkasanAbsensi");

  if (!hariKerja(tanggal)) {
    info.innerHTML = `<strong>${escHtml(labelTanggal(tanggal))}</strong> &middot; Akhir pekan tidak dihitung sebagai hari kerja.`;
    list.innerHTML =
      '<div class="absensi-empty">Pilih tanggal Senin&ndash;Jumat untuk mencatat absensi.</div>';
    ringkasan.innerHTML = "";
    const rincianKosong = document.getElementById("rincianIzin");
    if (rincianKosong) rincianKosong.innerHTML = "";
    const rincianWrapKosong = document.getElementById("rincianIzinWrap");
    if (rincianWrapKosong) rincianWrapKosong.hidden = true;
  } else {
    const harian = hitungUpahHarian(tanggal);
    const rows = pesertaHarian(tanggal);
    const upahHarian = Object.create(null);
    harian.hadir.forEach((r) => (upahHarian[r.id] = r));
    harian.izin.forEach((r) => (upahHarian[r.id] = r));
    const diLuarPeriode =
      tanggal < periode.mulai || tanggal > periode.selesai;
    info.innerHTML = `<strong>${escHtml(labelTanggal(tanggal))}</strong> &middot; ${harian.hadirCount} Hadir &middot; ${harian.izinCount} Izin${diLuarPeriode ? " &middot; di luar periode" : ""}`;

    if (!rows.length) {
      list.innerHTML =
        '<div class="absensi-empty">Belum ada peserta. Tekan <strong>+ Peserta</strong> untuk menambah.</div>';
    } else {
      list.innerHTML = rows
        .map((p) => {
          const rec = (absensiData.catatan[tanggal] || {})[p.id];
          const tarifTampil = rec ? angka(rec.tarif) : p.tarif;
          const upah = upahHarian[p.id];
          const uangIzinTampil =
            rec && rec.status === "izin"
              ? ` &middot; Uang izin ${rupiah(rec.izinPay)}`
              : "";
          const terimaTampil =
            rec && rec.status === "hadir" && upah
              ? `${upah.bonus > 0 ? ` &middot; + izin ${rupiah(upah.bonus)}` : ""} &middot; Terima ${rupiah(upah.total)}`
              : "";
          const isHadir = !!(rec && rec.status === "hadir");
          const isIzin = !!(rec && rec.status === "izin");
          return `<div class="absensi-row">
            <div class="absensi-row-main">
              <div class="absensi-row-name">
                <button type="button" class="absensi-name-btn" onclick="bukaDetailPeserta('${p.id}')">${escHtml(p.nama)}${
                  p.aktif
                    ? ""
                    : ' <span class="absensi-badge">Nonaktif</span>'
                }</button>
              </div>
              <div class="absensi-row-meta">${rupiah(tarifTampil)} / hari${uangIzinTampil}${terimaTampil}</div>
            </div>
            <div class="absensi-toggle">
              <button type="button" class="absensi-btn hadir${
                isHadir ? " active" : ""
              }" aria-pressed="${isHadir}" onclick="tandaiAbsensi('${p.id}','hadir')">HADIR</button>
              <button type="button" class="absensi-btn izin${
                isIzin ? " active" : ""
              }" aria-pressed="${isIzin}" onclick="tandaiAbsensi('${p.id}','izin')">IZIN</button>
            </div>
            <button type="button" class="absensi-edit" aria-label="Edit ${escHtml(p.nama)}" onclick="bukaPesertaModal('${p.id}')">&#9998;</button>
          </div>`;
        })
        .join("");
    }

    ringkasan.innerHTML = `
      <div class="absensi-summary-row"><span>Hadir (${harian.hadirCount})</span><strong>${rupiah(harian.totalHadir)}</strong></div>
      <div class="absensi-summary-row"><span>Izin (${harian.izinCount})</span><strong>${rupiah(harian.totalIzin)}</strong></div>
      ${
        harian.pool > 0
          ? `<div class="absensi-summary-row"><span>Uang izin dibagikan (sudah termasuk)</span><strong>${rupiah(harian.pool)}</strong></div>`
          : ""
      }
      ${
        harian.takTerbagi > 0
          ? `<div class="absensi-summary-row warning"><span>Tidak terbagi (belum ada Hadir)</span><strong>${rupiah(harian.takTerbagi)}</strong></div>`
          : ""
      }
      <div class="absensi-summary-row total"><span>Total upah hari ini</span><strong>${rupiah(harian.total)}</strong></div>`;

    const rincianWrap = document.getElementById("rincianIzinWrap");
    const rincian = document.getElementById("rincianIzin");
    if (rincianWrap && rincian) {
      if (!harian.izin.length) {
        rincianWrap.hidden = true;
        rincian.innerHTML = "";
      } else {
        rincianWrap.hidden = false;
        rincian.innerHTML = `
          <div class="rincian-group">
            <div class="rincian-group-title">Dari Izin (${harian.izinCount})</div>
            ${harian.izin
              .map(
                (r) => `<div class="rincian-row">
                  <div class="rincian-label">${escHtml(r.nama)}<div class="rincian-meta">${rupiah(r.tarif)} / hari &middot; Uang izin ${rupiah(r.izinPay)}</div></div>
                  <div class="rincian-amount">${rupiah(Math.max(0, r.tarif - r.izinPay))} dialihkan</div>
                </div>`,
              )
              .join("")}
          </div>
          ${
            harian.hadirCount
              ? `<div class="rincian-group">
                  <div class="rincian-group-title">Diterima Hadir (${harian.hadirCount})</div>
                  ${harian.hadir
                    .map(
                      (r) => `<div class="rincian-row">
                        <div class="rincian-label">${escHtml(r.nama)}<div class="rincian-meta">${rupiah(r.tarif)} / hari${
                          r.bonus > 0 ? ` &middot; + izin ${rupiah(r.bonus)}` : ""
                        }</div></div>
                        <div class="rincian-amount">${rupiah(r.total)}</div>
                      </div>`,
                    )
                    .join("")}
                </div>`
              : ""
          }
          ${
            harian.takTerbagi > 0
              ? `<div class="rincian-row rincian-unallocated">
                  <div class="rincian-label">Tidak terbagi (belum ada Hadir)</div>
                  <div class="rincian-amount">${rupiah(harian.takTerbagi)}</div>
                </div>`
              : ""
          }`;
      }
    }
  }

  const rekap = hitungRekapPeriode();
  const rekapEl = document.getElementById("rekapGaji");
  if (rekapEl) {
    if (!rekap.rows.length) {
      rekapEl.innerHTML =
        '<div class="absensi-empty">Belum ada peserta di periode ini.</div>';
    } else {
      const total = rekap.rows.reduce((s, r) => s + r.total, 0);
      rekapEl.innerHTML = `
        <div class="rekap-list">
          ${rekap.rows
            .map(
              (r) => `<button type="button" class="rekap-row" onclick="bukaDetailPeserta('${r.id}')">
                <span class="rekap-main">
                  <span class="rekap-name">${escHtml(r.nama)}${
                    r.aktif ? "" : ' <span class="absensi-badge">Nonaktif</span>'
                  }</span>
                  <span class="rekap-meta">${r.hadir} Hadir &middot; ${r.izin} Izin${
                    r.uangIzin > 0 ? ` &middot; Uang izin ${rupiah(r.uangIzin)}` : ""
                  }${
                    r.bonus > 0 ? ` &middot; Bonus izin ${rupiah(r.bonus)}` : ""
                  }</span>
                </span>
                <span class="rekap-total">${rupiah(r.total)}</span>
              </button>`,
            )
            .join("")}
        </div>
        <div class="rekap-grand"><span>Total ${rekap.rows.length} peserta</span><strong>${rupiah(total)}</strong></div>
        ${
          rekap.takTerbagi > 0
            ? `<div class="rekap-unallocated">Tidak terbagi (belum ada Hadir) <strong>${rupiah(rekap.takTerbagi)}</strong></div>`
            : ""
        }`;
    }
  }

  const infoPeriode = document.getElementById("periodeInfo");
  if (infoPeriode) {
    const gajian = tanggalGajian(periode.selesai);
    infoPeriode.innerHTML = `${rekap.tanggalKerja.length} hari kerja &middot; Gajian <strong>${formatTanggal(gajian)}</strong>`;
  }

  const nonaktif = absensiData.peserta
    .filter((p) => !p.aktif)
    .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  const wrap = document.getElementById("pesertaNonaktifWrap");
  if (wrap) wrap.hidden = nonaktif.length === 0;
  setTxt("jumlahNonaktif", nonaktif.length);
  const listNonaktif = document.getElementById("listPesertaNonaktif");
  if (listNonaktif) {
    listNonaktif.innerHTML = nonaktif
      .map(
        (p) => `<div class="peserta-nonaktif-row">
          <div class="rekap-main">
            <div class="rekap-name">${escHtml(p.nama)}</div>
            <div class="rekap-meta">${rupiah(p.tarif)} / hari</div>
          </div>
          <button type="button" class="btn-sm" onclick="aktifkanPeserta('${p.id}')">Aktifkan</button>
        </div>`,
      )
      .join("");
  }
  renderBadges();
}

/* =========================================
   BACKUP & RESTORE
   ========================================= */
function buildBackup() {
  return {
    app: "MBG",
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
    historyData,
    archiveData,
    absensi: absensiData,
  };
}

function renderBackupNote() {
  const el = document.getElementById("backupNote");
  if (!el) return;

  const adaData =
    data.length > 0 ||
    historyData.length > 0 ||
    absensiData.peserta.length > 0 ||
    Object.keys(absensiData.catatan).length > 0;
  let iso = null;
  try {
    iso = JSON.parse(localStorage.getItem("ultra_v10_backup") || "null");
  } catch {
    iso = null;
  }

  const t = iso ? new Date(iso) : null;
  const valid = t && !isNaN(t.getTime());
  const hari = valid ? Math.floor((Date.now() - t.getTime()) / 86400000) : 0;

  if (!adaData || (valid && hari < 7)) {
    el.hidden = true;
    return;
  }

  el.hidden = false;
  el.innerText = valid
    ? `Backup terakhir ${formatDateTime(iso)} — sudah ${hari} hari. Ekspor lagi.`
    : "Belum pernah backup. Data hanya tersimpan di perangkat ini.";
}

function exportData() {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mbg-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  localStorage.setItem(
    "ultra_v10_backup",
    JSON.stringify(new Date().toISOString()),
  );
  renderBackupNote();
  showSnackbar("Backup berhasil diekspor", false);
}

function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("file bukan JSON yang valid");
  }

  if (!parsed || !Array.isArray(parsed.data))
    throw new Error("struktur backup tidak dikenali");

  const isValidVal = (val) =>
    val &&
    Number.isFinite(Number(val.i)) &&
    Number.isFinite(Number(val.s)) &&
    Number(val.i) >= 0 &&
    Number(val.s) >= 0;

  const isSafeLabel = (v) =>
    typeof v === "string" && /^[A-Za-z0-9 ]{1,20}$/.test(v);

  const isValidSchool = (s) =>
    s &&
    typeof s.nama === "string" &&
    s.nama.trim() !== "" &&
    !/[<>]/.test(s.nama) &&
    isSafeLabel(s.mobil) &&
    isSafeLabel(s.rit) &&
    isValidVal(s.pk_val) &&
    isValidVal(s.pb_val);

  parsed.data.forEach((s, i) => {
    if (!isValidSchool(s))
      throw new Error(`data sekolah #${i + 1} tidak valid`);
  });

  const history = Array.isArray(parsed.historyData) ? parsed.historyData : [];
  history.forEach((s, i) => {
    if (!isValidSchool(s))
      throw new Error(`data riwayat #${i + 1} tidak valid`);
  });

  const archive = Array.isArray(parsed.archiveData) ? parsed.archiveData : [];
  archive.forEach((a, i) => {
    if (
      !a ||
      typeof a.tanggal !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.tanggal) ||
      !Array.isArray(a.items)
    )
      throw new Error(`arsip #${i + 1} tidak valid`);
    a.items.forEach((s, j) => {
      if (!isValidSchool(s))
        throw new Error(`data arsip #${i + 1}.${j + 1} tidak valid`);
    });
  });

  const normalize = (s) => {
    const status = ["pending", "done", "holiday"].includes(s.status)
      ? s.status
      : "pending";
    const doneAt =
      status === "done" &&
      typeof s.done_at === "string" &&
      !isNaN(Date.parse(s.done_at))
        ? new Date(s.done_at).toISOString()
        : null;

    return {
      nama: s.nama.trim(),
      mobil: s.mobil,
      rit: s.rit,
      status,
      pk_done: !!s.pk_done,
      pb_done: !!s.pb_done,
      done_at: doneAt,
      total: hitung(s.pk_val.i, s.pk_val.s) + hitung(s.pb_val.i, s.pb_val.s),
      pk_val: { i: Number(s.pk_val.i), s: Number(s.pk_val.s) },
      pb_val: { i: Number(s.pb_val.i), s: Number(s.pb_val.s) },
    };
  };

  return {
    data: parsed.data.map(normalize),
    historyData: history.map(normalize),
    archiveData: archive.map((a) => ({
      tanggal: a.tanggal,
      dibuat:
        typeof a.dibuat === "string" && !isNaN(Date.parse(a.dibuat))
          ? new Date(a.dibuat).toISOString()
          : null,
      items: a.items.map(normalize),
    })),
    absensi: normalisasiAbsensi(parsed.absensi),
  };
}

async function importData(input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    showSnackbar("Gagal: file backup terlalu besar", false);
    return;
  }

  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch (e) {
    showSnackbar(`Gagal: ${e.message}`, false);
    return;
  }

  const svgImpor = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 36px; height: 36px; color: var(--warning-text);"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 12 12 16.5m0 0 4.5-4.5M12 16.5V3" /></svg>`;

  openModal(
    svgImpor,
    "Impor Data",
    `Impor akan mengganti ${data.length} sekolah, ${historyData.length} riwayat, ${archiveData.length} arsip, dan ${absensiData.peserta.length} peserta absensi saat ini dengan ${parsed.data.length} sekolah, ${parsed.historyData.length} riwayat, ${parsed.archiveData.length} arsip, dan ${parsed.absensi.peserta.length} peserta absensi dari file. Lanjutkan?`,
    "var(--warning-text)",
    () => {
      deletedItem = {
        type: "import",
        content: {
          data: JSON.parse(JSON.stringify(data)),
          historyData: JSON.parse(JSON.stringify(historyData)),
          archiveData: JSON.parse(JSON.stringify(archiveData)),
          absensi: JSON.parse(JSON.stringify(absensiData)),
        },
      };
      data = parsed.data;
      historyData = parsed.historyData;
      archiveData = parsed.archiveData;
      absensiData = parsed.absensi;
      update();
      renderAbsensi();
      showSnackbar("Data berhasil diimpor", true);
    },
  );
}

/* =========================================
   DUPLICATE CHECK
   ========================================= */
function findDuplicateIndex(nama, excludeIdx = -1) {
  const key = nama.trim().replace(/\s+/g, " ");
  return data.findIndex(
    (d, i) =>
      i !== excludeIdx && d.nama.trim().replace(/\s+/g, " ") === key,
  );
}

function promptDuplicate(nama, dupIdx, closeCurrent) {
  const existing = data[dupIdx];
  const svgWarning = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 36px; height: 36px; color: var(--warning-text);"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>`;

  openModal(
    svgWarning,
    "Sekolah Sudah Ada",
    `${nama} sudah ada di daftar (${existing.mobil}, ${existing.rit || "Rit 1"}). Buka data yang ada?`,
    "var(--warning-text)",
    () => {
      closeCurrent();
      editSekolah(dupIdx);
    },
  );
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

  // Validasi Nama Kosong
  if (!nama) {
    showSnackbar("Gagal: Nama sekolah harus diisi!", false);
    return;
  }

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

  let pkUtama = angka(pki),
    pbUtama = angka(pbi),
    tendikUtama = angka(tendiki);
  let pkTotalEceran = angka(pks),
    pbTotalEceran = angka(pbs);
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

  // ==========================================
  // CEK JIKA TOTALNYA 0
  // ==========================================
  let totalMuatan = pkHitung + pbHitung;
  if (totalMuatan === 0) {
    showSnackbar("Gagal: Data muatan (Porsi Besar/Porsi Kecil) tidak boleh 0!", false);
    return; // Hentikan proses simpan
  }
  // ==========================================

  let editIdxVal = document.getElementById("editIdx").value;
  let dupIdx = findDuplicateIndex(
    nama,
    editIdxVal === "" ? -1 : parseInt(editIdxVal),
  );
  if (dupIdx !== -1) {
    promptDuplicate(nama, dupIdx, closeTambahModal);
    return;
  }

  let payload = {
    nama,
    mobil,
    rit,
    status: "pending",
    pk_done: false,
    pb_done: false,
    done_at: null,
    total: totalMuatan,
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
  showSnackbar("Data Sekolah Disimpan", false);
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
    eceranElements.forEach((el) => (el.style.display = "none"));
    if (item && item.pk_val) {
      pkInput.value = item.pk_val.i * 5 + parseInt(item.pk_val.s || 0);
      pbInput.value = item.pb_val.i * 5 + parseInt(item.pb_val.s || 0);
    }
  } else {
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
  setTimeout(() => document.getElementById("modalNama").focus(), 100);
}
function closeEditModal() {
  document.getElementById("editSekolahModal").style.display = "none";
}

function simpanPerubahanModal() {
  let idx = parseInt(document.getElementById("modalEditIdx").value);
  if (isNaN(idx)) return;

  let nama = document.getElementById("modalNama").value.trim().toUpperCase();

  // Validasi Nama Kosong
  if (!nama) {
    showSnackbar("Gagal: Nama sekolah harus diisi!", false);
    return;
  }

  let mobil = document.querySelector('input[name="modalMobil"]:checked').value;
  let rit = document.querySelector(
    'input[name="modalRitSelect"]:checked',
  ).value;
  let status = document.querySelector(
    'input[name="modalStatus"]:checked',
  ).value;
  let modeNode = document.querySelector('input[name="modalInputMode"]:checked');
  let mode = modeNode ? modeNode.value : "ikat";

  let pki = angka(document.getElementById("modalPk_i").value),
    pks = angka(document.getElementById("modalPk_s").value);
  let pbi = angka(document.getElementById("modalPb_i").value),
    pbs = angka(document.getElementById("modalPb_s").value);

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

  // ==========================================
  // CEK JIKA TOTALNYA 0
  // ==========================================
  let totalMuatan = pkHitung + pbHitung;
  if (totalMuatan === 0) {
    showSnackbar("Gagal: Data muatan (Porsi Besar/Porsi Kecil) tidak boleh 0!", false);
    return; // Hentikan proses simpan perubahan
  }

  let dupIdx = findDuplicateIndex(nama, idx);
  if (dupIdx !== -1) {
    promptDuplicate(nama, dupIdx, closeEditModal);
    return;
  }

  let prev = data[idx];
  arsipJikaBatalSelesai(prev, status);

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

  let doneAt = null;
  if (status === "done")
    doneAt =
      prev.status === "done"
        ? prev.done_at || null
        : new Date().toISOString();

  data[idx] = {
    nama,
    mobil,
    rit,
    status,
    pk_done: new_pk_done,
    pb_done: new_pb_done,
    done_at: doneAt,
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
    oldPb = data[i].pb_done,
    oldDoneAt = data[i].done_at;
  let arsipBefore = arsipJikaBatalSelesai(data[i], s);
  data[i].status = s;

  if (s === "done") {
    data[i].pk_done = true;
    data[i].pb_done = true;
    if (!data[i].done_at) data[i].done_at = new Date().toISOString();
  } else if (s === "pending") {
    // Direset ke false dulu, tapi nanti syncStatus di update() akan benerin jika ada yang muatan 0
    data[i].pk_done = false;
    data[i].pb_done = false;
  }
  if (s !== "done") data[i].done_at = null;

  deletedItem = {
    type: "status",
    index: i,
    content: { status: oldStatus, pk: oldPk, pb: oldPb, doneAt: oldDoneAt },
    arsip: arsipBefore,
  };
  update();
  let txt = s === "done" ? "SELESAI" : s === "holiday" ? "LIBUR" : "PENDING";
  showSnackbar(`${txt}`, true);
}

function restore(i) {
  data.unshift({
    ...historyData[i],
    status: "pending",
    pk_done: false,
    pb_done: false,
    done_at: null,
  });
  historyData.splice(i, 1);
  update();
}

/* =========================================
   MODALS, UNDO & CLEAR HISTORIES
   ========================================= */
function showSnackbar(msg, isUndoable = true) {
  const sb = document.getElementById("snackbar");
  if (!sb) return;

  const textSpan = sb.querySelector("span");
  textSpan.innerText = msg;

  const undoBtn = sb.querySelector("button");

  // Logika penyesuaian tata letak
  if (isUndoable) {
    if (undoBtn) undoBtn.style.display = "inline-block";

    // Kembalikan ke layout awal (rata kiri & tombol di kanan)
    sb.style.justifyContent = "space-between";
    textSpan.style.textAlign = "left";
    textSpan.style.width = "auto";
  } else {
    if (undoBtn) undoBtn.style.display = "none";

    // Pusatkan teks karena tidak ada tombol
    sb.style.justifyContent = "center";
    textSpan.style.textAlign = "center";
    textSpan.style.width = "100%";
  }

  sb.className = "snackbar show";
  clearTimeout(deleteTimeout);
  deleteTimeout = setTimeout(() => {
    sb.className = "snackbar";
    deletedItem = null;
  }, 3000);
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
      data[deletedItem.index].done_at = deletedItem.content.doneAt ?? null;
      if (deletedItem.arsip) archiveData = deletedItem.arsip;
    } else if (deletedItem.type === "archive_clear") {
      archiveData = deletedItem.content;
    } else if (deletedItem.type === "import") {
      data = deletedItem.content.data;
      historyData = deletedItem.content.historyData;
      archiveData = deletedItem.content.archiveData;
      if (deletedItem.content.absensi)
        absensiData = deletedItem.content.absensi;
    } else if (deletedItem.type === "bulk_status") {
      deletedItem.indices.forEach((i) => {
        data[i].status = deletedItem.content;
        data[i].pk_done = false;
        data[i].pb_done = false;
      });
    }
    // --- TAMBAHAN KONDISI UNDO BARU DI SINI ---
    else if (deletedItem.type === "bulk_reset_done") {
      data = deletedItem.content; // Kembalikan seluruh data ke kondisi awal sebelum reset
      if (deletedItem.arsip) archiveData = deletedItem.arsip;
    }
    // -----------------------------------------
    else {
      historyData.splice(deletedItem.index, 0, deletedItem.content);
    }
    document.getElementById("snackbar").className = "snackbar";
    deletedItem = null;
    update();
    renderAbsensi();
  }
}

function openModal(iconHTML, title, msg, color, onConfirm) {
  const m = document.getElementById("customModal");
  if (!m) return confirm(msg) && onConfirm();

  // Mengubah innerText menjadi innerHTML agar bisa merender SVG
  document.getElementById("modalIcon").innerHTML = iconHTML;
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
  const svgHapus = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 36px; height: 36px; color: var(--danger);"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>`;
  openModal(svgHapus, "Hapus", "Hapus sekolah ini?", "var(--danger)", () => {
    deletedItem = { type: "active", index: i, content: data[i] };
    historyData.unshift(data[i]);
    data.splice(i, 1);
    update();
    showSnackbar("Sekolah dihapus");
  });
}

function confirmHapusHist(i) {
  const svgHapusPermanen = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 36px; height: 36px; color: var(--danger);"><path stroke-linecap="round" stroke-linejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" /></svg>`;
  openModal(svgHapusPermanen, "Hapus", "Hapus permanen?", "var(--danger)", () => {
    deletedItem = { type: "history", index: i, content: historyData[i] };
    historyData.splice(i, 1);
    update();
    showSnackbar("Riwayat dihapus", false);
  });
}

const SVG_ALERT = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 36px; height: 36px; color: var(--danger);"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>`;

function confirmClearHistory() {
  openModal(
    SVG_ALERT,
    "Hapus Semua",
    "Kosongkan semua riwayat permanen?",
    "var(--danger)",
    () => {
      historyData = [];
      update();
      showSnackbar("Semua riwayat dibersihkan", false);
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
  const tendikInput = document.getElementById("tendik_i");
  const rowTendik = document.getElementById("row_tendik"),
    eceranElements = document.querySelectorAll(
      "#pk_s, #pb_s, #tendik_s, .plus-sign",
    );

  if (mode === "porsi") {
    if (tendikInput) tendikInput.placeholder = "Tendik (Porsi Besar)";
    eceranElements.forEach((el) => (el.style.display = "none"));
    if (rowTendik) rowTendik.style.display = "flex";
  } else {
    eceranElements.forEach((el) => (el.style.display = "inline-block"));
    if (rowTendik) rowTendik.style.display = "none";
  }
}

function shareText(title, text) {
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => console.log("Batal share"));
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  }
}

function shareRecap() {
  let aktif = data.filter((d) => d.status !== "holiday");
  if (aktif.length === 0) {
    showSnackbar("Belum ada data untuk direkap", false);
    return;
  }

  const totalDari = (d) =>
    Number(d.total) ||
    hitung(d.pk_val.i, d.pk_val.s) + hitung(d.pb_val.i, d.pb_val.s);

  let total = aktif.reduce((sum, d) => sum + totalDari(d), 0);
  let terdistribusi = hitungTerdistribusi(aktif);
  let sisa = Math.max(0, total - terdistribusi);
  let stok = stokPerMobil();
  let tersedia = stok["Mobil 1"] + stok["Mobil 2"];
  let done = aktif.filter((d) => d.status === "done").length;
  let pct = (val) => (total > 0 ? Math.round((val / total) * 100) : 0);

  let mobilLines = [...new Set(aktif.map((d) => d.mobil))].sort().map((m) => {
    let items = aktif.filter((d) => d.mobil === m);
    let mTotal = items.reduce((sum, d) => sum + totalDari(d), 0);
    let mKirim = hitungTerdistribusi(items);
    let mDone = items.filter((d) => d.status === "done").length;
    return `• ${m}: ${mKirim}/${mTotal} porsi (${mDone} sekolah selesai, stok ${stok[m] ?? 0})`;
  });

  let text = `*REKAP MBG*\n${formatDateTime(new Date().toISOString())}\n\n`;
  text += `Total Penerima: ${total}\n`;
  text += `Terdistribusi: ${terdistribusi} (${pct(terdistribusi)}%)\n`;
  text += `Belum Terdistribusi: ${sisa}\n`;
  text += `Tersedia: ${tersedia} (${pct(tersedia)}%)\n`;
  text += `Sekolah: ${done} selesai / ${aktif.length} total\n`;
  if (mobilLines.length > 0) text += `\n*Per Mobil:*\n${mobilLines.join("\n")}`;

  shareText("Rekap MBG", text);
}

function shareRitSummary(ritName) {
  let sekolahDiRitIni = data.filter((d) => (d.rit || "Rit 1") === ritName);
  let text = `*Jadwal Pengiriman: ${ritName.toUpperCase()}*\n\n`;

  sekolahDiRitIni.forEach((s) => {
    let pk = hitung(s.pk_val.i, s.pk_val.s),
      pb = hitung(s.pb_val.i, s.pb_val.s);
    let statusTag = s.status === "done" ? "(Selesai)" : "";
    if (s.status !== "done") {
      if (s.pk_done && pk > 0 && (!s.pb_done || pb === 0))
        statusTag = "(Porsi Kecil Selesai)";
      if (!s.pk_done && s.pb_done && pb > 0)
        statusTag = "(Porsi Besar Selesai)";
    }
    text += `• ${s.nama} ${statusTag}\n  Porsi Besar: ${pb} | Porsi Kecil: ${pk}\n`;
  });

  let totPK = sekolahDiRitIni.reduce(
    (sum, d) => sum + hitung(d.pk_val.i, d.pk_val.s),
    0,
  );
  let totPB = sekolahDiRitIni.reduce(
    (sum, d) => sum + hitung(d.pb_val.i, d.pb_val.s),
    0,
  );
  text += `\n-----------------------\n*TOTAL MUATAN:*\nPorsi Besar: ${totPB}\nPorsi Kecil: ${totPK}`;

  shareText("Jadwal Kirim", text);
}

/* =========================================
   MODAL INFO SEKOLAH & TOMBOL SELESAI PARSIAL
   ========================================= */
function showSchoolInfo(idx) {
  let s = data[idx];
  if (!s) return;

  let pkT = hitung(s.pk_val.i, s.pk_val.s);
  let pbT = hitung(s.pb_val.i, s.pb_val.s);

  let labelStatus = "PROSES";
  let badgeClass = "badge-pending";
  if (s.status === "done") {
    labelStatus = "SELESAI";
    badgeClass = "badge-done";
  } else if (s.status === "holiday") {
    labelStatus = "LIBUR";
    badgeClass = "badge-holiday";
  }

  let isPkDone = s.status === "done" || s.pk_done;
  let isPbDone = s.status === "done" || s.pb_done;

  // Render SVG Centang
  const svgCentang = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" style="width: 10px; height: 10px; display: inline-block; margin-right: 2px; vertical-align: baseline;"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>`;

  // Render Box PK
  let pkStatusMark =
    isPkDone && pkT > 0
      ? `<span class="status-mark">${svgCentang} SELESAI</span>`
      : "";
  let pkDoneClass = isPkDone && pkT > 0 ? " is-done" : "";

  // Render Box PB
  let pbStatusMark =
    isPbDone && pbT > 0
      ? `<span class="status-mark">${svgCentang} SELESAI</span>`
      : "";
  let pbDoneClass = isPbDone && pbT > 0 ? " is-done" : "";

  let btnSelesaiHTML = "";
  if (s.status !== "done") {
    btnSelesaiHTML = `<div class="info-actions">`;
    if (!s.pb_done && pbT > 0)
      btnSelesaiHTML += `<button class="btn-sm" onclick="setSchoolStatusFromModal(${idx}, 'PB')">PORSI BESAR SELESAI</button>`;
    if (!s.pk_done && pkT > 0)
      btnSelesaiHTML += `<button class="btn-sm" onclick="setSchoolStatusFromModal(${idx}, 'PK')">PORSI KECIL SELESAI</button>`;

    btnSelesaiHTML += `<button class="btn-sm primary" onclick="setSchoolStatusFromModal(${idx}, 'ALL')">SELESAI</button>
    </div>`;
  }

  let doneAtText = s.status === "done" ? formatDateTime(s.done_at) : "";
  const svgClock = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 12px; height: 12px; display: inline-block;"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" /></svg>`;
  let doneAtHTML = doneAtText
    ? `<div class="info-done-at">${svgClock} Selesai ${doneAtText}</div>`
    : "";

  const svgMapPin = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width: 14px; height: 14px; display: inline-block; vertical-align: text-bottom; margin-right: 2px;"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25v5.25m0-5.25a4.5 4.5 0 0 1 4.5 4.5m-4.5-4.5h-9a2.25 2.25 0 0 0-2.25 2.25v7.5" /></svg>`;

  const svgTrukMini = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 14px; height: 14px; display: inline-block; vertical-align: text-bottom; margin-right: 2px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 1.5v-1.5m0 0c0-.621.504-1.125 1.125-1.125m0 0h7.5" /></svg>`;

  document.getElementById("infoModalTitle").innerText = s.nama;
  document.getElementById("infoModalContent").innerHTML = `
        <div class="info-head">
            <span class="badge ${badgeClass}">
                ${labelStatus}
            </span>
            <div class="info-meta">
                <span>${svgMapPin} ${s.mobil}</span>
                <span>${svgTrukMini} ${s.rit || "Rit 1"}</span>
            </div>
        </div>
        ${doneAtHTML}

        <div class="info-box pb${pbDoneClass}">
            <div class="info-box-label">Porsi Besar ${pbStatusMark}</div>
            <div class="info-box-value">
                <span class="big">${pbT}</span>
                <span class="small">${s.pb_val.i} ikat + ${s.pb_val.s}</span>
            </div>
        </div>

        <div class="info-box pk${pkDoneClass}">
            <div class="info-box-label">Porsi Kecil ${pkStatusMark}</div>
            <div class="info-box-value">
                <span class="big">${pkT}</span>
                <span class="small">${s.pk_val.i} ikat + ${s.pk_val.s}</span>
            </div>
        </div>

        <div class="info-total">
            <div class="info-total-label">Total Keseluruhan</div>
            <div class="info-total-value">${s.total}</div>
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

  let msg =
    type === "PB" ? "Porsi Besar" : type === "PK" ? "Porsi Kecil" : "SEMUA";
  showSnackbar(`${s.nama} - ${msg} Selesai`, true);
}

function closeInfoModal() {
  document.getElementById("infoModal").style.display = "none";
}
function confirmResetAllDone() {
  // 1. Cari indeks sekolah apa saja yang statusnya 'done'
  let targetIndices = [];
  data.forEach((d, idx) => {
    if (d.status === "done") {
      targetIndices.push(idx);
    }
  });

  if (targetIndices.length === 0) {
    showSnackbar(
      "Tidak ada sekolah berstatus selesai untuk dikembalikan.",
      false,
    );
    return;
  }

  const svgRefresh = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="width: 36px; height: 36px; color: var(--warning-text);"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99જી" /></svg>`;

  openModal(
    svgRefresh,
    "Kembalikan ke Proses",
    `Kembalikan ${targetIndices.length} sekolah yang selesai menjadi berstatus proses? Data selesai akan disimpan ke Arsip Harian.`,
    "var(--warning-text)",
    () => {
      // 3. Simpan state lama untuk fitur UNDO (jaga-jaga jika salah klik)
      // Simpan salinan data sebelum diubah
      let backupData = JSON.parse(JSON.stringify(data));
      let arsipBefore = JSON.parse(JSON.stringify(archiveData));
      arsipkanSelesai();

      targetIndices.forEach((i) => {
        data[i].status = "pending";
        data[i].pk_done = false;
        data[i].pb_done = false;
        data[i].done_at = null;
      });

      // Rekam untuk memori undo
      deletedItem = {
        type: "bulk_reset_done",
        content: backupData,
        arsip: arsipBefore,
      };

      update();
      showSnackbar("Semua sekolah selesai dikembalikan ke proses", true);
    },
  );
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