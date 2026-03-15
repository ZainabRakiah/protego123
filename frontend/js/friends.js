/* ProTego Friends Navigator - Navigate Together */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDQBpM6DFHWVcPyNPLjdSfrP3NAxc4FXu4",
  authDomain: "loc-live-track.firebaseapp.com",
  databaseURL: "https://loc-live-track-default-rtdb.firebaseio.com",
  projectId: "loc-live-track",
  storageBucket: "loc-live-track.firebasestorage.app",
  messagingSenderId: "1097169095550",
  appId: "1:1097169095550:web:34e63d85ee686cecc5012f",
};
const OSRM_API = "https://router.project-osrm.org/route/v1/driving";
const BASE_URL = window.location.origin + window.location.pathname.replace(/[^/]+$/, "");

let db = null;
let userId = null;
let currentTeam = null;
let isCreator = false;
let friendsMap = null;
let meetupMarker = null;
let friendsRouteLayer = null;
let memberMarkers = {};
let memberRouteLayers = {}; // memberId -> L.polyline
let memberEtaCache = {};   // memberId -> { distance, eta }
let memberJoinToastTimer = null;
let prevMembersData = {};
let broadcastMap = null;
let broadcastRoute = null;
let broadcastWatchId = null;
let myPosition = null;
let displayName = "";
let membersData = {};
let activeBroadcastRef = null;
let companionRequests = {};
let currentDestLat = null;
let currentDestLng = null;
let friendsMapViewStart = null; // fallback start for ETA before GPS
let myStartLat = null;
let myStartLng = null;

/* Friends Location Picker */
let friendsPickerMap = null;
let friendsPickerMarker = null;
let friendsPickerFieldId = null;
let friendsPickerCoords = null;
let friendsPickerAddress = "";
const friendsLocationData = {}; // { createStart, createDestination, joinStart, joinDestination } -> { lat, lng, address }

async function reverseGeocodeFriends(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    return data?.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

function openFriendsLocationPicker(fieldId) {
  friendsPickerFieldId = fieldId;
  friendsPickerCoords = null;
  friendsPickerAddress = "";
  document.getElementById("friendsLocationModal").style.display = "flex";
  document.getElementById("friendsPickerAddress").textContent = "Tap on the map to drop a pin";
  setTimeout(initFriendsPickerMap, 100);
}

function initFriendsPickerMap() {
  const container = document.getElementById("friendsPickerMap");
  if (!container) return;
  if (friendsPickerMap) {
    friendsPickerMap.remove();
    friendsPickerMap = null;
    friendsPickerMarker = null;
  }
  const defaultLat = 12.9716, defaultLng = 77.5946;
  friendsPickerMap = L.map("friendsPickerMap").setView([defaultLat, defaultLng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(friendsPickerMap);
  setTimeout(() => friendsPickerMap?.invalidateSize(), 200);

  friendsPickerMap.on("click", async (e) => {
    const lat = e.latlng.lat, lng = e.latlng.lng;
    if (friendsPickerMarker) friendsPickerMap.removeLayer(friendsPickerMarker);
    friendsPickerMarker = L.marker([lat, lng]).addTo(friendsPickerMap);
    friendsPickerCoords = { lat, lng };
    friendsPickerAddress = await reverseGeocodeFriends(lat, lng);
    document.getElementById("friendsPickerAddress").textContent = friendsPickerAddress;
  });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        friendsPickerMap.setView([lat, lng], 15);
        if (friendsPickerMarker) friendsPickerMap.removeLayer(friendsPickerMarker);
        friendsPickerMarker = L.marker([lat, lng]).addTo(friendsPickerMap);
        friendsPickerCoords = { lat, lng };
        reverseGeocodeFriends(lat, lng).then(addr => {
          friendsPickerAddress = addr;
          document.getElementById("friendsPickerAddress").textContent = addr;
        });
      },
      () => {}
    );
  }
}

