const API_URL = "https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=";
const DEFAULT_LOCATION = "31.73.05.1005";
const DEPARTURE_TIME = "17:30";
const RAIN_CODES = new Set([60, 61, 63, 80, 95, 97]);

const form = document.querySelector("#location-form");
const input = document.querySelector("#adm4");
const button = document.querySelector("#check-button");
const result = document.querySelector("#result");
const searchCard = document.querySelector("#search-card");
const locationToggle = document.querySelector("#location-toggle");

function isRainForecast(item) {
  const description = String(item.weather_desc || "").toLowerCase();
  return /hujan|gerimis|petir|thunderstorm/.test(description) || RAIN_CODES.has(Number(item.weather));
}

function getLocalDateParts(timezone) {
  const now = new Date();
  if (timezone && /^[+-]\d{2}:?\d{2}$/.test(timezone)) {
    const sign = timezone[0] === "-" ? -1 : 1;
    const digits = timezone.slice(1).replace(":", "");
    const offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
    const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
    return {
      date: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`,
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
    };
  }

  function getZonedParts(timeZone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return {
      date: `${values.year}-${values.month}-${values.day}`,
      hour: Number(values.hour),
      minute: Number(values.minute),
    };
  }

  try {
    return getZonedParts(timezone || "Asia/Jakarta");
  } catch {
    return getZonedParts("Asia/Jakarta");
  }
}

function getEveningForecasts(data) {
  const location = data.lokasi || data.data?.[0]?.lokasi || {};
  const localNow = getLocalDateParts(location.timezone);
  const currentTime = `${String(localNow.hour).padStart(2, "0")}:${String(localNow.minute).padStart(2, "0")}`;
  const earliestTime = currentTime > DEPARTURE_TIME ? currentTime : DEPARTURE_TIME;
  const forecasts = (data.data || [])
    .flatMap((day) => day.cuaca || [])
    .flat()
    .filter((item) => String(item.local_datetime || "").slice(0, 10) === localNow.date)
    .sort((a, b) => String(a.local_datetime).localeCompare(String(b.local_datetime)));

  const departureForecasts = forecasts.filter((item) => String(item.local_datetime).slice(11, 16) >= earliestTime);
  return { forecasts, departureForecasts, earliestTime, date: localNow.date };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatTime(datetime) {
  return `${String(datetime).slice(11, 16)} WIB`;
}

function renderForecast(data, code) {
  const location = data.lokasi || data.data?.[0]?.lokasi || {};
  const { forecasts, departureForecasts, earliestTime, date } = getEveningForecasts(data);
  if (!forecasts.length) {
    result.innerHTML = `<div class="error-card">Prakiraan hari ini belum tersedia untuk ${escapeHtml(location.desa || code)}. Coba cek kembali nanti atau gunakan kode ADM4 lain.</div>`;
    return false;
  }

  const rainyForecasts = departureForecasts.filter(isRainForecast);
  const hasDepartureForecast = departureForecasts.length > 0;
  const hasRain = rainyForecasts.length > 0;
  const hasEarlierForecast = forecasts.some((item) => String(item.local_datetime).slice(11, 16) < earliestTime);
  const locationName = [...new Set([location.desa, location.kecamatan, location.kotkab].filter(Boolean))]
    .join(", ") || `Kode wilayah ${code}`;
  const lastUpdated = data.data?.[0]?.cuaca?.[0]?.[0]?.analysis_date;
  const updatedLabel = lastUpdated
    ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(`${lastUpdated}Z`))
    : "sesuai pembaruan BMKG";
  const rows = forecasts.map((item, index) => {
    const localTime = String(item.local_datetime).slice(11, 16);
    const isDepartureTime = localTime >= earliestTime;
    const raining = isRainForecast(item);
    const icon = item.image
      ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">`
      : "";
    const divider = isDepartureTime && index > 0 && hasEarlierForecast && String(forecasts[index - 1].local_datetime).slice(11, 16) < earliestTime
      ? `<div class="forecast-divider">Menjelang pulang · ${escapeHtml(DEPARTURE_TIME)}</div>`
      : "";
    return `${divider}<div class="forecast-row">
      <span class="forecast-time">${escapeHtml(formatTime(item.local_datetime))}</span>
      <span class="forecast-weather">${icon}<span>${escapeHtml(item.weather_desc || "Cuaca tidak diketahui")}</span></span>
      <span class="${raining ? "rain-tag" : "temp"}">${raining ? "Waspada hujan" : `${escapeHtml(item.t)}°`}</span>
    </div>`;
  }).join("");

  result.innerHTML = `<article class="forecast-card">
    <div class="forecast-heading">
      <div>
        <p class="location-label">Titik berangkat</p>
        <h2 class="location-name">${escapeHtml(locationName)}</h2>
        <p class="date-label">${escapeHtml(formatDate(date))} · Pulang pukul 17.30</p>
      </div>
      <span class="status-pill ${!hasDepartureForecast ? "unknown" : hasRain ? "rain" : "clear"}">${!hasDepartureForecast ? "Prakiraan belum tersedia" : hasRain ? "Ada indikasi hujan" : "Belum ada hujan"}</span>
    </div>
    <div class="verdict ${hasRain ? "rain" : ""}">
      <span class="verdict-icon" aria-hidden="true">${!hasDepartureForecast ? "🕒" : hasRain ? "🌂" : "☀️"}</span>
      <div>
        <h2>${!hasDepartureForecast ? "Prakiraan waktu pulang belum tersedia." : hasRain ? "Sebaiknya siapkan payung." : "Sepertinya aman untuk pulang."}</h2>
        <p>${!hasDepartureForecast
          ? `Data BMKG hari ini tersedia, tetapi belum ada slot mulai ${escapeHtml(earliestTime)}.`
          : hasRain
            ? `BMKG memperkirakan hujan pada ${rainyForecasts.map((item) => formatTime(item.local_datetime)).join(", ")}.`
            : `Tidak ada slot prakiraan hujan mulai ${escapeHtml(earliestTime)} pada data yang tersedia.`}</p>
      </div>
    </div>
    <div class="forecast-list">${hasEarlierForecast ? '<div class="forecast-divider">Prakiraan hari ini</div>' : ""}${rows}</div>
    <div class="forecast-foot">Data terakhir BMKG: ${escapeHtml(updatedLabel)} · Prakiraan per 3 jam, kondisi aktual dapat berubah.</div>
  </article>`;
  return true;
}

