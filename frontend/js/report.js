// BACKEND_URL is defined globally in script.js
// Get user from session storage
let user;
try {
    const userStr = sessionStorage.getItem("user");
    if (!userStr) {
        alert("Please login first");
        window.location.href = "login.html";
    }
    user = JSON.parse(userStr);
} catch (error) {
    console.error("Error getting user:", error);
    alert("Please login first");
    window.location.href = "login.html";
}

// State for location selection
let selectedLocation = {
    label: "",
    lat: null,
    lng: null
};

// State for media
let selectedMedia = null;
let mediaPreview = null;

// Map variables
let map = null;
let marker = null;
let currentLocationMode = "current"; // "current" or "search"

// Default marker icon
const defaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
    // Location field click handler
    const locationInput = document.getElementById("rep-location");
    if (locationInput) {
        locationInput.addEventListener("click", (e) => {
            e.preventDefault();
            openLocationModal();
        });
        locationInput.addEventListener("focus", (e) => {
            e.preventDefault();
            openLocationModal();
        });
        locationInput.readOnly = true;
        locationInput.style.cursor = "pointer";
    }

    // Attach media button
    const attachBtn = document.getElementById("attachMedia");
    if (attachBtn) {
        attachBtn.addEventListener("click", openMediaPicker);
    }

    // Submit button
    const submitBtn = document.getElementById("submitReport");
    if (submitBtn) {
        submitBtn.addEventListener("click", submitReport);
    }

    // Description word count
    const descTextarea = document.getElementById("rep-desc");
    if (descTextarea) {
        descTextarea.addEventListener("input", updateWordCount);
        updateWordCount();
    }
});

// Open location modal
function openLocationModal() {
    console.log("Opening location modal...");
    const modal = document.getElementById("locationModal");
    if (!modal) {
        console.error("Location modal not found!");
        alert("Location modal not found. Please refresh the page.");
        return;
    }
    
    modal.classList.add("active");
    
    // Initialize map after a short delay to ensure modal is visible
    setTimeout(() => {
        const mapContainer = document.getElementById("mapContainer");
        if (!mapContainer) {
            console.error("Map container not found!");
            return;
        }
        
        if (!map) {
            console.log("Initializing map...");
            initMap();
        } else {
            // If map already exists, invalidate size to fix rendering
            try {
                map.invalidateSize();
                // Recenter map if we have a selected location
                if (selectedLocation.lat && selectedLocation.lng) {
                    map.setView([selectedLocation.lat, selectedLocation.lng], 15);
                }
            } catch (error) {
                console.error("Error invalidating map size:", error);
                // Reinitialize map if there's an error
                initMap();
            }
        }
    }, 300);
}

// Close location modal
function closeLocationModal() {
    const modal = document.getElementById("locationModal");
    if (modal) {
        modal.classList.remove("active");
    }
}

// Initialize map
function initMap() {
    const mapContainer = document.getElementById("mapContainer");
    if (!mapContainer) {
        console.error("Map container not found!");
        return;
    }
    
    // Default to current location or a default location
    const defaultLat = 12.9716; // Bangalore default
    const defaultLng = 77.5946;
    
    try {
        // Check if map already exists and remove it
        if (map) {
            map.remove();
            map = null;
        }
        
        map = L.map("mapContainer").setView([defaultLat, defaultLng], 13);
        
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap",
            maxZoom: 19
        }).addTo(map);
        
        // Invalidate size to ensure proper rendering
        setTimeout(() => {
            map.invalidateSize();
        }, 200);
        
        // Add click handler to map
        map.on("click", (e) => {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            
            // Remove existing marker
            if (marker) {
                map.removeLayer(marker);
            }
            
            // Add new marker
            marker = L.marker([lat, lng], {
                icon: defaultIcon
            }).addTo(map);
            
            selectedLocation.lat = lat;
            selectedLocation.lng = lng;
            
            // Reverse geocode to get address
            reverseGeocode(lat, lng);
            
            // Enable confirm button
            const confirmBtn = document.getElementById("confirmLocationBtn");
            if (confirmBtn) {
                confirmBtn.disabled = false;
            }
        });
        
        // Try to get current location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    map.setView([lat, lng], 15);
                    
                    // Add marker at current location
                    if (marker) {
                        map.removeLayer(marker);
                    }
                    marker = L.marker([lat, lng], {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                            iconSize: [25, 41],
                            iconAnchor: [12, 41],
                            popupAnchor: [1, -34]
                        })
                    }).addTo(map);
                    
                    selectedLocation.lat = lat;
                    selectedLocation.lng = lng;
                    
                    reverseGeocode(lat, lng);
                    const confirmBtn = document.getElementById("confirmLocationBtn");
                    if (confirmBtn) {
                        confirmBtn.disabled = false;
                    }
                },
                (err) => {
                    console.error("Geolocation error:", err);
                    // Map will still work, just won't center on user location
                }
            );
        }
    } catch (error) {
        console.error("Error initializing map:", error);
        alert("Failed to initialize map. Please refresh the page.");
    }
}

