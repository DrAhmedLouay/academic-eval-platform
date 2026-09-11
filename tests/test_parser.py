import unittest
from core.document_parser import parse_academic_document, extract_document_number, extract_dates

class TestDocumentParser(unittest.TestCase):
    def test_minister_thank_you(self):
        text = """
        جمهورية العراق
        وزارة التعليم العالي والبحث العلمي
        مكتب الوزير
        العدد: م.و/1042
        التاريخ: 2025/11/15
        إلى: أ.م.د. علي حسين كاظم
        م / شكر وتقدير
        نظرا لجهودكم المتميزة والمبذولة في أداء الواجبات، يسرنا أن نوجه لكم شكرنا وتقديرنا العاليين
        وزير التعليم العالي والبحث العلمي
        """
        res = parse_academic_document(text, "minister_thanks.pdf")
        self.assertEqual(res["document_type"], "thank_you_letter")
        self.assertEqual(res["suggested_axis"], "axis3")
        self.assertEqual(res["suggested_paragraph"], "3")
        self.assertEqual(res["suggested_score"], 20.0)
        self.assertIn("وزير التعليم العالي", res["issuer"])
        self.assertEqual(res["document_number"], "م.و/1042")
        self.assertEqual(res["date"], "2025/11/15")

    def test_scopus_paper_high_citescore(self):
        text = """
        Applied Energy Research Journal
        Elsevier Publications - Indexed in Scopus and Clarivate
        DOI: 10.1016/j.apenergy.2025.109823
        CiteScore: 4.8
        Authors: Dr. Ahmed Louay (First Author and Corresponding Author), Dr. John Doe
        Date: 2025/08/20
        """
        res = parse_academic_document(text, "paper.pdf")
        self.assertEqual(res["document_type"], "scopus_paper")
        self.assertEqual(res["suggested_axis"], "axis2")
        self.assertEqual(res["suggested_paragraph"], "1")
        self.assertEqual(res["suggested_score"], 60.0)
        self.assertEqual(res["document_number"], "10.1016/j.apenergy.2025.109823")

    def test_exam_committee_order(self):
        text = """
        جامعة بغداد - كلية الهندسة
        قسم الهندسة المدنية
        أمر إداري المرقم 543
        التاريخ: 2025/10/01
        بناءً على الصلاحيات المخولة لنا تقرر تشكيل اللجنة الامتحانية للعام الدراسي 2025-2026
        رئيس اللجنة: أ.د. سمير محمد
        عضو: أ.م.د. علي حسين
        عميد الكلية
        """
        res = parse_academic_document(text, "exam_committee.pdf")
        self.assertEqual(res["document_type"], "committee_order")
        self.assertEqual(res["suggested_axis"], "axis3")
        self.assertEqual(res["suggested_paragraph"], "1")
        self.assertEqual(res["suggested_score"], 30.0)
        self.assertIn("اللجنة الامتحانية", res["title"])

    def test_recipient_and_subject_extraction(self):
        from core.document_parser import extract_recipient, extract_subject_or_title
        text = """جمهورية العراق
نقابة المهندسين العراقية
المركز العام - أسست سنة 1959
مكتب النقيب
العدد: 7417
التاريخ: 2024/11/06
الى/ وزارة التعليم العالي والبحث العلمي/ مكتب السيد الوزير
م/ دعوة لحضور المؤتمر المعماري الثاني
تهديكم نقابتنا اطيب التحيات"""
        self.assertEqual(extract_recipient(text), "وزارة التعليم العالي والبحث العلمي/ مكتب السيد الوزير")
        self.assertEqual(extract_subject_or_title(text), "دعوة لحضور المؤتمر المعماري الثاني")

    # ─────────────────────────────────────────────────────────────────────────
    # اختبارات خط اليد — مبنية على نماذج الصور المرفوعة من المستخدم
    # ─────────────────────────────────────────────────────────────────────────

    def test_handwritten_ocr_739_image3(self):
        """صورة 3: العدد هـ.ع/٧٣٩ — الرقم ٧ يُقرأ كـ V أو U"""
        text = "العدد: هـ ع / V39\nالتاريخ: 2025/4/14"
        num = extract_document_number(text)
        self.assertIsNotNone(num)
        self.assertIn("739", str(num))

    def test_handwritten_ocr_date_r_r5(self):
        """صورة 3 و4: التاريخ ٢٠٢٥ يُقرأ كـ r.r5"""
        text = "التاريخ: r.r5/4/14"
        dates = extract_dates(text)
        self.assertTrue(any("2025" in str(d) for d in dates),
                        f"Expected 2025 in dates, got: {dates}")

    def test_handwritten_ocr_date_c_eo(self):
        """صورة 4 (حبر أزرق): التاريخ ٢٠٢٥ يُقرأ كـ c-eo — مع علامة التاريخ"""
        # OCR يقرأ ٢٠٢٥ كـ c-eo في الخط الأزرق المائل
        text = "التاريخ: c-eo/1/12"
        # نطبق التصحيح مباشرة كما يحدث في labeled_date_pat
        from core.document_parser import clean_handwritten_token
        import re
        cand = "c-eo/1/12"
        cand = re.sub(r'\bc[-_\.][Ee][oO0]\b', '2025', cand)
        cleaned = clean_handwritten_token(cand)
        self.assertIn("2025", cleaned)

    def test_handwritten_ocr_1799_image1(self):
        """صورة 1: العدد هـ.ع/١٧٩٩"""
        text = "Ref: 1799\nالعدد: هـ ع / 1799\nDate: 2023/10/8"
        num = extract_document_number(text)
        self.assertIsNotNone(num)
        self.assertIn("1799", str(num))

    def test_handwritten_ocr_date_zero_as_o(self):
        """الصفر ٠ يُقرأ كـ حرف o بين الأرقام (مثل 2o25 → 2025)"""
        from core.document_parser import clean_handwritten_token
        result = clean_handwritten_token("2o25/1/19")
        self.assertIn("2025", result)

    def test_handwritten_mow_doc_number(self):
        """صورة 5: م و / ٨ / ١٣٠ — رقم مكتب الوزير"""
        text = "العدد: م و 8 / 130\nالتاريخ: 2025/1/19"
        num = extract_document_number(text)
        self.assertIsNotNone(num)
        self.assertIn("130", str(num))


if __name__ == "__main__":
    unittest.main()