function useCurrentInFriendsPicker() {
  if (!navigator.geolocation) return alert("Geolocation not supported");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      if (friendsPickerMap) {
        friendsPickerMap.setView([lat, lng], 15);
        if (friendsPickerMarker) friendsPickerMap.removeLayer(friendsPickerMarker);
        friendsPickerMarker = L.marker([lat, lng]).addTo(friendsPickerMap);
      }
      friendsPickerCoords = { lat, lng };
      friendsPickerAddress = await reverseGeocodeFriends(lat, lng);
      document.getElementById("friendsPickerAddress").textContent = friendsPickerAddress;
    },
    () => alert("Could not get location")
  );
}

function cancelFriendsLocationPicker() {
  document.getElementById("friendsLocationModal").style.display = "none";
  if (friendsPickerMap) {
    friendsPickerMap.remove();
    friendsPickerMap = null;
    friendsPickerMarker = null;
  }
  friendsPickerFieldId = null;
  friendsPickerCoords = null;
}

function saveFriendsLocationPicker() {
  if (!friendsPickerCoords || !friendsPickerFieldId) {
    alert("Select a location on the map first");
    return;
  }
  const input = document.getElementById(friendsPickerFieldId);
  if (input) {
    input.value = friendsPickerAddress;
    friendsLocationData[friendsPickerFieldId] = { ...friendsPickerCoords, address: friendsPickerAddress };
  }
  cancelFriendsLocationPicker();
}

function useCurrentForFriendsField(fieldId) {
  if (!navigator.geolocation) return alert("Geolocation not supported");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const address = await reverseGeocodeFriends(lat, lng);
      const input = document.getElementById(fieldId);
      if (input) {
        input.value = address;
        friendsLocationData[fieldId] = { lat, lng, address };
      }
    },
    () => alert("Could not get location")
  );
}

function getUser() {
  try {
    const u = JSON.parse(sessionStorage.getItem("user"));
    return u;
  } catch { return null; }
}

function ensureUserId() {
  const u = getUser();
  if (u && u.id) {
    userId = "protego_" + u.id;
    displayName = u.name || "User";
    return;
  }
  userId = "u_" + Math.random().toString(36).slice(2, 10);
  displayName = "User " + userId.slice(-4);
}

function initFirebase() {
  if (typeof firebase === "undefined") return false;
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    return true;
  } catch (e) {
    console.error("Firebase init error", e);
    return false;
  }
}

ensureUserId();
if (!initFirebase()) {
  console.warn("Firebase not loaded - some features may not work");
}

/* ========== Create Team ========== */
function openCreateTeamModal() {
  document.getElementById("createTeamModal").style.display = "flex";
  document.getElementById("createTeamName").value = "";
  document.getElementById("createUserName").value = displayName;
  document.getElementById("createStart").value = "";
  document.getElementById("createDestination").value = "";
  friendsLocationData.createStart = null;
  friendsLocationData.createDestination = null;
}

function closeCreateTeamModal() {
  document.getElementById("createTeamModal").style.display = "none";
}

