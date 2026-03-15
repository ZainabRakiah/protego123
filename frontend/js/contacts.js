// BACKEND_URL is provided by script.js

// Get user from session storage
let user;
try {
    const userStr = sessionStorage.getItem("user");
    if (!userStr) {
        alert("Please login first");
        window.location.href = "login.html";
        throw new Error("No user");
    }
    user = JSON.parse(userStr);
    if (!user || !user.id) {
        alert("Invalid user session. Please login again.");
        window.location.href = "login.html";
        throw new Error("Invalid user");
    }
} catch (error) {
    console.error("Error getting user:", error);
    if (error.message !== "No user" && error.message !== "Invalid user") {
        alert("Please login first");
        window.location.href = "login.html";
    }
}

// State management
let locationsData = [];
let editingLocationId = null;

// Popup state
let tempContacts = [];
let currentContactIndex = 0;
let currentLocationId = null;

// Load all locations with their contacts
async function loadLocationsWithContacts() {
    try {
        if (!user || !user.id) {
            console.error("User not available", user);
            return;
        }
        
        console.log(`Fetching contacts for user ID: ${user.id}`);
        const url = `${BACKEND_URL}/api/locations/${user.id}/with-contacts`;
        console.log(`Fetching from: ${url}`);
        
        const res = await fetch(url);
        console.log(`Response status: ${res.status}`);
        
        if (!res.ok) {
            const errorText = await res.text();
            console.error(`HTTP error! status: ${res.status}, response: ${errorText}`);
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        console.log(`Received data:`, data);
        locationsData = data;
        renderLocations();
    } catch (error) {
        console.error("Error loading contacts:", error);
        console.error("Error details:", error.message, error.stack);
        alert(`Failed to load contacts: ${error.message}\n\nPlease check:\n1. Server is running\n2. You are logged in\n3. Check browser console for details`);
    }
}

// Render all locations with contacts
function renderLocations() {
    const container = document.getElementById("locationsList");
    container.innerHTML = "";

    if (locationsData.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>Add addresses and emergency contacts for each.</p>
                <button class="btn primary" onclick="openAddContactModal(null)">+ Add Address & Contacts</button>
            </div>
        `;
        return;
    }

    locationsData.forEach(location => {
        const locationCard = document.createElement("div");
        locationCard.className = "location-card";
        
        const isEditing = editingLocationId === location.id;
        
        locationCard.innerHTML = `
            <div class="location-header">
                <h3>${location.label}</h3>
                <div class="location-actions">
                    <span class="icon-btn delete-icon" onclick="deleteLocation(${location.id})" title="Delete location">🗑</span>
                    <span class="icon-btn edit-icon" onclick="toggleEditLocation(${location.id})" title="Edit contacts">✏</span>
                </div>
            </div>
            <div class="contacts-list" id="contacts-${location.id}">
                ${renderContactsForLocation(location, isEditing)}
            </div>
            ${isEditing ? `
                <div class="edit-actions">
                    <button class="btn primary" onclick="saveLocationEdits(${location.id})">Save Changes</button>
                    <button class="btn ghost" onclick="cancelLocationEdits(${location.id})">Cancel</button>
                </div>
            ` : ''}
            <button class="add-contact-btn btn" onclick="openAddContactModal(${location.id}, '${location.label}')">
                + Add Contact
            </button>
        `;
        
        container.appendChild(locationCard);
    });

    // Always show "Add Address & Contacts" so user can add more anytime
    const addBtn = document.createElement("div");
    addBtn.className = "global-add-btn";
    addBtn.innerHTML = `
        <button class="btn primary" onclick="openAddContactModal(null)">+ Add Address & Contacts</button>
    `;
    container.appendChild(addBtn);
}

// Render contacts for a specific location
function renderContactsForLocation(location, isEditing) {
    if (location.contacts.length === 0) {
        return '<p class="no-contacts">No contacts yet</p>';
    }

    return location.contacts.map((contact, index) => {
        if (isEditing) {
            return `
                <div class="contact-row editing" data-contact-id="${contact.id}">
                    <span class="contact-number">${index + 1}.</span>
                    <input type="text" class="contact-name-input" value="${escapeHtml(contact.name)}" 
                           data-contact-id="${contact.id}" placeholder="Name">
                    <input type="tel" class="contact-phone-input" value="${escapeHtml(contact.phone || '')}" 
                           data-contact-id="${contact.id}" placeholder="Phone">
                </div>
            `;
        } else {
            return `
                <div class="contact-row">
                    <span class="contact-number">${index + 1}.</span>
                    <span class="contact-name">${escapeHtml(contact.name)}</span>
                    <span class="contact-separator">-</span>
                    <span class="contact-phone">${escapeHtml(contact.phone || 'N/A')}</span>
                </div>
            `;
        }
    }).join('');
}

// Toggle edit mode for a location
function toggleEditLocation(locationId) {
    // Cancel previous edits if any
    if (editingLocationId && editingLocationId !== locationId) {
        editingLocationId = null;
    }
    
    if (editingLocationId === locationId) {
        // If already editing, just cancel
        editingLocationId = null;
    } else {
        editingLocationId = locationId;
    }
    renderLocations();
}

// Save location edits
async function saveLocationEdits(locationId) {
    await saveAllLocationEdits(locationId);
    editingLocationId = null;
    renderLocations();
}

// Cancel location edits
function cancelLocationEdits(locationId) {
    editingLocationId = null;
    renderLocations();
}

// Save all edits in a location
async function saveAllLocationEdits(locationId) {
    const location = locationsData.find(l => l.id === locationId);
    if (!location) return;

    const nameInputs = document.querySelectorAll(`#contacts-${locationId} .contact-name-input`);
    const phoneInputs = document.querySelectorAll(`#contacts-${locationId} .contact-phone-input`);

    for (let i = 0; i < nameInputs.length; i++) {
        const contactId = parseInt(nameInputs[i].dataset.contactId);
        const name = nameInputs[i].value.trim();
        const phone = phoneInputs[i].value.trim();
        const contact = location.contacts.find(c => c.id === contactId);
        
        if (contact && (contact.name !== name || contact.phone !== phone)) {
            await updateContact(contactId, name, phone, contact.email || '');
        }
    }

    await loadLocationsWithContacts();
}


// Update contact via API
async function updateContact(contactId, name, phone, email) {
    try {
        await fetch(`${BACKEND_URL}/api/contacts/${contactId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: name,
                phone: phone,
                email: email
            })
        });
    } catch (error) {
        console.error("Error updating contact:", error);
        alert("Failed to update contact");
    }
}

// Delete location
async function deleteLocation(locationId) {
    if (!confirm("Delete this location and all its contacts?")) {
        return;
    }

    try {
        await fetch(`${BACKEND_URL}/api/locations/${locationId}`, {
            method: "DELETE"
        });
        await loadLocationsWithContacts();
    } catch (error) {
        console.error("Error deleting location:", error);
        alert("Failed to delete location");
    }
}

// Open add contact modal
function openAddContactModal(locationId, locationLabel) {
    currentLocationId = locationId;
    tempContacts = [];
    currentContactIndex = 0;

    const modal = document.getElementById("contactModal");
    const modalTitle = document.getElementById("modalTitle");
    const locationInput = document.getElementById("locationInput");
    const nameInput = document.getElementById("nameInput");
    const phoneInput = document.getElementById("phoneInput");
    const emailInput = document.getElementById("emailInput");

    if (locationId && locationLabel) {
        modalTitle.textContent = `Add Contact - ${locationLabel}`;
        locationInput.value = locationLabel;
        locationInput.readOnly = true;
    } else {
        modalTitle.textContent = "Add Address & Contacts";
        locationInput.value = "";
        locationInput.readOnly = false;
        locationInput.placeholder = "Address (e.g. Home, Office, College)";
    }

    nameInput.value = "";
    phoneInput.value = "";
    emailInput.value = "";

    updateModalUI();
    modal.style.display = "flex";
}

// Add another contact to temp array
function addAnotherContact() {
    const name = document.getElementById("nameInput").value.trim();
    const phone = document.getElementById("phoneInput").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const locationLabel = document.getElementById("locationInput").value.trim();

    if (!name) {
        alert("Name is required");
        return;
    }

    if (!currentLocationId && !locationLabel) {
        alert("Location is required");
        return;
    }

    // Add to temp contacts
    tempContacts.push({
        name: name,
        phone: phone,
        email: email,
        location_label: locationLabel
    });

    // Clear inputs
    document.getElementById("nameInput").value = "";
    document.getElementById("phoneInput").value = "";
    document.getElementById("emailInput").value = "";

    currentContactIndex = tempContacts.length;
    updateModalUI();
}

// Navigate to previous contact
function prevContact() {
    if (currentContactIndex > 0) {
        currentContactIndex--;
        loadContactIntoForm(currentContactIndex);
        updateModalUI();
    }
}

// Navigate to next contact
function nextContact() {
    if (currentContactIndex < tempContacts.length - 1) {
        currentContactIndex++;
        loadContactIntoForm(currentContactIndex);
        updateModalUI();
    }
}

// Load contact data into form
function loadContactIntoForm(index) {
    const contact = tempContacts[index];
    document.getElementById("nameInput").value = contact.name || "";
    document.getElementById("phoneInput").value = contact.phone || "";
    document.getElementById("emailInput").value = contact.email || "";
}

// Update modal UI (arrows, counter, etc.)
function updateModalUI() {
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const counter = document.getElementById("contactCounter");
    const nameInput = document.getElementById("nameInput");
    const phoneInput = document.getElementById("phoneInput");
    const emailInput = document.getElementById("emailInput");

    // Show/hide navigation arrows
    if (tempContacts.length === 0) {
        prevBtn.style.display = "none";
        nextBtn.style.display = "none";
        counter.textContent = "";
    } else {
        prevBtn.style.display = currentContactIndex > 0 ? "inline-block" : "none";
        nextBtn.style.display = currentContactIndex < tempContacts.length - 1 ? "inline-block" : "none";
        counter.textContent = `${currentContactIndex + 1} / ${tempContacts.length}`;
        
        // Load current contact if viewing existing
        if (currentContactIndex < tempContacts.length) {
            loadContactIntoForm(currentContactIndex);
        } else {
            // Clear form for new contact
            nameInput.value = "";
            phoneInput.value = "";
            emailInput.value = "";
        }
    }
}

// Save all contacts
async function saveContacts() {
    if (tempContacts.length === 0) {
        // Save current form as single contact
        const name = document.getElementById("nameInput").value.trim();
        const phone = document.getElementById("phoneInput").value.trim();
        const email = document.getElementById("emailInput").value.trim();
        const locationLabel = document.getElementById("locationInput").value.trim();

        if (!name) {
            alert("Name is required");
            return;
        }

        if (!currentLocationId && !locationLabel) {
            alert("Location is required");
            return;
        }

        tempContacts = [{
            name: name,
            phone: phone,
            email: email,
            location_label: locationLabel
        }];
    }

    try {
        // If location doesn't exist, we need to create it first
        let locationId = currentLocationId;

        if (!locationId) {
            const locationLabel = tempContacts[0].location_label;
            if (!locationLabel) {
                alert("Location is required");
                return;
            }

        // Create new location
        const createRes = await fetch(`${BACKEND_URL}/api/locations`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                user_id: user.id,
                label: locationLabel,
                lat: null,
                lng: null
            })
        });

        if (!createRes.ok) {
            throw new Error("Failed to create location");
        }

        const createData = await createRes.json();
        locationId = createData.location_id;
        }

        if (!locationId) {
            throw new Error("Failed to get location ID");
        }

        // Save all contacts
        const contactsToSave = tempContacts.map(c => ({
            location_id: locationId,
            name: c.name,
            phone: c.phone || null,
            email: c.email || null
        }));

        for (const contact of contactsToSave) {
            await fetch(`${BACKEND_URL}/api/contacts`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(contact)
            });
        }

        cancelModal();
        await loadLocationsWithContacts();
    } catch (error) {
        console.error("Error saving contacts:", error);
        alert("Failed to save contacts");
    }
}

// Cancel modal
function cancelModal() {
    document.getElementById("contactModal").style.display = "none";
    tempContacts = [];
    currentContactIndex = 0;
    currentLocationId = null;
}

// Utility: Escape HTML
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (user && user.id) {
            loadLocationsWithContacts();
        }
    });
} else {
    // DOM is already ready
    if (user && user.id) {
        loadLocationsWithContacts();
    }
}
