# Object Scan GLB

Android-focused browser scanner for drawing a bounding box around an object, walking one circle around it, watching a progressive 3D preview build, and exporting the result as `.glb`.

## What It Builds

This MVP runs fully in the browser:

- Opens the rear camera with `facingMode: environment`.
- Lets you draw a scan box before capture.
- Captures one object slice every 620 ms while you walk around the object.
- Builds a colored Three.js mesh progressively on screen.
- Closes the mesh after one full scan and downloads a binary `.glb`.

The reconstruction is a lightweight turntable/silhouette approximation, not COLMAP-grade photogrammetry. It is useful for proving the Android capture, scan UX, preview, and GLB export loop. A later backend can replace the local reconstruction with a real multi-view photogrammetry or GPU image-to-3D pipeline while keeping the same scan UI.

## Run Locally

```powershell
npm install
npm run dev -- --port 5178 --strictPort
```

Desktop browser:

```text
http://localhost:5178
```

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

Same-Wi-Fi HTTPS is also available:

```powershell
npm run dev:https -- --port 5443 --strictPort
```

Then open the Vite network URL, for example:

```text
https://192.168.0.196:5443
```

If Android Chrome refuses camera access because the local certificate is self-signed, use the `adb reverse` path above or deploy `dist/` to a trusted HTTPS host.

## GitHub Pages

The Pages workflow publishes the app at:

```text
https://sshibinthomass.github.io/photogram/
```

That URL is HTTPS, so Android Chrome can request camera access there without the local certificate warning.

## Scan Flow

1. Point the rear camera at the object.
2. Drag a box tightly around the object.
3. Tap **Start scan**.
4. Walk around the object once, keeping it inside the box.
5. Wait for `42/42`.
6. Tap **.glb** to download the model.

## Commands

```powershell
npm test
npm run build
npm run dev
npm run dev:https
```