// Use current location
function useCurrentLocation() {
    if (!map) {
        alert("Map is not initialized. Please wait a moment and try again.");
        return;
    }
    
    currentLocationMode = "current";
    const searchInput = document.getElementById("searchLocationInput");
    const useCurrentBtn = document.getElementById("useCurrentLocationBtn");
    const searchBtn = document.getElementById("searchLocationBtn");
    
    if (searchInput) searchInput.style.display = "none";
    if (useCurrentBtn) useCurrentBtn.classList.add("active");
    if (searchBtn) searchBtn.classList.remove("active");
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                
                map.setView([lat, lng], 15);
                
                if (marker) {
                    map.removeLayer(marker);
                }
                marker = L.marker([lat, lng], {
                    icon: defaultIcon
                }).addTo(map);
                
                selectedLocation.lat = lat;
                selectedLocation.lng = lng;
                
                reverseGeocode(lat, lng);
                const confirmBtn = document.getElementById("confirmLocationBtn");
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                }
            },
            (err) => {
                console.error("Geolocation error:", err);
                alert("Unable to get your current location. Please select a location on the map.");
            }
        );
    } else {
        alert("Geolocation is not supported by your browser.");
    }
}

// Show search location
function showSearchLocation() {
    currentLocationMode = "search";
    const searchInput = document.getElementById("searchLocationInput");
    const useCurrentBtn = document.getElementById("useCurrentLocationBtn");
    const searchBtn = document.getElementById("searchLocationBtn");
    
    if (searchInput) {
        searchInput.style.display = "block";
        searchInput.focus();
        
        // Remove existing listeners and add new one
        const newSearchInput = searchInput.cloneNode(true);
        searchInput.parentNode.replaceChild(newSearchInput, searchInput);
        
        newSearchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                searchLocation(newSearchInput.value);
            }
        });
    }
    if (useCurrentBtn) useCurrentBtn.classList.remove("active");
    if (searchBtn) searchBtn.classList.add("active");
}

// Search for location
async function searchLocation(query) {
    if (!query.trim()) return;
    
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
        );
        const data = await res.json();
        
        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            
            map.setView([lat, lng], 15);
            
            if (marker) {
                map.removeLayer(marker);
            }
            marker = L.marker([lat, lng], {
                icon: L.icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                    iconSize: [25, 41],
                    iconAnchor: [12, 41]
                })
            }).addTo(map);
            
            selectedLocation.lat = lat;
            selectedLocation.lng = lng;
            selectedLocation.label = data[0].display_name;
            
            document.getElementById("addressText").textContent = data[0].display_name;
            document.getElementById("selectedAddress").style.display = "block";
            document.getElementById("confirmLocationBtn").disabled = false;
        } else {
            alert("Location not found. Please try a different search term.");
        }
    } catch (error) {
        console.error("Search error:", error);
        alert("Failed to search location. Please try again.");
    }
}

// Reverse geocode to get address
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const data = await res.json();
        
        if (data && data.display_name) {
            selectedLocation.label = data.display_name;
            document.getElementById("addressText").textContent = data.display_name;
            document.getElementById("selectedAddress").style.display = "block";
        } else {
            selectedLocation.label = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            document.getElementById("addressText").textContent = selectedLocation.label;
            document.getElementById("selectedAddress").style.display = "block";
        }
    } catch (error) {
        console.error("Reverse geocode error:", error);
        selectedLocation.label = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        document.getElementById("addressText").textContent = selectedLocation.label;
        document.getElementById("selectedAddress").style.display = "block";
    }
}

// Confirm location selection
function confirmLocation() {
    if (!selectedLocation.lat || !selectedLocation.lng) {
        alert("Please select a location on the map");
        return;
    }
    
    const locationInput = document.getElementById("rep-location");
    if (locationInput) {
        locationInput.value = selectedLocation.label;
    }
    closeLocationModal();
}

