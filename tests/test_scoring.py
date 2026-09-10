import unittest
from core.scoring_engine import calculate_evaluation, number_to_arabic_words

class TestScoringEngine(unittest.TestCase):
    def test_normal_calculation(self):
        sample_data = {
            "is_non_teaching": False,
            "axis1": {
                "courses_score": 20,
                "classroom_management_score": 20,
                "blended_learning_items": [5, 5, 5, 5],
                "course_description_items": [4, 4, 4, 4, 4],
                "job_commitment_items": [4, 4, 4, 4, 4]
            },
            "axis2": {
                "global_research_score": 60,
                "local_research_score": 25,
                "supervision_score": 15
            },
            "axis3": {
                "committees_score": 30,
                "continuous_learning_score": 20,
                "thank_you_score": 20,
                "field_visits_score": 30
            },
            "axis4": {
                "items": {"item1": 3, "item2": 4} # sum 7, capped at 5
            },
            "axis5": {
                "penalties": []
            }
        }
        res = calculate_evaluation(sample_data)
        # Axis 1: 100 * 0.5 = 50
        # Axis 2: 100 * 0.3 = 30
        # Axis 3: 100 * 0.2 = 20
        # Three axes total: 100
        # Strengths: +5, but capped at 100
        self.assertEqual(res["axis1"]["weighted_score"], 50.0)
        self.assertEqual(res["axis2"]["weighted_score"], 30.0)
        self.assertEqual(res["axis3"]["weighted_score"], 20.0)
        self.assertEqual(res["three_axes_total"], 100.0)
        self.assertEqual(res["final_score"], 100.0)
        self.assertEqual(res["rating"], "امتياز")
        self.assertIn("مئة درجة", res["score_in_words"])

    def test_global_research_zero_cap_rule(self):
        """إذا كانت درجة الفقرة (المحور الثاني/1) صفر فإن التقييم لا يتجاوز 75"""
        sample_data = {
            "is_non_teaching": False,
            "axis1": {
                "courses_score": 20,
                "classroom_management_score": 20,
                "blended_learning_items": [5, 5, 5, 5],
                "course_description_items": [4, 4, 4, 4, 4],
                "job_commitment_items": [4, 4, 4, 4, 4]
            },
            "axis2": {
                "global_research_score": 0, # ZERO global research
                "local_research_score": 25,
                "supervision_score": 15
            },
            "axis3": {
                "committees_score": 30,
                "continuous_learning_score": 20,
                "thank_you_score": 20,
                "field_visits_score": 30
            },
            "axis4": {
                "items": {"item1": 3}
            },
            "axis5": {
                "penalties": []
            }
        }
        res = calculate_evaluation(sample_data)
        # Axis 1: 100 * 0.5 = 50
        # Axis 2: 40 * 0.3 = 12
        # Axis 3: 100 * 0.2 = 20
        # Three axes total: 82.0
        # Strengths: 3 -> 85.0
        # But global research is 0, so must be capped at 75!
        self.assertTrue(res["is_capped_at_75"])
        self.assertEqual(res["final_score"], 75.0)
        self.assertEqual(res["rating"], "جيد")
        self.assertTrue(len(res["warnings"]) > 0)

    def test_penalties_deduction(self):
        sample_data = {
            "is_non_teaching": False,
            "axis1": {"courses_score": 20, "classroom_management_score": 20, "blended_learning_items": [5,5,5,5], "course_description_items": [4,4,4,4,4], "job_commitment_items": [4,4,4,4,4]},
            "axis2": {"global_research_score": 60, "local_research_score": 25, "supervision_score": 15},
            "axis3": {"committees_score": 30, "continuous_learning_score": 20, "thank_you_score": 20, "field_visits_score": 30},
            "axis4": {"items": {}},
            "axis5": {
                "penalties": [
                    {"type": "notice", "count": 1},   # -3
                    {"type": "warning", "count": 1}    # -5
                ]
            }
        }
        res = calculate_evaluation(sample_data)
        # Total before penalties = 100
        # Penalties = 8
        # Final score = 92
        self.assertEqual(res["axis5"]["total_deduction"], 8.0)
        self.assertEqual(res["final_score"], 92.0)
        self.assertEqual(res["rating"], "امتياز")

    def test_non_teaching_staff(self):
        sample_data = {
            "is_non_teaching": True,
            "axis1": {
                "job_commitment_items": [20, 20, 20, 20, 20]
            },
            "axis2": {"global_research_score": 60, "local_research_score": 0, "supervision_score": 0},
            "axis3": {"committees_score": 30, "continuous_learning_score": 0, "thank_you_score": 0, "field_visits_score": 0},
            "axis4": {"items": {}},
            "axis5": {"penalties": []}
        }
        res = calculate_evaluation(sample_data)
        self.assertEqual(res["axis1"]["raw_total"], 100.0)
        self.assertEqual(res["axis1"]["weighted_score"], 50.0)

    def test_zero_and_unproven_scores(self):
        """التحقق من أن المنصة لا تضع أي درجات افتراضية للمحاور دون رفع ملفات أو إدخال يدوي"""
        zero_data = {
            "is_non_teaching": False,
            "axis1": {
                "courses_score": 0,
                "classroom_management_score": 0,
                "blended_learning_items": [0, 0, 0, 0],
                "course_description_items": [0, 0, 0, 0, 0],
                "job_commitment_items": [0, 0, 0, 0, 0]
            },
            "axis2": {
                "global_research_score": 0,
                "local_research_score": 0,
                "supervision_score": 0
            },
            "axis3": {
                "committees_score": 0,
                "continuous_learning_score": 0,
                "thank_you_score": 0,
                "field_visits_score": 0
            },
            "axis4": {"items": {}},
            "axis5": {"penalties": []}
        }
        res = calculate_evaluation(zero_data)
        self.assertEqual(res["axis1"]["weighted_score"], 0.0)
        self.assertEqual(res["axis2"]["weighted_score"], 0.0)
        self.assertEqual(res["axis3"]["weighted_score"], 0.0)
        self.assertEqual(res["final_score"], 0.0)
        self.assertEqual(res["rating"], "ضعيف")

