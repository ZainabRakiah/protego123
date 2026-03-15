const CAM_BACKEND_URL = typeof BACKEND_URL !== "undefined"
  ? BACKEND_URL
  : "http://127.0.0.1:5001";

let camStream = null;
let camTrack = null;
let torchOn = false;
let sosIntervalId = null;

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

function openCameraOverlay() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;
  const overlay = document.getElementById("cameraOverlay");
  if (overlay) {
    overlay.style.display = "flex";
  }
  startCamera();
}

function closeCameraOverlay() {
  const overlay = document.getElementById("cameraOverlay");
  if (overlay) {
    overlay.style.display = "none";
  }
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());
    camStream = null;
    camTrack = null;
    torchOn = false;
  }
}

async function openEvidenceVault() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;
  const pwd = document.getElementById("vaultPassword").value.trim();
  if (!pwd) {
    alert("Please enter your account password.");
    return;
  }
  try {
    const res = await fetch(`${CAM_BACKEND_URL}/safecam/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, password: pwd })
    });
    if (!res.ok) {
      alert("Incorrect password. Please try again.");
      return;
    }
    window.location.href = "evidence.html";
  } catch (err) {
    console.error("Vault login error", err);
    alert("Unable to verify password. Please try again.");
  }
}

async function startCamera() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert("Camera not supported on this device");
      return;
    }
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    const video = document.getElementById("safeCamVideo");
    video.srcObject = camStream;
    video.style.display = "block";
    await video.play();
    const tracks = camStream.getVideoTracks();
    if (tracks.length > 0) {
      camTrack = tracks[0];
    }
  } catch (err) {
    console.error("Start camera error", err);
    alert("Could not open camera.");
  }
}

async function toggleTorch() {
  if (!camTrack) {
    alert("Open the camera first.");
    return;
  }
  const capabilities = camTrack.getCapabilities
    ? camTrack.getCapabilities()
    : {};
  if (!("torch" in capabilities)) {
    alert("Torch not supported on this device.");
    return;
  }
  torchOn = !torchOn;
  try {
    await camTrack.applyConstraints({
      advanced: [{ torch: torchOn }]
    });
  } catch (err) {
    console.error("Torch error", err);
    alert("Unable to toggle torch.");
  }
}

async function capturePhoto() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;
  if (!camStream) {
    alert("Open the camera first.");
    return;
  }
  const video = document.getElementById("safeCamVideo");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

  // Optional: include location if available
  let lat = null;
  let lng = null;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      },
      () => {}
    );
  }

  try {
    await fetch(`${CAM_BACKEND_URL}/api/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        image_base64: dataUrl,
        lat,
        lng,
        accuracy: null,
        type: "NORMAL",
        timestamp: Math.floor(Date.now() / 1000)
      })
    });
    alert("Picture saved to evidence gallery.");
  } catch (err) {
    console.error("Upload error", err);
    alert("Could not upload picture.");
  }
}

function toggleSafeCamSOS() {
  const userId = getUserIdOrRedirect();
  if (!userId) return;

  const btn = document.querySelector(".sos-round");
  const turningOn = !sosIntervalId;

  if (turningOn) {
    // Start SOS: open camera overlay, enable torch if possible, capture every 5s
    openCameraOverlay();
    // Try to turn on torch after stream starts
    setTimeout(() => {
      toggleTorch();
    }, 500);
    sosIntervalId = setInterval(() => {
      capturePhoto();
    }, 5000);
    if (btn) btn.classList.add("active");
  } else {
    // Stop SOS
    clearInterval(sosIntervalId);
    sosIntervalId = null;
    if (btn) btn.classList.remove("active");
    closeCameraOverlay();
  }
}

