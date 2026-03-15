function useCurrentLocation(){

navigator.geolocation.getCurrentPosition(pos=>{

const lat = pos.coords.latitude
const lng = pos.coords.longitude

document.getElementById("startInput").value =
lat + "," + lng

})

}


function submitRoute(){

const start =
document.getElementById("startInput").value

const dest =
document.getElementById("destInput").value

if(!start || !dest){

alert("Enter both locations")
return

}

localStorage.setItem("routeStart",start)
localStorage.setItem("routeDest",dest)

window.location.href = "map.html"

}