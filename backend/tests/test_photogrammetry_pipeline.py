import json
import tempfile
import unittest
from pathlib import Path

from backend.photogrammetry_pipeline import (
    JobStatus,
    PipelinePaths,
    build_colmap_commands,
    parse_scan_metadata,
    read_status,
    write_status,
)


class PhotogrammetryPipelineTests(unittest.TestCase):
    def test_builds_gpu_colmap_pipeline_commands(self):
        paths = PipelinePaths(
            workspace=Path("/work/scan-1"),
            image_dir=Path("/work/scan-1/images"),
            database=Path("/work/scan-1/database.db"),
            sparse_dir=Path("/work/scan-1/sparse"),
            dense_dir=Path("/work/scan-1/dense"),
            fused_ply=Path("/work/scan-1/dense/fused.ply"),
            mesh_ply=Path("/work/scan-1/dense/meshed-poisson.ply"),
            model_glb=Path("/work/scan-1/model.glb"),
        )

        commands = build_colmap_commands(paths, use_gpu=True)
        joined = [" ".join(command) for command in commands]

        self.assertIn("--SiftExtraction.use_gpu 1", joined[0])
        self.assertTrue(any(command[0:2] == ["colmap", "patch_match_stereo"] for command in commands))
        self.assertTrue(any(command[0] == "python" and "trimesh" in " ".join(command) for command in commands))

    def test_status_round_trip_uses_json_file(self):
        with tempfile.TemporaryDirectory() as directory:
            status_path = Path(directory) / "status.json"
            write_status(status_path, JobStatus(status="processing", progress=25, message="Matching photos"))

            payload = json.loads(status_path.read_text())
            self.assertEqual(payload["status"], "processing")
            self.assertEqual(read_status(status_path).message, "Matching photos")

    def test_parse_scan_metadata_requires_json_object(self):
        self.assertEqual(parse_scan_metadata('{"frameCount": 24}')["frameCount"], 24)

        with self.assertRaises(ValueError):
            parse_scan_metadata("{bad metadata")

        with self.assertRaises(ValueError):
            parse_scan_metadata("[1, 2, 3]")


if __name__ == "__main__":
    unittest.main()
