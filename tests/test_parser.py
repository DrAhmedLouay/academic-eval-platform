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

if __name__ == "__main__":
    unittest.main()
