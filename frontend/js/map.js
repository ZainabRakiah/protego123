let map;
let routeLayer = null;
let liveMarker = null;
let watchId = null;
let lastPosition = null;
let safetyPoints = [];
let selectionMarker = null;
let selectedLocation = null;
let isSelectionMode = false;
// BACKEND_URL is provided by script.js

// Check if in selection mode
const urlParams = new URLSearchParams(window.location.search);
isSelectionMode = urlParams.get("mode") === "select";

/* MAP INITIALIZATION*/
function clearRouteAndSearch() {
  const startEl = document.getElementById("startInput");
  const destEl = document.getElementById("destInput");
  if (startEl) startEl.value = "";
  if (destEl) destEl.value = "";
  if (routeLayer && map) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
}

function initMap(){
if(!navigator.geolocation){
alert("Geolocation not supported")
return
}
clearRouteAndSearch();
navigator.geolocation.getCurrentPosition(pos=>{
const lat = pos.coords.latitude
const lng = pos.coords.longitude
lastPosition = [lat, lng]
map = L.map("map").setView([lat,lng],16)
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
attribution:"© OpenStreetMap"
}).addTo(map)

if (isSelectionMode) {
  setupLocationSelection();
} else {
  liveMarker = L.marker([lat,lng],{icon:arrowIcon}).addTo(map)
  startLiveTracking();
  /* Do NOT clear route on moveend - it was removing the route when fitBounds ran after drawing */
}
  tryDrawRouteFromStorage();
})
}
initMap()

/*REQUEST LOCATION + LIVE TRACKING*/
if (navigator.geolocation) {
  startLiveTracking();
} else {
  alert("Geolocation not supported");
}
/* =====================================
 LIVE TRACKING
===================================== */
const arrowIcon = L.divIcon({
  className: "arrow-marker",
  html: "➤",
  iconSize: [32,32],
  iconAnchor: [16,16]
});
function startLiveTracking() {
  if (watchId) return;
  watchId = navigator.geolocation.watchPosition(
    pos => {
      const current = [
        pos.coords.latitude,
        pos.coords.longitude
      ];
      if (!liveMarker) {
        liveMarker = L.marker(current,{icon:arrowIcon}).addTo(map);
        map.setView(current,16);
      }
      else {
        liveMarker.setLatLng(current);


        if (lastPosition) {

          const angle = getBearing(lastPosition,current);

          liveMarker._icon.style.transform =
            `rotate(${angle}deg) translate(-50%,-50%)`;

        }

      }

      lastPosition = current;

    },

    err => {

      console.error("Tracking error",err);

      alert("Location tracking error");

    },

    {enableHighAccuracy:true}

  );

}


/* =====================================
 BEARING CALCULATION
===================================== */

function getBearing(from,to){

  const lat1 = from[0]*Math.PI/180;

  const lat2 = to[0]*Math.PI/180;

  const dLng = (to[1]-from[1])*Math.PI/180;

  const y = Math.sin(dLng)*Math.cos(lat2);

  const x =

  Math.cos(lat1)*Math.sin(lat2) -

  Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLng);

  return Math.atan2(y,x)*180/Math.PI;

}


/* =====================================
 SAFE ROUTE REQUEST
===================================== */

