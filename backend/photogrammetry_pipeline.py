from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class PipelinePaths:
    workspace: Path
    image_dir: Path
    database: Path
    sparse_dir: Path
    dense_dir: Path
    fused_ply: Path
    mesh_ply: Path
    model_glb: Path


@dataclass(frozen=True)
class JobStatus:
    status: str
    progress: int
    message: str
    model_url: str | None = None


def build_paths(scan_dir: Path) -> PipelinePaths:
    return PipelinePaths(
        workspace=scan_dir,
        image_dir=scan_dir / "images",
        database=scan_dir / "database.db",
        sparse_dir=scan_dir / "sparse",
        dense_dir=scan_dir / "dense",
        fused_ply=scan_dir / "dense" / "fused.ply",
        mesh_ply=scan_dir / "dense" / "meshed-poisson.ply",
        model_glb=scan_dir / "model.glb",
    )


def build_colmap_commands(paths: PipelinePaths, use_gpu: bool = True) -> list[list[str]]:
    gpu = "1" if use_gpu else "0"
    sparse_model = paths.sparse_dir / "0"
    glb_script = (
        "import trimesh, pathlib; "
        f"mesh = trimesh.load(r'{paths.mesh_ply}', process=False); "
        f"pathlib.Path(r'{paths.model_glb}').parent.mkdir(parents=True, exist_ok=True); "
        f"mesh.export(r'{paths.model_glb}')"
    )

    return [
        [
            "colmap",
            "feature_extractor",
            "--database_path",
            str(paths.database),
            "--image_path",
            str(paths.image_dir),
            "--ImageReader.single_camera",
            "1",
            "--SiftExtraction.use_gpu",
            gpu,
        ],
        [
            "colmap",
            "exhaustive_matcher",
            "--database_path",
            str(paths.database),
            "--SiftMatching.use_gpu",
            gpu,
        ],
        [
            "colmap",
            "mapper",
            "--database_path",
            str(paths.database),
            "--image_path",
            str(paths.image_dir),
            "--output_path",
            str(paths.sparse_dir),
        ],
        [
            "colmap",
            "image_undistorter",
            "--image_path",
            str(paths.image_dir),
            "--input_path",
            str(sparse_model),
            "--output_path",
            str(paths.dense_dir),
            "--output_type",
            "COLMAP",
            "--max_image_size",
            "1600",
        ],
        [
            "colmap",
            "patch_match_stereo",
            "--workspace_path",
            str(paths.dense_dir),
            "--workspace_format",
            "COLMAP",
            "--PatchMatchStereo.geom_consistency",
            "true",
            "--PatchMatchStereo.gpu_index",
            "0" if use_gpu else "-1",
        ],
        [
            "colmap",
            "stereo_fusion",
            "--workspace_path",
            str(paths.dense_dir),
            "--workspace_format",
            "COLMAP",
            "--input_type",
            "geometric",
            "--output_path",
            str(paths.fused_ply),
        ],
        [
            "colmap",
            "poisson_mesher",
            "--input_path",
            str(paths.fused_ply),
            "--output_path",
            str(paths.mesh_ply),
        ],
        ["python", "-c", glb_script],
    ]


def write_status(status_path: Path, status: JobStatus) -> None:
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(asdict(status), indent=2), encoding="utf-8")


def read_status(status_path: Path) -> JobStatus:
    payload = json.loads(status_path.read_text(encoding="utf-8"))
    return JobStatus(
        status=payload["status"],
        progress=int(payload.get("progress", 0)),
        message=payload.get("message", ""),
        model_url=payload.get("model_url"),
    )


def parse_scan_metadata(metadata: str) -> dict:
    try:
        payload = json.loads(metadata or "{}")
    except json.JSONDecodeError as error:
        raise ValueError("Metadata must be a valid JSON object.") from error

    if not isinstance(payload, dict):
        raise ValueError("Metadata must be a valid JSON object.")

    return payload


def run_commands(commands: list[list[str]], log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as log:
        for command in commands:
            log.write(f"$ {' '.join(command)}\n")
            log.flush()
            subprocess.run(command, check=True, stdout=log, stderr=subprocess.STDOUT)
