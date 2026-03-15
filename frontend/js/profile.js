// BACKEND_URL is provided by script.js

const user = JSON.parse(sessionStorage.getItem("user"));

/* USERNAME */

document.getElementById("username").innerText =
user.name || "User";


/* PHONE + ADDRESS */

document.getElementById("phoneText").innerText =
user.phone || "Not set";

document.getElementById("addressText").innerText =
user.address || "Not set";


/* AVATAR UPLOAD */

document.getElementById("avatarUpload").onchange = function(e){

const file = e.target.files[0];

if(!file) return;

document.getElementById("avatar").src =
URL.createObjectURL(file);

};


function uploadAvatar(){

document.getElementById("avatarUpload").click();

}


/* EDIT PROFILE */

function enableEdit(){

const username = document.getElementById("username").innerText;
const phone = document.getElementById("phoneText").innerText;
const address = document.getElementById("addressText").innerText;

/* convert text → input */
document.getElementById("username").outerHTML =
`<input id="usernameInput" value="${escapeHtmlAttr(username)}" style="font-size:1.4rem;font-weight:600;padding:8px;border:1px solid #d1d5db;border-radius:8px;width:100%;" />`;

document.getElementById("phoneText").outerHTML =
`<input id="phoneInput" value="${escapeHtmlAttr(phone)}" />`;

document.getElementById("addressText").outerHTML =
`<input id="addressInput" value="${escapeHtmlAttr(address)}" />`;


/* change button */

const btn = document.getElementById("editBtn");

btn.innerText = "Save";

btn.onclick = saveProfile;

}


/* SAVE PROFILE */

function escapeHtmlAttr(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function saveProfile(){

const username = document.getElementById("usernameInput")?.value?.trim() || "";
const phone = document.getElementById("phoneInput")?.value?.trim() || "";
const address = document.getElementById("addressInput")?.value?.trim() || "";

const user = JSON.parse(sessionStorage.getItem("user"))

try {
    const res = await fetch((typeof BACKEND_URL !== "undefined" ? BACKEND_URL : "http://127.0.0.1:5001") + "/api/update-profile",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            user_id: user.id,
            name: username,
            phone: phone,
            address: address
        })
    })

    if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update profile");
    }

    const data = await res.json()

    // Update sessionStorage with new values
    user.name = username;
    user.phone = phone;
    user.address = address;
    sessionStorage.setItem("user", JSON.stringify(user));

    // Update UI
    document.getElementById("usernameInput").outerHTML =
        `<h2 id="username">${escapeHtmlAttr(username) || "User"}</h2>`;
    document.getElementById("phoneInput").outerHTML =
        `<span id="phoneText">${escapeHtmlAttr(phone) || "Not set"}</span>`;
    document.getElementById("addressInput").outerHTML =
        `<span id="addressText">${escapeHtmlAttr(address) || "Not set"}</span>`;

    // Reset button
    const btn = document.getElementById("editBtn");
    btn.innerText = "Edit Profile";
    btn.onclick = enableEdit;

    alert("Profile updated successfully");

} catch (error) {
    console.error("Error updating profile:", error);
    alert("Failed to update profile: " + error.message);
}

}