class TestReclassifyEvidenceApi(unittest.TestCase):
    def test_reclassify_evidence_endpoint(self):
        from fastapi.testclient import TestClient
        from app import app
        import json
        import os

        client = TestClient(app)
        
        # Test 1: Non-existent ref_code creates a new reclassified entry
        res = client.post("/api/reclassify-evidence", json={
            "ref_code": "NON_EXISTENT_REF_999",
            "axis": "axis1",
            "paragraph": "1"
        })
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["item"]["ref_code"], "NON_EXISTENT_REF_999")
        self.assertEqual(data["item"]["axis"], "axis1")

        # Test 2: Valid item reclassification
        cache_path = "indexed_results_cache.json"
        temp_item = {
            "ref_code": "TEST-RECLASS-01",
            "axis": "axis2",
            "paragraph": "1",
            "axis_name": "المحور الثاني",
            "paragraph_name": "البحوث العالمية",
            "doc_type": "بحث علمي",
            "suggested_score": 10.0,
            "filename": "test_doc.pdf"
        }
        
        # Load or create cache
        existing_cache = []
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                    if isinstance(raw, dict):
                        existing_cache = raw.get("indexed_evidence_list", [])
                    elif isinstance(raw, list):
                        existing_cache = raw
            except Exception:
                existing_cache = []
        
        updated_cache = [x for x in existing_cache if isinstance(x, dict) and x.get("ref_code") != "TEST-RECLASS-01"]
        updated_cache.append(temp_item)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump({"indexed_evidence_list": updated_cache}, f, ensure_ascii=False, indent=2)

        try:
            reclass_payload = {
                "ref_code": "TEST-RECLASS-01",
                "axis": "axis1",
                "paragraph": "2",
                "axis_name": "المحور الأول: جودة التدريس والتعليم والالتزام الوظيفي",
                "paragraph_name": "2. إدارة الصف والعلاقة مع الطلبة",
                "doc_type": "استمارة تقييم أداء الطلبة",
                "suggested_score": 15.0,
                "auditor_notes": "تم التصحيح يدوياً بواسطة المدقق"
            }
            res2 = client.post("/api/reclassify-evidence", json=reclass_payload)
            self.assertEqual(res2.status_code, 200)
            data2 = res2.json()
            self.assertTrue(data2["success"])
            self.assertEqual(data2["updated_item"]["axis"], "axis1")
            self.assertEqual(data2["updated_item"]["paragraph"], "2")
            self.assertEqual(data2["updated_item"]["suggested_score"], 15.0)
            self.assertEqual(data2["updated_item"]["doc_type"], "استمارة تقييم أداء الطلبة")
            self.assertEqual(data2["updated_item"]["audit_status"], "modified")
            self.assertTrue(data2["updated_item"]["manual_reclassified"])
        finally:
            # Clean up test item from cache
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    final_cache = json.load(f)
                test_codes = {"TEST-RECLASS-01", "NON_EXISTENT_REF_999"}
                if isinstance(final_cache, list):
                    cleaned = [x for x in final_cache if x.get("ref_code") not in test_codes]
                else:
                    cleaned = final_cache
                    cleaned["indexed_evidence_list"] = [x for x in final_cache.get("indexed_evidence_list", []) if x.get("ref_code") not in test_codes]
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(cleaned, f, ensure_ascii=False, indent=2)
            except Exception:
                pass

if __name__ == "__main__":
    unittest.main()

