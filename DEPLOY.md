# How to Deploy ProTego

ProTego has two deployable parts:

1. **Full app (backend + frontend)** – Flask API + SafeWalk UI (recommended for the main product).
2. **FriendsNavigator** – Static site only; see [FriendsNavigator/DEPLOY.md](FriendsNavigator/DEPLOY.md) for Netlify, Vercel, Firebase.

---

## Deploying the full ProTego app (backend + frontend)

The main app is a **Flask backend** that serves the **frontend** and uses the `frontend/`, `backend/`, and `safety_route/data1/` (or `safety_route/data/`) folders. It must run as a **Python web service** with the project root as the working directory.

### What the server needs

- **Working directory:** project root (parent of `backend/`).
- **Start command:** run the Flask app with Gunicorn (or `python backend/app.py` for local/dev).
- **Port:** read from the `PORT` environment variable (e.g. `5001` locally, set by the host in production).
- **Python:** 3.8+ with dependencies from `requirements.txt`.

### Option A: Render (recommended, free tier)

1. Push the repo to **GitHub**.
2. Go to [render.com](https://render.com) → **New** → **Web Service**.
3. Connect the GitHub repo and select it.
4. Configure:
   - **Environment:** Python 3.
   - **Build command:**  
     `pip install -r requirements.txt`
   - **Start command:**  
     `gunicorn --bind 0.0.0.0:$PORT backend.app:app`
   - **Root directory:** leave default (repo root).
5. Under **Environment**, add `PORT` if the UI doesn’t set it (Render usually sets it automatically).
6. Deploy. Your app will be at `https://<your-service>.onrender.com`.

**Note:** On the free tier the service may spin down when idle; the first request can be slow.

---

### Option B: Railway

1. Push the repo to **GitHub**.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub** and choose the repo.
3. Add a **Web Service** and set:
   - **Build command:**  
     `pip install -r requirements.txt`
   - **Start command:**  
     `gunicorn --bind 0.0.0.0:$PORT backend.app:app`
4. Railway sets `PORT` automatically. Deploy and use the generated URL.

---

### Option C: Fly.io

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/) and log in.
2. In the **project root** run:
   ```bash
   fly launch
   ```
   Follow the prompts (app name, region). Do **not** deploy yet when asked.
3. Ensure you have a `Dockerfile` in the project root (see “Dockerfile for Fly.io” below).
4. Run:
   ```bash
   fly deploy
   ```

---

### Option D: Google Cloud Run

1. In project root, build and push a container (see Dockerfile below), then create a Cloud Run service that runs:
   `gunicorn --bind 0.0.0.0:$PORT backend.app:app`
2. Set the service to listen on `PORT` (Cloud Run sets this automatically).

---

## Gunicorn start command (all platforms)

From the **project root**:

```bash
gunicorn --bind 0.0.0.0:$PORT backend.app:app
```

On Windows (e.g. local test):

```powershell
$env:PORT=5001; gunicorn --bind 0.0.0.0:5001 backend.app:app
```

---

## Optional: Dockerfile for cloud deployment

If your host uses Docker (e.g. Fly.io, Cloud Run), you can add a `Dockerfile` in the **project root**:

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ backend/
COPY frontend/ frontend/
COPY safety_route/ safety_route/

ENV PORT=8080
EXPOSE 8080

CMD gunicorn --bind 0.0.0.0:$PORT backend.app:app
```

Build and run locally (example):

```bash
docker build -t protego .
docker run -p 5001:8080 -e PORT=8080 protego
```

Then open `http://localhost:5001`.

---

## Checklist before deploy

- [ ] Repo includes `backend/`, `frontend/`, and at least one of `safety_route/data1/ProTego.csv` or `safety_route/data/ProTego.csv`.
- [ ] `requirements.txt` is at project root and includes `flask`, `gunicorn`, `flask-cors`, etc.
- [ ] Start command is run from **project root** and uses `backend.app:app` for Gunicorn.
- [ ] `PORT` is set by the platform or in the environment (no need to change code).

---

## Deploying only FriendsNavigator (static site)

If you only need the **FriendsNavigator** static app (no Flask backend):

- See **[FriendsNavigator/DEPLOY.md](FriendsNavigator/DEPLOY.md)** for:
  - Netlify (drag & drop or Git)
  - Vercel
  - Firebase Hosting
  - GitHub Pages

That app is HTML/CSS/JS only and does not use the ProTego backend.

---

## After deploying the full app

1. Open the deployed URL and check the SafeWalk UI and map.
2. Test the main API, e.g. `/api/health` or any route you use.
3. If you use Firebase (e.g. for FriendsNavigator), ensure Realtime Database rules are set as in `firebase-rules.json` (see FriendsNavigator docs).

If you tell me which platform you prefer (Render, Railway, Fly.io, or Docker), I can give step-by-step clicks for that one.