async function geocode(place) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}&limit=1`);
  const data = await res.json();
  if (!data.length) throw new Error("Location not found");
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

async function submitCreateTeam() {
  const teamName = document.getElementById("createTeamName").value.trim();
  const userName = document.getElementById("createUserName").value.trim();
  const startText = document.getElementById("createStart").value.trim();
  const dest = document.getElementById("createDestination").value.trim();
  if (!teamName || !userName || !startText || !dest) {
    alert("Please fill Team Name, Your Name, Start Location and Destination");
    return;
  }
  let startLat, startLng, destLat, destLng;
  try {
    if (friendsLocationData.createStart) {
      startLat = friendsLocationData.createStart.lat;
      startLng = friendsLocationData.createStart.lng;
    } else {
      const s = await geocode(startText);
      startLat = s.lat;
      startLng = s.lng;
    }
    if (friendsLocationData.createDestination) {
      destLat = friendsLocationData.createDestination.lat;
      destLng = friendsLocationData.createDestination.lng;
    } else {
      const d = await geocode(dest);
      destLat = d.lat;
      destLng = d.lng;
    }
  } catch (e) {
    alert("Could not find location: " + e.message);
    return;
  }

  const teamId = "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const shareLink = `${window.location.origin}${window.location.pathname}?join=${teamId}`;

  if (db) {
    try {
      await db.ref(`teams/${teamId}`).set({
        name: teamName,
        creatorId: userId,
        destination: dest,
        destLat: destLat,
        destLng: destLng,
        startLat: startLat,
        startLng: startLng,
        createdAt: Date.now(),
      });
      await db.ref(`teams/${teamId}/members/${userId}`).set({
        id: userId,
        name: userName,
        lat: null,
        lng: null,
        startLat,
        startLng,
        ts: Date.now(),
      });
    } catch (e) {
      alert("Failed to create team: " + e.message);
      return;
    }
  }

  closeCreateTeamModal();
  document.getElementById("teamSuccessModal").style.display = "flex";
  document.getElementById("shareLinkBox").textContent = shareLink;
  window._pendingTeam = { teamId, teamName, userName, dest, destLat, destLng, startLat, startLng, shareLink };
}

function shareTeamLink() {
  const link = document.getElementById("shareLinkBox").textContent;
  if (navigator.share) {
    navigator.share({ title: "Join my team", text: "Join my navigation team", url: link });
  } else {
    navigator.clipboard.writeText(link);
    alert("Link copied to clipboard!");
  }
}

function closeSuccessAndGoToMap() {
  document.getElementById("teamSuccessModal").style.display = "none";
  const p = window._pendingTeam;
  if (p) {
    currentTeam = p.teamId;
    isCreator = true;
    showFriendsMapView(p.teamId, p.teamName, p.userName, p.dest, p.destLat, p.destLng, p.startLat, p.startLng);
    window._pendingTeam = null;
  }
}

/* ========== Join Team ========== */
function openJoinTeamModal() {
  document.getElementById("joinTeamModal").style.display = "flex";
  document.getElementById("joinTeamLink").value = "";
  document.getElementById("joinUserName").value = displayName;
  document.getElementById("joinStart").value = "";
  friendsLocationData.joinStart = null;
  const params = new URLSearchParams(window.location.search);
  const join = params.get("join");
  if (join) document.getElementById("joinTeamLink").value = window.location.href;
}

function closeJoinTeamModal() {
  document.getElementById("joinTeamModal").style.display = "none";
}

function extractTeamIdFromLink(link) {
  const trimmed = (link || "").trim();
  const m = trimmed.match(/[?&]join=([^&]+)/);
  if (m) return m[1];
  if (trimmed.startsWith("t_")) return trimmed;
  return trimmed;
}

async function submitJoinTeam() {
  const link = document.getElementById("joinTeamLink").value.trim();
  const userName = document.getElementById("joinUserName").value.trim();
  const startText = document.getElementById("joinStart").value.trim();
  if (!link || !userName || !startText) {
    alert("Please enter the link, your name, and your start location");
    return;
  }
  const teamId = extractTeamIdFromLink(link);
  if (!teamId) {
    alert("Invalid link. Paste the full link shared by the team creator.");
    return;
  }

  if (db) {
    try {
      const snap = await db.ref(`teams/${teamId}`).once("value");
      const team = snap.val();
      if (!team) {
        alert("Team not found. Check the link and try again.");
        return;
      }
      const destText = team.destination || "Destination";
      const destLat = team.destLat;
      const destLng = team.destLng;
      if (!destLat || !destLng) {
        alert("Team destination not set. Ask the creator to update the team.");
        return;
      }

      let startLat, startLng;
      try {
        if (friendsLocationData.joinStart) {
          startLat = friendsLocationData.joinStart.lat;
          startLng = friendsLocationData.joinStart.lng;
        } else {
          const s = await geocode(startText);
          startLat = s.lat;
          startLng = s.lng;
        }
      } catch (e) {
        alert("Could not find your start location: " + e.message);
        return;
      }

      await db.ref(`teams/${teamId}/members/${userId}`).set({
        id: userId,
        name: userName,
        lat: null,
        lng: null,
        startLat,
        startLng,
        ts: Date.now(),
      });
      currentTeam = teamId;
      isCreator = false;
      closeJoinTeamModal();
      showFriendsMapView(teamId, team.name, userName, destText, destLat, destLng, startLat, startLng);
    } catch (e) {
      alert("Failed to join: " + e.message);
    }
  } else {
    alert("Service unavailable. Please try again later.");
  }
}

/* ========== Friends Map View ========== */
function showFriendsMapView(teamId, teamName, userName, dest, destLat, destLng, startLat, startLng) {
  document.querySelector(".friends-main").style.display = "none";
  document.getElementById("friendsMapView").style.display = "flex";

  document.getElementById("panelTeamName").textContent = teamName;
  document.getElementById("panelUserName").textContent = userName;
  document.getElementById("panelDestination").textContent = dest;
  const panelActions = document.getElementById("panelActions");
  panelActions.style.display = isCreator ? "flex" : "none";
  const leaveBtn = document.getElementById("leaveTeamBtn");
  if (leaveBtn) leaveBtn.style.display = isCreator ? "none" : "block";

  const centerLat = startLat ?? destLat;
  const centerLng = startLng ?? destLng;

  if (!friendsMap) {
    friendsMap = L.map("friendsMap").setView([centerLat, centerLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(friendsMap);
  }
  friendsMap.setView([centerLat, centerLng], 14);
  setTimeout(function () {
    if (friendsMap) friendsMap.invalidateSize();
  }, 300);

  if (meetupMarker) friendsMap.removeLayer(meetupMarker);
  meetupMarker = L.marker([destLat, destLng], {
    icon: L.divIcon({
      className: "meetup-marker",
      html: '<div style="background:#2563eb;color:#fff;padding:4px 8px;border-radius:8px;font-weight:700;">Meet Here</div>',
      iconSize: [80, 30],
      iconAnchor: [40, 30],
    }),
  }).addTo(friendsMap).bindPopup(dest);

  if (friendsRouteLayer) {
    friendsMap.removeLayer(friendsRouteLayer);
    friendsRouteLayer = null;
  }
  Object.keys(memberRouteLayers).forEach(id => {
    friendsMap.removeLayer(memberRouteLayers[id]);
  });
  memberRouteLayers = {};

  currentDestLat = destLat;
  currentDestLng = destLng;
  myStartLat = startLat;
  myStartLng = startLng;
  friendsMapViewStart = (startLat != null && startLng != null) ? { lat: startLat, lng: startLng } : null;
  updateEtaDistance(destLat, destLng);
  startLocationForTeam();
  listenToMembers(teamId);
}

function updateEtaDistance(destLat, destLng) {
  const fromPos = myPosition || (friendsMapViewStart ? { lat: friendsMapViewStart.lat, lng: friendsMapViewStart.lng } : null);
  if (!fromPos) return;
  const from = `${fromPos.lng},${fromPos.lat}`;
  const to = `${destLng},${destLat}`;
  fetch(`${OSRM_API}/${from};${to}?overview=false`)
    .then(r => r.json())
    .then(data => {
      if (data.code === "Ok" && data.routes?.[0]) {
        const r = data.routes[0];
        const km = (r.distance / 1000).toFixed(1);
        const min = Math.round(r.duration / 60);
        document.getElementById("panelDistance").textContent = `Distance: ${km} km`;
        document.getElementById("panelEta").textContent = `ETA: ${min} min`;
      }
    })
    .catch(() => {});
}

function startLocationForTeam() {
  if (broadcastWatchId) navigator.geolocation.clearWatch(broadcastWatchId);
  if (!navigator.geolocation) return;
  broadcastWatchId = navigator.geolocation.watchPosition(
    pos => {
      myPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (currentTeam && db) {
        db.ref(`teams/${currentTeam}/members/${userId}`).update({
          lat: myPosition.lat,
          lng: myPosition.lng,
          ts: Date.now(),
        });
      }
      if (currentDestLat != null && currentDestLng != null) {
        updateEtaDistance(currentDestLat, currentDestLng);
      }
    },
    () => {},
    { enableHighAccuracy: true }
  );
}

function listenToMembers(teamId) {
  if (!db) return;
  db.ref(`teams/${teamId}/members`).on("value", snap => {
    const next = snap.val() || {};
    Object.keys(next).forEach(id => {
      if (id !== userId && !prevMembersData[id]) {
        const name = next[id]?.name || id;
        showJoinToast(`${name} has joined the team`);
      }
    });
    prevMembersData = { ...next };
    membersData = next;
    renderMembersList();
    renderMemberMarkers();
    renderMemberRoutes();
  });
}

function showJoinToast(message) {
  const el = document.getElementById("joinToast");
  if (!el) return;
  if (memberJoinToastTimer) clearTimeout(memberJoinToastTimer);
  el.textContent = message;
  el.style.display = "block";
  memberJoinToastTimer = setTimeout(() => {
    el.style.display = "none";
    memberJoinToastTimer = null;
  }, 5000);
}

function renderMembersList() {
  const el = document.getElementById("panelMembers");
  if (!el) return;
  el.innerHTML = "";
  const now = Date.now();
  Object.entries(membersData).forEach(([id, m]) => {
    if (!m) return;
    const online = m.ts && now - m.ts < 30000;
    const row = document.createElement("p");
    row.style.fontSize = "13px";
    row.textContent = `${m.name || id}${online ? " (Online)" : ""}`;
    if (id === userId) row.style.fontWeight = "600";
    el.appendChild(row);
  });
}

function renderMemberRoutes() {
  if (!friendsMap || currentDestLat == null || currentDestLng == null) return;
  const dest = `${currentDestLng},${currentDestLat}`;

  Object.keys(memberRouteLayers).forEach(id => {
    const mem = membersData[id];
    const hasStart = (mem && (mem.startLat != null || (id === userId && myStartLat != null)));
    if (!hasStart) {
      friendsMap.removeLayer(memberRouteLayers[id]);
      delete memberRouteLayers[id];
    }
  });
  const myHasStart = (membersData[userId] && (membersData[userId].startLat != null)) || (myStartLat != null && myStartLng != null);
  if (friendsRouteLayer && !myHasStart) {
    friendsMap.removeLayer(friendsRouteLayer);
    friendsRouteLayer = null;
  }

  Object.entries(membersData).forEach(([id, m]) => {
    if (!m) return;
    const isMe = id === userId;
    const startLat = (m.startLat != null ? m.startLat : (isMe ? myStartLat : null));
    const startLng = (m.startLng != null ? m.startLng : (isMe ? myStartLng : null));
    if (startLat == null || startLng == null) return;
    if (isMe && friendsRouteLayer) return;
    if (!isMe && memberRouteLayers[id]) return;

    const from = `${startLng},${startLat}`;
    fetch(`${OSRM_API}/${from};${dest}?overview=full&geometries=geojson`)
      .then(r => r.json())
      .then(data => {
        let coords;
        if (data.code === "Ok" && data.routes?.[0] && data.routes[0].geometry?.coordinates?.length) {
          coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        } else {
          coords = [[startLat, startLng], [currentDestLat, currentDestLng]];
        }
        const color = isMe ? "#2563eb" : "#22c55e";
        const layer = L.polyline(coords, { color, weight: isMe ? 6 : 5, opacity: 1 }).addTo(friendsMap);
        layer.bringToFront();

        if (isMe) {
          if (friendsRouteLayer) friendsMap.removeLayer(friendsRouteLayer);
          friendsRouteLayer = layer;
          friendsMap.fitBounds(layer.getBounds());
          const myName = m.name || displayName || userId;
          const updateMyTooltip = () => {
            const mm = membersData[userId] || m;
            const lat = myPosition?.lat ?? mm?.lat ?? mm?.startLat;
            const lng = myPosition?.lng ?? mm?.lng ?? mm?.startLng;
            const fromPos = `${lng},${lat}`;
            fetch(`${OSRM_API}/${fromPos};${dest}?overview=false`)
              .then(r => r.json())
              .then(d => {
                if (d.code === "Ok" && d.routes?.[0]) {
                  const km = (d.routes[0].distance / 1000).toFixed(1);
                  const min = Math.round(d.routes[0].duration / 60);
                  const tooltip = layer.getTooltip();
                  if (tooltip) tooltip.setContent(`${myName}<br>Distance: ${km} km<br>ETA: ${min} min`);
                }
              })
              .catch(() => {});
          };
          layer.bindTooltip(`${myName}<br>Loading distance & ETA...`, {
            permanent: false,
            direction: "top",
            className: "route-tooltip",
          });
          updateMyTooltip();
          layer.on("mouseover", updateMyTooltip);
        } else {
          memberRouteLayers[id] = layer;
          const name = m.name || id;
          const updateTooltip = () => {
            const mm = membersData[id];
            const lat = mm?.lat ?? mm?.startLat;
            const lng = mm?.lng ?? mm?.startLng;
            const fromPos = `${lng},${lat}`;
            fetch(`${OSRM_API}/${fromPos};${dest}?overview=false`)
              .then(r => r.json())
              .then(d => {
                if (d.code === "Ok" && d.routes?.[0]) {
                  const km = (d.routes[0].distance / 1000).toFixed(1);
                  const min = Math.round(d.routes[0].duration / 60);
                  memberEtaCache[id] = { distance: km, eta: min };
                  const tooltip = layer.getTooltip();
                  if (tooltip) tooltip.setContent(`${name}<br>Distance: ${km} km<br>ETA: ${min} min`);
                }
              })
              .catch(() => {});
          };
          layer.bindTooltip(`${name}<br>Loading distance & ETA...`, {
            permanent: false,
            direction: "top",
            className: "route-tooltip",
          });
          updateTooltip();
          layer.on("mouseover", updateTooltip);
        }
      })
      .catch(() => {
        const fallbackCoords = [[startLat, startLng], [currentDestLat, currentDestLng]];
        const fallbackColor = isMe ? "#2563eb" : "#22c55e";
        const fallbackLayer = L.polyline(fallbackCoords, { color: fallbackColor, weight: isMe ? 6 : 5, opacity: 1 }).addTo(friendsMap);
        fallbackLayer.bringToFront();
        if (isMe) {
          if (friendsRouteLayer) friendsMap.removeLayer(friendsRouteLayer);
          friendsRouteLayer = fallbackLayer;
          friendsMap.fitBounds(fallbackLayer.getBounds());
          fallbackLayer.bindTooltip((m.name || displayName || userId) + "<br>Distance & ETA (route from start to destination)", { permanent: false, direction: "top", className: "route-tooltip" });
        } else {
          memberRouteLayers[id] = fallbackLayer;
          fallbackLayer.bindTooltip((m.name || id) + "<br>Distance & ETA (hover to refresh)", { permanent: false, direction: "top", className: "route-tooltip" });
        }
      });
  });
}

function renderMemberMarkers() {
  if (!friendsMap) return;
  const now = Date.now();
  Object.entries(membersData).forEach(([id, m]) => {
    if (!m || !m.lat || !m.lng || (m.ts && now - m.ts > 30000)) {
      if (memberMarkers[id]) {
        friendsMap.removeLayer(memberMarkers[id]);
        delete memberMarkers[id];
      }
      return;
    }
    const isMe = id === userId;
    const color = isMe ? "#2563eb" : "#22c55e";
    if (!memberMarkers[id]) {
      memberMarkers[id] = L.circleMarker([m.lat, m.lng], {
        radius: 8,
        fillColor: color,
        color: "#fff",
        weight: 2,
        fillOpacity: 0.9,
      })
        .addTo(friendsMap)
        .bindPopup(m.name || id);
    } else {
      memberMarkers[id].setLatLng([m.lat, m.lng]);
    }
  });
  Object.keys(memberMarkers).forEach(id => {
    if (!membersData[id] || !membersData[id].lat) {
      friendsMap.removeLayer(memberMarkers[id]);
      delete memberMarkers[id];
    }
  });
}

function openShareTeamModal() {
  const link = `${window.location.origin}${window.location.pathname}?join=${currentTeam}`;
  document.getElementById("shareTeamLinkBox").textContent = link;
  document.getElementById("shareTeamModal").style.display = "flex";
}

function closeShareTeamModal() {
  document.getElementById("shareTeamModal").style.display = "none";
}

function copyAndShareTeamLink() {
  const link = document.getElementById("shareTeamLinkBox").textContent;
  navigator.clipboard.writeText(link);
  if (navigator.share) {
    navigator.share({ title: "Join my team", text: "Join my navigation team", url: link });
  }
  alert("Link copied!");
  closeShareTeamModal();
}

function confirmDeleteTeam() {
  if (!confirm("Are you sure you want to delete this team?")) return;
  deleteTeam();
}

function deleteTeam() {
  if (!currentTeam || !db) return;
  db.ref(`teams/${currentTeam}`).remove();
  if (db.ref(`teams/${currentTeam}/members`)) {
    db.ref(`teams/${currentTeam}/members/${userId}`).remove();
  }
  goBackToFriendsHome();
}

function leaveTeam() {
  if (!confirm("Leave this team?")) return;
  if (currentTeam && db) {
    db.ref(`teams/${currentTeam}/members/${userId}`).remove();
  }
  goBackToFriendsHome();
}

function goBackToFriendsHome() {
  if (broadcastWatchId) {
    navigator.geolocation.clearWatch(broadcastWatchId);
    broadcastWatchId = null;
  }
  if (currentTeam && db) {
    db.ref(`teams/${currentTeam}/members`).off();
  }
  document.getElementById("friendsMapView").style.display = "none";
  document.getElementById("broadcastMapView").style.display = "none";
  document.querySelector(".friends-main").style.display = "block";
  currentTeam = null;
  isCreator = false;
  membersData = {};
  if (friendsMap && meetupMarker) {
    try { friendsMap.removeLayer(meetupMarker); } catch (e) {}
    meetupMarker = null;
  }
  if (friendsRouteLayer && friendsMap) {
    try { friendsMap.removeLayer(friendsRouteLayer); } catch (e) {}
    friendsRouteLayer = null;
  }
  Object.values(memberRouteLayers).forEach(m => { try { friendsMap && friendsMap.removeLayer(m); } catch (e) {} });
  memberRouteLayers = {};
  Object.values(memberMarkers).forEach(m => { try { friendsMap && friendsMap.removeLayer(m); } catch (e) {} });
  memberMarkers = {};
  prevMembersData = {};
  if (memberJoinToastTimer) clearTimeout(memberJoinToastTimer);
  memberJoinToastTimer = null;
  window.location.href = "map.html";
}

/* ========== Find Companion ========== */
function openFindCompanionModal() {
  document.getElementById("findCompanionModal").style.display = "flex";
  document.getElementById("compStartInput").value = "";
  document.getElementById("compDestInput").value = "";
}

function closeFindCompanionModal() {
  document.getElementById("findCompanionModal").style.display = "none";
}

function useCurrentLocationForCompanion() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById("compStartInput").value = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
    },
    () => alert("Could not get location"),
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

async function startBroadcasting() {
  const startVal = document.getElementById("compStartInput").value.trim();
  const destVal = document.getElementById("compDestInput").value.trim();
  if (!startVal || !destVal) {
    alert("Enter start and destination");
    return;
  }
  let startLat, startLng, destLat, destLng;
  try {
    if (startVal.includes(",")) {
      const [a, b] = startVal.split(",").map(Number);
      startLat = a;
      startLng = b;
    } else {
      const s = await geocode(startVal);
      startLat = s.lat;
      startLng = s.lng;
    }
    const d = await geocode(destVal);
    destLat = d.lat;
    destLng = d.lng;
  } catch (e) {
    alert("Could not find location: " + e.message);
    return;
  }

  closeFindCompanionModal();

  document.querySelector(".friends-main").style.display = "none";
  document.getElementById("broadcastMapView").style.display = "flex";

  if (!broadcastMap) {
    broadcastMap = L.map("broadcastMap").setView([startLat, startLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(broadcastMap);
  }

  const from = `${startLng},${startLat}`;
  const to = `${destLng},${destLat}`;
  try {
    const res = await fetch(`${OSRM_API}/${from};${to}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.code === "Ok" && data.routes?.[0]) {
      const coords = data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
      if (broadcastRoute) broadcastMap.removeLayer(broadcastRoute);
      broadcastRoute = L.polyline(coords, { color: "#2563eb", weight: 5 }).addTo(broadcastMap);
      broadcastMap.fitBounds(broadcastRoute.getBounds());
      const km = (data.routes[0].distance / 1000).toFixed(1);
      const min = Math.round(data.routes[0].duration / 60);
      document.getElementById("broadcastDistance").textContent = `Distance: ${km} km`;
      document.getElementById("broadcastEta").textContent = `ETA: ${min} min`;
    }
  } catch (e) {
    console.error(e);
  }

  if (db) {
    const broadcastId = "b_" + userId + "_" + Date.now();
    activeBroadcastRef = db.ref(`broadcasts/${broadcastId}`);
    await activeBroadcastRef.set({
      userId,
      userName: displayName,
      startLat,
      startLng,
      destLat,
      destLng,
      ts: Date.now(),
    });
    activeBroadcastRef.onDisconnect().remove();
    pollForCompanions(broadcastId, startLat, startLng, destLat, destLng);
  }
}

