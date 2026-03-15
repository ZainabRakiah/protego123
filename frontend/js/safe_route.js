const SAFE_BACKEND_URL = typeof BACKEND_URL !== "undefined"
  ? BACKEND_URL
  : window.location.origin;

let safeMap;
let safeRouteLayer = null;
let safeHeatLayerPoints = [];
let safeLiveMarker = null;
let safeWatchId = null;
let safeLastPosition = null;
let sosTimerId = null;
let sosCountdown = 10;
// Separate from SafeCam's camera variables to avoid collisions
let routeCameraStream = null;
let routeCameraTrack = null;
let routeCameraCaptureIntervalId = null;

function getUserIdOrRedirect() {
  const userStr = sessionStorage.getItem("user");
  if (!userStr) {
    window.location.href = "index.html";
    return null;
  }
  try {
    const user = JSON.parse(userStr);
    return user?.id ?? null;
  } catch {
    window.location.href = "index.html";
    return null;
  }
}

function clearSafeRouteAndSearch() {
  const startEl = document.getElementById("safeStartInput");
  const destEl = document.getElementById("safeDestInput");
  if (startEl) startEl.value = "";
  if (destEl) destEl.value = "";
  if (safeRouteLayer && safeMap) {
    if (Array.isArray(safeRouteLayer)) {
      safeRouteLayer.forEach(l => safeMap.removeLayer(l));
    } else {
      safeMap.removeLayer(safeRouteLayer);
    }
    safeRouteLayer = null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  getUserIdOrRedirect();
  clearSafeRouteAndSearch();
  initSafeRouteMap();
  startSafeLiveTracking();
});

function initSafeRouteMap() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      safeLastPosition = [lat, lng];
      safeMap = L.map("safeRouteMap").setView([lat, lng], 16);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }).addTo(safeMap);

      safeLiveMarker = L.marker([lat, lng]).addTo(safeMap);
      updateSafetyMeta(lat, lng);
    },
    () => {
      safeMap = L.map("safeRouteMap").setView([12.9716, 77.5946], 14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
      }).addTo(safeMap);
    }
  );
}

function startSafeLiveTracking() {
  if (!navigator.geolocation || safeWatchId) return;
  safeWatchId = navigator.geolocation.watchPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const current = [lat, lng];

      if (!safeLiveMarker && safeMap) {
        safeLiveMarker = L.marker(current).addTo(safeMap);
      } else if (safeLiveMarker) {
        safeLiveMarker.setLatLng(current);
      }
      safeLastPosition = current;
      updateSafetyMeta(lat, lng);
    },
    err => {
      console.error("Safe route tracking error", err);
    },
    { enableHighAccuracy: true }
  );
}

function openSafeRouteModal() {
  document.getElementById("safeRouteModal").style.display = "flex";
}

function closeSafeRouteModal() {
  document.getElementById("safeRouteModal").style.display = "none";
}

function useCurrentLocationForSafeRoute() {
  const btn = document.getElementById("useMyLocBtn");
  const input = document.getElementById("safeStartInput");

  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }

  // Use cached position if we already have it (instant)
  if (safeLastPosition && safeLastPosition.length === 2) {
    const [lat, lng] = safeLastPosition;
    input.value = `${lat.toFixed(6)},${lng.toFixed(6)}`;
    return;
  }

  btn.textContent = "Fetching…";
  btn.disabled = true;

  const opts = {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 60000
  };

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      input.value = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      btn.textContent = "Use My Location";
      btn.disabled = false;
    },
    err => {
      btn.textContent = "Use My Location";
      btn.disabled = false;
      alert("Could not get location. " + (err.message || "Check permissions."));
    },
    opts
  );
}

