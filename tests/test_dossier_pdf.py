import unittest
import os
from fastapi.testclient import TestClient
from app import app

class TestDossierPdf(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_save_audit_status_api(self):
        res = self.client.post("/api/save-audit-status", json={
            "ref_code": "REF-AX1-P1-01",
            "status": "approved",
            "notes": "تم تدقيق الأمر الإداري ومطابقته رسمياً مع سجلات الكلية."
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("status"), "approved")

    def test_export_dossier_pdf_api(self):
        sample_form = {
            "personal_info": {
                "university": "جامعة بغداد",
                "college": "كلية الهندسة",
                "department": "الهندسة المدنية",
                "first_name": "أحمد",
                "father_name": "لؤي",
                "last_name": "أحمد",
                "academic_title": "أستاذ مساعد"
            },
            "axis1": {"courses_score": 20, "classroom_management_score": 20, "blended_learning_items": [5,5,5,5], "course_description_items": [4,4,4,4,4], "job_commitment_items": [4,4,4,4,4]},
            "axis2": {"global_research_score": 60, "local_research_score": 25, "supervision_score": 15},
            "axis3": {"committees_score": 30, "continuous_learning_score": 20, "thank_you_score": 20, "field_visits_score": 30},
            "axis4": {"items": {}},
            "axis5": {"penalties": []},
            "is_non_teaching": False
        }
        sample_attachments = [
            {
                "ref_code": "REF-AX1-P1-01",
                "axis": "axis1",
                "paragraph": "1",
                "doc_type": "أمر إداري بتكليف تدريسي",
                "doc_number": "ق/452",
                "date": "2025/10/12",
                "title": "تكليف بتدريس الهندسة الإنشائية",
                "suggested_score": 20.0,
                "audit_status": "approved"
            }
        ]
        sample_signatures = {
            "direct_manager_sig": "",
            "higher_manager_sig": "",
            "college_stamp": ""
        }

        res = self.client.post("/api/export-dossier-pdf", json={
            "form_data": sample_form,
            "attachments": sample_attachments,
            "signatures": sample_signatures
        })
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "application/pdf")
        self.assertGreater(len(res.content), 1000)

    def test_delete_evidence_isolation(self):
        cache_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "indexed_results_cache.json")
        backup_content = None
        if os.path.exists(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    backup_content = f.read()
            except Exception:
                backup_content = None

        try:
            # Sync test items
            test_items = [
                {"ref_code": "TEST-ISO-AX2-01", "axis": "axis2", "paragraph": "1", "title": "Paper 1"},
                {"ref_code": "TEST-ISO-AX2-02", "axis": "axis2", "paragraph": "2", "title": "Paper 2"},
                {"ref_code": "TEST-ISO-AX1-01", "axis": "axis1", "paragraph": "1", "title": "Course Doc"}
            ]
            sync_res = self.client.post("/api/sync-evidence-catalog", json={"indexed_evidence_list": test_items})
            self.assertEqual(sync_res.status_code, 200)

            # Delete only TEST-ISO-AX2-01
            del_res = self.client.delete("/api/delete-evidence/TEST-ISO-AX2-01")
            self.assertEqual(del_res.status_code, 200)

            # Verify catalog preserves TEST-ISO-AX2-02 and TEST-ISO-AX1-01
            cat_res = self.client.get("/api/evidence-catalog")
            current_list = cat_res.json().get("indexed_evidence_list", [])
            ref_codes = [i.get("ref_code") for i in current_list]
            self.assertNotIn("TEST-ISO-AX2-01", ref_codes)
            self.assertIn("TEST-ISO-AX2-02", ref_codes)
            self.assertIn("TEST-ISO-AX1-01", ref_codes)
        finally:
            if backup_content is not None:
                try:
                    with open(cache_file, "w", encoding="utf-8") as f:
                        f.write(backup_content)
                except Exception:
                    pass

if __name__ == "__main__":
    unittest.main()