// Update word count
function updateWordCount() {
    const descTextarea = document.getElementById("rep-desc");
    const wordCountDiv = document.getElementById("wordCount");
    
    if (!descTextarea || !wordCountDiv) return;
    
    const text = descTextarea.value.trim();
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const wordCount = words.length;
    
    wordCountDiv.textContent = `${wordCount} words`;
    
    if (wordCount < 10 && text.length > 0) {
        wordCountDiv.classList.add("error");
        wordCountDiv.textContent = `${wordCount} words (minimum 10 words required)`;
    } else {
        wordCountDiv.classList.remove("error");
    }
}

// Open media picker
function openMediaPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            alert("File size must be less than 10MB");
            return;
        }
        
        selectedMedia = file;
        
        // Create preview
        const reader = new FileReader();
        reader.onload = (e) => {
            if (file.type.startsWith("image/")) {
                mediaPreview = e.target.result;
                showMediaPreview(mediaPreview, "image");
            } else if (file.type.startsWith("video/")) {
                mediaPreview = e.target.result;
                showMediaPreview(mediaPreview, "video");
            }
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// Show media preview
function showMediaPreview(src, type) {
    // Remove existing preview if any
    const existingPreview = document.getElementById("mediaPreview");
    if (existingPreview) {
        existingPreview.remove();
    }
    
    const previewDiv = document.createElement("div");
    previewDiv.id = "mediaPreview";
    previewDiv.style.cssText = "margin: 15px 0; padding: 10px; background: #f3f4f6; border-radius: 8px; position: relative;";
    
    if (type === "image") {
        const img = document.createElement("img");
        img.src = src;
        img.style.cssText = "max-width: 100%; max-height: 200px; border-radius: 6px; display: block;";
        previewDiv.appendChild(img);
    } else if (type === "video") {
        const video = document.createElement("video");
        video.src = src;
        video.controls = true;
        video.style.cssText = "max-width: 100%; max-height: 200px; border-radius: 6px; display: block;";
        previewDiv.appendChild(video);
    }
    
    // Add remove button
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "Remove";
    removeBtn.className = "ghost";
    removeBtn.style.cssText = "margin-top: 8px; padding: 6px 12px;";
    removeBtn.onclick = () => {
        selectedMedia = null;
        mediaPreview = null;
        previewDiv.remove();
    };
    previewDiv.appendChild(removeBtn);
    
    // Insert after description textarea
    const descTextarea = document.getElementById("rep-desc");
    descTextarea.parentNode.insertBefore(previewDiv, descTextarea.nextSibling);
}

// Submit report
async function submitReport() {
    const locationLabel = document.getElementById("rep-location").value.trim();
    const description = document.getElementById("rep-desc").value.trim();
    
    // Validate location
    if (!locationLabel || !selectedLocation.lat || !selectedLocation.lng) {
        alert("Please select a location from the map");
        return;
    }
    
    // Validate description - minimum 10 words
    const words = description.split(/\s+/).filter(word => word.length > 0);
    if (words.length < 10) {
        alert("Please describe what happened in at least 10 words");
        return;
    }
    
    if (!user || !user.id) {
        alert("Please login first");
        window.location.href = "login.html";
        return;
    }
    
    try {
        // Convert media to base64 if selected
        let imageBase64 = null;
        if (selectedMedia && mediaPreview) {
            imageBase64 = mediaPreview;
        }
        
        // Get timestamp
        const timestamp = Math.floor(Date.now() / 1000);
        
        const res = await fetch(`${BACKEND_URL}/api/reports`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_id: user.id,
                location_label: locationLabel,
                lat: selectedLocation.lat,
                lng: selectedLocation.lng,
                description: description,
                image_base64: imageBase64,
                timestamp: timestamp
            })
        });
        
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || "Failed to submit report");
        }
        
        const data = await res.json();
        
        // Show success message
        alert("Report submitted successfully!");
        
        // Clear form
        document.getElementById("rep-location").value = "";
        document.getElementById("rep-desc").value = "";
        selectedLocation = { label: "", lat: null, lng: null };
        selectedMedia = null;
        mediaPreview = null;
        updateWordCount();
        
        // Remove preview
        const preview = document.getElementById("mediaPreview");
        if (preview) {
            preview.remove();
        }
        
    } catch (error) {
        console.error("Error submitting report:", error);
        alert("Failed to submit report: " + error.message);
    }
}
