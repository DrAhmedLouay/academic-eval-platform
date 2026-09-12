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

    def test_extract_faculty_role_in_table_format(self):
        table_text = """
        وزارة التعليم العالي والبحث العلمي - الجامعة التكنولوجية
        أمر إداري بتشكيل لجنة تدقيقية:
        | ت | الاسم الثلاثي واللقب | اللقب العلمي | الدور في اللجنة |
        | 1 | أ.د. صباح حسن كاظم | أستاذ | رئيساً |
        | 2 | م.د. أحمد لؤي أحمد | مدرس | عضواً ومقرراً |
        | 3 | م.م. زينب عادل هادي | مدرس مساعد | عضواً |
        """
        role_info = extract_faculty_role_in_order(table_text, faculty_name="د. احمد لؤي احمد")
        self.assertIsNotNone(role_info)
        self.assertEqual(role_info["role"], "عضو ومقرر")
        self.assertEqual(role_info["suggested_score"], 25.0)
        self.assertEqual(role_info["order_index"], "2")
        self.assertEqual(role_info["academic_rank"], "مدرس")
        self.assertIn("faculty-name-highlight", role_info["highlighted_line"])

    def test_extract_faculty_role_in_appreciation_and_workshop(self):
        appreciation_text = """
        جامعة بغداد - كلية الهندسة
        كتاب شكر وتقدير
        نظراً لجهودكم المتميزة والمبذولة في إنجاز المهام الموكلة إليكم، يسرنا توجيه الشكر والتقدير إلى:
        (المهندس المعماري د. أحمد لؤي أحمد)
        متمنين لكم مزيداً من العطاء خدمة لبلدنا العزيز.
        """
        role_info = extract_faculty_role_in_order(appreciation_text, faculty_name="احمد لوي")
        self.assertIsNotNone(role_info)
        self.assertEqual(role_info["role"], "مكرم بكتاب شكر وتقدير")
        self.assertEqual(role_info["suggested_score"], 15.0)

    def test_bounding_boxes_with_faculty_match(self):
        matched_info = {
            "matched_name": "أحمد لؤي أحمد",
            "role": "رئيس لجنة",
            "approx_top_pct": 52.0
        }
        boxes = calculate_local_bounding_boxes("نص", "1509", "2024/10/29", "أمر تشكيل لجنة", matched_info)
        self.assertIn("faculty", boxes)
        self.assertEqual(boxes["faculty"]["color"], "#059669")
        self.assertIn("رئيس لجنة", boxes["faculty"]["label"])


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

    def test_gemini_vlm_handwriting_post_processing(self):
        from unittest.mock import patch
        from core.vlm_engine import scan_document_multimodal

        mock_gemini_response = {
            "doc_number": "هـ.ع / V39",
            "date": "r.r5/4/14",
            "subject": "أمر إداري بتشكيل لجنة",
            "issuer": "قسم هندسة العمارة",
            "doc_type": "أمر إداري",
            "is_handwritten": True
        }

        with patch("core.vlm_engine.load_vlm_config", return_value={"engine": "gemini", "gemini_api_key": "dummy_key", "model": "gemini-2.0-flash"}), \
             patch("core.vlm_engine.call_gemini_vlm_api", return_value=mock_gemini_response):
            result = scan_document_multimodal("dummy_path.jpg", faculty_name="أحمد لؤي أحمد")
            self.assertTrue(result.get("ocr_success"))
            self.assertIn("739", result.get("doc_number", ""))
            self.assertIn("2025", result.get("date", ""))

if __name__ == "__main__":
    unittest.main()

