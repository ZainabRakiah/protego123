const ACC_BACKEND_URL = typeof BACKEND_URL !== "undefined"
  ? BACKEND_URL
  : window.location.origin;

let accidentSosTimerId = null;
let accidentCountdown = 10;

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

document.addEventListener("DOMContentLoaded", () => {
  getUserIdOrRedirect();
  loadNearbyHospitals();
  hydrateThirdPartyLocationFromStorage();
});

async function loadNearbyHospitals() {
  const list = document.getElementById("hospitalList");
  if (list) list.innerHTML = "<p class='muted'>Loading nearby hospitals…</p>";
  if (!navigator.geolocation) {
    if (list) list.innerHTML = "<p class='muted'>Location access is needed to find nearby hospitals.</p>";
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        const res = await fetch(
          `${ACC_BACKEND_URL}/api/hospitals-nearby?lat=${lat}&lng=${lng}`
        );
        const data = await res.json().catch(() => ({}));
        renderHospitals(data.hospitals || []);
      } catch (err) {
        console.error("Hospitals error", err);
        if (list) list.innerHTML = "<p class='muted'>Could not load hospitals. Check connection and try again.</p>";
      }
    },
    err => {
      console.error("Hospitals location error", err);
      if (list) list.innerHTML = "<p class='muted'>Allow location access to see nearest hospitals.</p>";
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

function renderHospitals(hospitals) {
  const list = document.getElementById("hospitalList");
  if (!list) return;
  list.innerHTML = "";
  if (!hospitals.length) {
    list.innerHTML = "<p class='muted'>No hospitals found nearby.</p>";
    return;
  }
  hospitals.slice(0, 3).forEach(h => {
    const div = document.createElement("div");
    div.className = "card small";
    const distanceText =
      typeof h.distance_km === "number"
        ? `${h.distance_km.toFixed(1)} km away`
        : "";
    const lat = typeof h.lat === "number" ? h.lat : "";
    const lng = typeof h.lng === "number" ? h.lng : "";
    div.innerHTML = `
      <h4>${(h.name || "Hospital").replace(/</g, "&lt;")}</h4>
      <p class="muted">${(h.address || "").replace(/</g, "&lt;")}</p>
      <p class="muted">${distanceText}</p>
      <button type="button" onclick="routeToHospital('${encodeURIComponent(
        h.address || ""
      )}', ${lat}, ${lng})">Get route</button>
    `;
    list.appendChild(div);
  });
}

function routeToHospital(addressEncoded, destLat, destLng) {
  const address = decodeURIComponent(addressEncoded || "");
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    localStorage.setItem("routeStart", `${lat},${lng}`);
    localStorage.setItem("routeDest", address);
    if (typeof destLat === "number" && typeof destLng === "number") {
      localStorage.setItem("routeDestLat", String(destLat));
      localStorage.setItem("routeDestLng", String(destLng));
    } else {
      localStorage.removeItem("routeDestLat");
      localStorage.removeItem("routeDestLng");
    }
    window.location.href = "map.html";
  });
}

function handleAccidentSOSClick() {
  if (accidentSosTimerId) return;
  accidentCountdown = 10;
  const overlay = document.getElementById("accidentSosOverlay");
  const text = document.getElementById("accidentSosCountdownText");
  if (overlay) overlay.style.display = "flex";
  if (text) text.textContent = "SOS will be sent in 10 seconds.";

  accidentSosTimerId = setInterval(() => {
    accidentCountdown -= 1;
    if (accidentCountdown <= 0) {
      clearInterval(accidentSosTimerId);
      accidentSosTimerId = null;
      if (overlay) overlay.style.display = "none";
      sendAccidentSOS();
    } else if (text) {
      text.textContent = `SOS will be sent in ${accidentCountdown} seconds.`;
    }
  }, 1000);
}

function cancelAccidentSOS() {
  if (accidentSosTimerId) {
    clearInterval(accidentSosTimerId);
    accidentSosTimerId = null;
  }
  const overlay = document.getElementById("accidentSosOverlay");
  if (overlay) overlay.style.display = "none";
}

async function sendAccidentSOS() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;
  if (!navigator.geolocation) {
    alert("Location not available");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      try {
        await fetch(`${ACC_BACKEND_URL}/api/emergency/sos-accident`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, lat, lng })
        });
        document.getElementById("accidentSosStatus").textContent =
          "Accident SOS sent to nearby hospitals, police and your emergency contacts.";
      } catch (err) {
        console.error("Accident SOS error", err);
        document.getElementById("accidentSosStatus").textContent =
          "Failed to send SOS. Please try again.";
      }
    },
    err => {
      console.error("Accident SOS location error", err);
      document.getElementById("accidentSosStatus").textContent =
        "Unable to get your location.";
    }
  );
}

function openAccidentLocationSelector() {
  window.location.href = "map.html?mode=select&return=accident";
}

function hydrateThirdPartyLocationFromStorage() {
  const label = sessionStorage.getItem("selectedLocationLabel");
  if (!label) return;
  const el = document.getElementById("thirdPartyLocationLabel");
  if (el) {
    el.textContent = `Location: ${label}`;
  }
}

async function reportThirdPartyAccident() {
  const latStr = sessionStorage.getItem("selectedLocationLat");
  const lngStr = sessionStorage.getItem("selectedLocationLng");
  const label = sessionStorage.getItem("selectedLocationLabel");
  if (!latStr || !lngStr) {
    alert("Please add a location first.");
    return;
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  try {
    await fetch(`${ACC_BACKEND_URL}/api/emergency/accident-third-party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, label })
    });
    alert("Accident reported for the selected location.");
  } catch (err) {
    console.error("Third party accident error", err);
    alert("Failed to report accident.");
  }
}