async function geocodePlace(place) {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      place
    )}&limit=1`
  );
  const data = await res.json();
  if (!data.length) throw new Error("Location not found");
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon)
  };
}

async function submitSafeRoute() {
  const startLocation = document.getElementById("safeStartInput").value.trim();
  const destLocation = document.getElementById("safeDestInput").value.trim();
  if (!startLocation || !destLocation) {
    alert("Enter start and destination");
    return;
  }

  try {
    let startLat, startLng;
    if (startLocation.includes(",")) {
      const parts = startLocation.split(",");
      startLat = parseFloat(parts[0]);
      startLng = parseFloat(parts[1]);
    } else {
      const start = await geocodePlace(startLocation);
      startLat = start.lat;
      startLng = start.lng;
    }
    const end = await geocodePlace(destLocation);
    await requestSafestRoute(startLat, startLng, end.lat, end.lng);
    closeSafeRouteModal();
  } catch (err) {
    console.error("Safest route error", err);
    alert("Failed to find safest route: " + err.message);
  }
}

async function requestSafestRoute(startLat, startLng, endLat, endLng) {
  try {
    const res = await fetch(`${SAFE_BACKEND_URL}/api/safest-route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start: { lat: startLat, lng: startLng },
        end: { lat: endLat, lng: endLng }
      })
    });
    if (!res.ok) {
      throw new Error("Backend error");
    }
    const data = await res.json();

    if (!data.route || !Array.isArray(data.route)) {
      throw new Error("Invalid route response");
    }

    const coords = data.route.map(p => [p.lat, p.lng]);

    if (safeRouteLayer && Array.isArray(safeRouteLayer)) {
      safeRouteLayer.forEach(l => safeMap.removeLayer(l));
    } else if (safeRouteLayer) {
      safeMap.removeLayer(safeRouteLayer);
    }
    safeRouteLayer = [];

    const segScores = data.segment_scores || data.route.map(p => ({ ...p, score: 50 }));
    const n = segScores.length;
    const rLen = coords.length;

    const allScores = segScores.map(s => typeof s.score === "number" ? s.score : 50);
    const sorted = [...allScores].sort((a, b) => a - b);
    const p33 = sorted[Math.floor(sorted.length * 0.33)] ?? 50;
    const p67 = sorted[Math.floor(sorted.length * 0.67)] ?? 70;
    const hasVariation = p33 < p67 - 1;

    function scoreToColor(score, segIndex) {
      const s = typeof score === "number" ? score : 50;
      if (hasVariation) {
        if (s <= p33) return "#ef4444";
        if (s < p67) return "#22c55e";
        return "#2563eb";
      }
      const tier = n > 0 ? Math.floor((segIndex / n) * 3) : 0;
      return ["#ef4444", "#22c55e", "#2563eb"][Math.min(tier, 2)];
    }

    for (let i = 0; i < rLen - 1; i++) {
      const idx = n > 1 ? Math.min(Math.floor((i / Math.max(1, rLen - 1)) * n), n - 1) : 0;
      const score = segScores[idx]?.score ?? 50;
      const color = scoreToColor(score, idx);
      const seg = L.polyline([coords[i], coords[i + 1]], {
        color,
        weight: 6
      }).addTo(safeMap);
      safeRouteLayer.push(seg);
    }
    if (coords.length) {
      safeMap.fitBounds(L.polyline(coords).getBounds());
    }

    // We no longer show safety text in the search bar,
    // but keep these values available if you want to use them elsewhere.
  } catch (err) {
    console.error("Safest route request error", err);
    alert("Could not fetch safest route");
  }
}

