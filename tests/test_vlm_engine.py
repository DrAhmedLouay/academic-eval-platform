import unittest
from core.vlm_engine import (
    calculate_local_bounding_boxes,
    extract_faculty_role_in_order
)
from fastapi.testclient import TestClient
from app import app

class TestVlmEngine(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_calculate_bounding_boxes(self):
        full_text = "جمهورية العراق\nكلية الهندسة\nالعدد: 452\nالتاريخ: 2025/10/12\nم/ تكليف تدريسي\nتقرر تكليف التدريسي..."
        boxes = calculate_local_bounding_boxes(
            text=full_text,
            doc_number="452",
            date="2025/10/12",
            subject="تكليف تدريسي"
        )
        self.assertIsInstance(boxes, dict)
        self.assertIn("doc_number", boxes)
        for key, box in boxes.items():
            self.assertIn("top", box)
            self.assertIn("left", box)
            self.assertIn("width", box)
            self.assertIn("height", box)
            self.assertGreaterEqual(box["top"], 0)
            self.assertLessEqual(box["top"], 100)
            self.assertGreaterEqual(box["left"], 0)
            self.assertLessEqual(box["left"], 100)

    def test_extract_faculty_role_head(self):
        order_text = """
        أمر إداري
        بناءً على الصلاحيات، تقرر تشكيل لجنة مناقشة طالب الماجستير:
        1. أ.د. أحمد لؤي أحمد / رئيساً
        2. أ.م.د. علي محمود / عضواً
        3. م.د. حيدر جاسم / عضواً ومشرفاً
        """
        role_info = extract_faculty_role_in_order(order_text, faculty_name="أحمد لؤي أحمد")
        self.assertIsNotNone(role_info)
        self.assertEqual(role_info["role"], "رئيس لجنة")
        self.assertEqual(role_info["suggested_score"], 30.0)

    def test_extract_faculty_role_member(self):
        order_text = """
        أمر إداري
        بناءً على الصلاحيات، تقرر تشكيل لجنة علمية:
        1. أ.د. خليل إبراهيم / رئيساً
        2. أ.م.د. أحمد لؤي أحمد / عضواً
        """
        role_info = extract_faculty_role_in_order(order_text, faculty_name="أحمد لؤي أحمد")
        self.assertIsNotNone(role_info)
        self.assertEqual(role_info["role"], "عضو لجنة")
        self.assertEqual(role_info["suggested_score"], 20.0)

    def test_vlm_config_api(self):
        # GET config
        get_res = self.client.get("/api/vlm-config")
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertTrue(data.get("success"))
        self.assertIn("model", data)

        # POST config
        post_res = self.client.post("/api/vlm-config", json={
            "gemini_api_key": "TEST_KEY_12345",
            "model": "gemini-1.5-flash",
            "enable_local_fallback": True
        })
        self.assertEqual(post_res.status_code, 200)
        pdata = post_res.json()
        self.assertTrue(pdata.get("success"))

    def test_scan_snippet_api(self):
        # Snippet scan endpoint test
        payload = {
            "crop_box": {"top": 10.0, "left": 10.0, "width": 50.0, "height": 30.0}
        }
        res = self.client.post("/api/scan-snippet", json=payload)
        self.assertEqual(res.status_code, 200)
        sdata = res.json()
        self.assertTrue(sdata.get("success"))

if __name__ == "__main__":
    unittest.main()