function pollForCompanions(myId, myStartLat, myStartLng, myDestLat, myDestLng) {
  if (!db) return;
  db.ref("broadcasts").on("value", snap => {
    const all = snap.val() || {};
    Object.entries(all).forEach(([bid, b]) => {
      if (!b || b.userId === userId) return;
      const dx = Math.abs(b.destLat - myDestLat);
      const dy = Math.abs(b.destLng - myDestLng);
      const dist = Math.sqrt(dx * dx + dy * dy) * 111;
      if (dist < 5 && !companionRequests[bid]) {
        companionRequests[bid] = true;
        const pct = Math.round(70 + Math.random() * 25);
        document.getElementById("companionMatchTitle").textContent = "Travel Companion Found";
        document.getElementById("companionMatchText").textContent =
          `${b.userName || "Someone"} is travelling across a similar route, covering about ${pct}% of your journey. Do you want to join them?`;
        document.getElementById("companionMatchModal").style.display = "flex";
        window._pendingCompanion = { bid, b };
      }
    });
  });
}

function declineCompanion() {
  document.getElementById("companionMatchModal").style.display = "none";
  window._pendingCompanion = null;
  goBackToFriendsHome();
}

function acceptCompanionChat() {
  const p = window._pendingCompanion;
  document.getElementById("companionMatchModal").style.display = "none";
  if (p && Math.random() > 0.5) {
    alert("Sorry, your request was denied.");
  } else {
    alert("Chat with " + (p?.b?.userName || "companion") + " - (Chat UI coming soon)");
  }
  window._pendingCompanion = null;
}

function stopBroadcasting() {
  if (activeBroadcastRef) {
    activeBroadcastRef.remove();
    activeBroadcastRef = null;
  }
  if (broadcastRoute && broadcastMap) {
    broadcastMap.removeLayer(broadcastRoute);
    broadcastRoute = null;
  }
  goBackToFriendsHome();
}

/* Check for join link on load */
document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("join")) {
    openJoinTeamModal();
    document.getElementById("joinTeamLink").value = window.location.href;
  }
});
