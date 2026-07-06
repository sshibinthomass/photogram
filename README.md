# Object Scan GLB

Android-focused web photogrammetry scanner for drawing a guide box around an object, walking one slow circle around it, sending the captured photo set to a Modal GPU worker, and downloading the reconstructed result as `.glb`.

Live app:

```text
https://sshibinthomass.github.io/photogram/
```

Modal API:

```text
https://sshibinthomass--photogrammetry-colmap-fastapi-app.modal.run
```

## What This Does

- Opens the Android rear camera in the browser.
- Lets you draw a guide box before scanning.
- Captures real full-frame JPEG photos while you move around the object.
- Rejects blurry frames and near-duplicate views before upload.
- Uploads the accepted photo set to Modal.
- Runs a GPU-backed COLMAP pipeline: SIFT features, matching, sparse reconstruction, dense stereo, fusion, meshing, and GLB export.
- Polls the job status and previews/downloads the generated `.glb`.

The guide box is not used as fake geometry. It is saved as scan metadata and helps the user keep the same object centered. The reconstruction comes from the captured photos.

## Architecture

```text
Android Chrome camera
  -> React capture UI
  -> multipart photo upload
  -> Modal FastAPI endpoint
  -> Modal GPU worker with COLMAP
  -> Modal Volume model.glb
  -> browser preview/download
```

The backend lives in `backend/modal_photogrammetry_app.py`. Shared command/status helpers live in `backend/photogrammetry_pipeline.py`.

## Run Locally

Install frontend dependencies:

```powershell
npm install
```

Run the web app:

```powershell
npm run dev -- --port 5178 --strictPort
```

Open:

```text
http://localhost:5178
```

The scanner defaults to the deployed Modal URL. You can change it in the in-app API URL field if you deploy your own Modal app.

## Test On Samsung S25 Ultra

Android Chrome only allows camera access from a secure context. The most reliable local-device path is USB debugging plus `adb reverse`, because `http://localhost` on the phone is treated as trustworthy.

1. Enable Developer options and USB debugging on the S25 Ultra.
2. Connect the phone by USB.
3. Run the dev server:

```powershell
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

4. In another terminal:

```powershell
adb reverse tcp:5188 tcp:5188
```

5. Open this on the phone:

```text
http://localhost:5188
```

The GitHub Pages URL is HTTPS, so Android Chrome can request camera access there without the local certificate warning.

## Scan Tips

- Use a matte, textured object. Glossy, transparent, black, or plain objects reconstruct poorly.
- Put the object on a textured surface, not a blank table.
- Keep the whole object in frame and move slowly.
- Capture 50-80 accepted photos with 60-80% overlap.
- Use bright, steady lighting.
- Avoid moving the object, changing zoom, or changing focus during capture.

## Deploy Modal Backend

Install and authenticate Modal, then deploy:

```powershell
python -m modal setup
python -m modal deploy backend/modal_photogrammetry_app.py
```

Useful checks:

```powershell
curl.exe https://sshibinthomass--photogrammetry-colmap-fastapi-app.modal.run/health
python -m modal app logs photogrammetry-colmap --since 10m
```

The worker uses Modal GPU scheduling with `gpu=["L4", "A10G", "any"]`. COLMAP can run feature extraction and dense stereo on the GPU; CPU stages still happen inside the same worker.

## Deploy GitHub Pages

The workflow at `.github/workflows/deploy-pages.yml` runs tests and publishes `dist/` on every push to `main`.

Manual Pages build:

```powershell
$env:GITHUB_PAGES = "true"
npm run build
```

## Verification

```powershell
npm test
npm run build
python -m unittest discover backend/tests
```

Hosted API checks:

```powershell
curl.exe https://sshibinthomass--photogrammetry-colmap-fastapi-app.modal.run/health
```

Uploading fewer than 12 photos should return:

```text
400 Upload at least 12 photos for photogrammetry.
```
