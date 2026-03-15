(function() {
  var hideOn = ["index.html", "login.html", "signup.html"];
  var path = window.location.pathname || "";
  var page = path.split("/").pop() || "index.html";
  if (hideOn.indexOf(page) !== -1) return;

  var bar = document.createElement("div");
  bar.className = "fab-bar";
  bar.innerHTML = [
    '<a href="safe_route.html" class="fab-item" title="SafeRoute"><img src="../assets/safe_route.png" alt=""><span>SafeRoute</span></a>',
    '<a href="friends.html" class="fab-item" title="NavBar"><img src="../assets/friends.png" alt=""><span>NavBar</span></a>',
    '<a href="accident.html" class="fab-item" title="QuickAid"><img src="../assets/accident.jpg" alt=""><span>QuickAid</span></a>',
    '<a href="camera.html" class="fab-item" title="SafeCam"><img src="../assets/camera.png" alt=""><span>SafeCam</span></a>'
  ].join("");

  document.body.appendChild(bar);
})();
