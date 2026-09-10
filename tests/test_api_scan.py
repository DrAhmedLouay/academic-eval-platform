import unittest
import io
from fastapi.testclient import TestClient
from app import app

class TestApiScan(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_scan_evidence_flow(self):
        sample_text = "جمهورية العراق\nوزارة التعليم العالي والبحث العلمي\nأمر وزاري ذي العدد 9988 في 15/04/2025\nنظراً للجهود المتميزة، تقرر توجيه كتاب شكر وتقدير للأستاذ الدكتور تقديراً لعطائه العلمي."
        file_bytes = io.BytesIO(sample_text.encode('utf-8'))
        
        response = self.client.post(
            "/api/scan-evidence",
            data={
                "target_axis": "axis3",
                "target_paragraph": "3",
                "counter": "1"
            },
            files={"file": ("thank_you_doc.txt", file_bytes, "text/plain")}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        ev = data.get("indexed_evidence", {})
        self.assertEqual(ev.get("ref_code"), "REF-AX3-P3-01")
        self.assertIn("شكر وتقدير", ev.get("doc_type"))
        self.assertEqual(ev.get("suggested_score"), 20.0)

    def test_batch_scan_evidence_flow(self):
        doc1 = io.BytesIO("أمر وزاري شكر وتقدير عدد 101 تاريخ 2025/01/01".encode('utf-8'))
        doc2 = io.BytesIO("أمر إداري تشكيل لجنة امتحانية عدد 202 تاريخ 2025/02/02".encode('utf-8'))
        
        response = self.client.post(
            "/api/batch-scan-evidence",
            files=[
                ("files", ("shukr.txt", doc1, "text/plain")),
                ("files", ("committee.txt", doc2, "text/plain")),
            ]
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("count"), 2)
        ev_list = data.get("indexed_evidence_list", [])
        self.assertEqual(len(ev_list), 2)
        self.assertTrue(any(e["ref_code"].startswith("REF-AX3-P3") for e in ev_list))
        self.assertTrue(any(e["ref_code"].startswith("REF-AX3-P1") for e in ev_list))

if __name__ == "__main__":
    unittest.main()

