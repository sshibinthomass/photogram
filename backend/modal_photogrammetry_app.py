import json
import shutil
import uuid
from pathlib import Path

import modal

from backend.photogrammetry_pipeline import (
    JobStatus,
    build_colmap_commands,
    build_paths,
    parse_scan_metadata,
    read_status,
    run_commands,
    write_status,
)

APP_NAME = "photogrammetry-colmap"
DATA_ROOT = Path("/data")
VOLUME_NAME = "photogrammetry-scans"

api_image = (
    modal.Image.debian_slim()
    .pip_install("fastapi[standard]", "python-multipart")
    .add_local_python_source("backend")
)
worker_image = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-runtime-ubuntu22.04", add_python="3.11")
    .apt_install("colmap")
    .pip_install("trimesh", "numpy")
    .add_local_python_source("backend")
)

app = modal.App(APP_NAME)
scan_volume = modal.Volume.from_name(VOLUME_NAME, create_if_missing=True)


def scan_dir(job_id: str) -> Path:
    return DATA_ROOT / "scans" / job_id


def status_path(job_id: str) -> Path:
    return scan_dir(job_id) / "status.json"


def response_from_status(job_id: str, status: JobStatus) -> dict:
    return {
        "jobId": job_id,
        "status": status.status,
        "progress": status.progress,
        "message": status.message,
        "modelUrl": f"/scans/{job_id}/model.glb" if status.status == "complete" else status.model_url,
    }


@app.function(image=worker_image, volumes={DATA_ROOT: scan_volume}, gpu=["L4", "A10G", "any"], timeout=3 * 60 * 60)
def run_reconstruction(job_id: str, use_gpu: bool = True) -> dict:
    paths = build_paths(scan_dir(job_id))
    paths.sparse_dir.mkdir(parents=True, exist_ok=True)
    paths.dense_dir.mkdir(parents=True, exist_ok=True)
    log_path = paths.workspace / "reconstruction.log"

    try:
        image_count = len(list(paths.image_dir.glob("*.jpg")))
        if image_count < 12:
            raise RuntimeError(f"Need at least 12 photos for reconstruction, received {image_count}.")

        commands = build_colmap_commands(paths, use_gpu=use_gpu)
        step_messages = [
            "Extracting SIFT features",
            "Matching overlapping photos",
            "Solving camera poses",
            "Undistorting images",
            "Running dense stereo",
            "Fusing dense point cloud",
            "Meshing point cloud",
            "Exporting GLB",
        ]

        for index, command in enumerate(commands):
            write_status(
                status_path(job_id),
                JobStatus(status="processing", progress=10 + index * 10, message=step_messages[index]),
            )
            scan_volume.commit()
            run_commands([command], log_path)

        if not paths.model_glb.exists():
            raise RuntimeError("COLMAP finished but model.glb was not created.")

        write_status(
            status_path(job_id),
            JobStatus(
                status="complete",
                progress=100,
                message="Photogrammetry reconstruction complete",
                model_url=f"/scans/{job_id}/model.glb",
            ),
        )
        scan_volume.commit()
        return {"jobId": job_id, "status": "complete"}
    except Exception as error:
        write_status(status_path(job_id), JobStatus(status="failed", progress=100, message=str(error)))
        scan_volume.commit()
        raise


@app.function(image=api_image, volumes={DATA_ROOT: scan_volume})
@modal.concurrent(max_inputs=20)
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse

    web_app = FastAPI(title="Photogrammetry COLMAP API")
    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @web_app.get("/health")
    def health():
        return {"status": "ok", "app": APP_NAME}

    @web_app.post("/scans")
    async def create_scan(metadata: str = Form("{}"), images: list[UploadFile] = File(...)):
        if len(images) < 12:
            raise HTTPException(status_code=400, detail="Upload at least 12 photos for photogrammetry.")

        job_id = f"scan-{uuid.uuid4().hex[:12]}"
        root = scan_dir(job_id)
        image_dir = root / "images"
        image_dir.mkdir(parents=True, exist_ok=True)

        try:
            parsed_metadata = parse_scan_metadata(metadata)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        (root / "metadata.json").write_text(json.dumps(parsed_metadata, indent=2), encoding="utf-8")

        for index, image in enumerate(images, start=1):
            if image.content_type not in {"image/jpeg", "image/jpg", "application/octet-stream"}:
                raise HTTPException(status_code=400, detail=f"Unsupported image type: {image.content_type}")
            target = image_dir / f"frame-{index:04d}.jpg"
            with target.open("wb") as handle:
                shutil.copyfileobj(image.file, handle)

        write_status(status_path(job_id), JobStatus(status="queued", progress=0, message="Queued on Modal"))
        scan_volume.commit()
        run_reconstruction.spawn(job_id)
        write_status(status_path(job_id), JobStatus(status="processing", progress=5, message="Started Modal worker"))
        scan_volume.commit()
        return response_from_status(job_id, read_status(status_path(job_id)))

    @web_app.get("/scans/{job_id}")
    def get_scan(job_id: str):
        scan_volume.reload()
        path = status_path(job_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Scan not found.")
        return response_from_status(job_id, read_status(path))

    @web_app.get("/scans/{job_id}/model.glb")
    def get_model(job_id: str):
        scan_volume.reload()
        model_path = scan_dir(job_id) / "model.glb"
        if not model_path.exists():
            raise HTTPException(status_code=404, detail="Model is not ready.")
        return FileResponse(model_path, media_type="model/gltf-binary", filename=f"{job_id}.glb")

    return web_app