async function findSafeRoute(startLat, startLng, endLat, endLng) {
  const params = new URLSearchParams({
    start_lat: String(startLat),
    start_lng: String(startLng),
    end_lat: String(endLat),
    end_lng: String(endLng),
  });
  const url = `/api/osrm-route?${params.toString()}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 404) {
        alert("Route not found. The road network may not connect these points.");
        return;
      }
      alert(data.error || "Routing service error. Try again.");
      return;
    }
    if (!data.routes || !data.routes.length) {
      alert("Route not found.");
      return;
    }
    const geom = data.routes[0].geometry;
    if (!geom || !geom.coordinates || !geom.coordinates.length) {
      alert("Route not found.");
      return;
    }
    const route = geom.coordinates.map(c => [c[1], c[0]]);
    drawRouteOnMap(route);
    const legs = data.routes[0].legs;
    if (legs && legs[0] && legs[0].steps) {
      legs[0].steps.forEach(step => {
        if (step.maneuver && step.maneuver.instruction) {
          console.log(step.maneuver.instruction);
        }
      });
    }
  } catch (err) {
    console.error(err);
    alert("Routing service error. Check your connection or try again.");
  }
}

/*DRAW ROUTE ON MAP*/
function drawRouteOnMap(route){
  if(routeLayer){
    map.removeLayer(routeLayer);
  }
  routeLayer = L.polyline(route,{
    color:"#2563eb",
    weight:6
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds());
}


/* LOAD SAFETY POINTS (CSV) */
function parseCsv(text){
  const rows = text.trim().split("\n");
  const headers = rows[0].split(",");
  const typeIdx = headers.indexOf("type");
  const latIdx = headers.indexOf("lat");
  const lngIdx = headers.indexOf("lon") !== -1
    ? headers.indexOf("lon")
    : headers.indexOf("lng");
  return rows.slice(1)
    .map(r=>{
      const c = r.split(",");
      return{
        type:c[typeIdx],
        lat:parseFloat(c[latIdx]),
        lng:parseFloat(c[lngIdx])
      };
    })
    .filter(p=>!isNaN(p.lat)&&!isNaN(p.lng));
}
async function loadSafetyCSV(){
  let text;
  const candidates = [
    "../data/ProTego.csv",
    "ProTego.csv"
  ];
  for(const path of candidates){
    try{
      const res = await fetch(path);
      if(!res.ok) throw new Error();
      text = await res.text();
      break;
    }
    catch(e){}
  }

  if(!text){
    console.warn("Safety CSV not found");
    return;
  }
  safetyPoints = parseCsv(text);
  safetyPoints.forEach(p=>{
    const color = p.type==="police"
      ? "#1d4ed8"
      : "#facc15";
    const radius = p.type==="police"
      ? 6
      : 4;
    L.circleMarker([p.lat,p.lng],{
      radius,
      color,
      fillColor:color,
      fillOpacity:0.8
    }).addTo(map);
  });
}
loadSafetyCSV();
/* NAVIGATION FUNCTIONS (SEARCH BAR ICONS) */
function openSearchPage(){
document.getElementById("routeModal").style.display="flex"
}
function openSafeRoute(){
  window.location.href = "safe_route.html";
}
function openFriends(){
  window.location.href = "friends.html";
}
function openAccident(){
  window.location.href = "accident.html";
}
function closeRouteModal(){
document.getElementById("routeModal").style.display="none"
}
function openCameraPage(){
  window.location.href = "camera.html";
}
function useCurrentLocation() {
  const btn = document.getElementById("useMyLocBtn");
  const input = document.getElementById("startInput");
  if (!navigator.geolocation) {
    alert("Geolocation not supported");
    return;
  }
  // Use cached position if available (instant)
  if (lastPosition && lastPosition.length === 2) {
    input.value = lastPosition[0].toFixed(6) + "," + lastPosition[1].toFixed(6);
    return;
  }
  if (btn) { btn.textContent = "Fetching…"; btn.disabled = true; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      input.value = lat + "," + lng;
      if (btn) { btn.textContent = "Use My Location"; btn.disabled = false; }
    },
    err => {
      if (btn) { btn.textContent = "Use My Location"; btn.disabled = false; }
      alert("Could not get location. " + (err.message || "Check permissions."));
    },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
  );
}

async function geocode(place){
const res = await fetch(
`https://nominatim.openstreetmap.org/search?format=json&q=${place}`
)
const data = await res.json()
if(!data.length) throw new Error("Location not found")
return {
lat: parseFloat(data[0].lat),
lng: parseFloat(data[0].lon)
}
}

async function submitRoute(){
const startLocation = document.getElementById("startInput").value
const destLocation = document.getElementById("destInput").value
if(!startLocation || !destLocation){
alert("Enter start and destination")
return
}
try {
  const start = await geocode(startLocation)
  const end = await geocode(destLocation)
  findSafeRoute(start.lat,start.lng,end.lat,end.lng)
  closeRouteModal()
} catch (error) {
  console.error("Route error:", error);
  alert("Failed to find route: " + error.message);
}
}

