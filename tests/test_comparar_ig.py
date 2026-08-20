import os
import tempfile
import json
from unittest import mock
import unittest

from openpyxl import load_workbook

import comparar_ig
import auto_watcher


class AutoCsvTests(unittest.TestCase):
    def test_parse_current_filename(self):
        parsed = comparar_ig._parse_auto_csv_name(
            "ig_auto_perfil_demo_followers_20260819t120000-abc12_1770000000000.csv"
        )
        self.assertEqual(parsed["profile"], "perfil_demo")
        self.assertEqual(parsed["phase"], "followers")
        self.assertEqual(parsed["run_id"], "20260819t120000-abc12")

    def test_different_run_ids_are_never_paired(self):
        candidates = [
            {
                "path": "followers.csv",
                "profile": "demo",
                "phase": "followers",
                "run_id": "run-a",
                "ts": 1000,
            },
            {
                "path": "following.csv",
                "profile": "demo",
                "phase": "following",
                "run_id": "run-b",
                "ts": 1001,
            },
        ]
        self.assertIsNone(comparar_ig._select_best_auto_pair(candidates))

    def test_matching_run_id_is_paired(self):
        candidates = [
            {
                "path": "followers.csv",
                "profile": "demo",
                "phase": "followers",
                "run_id": "run-a",
                "ts": 1000,
            },
            {
                "path": "following.csv",
                "profile": "demo",
                "phase": "following",
                "run_id": "run-a",
                "ts": 1001,
            },
        ]
        pair = comparar_ig._select_best_auto_pair(candidates)
        self.assertEqual(pair["run_id"], "run-a")
        self.assertEqual(pair["followers_path"], "followers.csv")


class HistoryAndReportTests(unittest.TestCase):
    def test_corrupt_history_is_distinguishable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "history.json")
            with open(path, "w", encoding="utf-8") as stream:
                stream.write("{broken")
            self.assertEqual(comparar_ig.historial_estado(path), "corrupt")
            self.assertEqual(comparar_ig.historial_estado(path + ".missing"), "missing")
            with self.assertRaises((ValueError, json.JSONDecodeError)):
                comparar_ig.cargar_historial(path)

    def test_history_write_is_valid_and_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "history.json")
            comparar_ig.guardar_historial(path, {"Ana"}, {"@Beto"})
            self.assertEqual(comparar_ig.historial_estado(path), "valid")
            self.assertEqual(comparar_ig.cargar_historial_estricto(path), ({"ana"}, {"beto"}))
            self.assertFalse([name for name in os.listdir(directory) if name.endswith(".tmp")])

    def test_csv_normalizes_and_rejects_formula_values(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "users.csv")
            with open(path, "w", encoding="utf-8", newline="") as stream:
                stream.write("Usuario\n@Ana\n")
            self.assertEqual(comparar_ig.leer_csv_usuarios(path), {"ana"})
            with open(path, "w", encoding="utf-8", newline="") as stream:
                stream.write("=HYPERLINK(\"https://evil.example\")\n")
            with self.assertRaises(ValueError):
                comparar_ig.leer_csv_usuarios(path)

    def test_multiple_json_exports_are_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            for suffix, username in (("_1", "ana"), ("_2", "beto")):
                with open(os.path.join(directory, f"followers{suffix}.json"), "w", encoding="utf-8") as stream:
                    json.dump([{"string_list_data": [{"value": username}]}], stream)
            self.assertEqual(
                set().union(*(comparar_ig.parse_followers_json(path) for path in sorted(__import__("glob").glob(os.path.join(directory, "followers*.json"))))),
                {"ana", "beto"},
            )

            for suffix, username in (("_1", "carla"), ("_2", "diana")):
                with open(os.path.join(directory, f"following{suffix}.json"), "w", encoding="utf-8") as stream:
                    json.dump({"relationships_following": [{"string_list_data": [{"value": username}]}]}, stream)
            self.assertEqual(
                set().union(*(comparar_ig.parse_following_json(path) for path in sorted(__import__("glob").glob(os.path.join(directory, "following*.json"))))),
                {"carla", "diana"},
            )

    def test_accounts_use_distinct_local_history_keys(self):
        self.assertNotEqual(
            comparar_ig.historial_path("/tmp", "local::ana"),
            comparar_ig.historial_path("/tmp", "local::beto"),
        )

    def test_excel_failure_does_not_commit_history(self):
        with tempfile.TemporaryDirectory() as directory:
            followers = os.path.join(directory, "ig_auto_demo_followers_run-a_1000.csv")
            following = os.path.join(directory, "ig_auto_demo_following_run-a_1001.csv")
            for path, username in ((followers, "ana"), (following, "beto")):
                with open(path, "w", encoding="utf-8") as stream:
                    stream.write("username\n" + username + "\n")
            pair = comparar_ig._select_best_auto_pair([
                comparar_ig._parse_auto_csv_name(followers),
                comparar_ig._parse_auto_csv_name(following),
            ])
            with mock.patch.object(comparar_ig, "generar_excel", side_effect=OSError("locked")):
                with self.assertRaises(OSError):
                    auto_watcher._generate_excel_from_pair(directory, pair)
            profile_history = comparar_ig.historial_path(directory, "external_auto::demo")
            self.assertFalse(os.path.exists(profile_history))

    def test_changes_include_additions_and_removals(self):
        added, removed = comparar_ig.calcular_cambios(
            {"ana", "carla"}, {"ana", "beto"}, True
        )
        self.assertEqual(added, ["carla"])
        self.assertEqual(removed, ["beto"])

    def test_no_history_means_baseline(self):
        self.assertEqual(
            comparar_ig.calcular_cambios({"ana"}, set(), False), ([], [])
        )

    def test_large_drop_requires_confirmation(self):
        warning = comparar_ig.detectar_caida_sospechosa(
            {"ana"},
            {"ana"},
            {f"user{i}" for i in range(12)},
            {"ana"},
        )
        self.assertIn("mayor al 50%", warning)
        self.assertIsNone(
            comparar_ig.detectar_caida_sospechosa(
                {"ana", "beto"}, {"ana"}, {"ana"}, {"ana"}
            )
        )

    def test_generated_workbook_contains_change_columns(self):
        with tempfile.TemporaryDirectory() as directory:
            output = os.path.join(directory, "reporte.xlsx")
            comparar_ig.generar_excel(
                output,
                "Prueba",
                {"ana", "beto"},
                {"ana", "carla"},
                ["beto"],
                ["carla"],
                "2026-08-19 12:00:00",
                ["diego"],
                ["eva"],
            )
            workbook = load_workbook(output)
            sheet = workbook.active
            self.assertIn("Dejaron de Seguirte", sheet["L6"].value)
            self.assertIn("Dejaste de Seguir", sheet["N6"].value)
            self.assertEqual(sheet["P7"].value, "2026-08-19 12:00:00")


if __name__ == "__main__":
    unittest.main()