async function checkWeather(code) {
  result.setAttribute("aria-busy", "true");
  button.disabled = true;
  result.innerHTML = '<div class="loading">Sedang mengambil prakiraan BMKG…</div>';

  try {
    const response = await fetch(`${API_URL}${encodeURIComponent(code)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      throw new Error(response.status === 404
        ? "Kode wilayah tidak ditemukan. Periksa kembali kode ADM4 kelurahan/desamu."
        : `BMKG tidak dapat diakses saat ini (HTTP ${response.status}). Coba lagi sebentar lagi.`);
    }

    const data = await response.json();
    if (!data.lokasi && !data.data?.[0]?.lokasi) {
      throw new Error("Respons BMKG tidak memuat informasi lokasi. Periksa kode ADM4 dan coba lagi.");
    }
    if (renderForecast(data, code)) {
      searchCard.hidden = true;
      locationToggle.setAttribute("aria-expanded", "false");
      locationToggle.innerHTML = '<span aria-hidden="true">⌖</span> Ganti titik berangkat';
    }
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "Permintaan ke BMKG terlalu lama. Periksa koneksi internet lalu coba lagi."
      : error instanceof TypeError
        ? "Tidak dapat menghubungi API BMKG. Periksa koneksi internet dan coba lagi."
        : error.message || "Terjadi kesalahan saat mengambil prakiraan BMKG.";
    result.innerHTML = `<div class="error-card" role="alert">${escapeHtml(message)}</div>`;
  } finally {
    button.disabled = false;
    result.setAttribute("aria-busy", "false");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = input.value.trim();
  if (!/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(code)) {
    input.setCustomValidity("Masukkan kode ADM4 dengan format 00.00.00.0000.");
    input.reportValidity();
    return;
  }
  input.setCustomValidity("");
  checkWeather(code);
});

input.addEventListener("input", () => input.setCustomValidity(""));
locationToggle.addEventListener("click", () => {
  searchCard.hidden = !searchCard.hidden;
  const isExpanded = !searchCard.hidden;
  locationToggle.setAttribute("aria-expanded", String(isExpanded));
  locationToggle.innerHTML = isExpanded
    ? '<span aria-hidden="true">×</span> Tutup'
    : '<span aria-hidden="true">⌖</span> Ganti titik berangkat';
  if (isExpanded) input.focus();
});

input.value = DEFAULT_LOCATION;
checkWeather(DEFAULT_LOCATION);