/* =====================================
 LOCATION SELECTION MODE (FOR REPORT PAGE)
===================================== */
function setupLocationSelection() {
  const returnPage = urlParams.get("return") || "report";
  const isAccident = returnPage === "accident";

  const confirmBtnHtml = isAccident
    ? ""
    : `<button id="confirmSelectionBtn" style="margin-left: 8px; padding: 6px 12px; background: white; color: #2563eb; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;" disabled>Confirm</button>`;
  const reportAccidentBtnHtml = isAccident
    ? `<button id="reportAccidentBtn" style="margin-left: 8px; padding: 6px 12px; background: white; color: #2563eb; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;" disabled>Report Accident</button>`
    : "";

  const banner = document.createElement("div");
  banner.id = "selectionBanner";
  banner.style.cssText = "position: fixed; top: 60px; left: 50%; transform: translateX(-50%); background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; z-index: 1000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;";
  banner.innerHTML = `
    <span>Tap on the map to select a location</span>
    ${confirmBtnHtml}
    ${reportAccidentBtnHtml}
    <button id="cancelSelectionBtn" style="padding: 6px 12px; background: transparent; color: white; border: 1px solid white; border-radius: 4px; cursor: pointer;">Cancel</button>
  `;
  document.body.appendChild(banner);

  // Map click handler
  map.on("click", (e) => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    selectedLocation = { lat, lng };
    
    // Remove existing marker
    if (selectionMarker) {
      map.removeLayer(selectionMarker);
    }
    
    // Add new marker
    selectionMarker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41]
      })
    }).addTo(map);
    
    const confirmBtn = document.getElementById("confirmSelectionBtn");
    if (confirmBtn) confirmBtn.disabled = false;
    const reportBtn = document.getElementById("reportAccidentBtn");
    if (reportBtn) reportBtn.disabled = false;
    
    // Reverse geocode to get address
    reverseGeocode(lat, lng);
  });

  // Confirm button (report flow only)
  const confirmBtn = document.getElementById("confirmSelectionBtn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      if (selectedLocation) saveSelectedLocation();
    });
  }

  // Report Accident button (accident page only)
  const reportAccidentBtn = document.getElementById("reportAccidentBtn");
  if (reportAccidentBtn) {
    reportAccidentBtn.addEventListener("click", () => {
      if (!selectedLocation) return;
      reportAccidentFromMap(selectedLocation);
    });
  }

  // Cancel button
  document.getElementById("cancelSelectionBtn").addEventListener("click", () => {
    window.location.href = `${returnPage}.html`;
  });
}

// Reverse geocode to get address
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    if (data && data.display_name) {
      selectedLocation.label = data.display_name;
    } else {
      selectedLocation.label = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }
  } catch (error) {
    console.error("Reverse geocode error:", error);
    selectedLocation.label = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

const MAP_BACKEND_URL = typeof BACKEND_URL !== "undefined" ? BACKEND_URL : window.location.origin;

async function reportAccidentFromMap(loc) {
  try {
    const res = await fetch(`${MAP_BACKEND_URL}/api/emergency/accident-third-party`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: loc.lat, lng: loc.lng, label: loc.label })
    });
    if (!res.ok) throw new Error("Request failed");
    alert("Accident reported for the selected location.");
  } catch (err) {
    console.error("Report accident error", err);
    alert("Failed to report accident.");
  }
  window.location.href = "accident.html";
}

// Save selected location and return to report page
function saveSelectedLocation() {
  if (!selectedLocation) return;
  
  // Store in session storage
  sessionStorage.setItem("selectedLocationLabel", selectedLocation.label || `${selectedLocation.lat}, ${selectedLocation.lng}`);
  sessionStorage.setItem("selectedLocationLat", selectedLocation.lat.toString());
  sessionStorage.setItem("selectedLocationLng", selectedLocation.lng.toString());
  
  // Return to report page
  const returnPage = urlParams.get("return") || "report";
  window.location.href = `${returnPage}.html?selected=true`;
}

/* ROUTE FROM SEARCH PAGE OR ACCIDENT (ROUTE TO HOSPITAL) – run after map is ready */
function tryDrawRouteFromStorage() {
  if (!map) return;
  const startLocation = localStorage.getItem("routeStart");
  const destLocation = localStorage.getItem("routeDest");
  const destLatStr = localStorage.getItem("routeDestLat");
  const destLngStr = localStorage.getItem("routeDestLng");

  if (!startLocation || (!destLocation && !(destLatStr && destLngStr))) return;

  const startParts = startLocation.split(",");
  const startLat = parseFloat(startParts[0]);
  const startLng = parseFloat(startParts[1]);
  if (isNaN(startLat) || isNaN(startLng)) return;

  const endLat = destLatStr ? parseFloat(destLatStr) : NaN;
  const endLng = destLngStr ? parseFloat(destLngStr) : NaN;
  const hasDestCoords = !isNaN(endLat) && !isNaN(endLng);

  if (hasDestCoords) {
    findSafeRoute(startLat, startLng, endLat, endLng);
    localStorage.removeItem("routeDestLat");
    localStorage.removeItem("routeDestLng");
  } else if (destLocation) {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destLocation)}&limit=1`)
      .then(res => res.json())
      .then(data => {
        if (!data || !data.length) {
          alert("Destination not found. Try a different address.");
          return;
        }
        const endLat = parseFloat(data[0].lat);
        const endLng = parseFloat(data[0].lon);
        findSafeRoute(startLat, startLng, endLat, endLng);
      })
      .catch(err => {
        console.error("Geocode error", err);
        alert("Could not find destination. Please try again.");
      });
  }
  localStorage.removeItem("routeStart");
  localStorage.removeItem("routeDest");
}

function openSafetyRoute() {
    window.location.href = "safe_route.html";
}

function openFriends() {
    window.location.href = "friends_navigator.html";
}

function openAccident() {
    window.location.href = "accident.html";
}

function openCamera() {
    window.location.href = "camera.html";
}