async function loadSafetyHeat() {
  if (!safeMap) return;
  const bounds = safeMap.getBounds();
  const params = new URLSearchParams({
    minLat: bounds.getSouth().toString(),
    maxLat: bounds.getNorth().toString(),
    minLng: bounds.getWest().toString(),
    maxLng: bounds.getEast().toString()
  });
  try {
    const res = await fetch(`${SAFE_BACKEND_URL}/api/safety-grid?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data.points)) return;

    safeHeatLayerPoints.forEach(c => safeMap.removeLayer(c));
    safeHeatLayerPoints = [];

    data.points.forEach(p => {
      const color = safetyToColor(p.score);
      const circle = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.4,
        weight: 0
      }).addTo(safeMap);
      safeHeatLayerPoints.push(circle);
    });
  } catch (err) {
    console.error("Safety heat error", err);
  }
}

function safetyToColor(score) {
  const s = typeof score === "number" ? score : 0;
  if (s < 25) return "#ef4444";
  if (s < 50) return "#facc15";
  if (s < 75) return "#3b82f6";
  return "#22c55e";
}

async function updateSafetyMeta(lat, lng) {
  try {
    const res = await fetch(
      `${SAFE_BACKEND_URL}/api/safety-point?lat=${lat}&lng=${lng}`
    );
    if (!res.ok) return;
    const data = await res.json();
    const score = data.score != null ? Math.round(data.score) : null;
    const el = document.getElementById("safetyScoreValue");
    const badge = document.getElementById("safetyScoreBadge");
    if (el && score != null) {
      el.textContent = score + "%";
      badge.className = "safety-score-badge safety-" + getSafetyTier(score);
    } else if (el) {
      el.textContent = "—";
      badge.className = "safety-score-badge";
    }
  } catch (err) {
    console.error("Safety meta error", err);
  }
}

function getSafetyTier(score) {
  if (score < 25) return "unsafe";
  if (score < 50) return "moderate";
  if (score < 75) return "safe";
  return "very-safe";
}

function goToEmergencyContacts() {
  window.location.href = "contacts.html";
}

async function shareLiveLocation() {
  if (!safeLastPosition) {
    alert("Waiting for your location...");
    return;
  }
  const [lat, lng] = safeLastPosition;
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  const text = `My live location (ProTego): ${url}`;

  if (navigator.share) {
    try {
      await navigator.share({ text, url });
    } catch (err) {
      console.error("Share cancelled", err);
    }
  } else {
    navigator.clipboard
      .writeText(text)
      .then(() => alert("Location copied. Share it in your apps."));
  }
}

function handleSOSClick() {
  if (sosTimerId) {
    return;
  }
  sosCountdown = 10;
  document.getElementById("sosCountdownText").textContent =
    "SOS will be sent in 10 seconds.";
  document.getElementById("sosOverlay").style.display = "flex";

  sosTimerId = setInterval(() => {
    sosCountdown -= 1;
    if (sosCountdown <= 0) {
      clearInterval(sosTimerId);
      sosTimerId = null;
      document.getElementById("sosOverlay").style.display = "none";
      sendSafetySOS();
      startCameraSOS();
    } else {
      document.getElementById(
        "sosCountdownText"
      ).textContent = `SOS will be sent in ${sosCountdown} seconds.`;
    }
  }, 1000);
}

function cancelSOS() {
  if (sosTimerId) {
    clearInterval(sosTimerId);
    sosTimerId = null;
  }
  document.getElementById("sosOverlay").style.display = "none";
}

async function sendSafetySOS() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;
  if (!safeLastPosition) {
    alert("Location not available for SOS");
    return;
  }
  const [lat, lng] = safeLastPosition;
  try {
    await fetch(`${SAFE_BACKEND_URL}/api/emergency/sos-safety`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, lat, lng })
    });
    alert("Safety SOS triggered");
  } catch (err) {
    console.error("SOS error", err);
    alert("Failed to send SOS");
  }
}

async function startCameraSOS() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera not supported on this device");
      return;
    }
    if (!routeCameraStream) {
      routeCameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }
      });
      const tracks = routeCameraStream.getVideoTracks();
      if (tracks.length > 0) {
        routeCameraTrack = tracks[0];
      }
    }
    if (routeCameraCaptureIntervalId) return;
    routeCameraCaptureIntervalId = setInterval(captureAndUploadFrame, 5000);
    document.getElementById("cameraSosButton")?.classList?.add("active");
  } catch (err) {
    console.error("Camera SOS error", err);
    alert("Could not start camera SOS");
  }
}

function stopCameraSOS() {
  if (routeCameraCaptureIntervalId) {
    clearInterval(routeCameraCaptureIntervalId);
    routeCameraCaptureIntervalId = null;
  }
  if (routeCameraStream) {
    routeCameraStream.getTracks().forEach(t => t.stop());
    routeCameraStream = null;
    routeCameraTrack = null;
  }
  document.getElementById("cameraSosButton")?.classList?.remove("active");
}

function toggleCameraSOS() {
  if (routeCameraCaptureIntervalId) {
    stopCameraSOS();
  } else {
    startCameraSOS();
  }
}

async function captureAndUploadFrame() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;
  if (!routeCameraStream) return;
  const video = document.createElement("video");
  video.srcObject = routeCameraStream;
  await video.play();
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

  try {
    await fetch(`${SAFE_BACKEND_URL}/api/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        image_base64: dataUrl,
        lat: safeLastPosition ? safeLastPosition[0] : null,
        lng: safeLastPosition ? safeLastPosition[1] : null,
        accuracy: null,
        type: "SOS",
        timestamp: Math.floor(Date.now() / 1000)
      })
    });
  } catch (err) {
    console.error("Upload frame error", err);
  }
}

