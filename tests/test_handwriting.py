import unittest
from core.ocr_engine import normalize_arabic_text
from core.document_parser import (
    extract_dates,
    extract_document_number,
    parse_academic_document,
    deep_scan_and_index_document
)

class TestHandwritingExtraction(unittest.TestCase):
    def test_handwritten_number_on_dotted_line(self):
        text = """
        جمهورية العراق
        وزارة التعليم العالي والبحث العلمي
        العدد : ................. 10425 / 7 / ص .................
        التاريخ : ................. 2025 / 11 / 14 .................
        أمر إداري بتشكيل لجنة امتحانية
        """
        num_res = extract_document_number(text)
        self.assertIsNotNone(num_res)
        # Should clean the dotted lines and spaced digits
        if isinstance(num_res, dict):
            num_val = num_res.get("value")
            self.assertTrue(num_res.get("is_handwritten"))
        else:
            num_val = num_res
        self.assertIn("10425/7/ص", num_val)

    def test_handwritten_eastern_arabic_spaced_digits(self):
        text = """
        جامعة بغداد - كلية الهندسة
        العدد: ١ ٠ ٤ ٢ ٥ | ٧
        التأريخ: ١ ٤ / ١ ١ / ٢ ٠ ٢ ٥
        شكر وتقدير من معالي وزير التعليم العالي
        """
        num_res = extract_document_number(text)
        dates = extract_dates(text)
        
        num_val = num_res.get("value") if isinstance(num_res, dict) else num_res
        self.assertIsNotNone(num_val)
        self.assertIn("10425/7", num_val)
        
        date_val = dates[0].get("date") if (dates and isinstance(dates[0], dict)) else (dates[0] if dates else None)
        self.assertIsNotNone(date_val)
        self.assertTrue("2025" in date_val and "11" in date_val and "14" in date_val)

    def test_handwritten_multiline_number_and_textual_date(self):
        text = """
        أمر جامعي
        العدد:
        1258 / ق
        التاريخ:
        14 نيسان 2025
        نظراً للجهود المتميزة تقرر توجيه كتاب شكر وتقدير
        """
        num_res = extract_document_number(text)
        dates = extract_dates(text)
        
        num_val = num_res.get("value") if isinstance(num_res, dict) else num_res
        self.assertIsNotNone(num_val)
        self.assertIn("1258/ق", num_val)
        
        date_val = dates[0].get("date") if (dates and isinstance(dates[0], dict)) else (dates[0] if dates else None)
        self.assertIsNotNone(date_val)
        self.assertIn("2025/04/14", date_val)

    def test_deep_scan_with_handwriting_flags(self):
        text = """
        وزارة التعليم العالي والبحث العلمي
        العدد : ........ 9988 / أ ........
        التاريخ : ........ 2025 / 05 / 20 ........
        أمر وزاري شكر وتقدير للأستاذ
        """
        item = deep_scan_and_index_document(text=text, filename="handwritten_order.jpg")
        self.assertTrue(item.get("handwritten_detected"))
        self.assertIn("9988/أ", item.get("doc_number"))
        self.assertIn("2025/05/20", item.get("date"))
        self.assertIn("خط اليد", item.get("auto_fill_summary"))

    def test_iraqi_handwritten_doc_number_formula(self):
        """اختبار صيغة العدد الإداري العراقي: حروف عربية بنقاط أو بدونها / رقم تسلسلي"""
        # مثال الصورة 2: هندسة عمارة مع رقم تسلسلي 734
        text_img2 = """
        الجامعة التكنولوجية
        قسم هندسة العمارة
        العدد: ه R٢ : ١/٣٤ /٤
        التاريخ : Date: ٢٠٢٥ / ٤ / ١٤
        امر اداري
        م/تكليف
        """
        num2 = extract_document_number(text_img2)
        self.assertIsNotNone(num2)
        self.assertEqual(str(num2), "هـ.ع/734")

        # مثال الصورة 1: مكتب المساعد العلمي مع رقم تسلسلي 1509
        text_img1 = """
        الجامعة التكنولوجية
        مكتب مساعد رئيس الجامعة للشؤون العلمية
        العدد : ١٥٠٩ / ٤٠٢٠٢
        التاريخ: ٢٠٢٤/٩/١٩
        امر جامعي
        م/ تشكيل لجنة
        """
        num1 = extract_document_number(text_img1)
        self.assertIsNotNone(num1)
        self.assertEqual(str(num1), "م.ع/1509")

        # مثال دراسات وتخطيط: د.ت/625
        text_dt = """
        الجامعة التكنولوجية - العراق
        قسم الدراسات و التخطيط
        العدد: د.ت / 625
        التاريخ: 2024/9/26
        """
        num_dt = extract_document_number(text_dt)
        self.assertIsNotNone(num_dt)
        self.assertEqual(str(num_dt), "د.ت/625")

        # مثال مؤتمر IETAS قسم الشؤون العلمية: ش.ع/43
        text_ietas_ocr = """
        وزارة التعليم العالي والبحث العلمي
        الجامعة التكنولوجية
        قسم الشؤون العلمية
        العدد: مش ٤٣ /٤
        التاريخ: ٢٠٢٥/١/١٣
        الى / تشكيلات الجامعة كافة
        م/ تأييد حضور مؤتمر
        """
        num_ietas = extract_document_number(text_ietas_ocr)
        self.assertIsNotNone(num_ietas)
        self.assertEqual(str(num_ietas), "ش.ع/43")
        dates_ietas = extract_dates(text_ietas_ocr)
        self.assertTrue(len(dates_ietas) > 0)
        self.assertEqual(dates_ietas[0], "2025/01/13")

        # مثال مباشر مع مسافات وبدون نقاط: ش ع / 43
        text_direct = """
        الجامعة التكنولوجية
        قسم الشؤون العلمية
        العدد: ش ع / 43
        التاريخ: 13 / 1 / 2025
        """
        num_direct = extract_document_number(text_direct)
        self.assertIsNotNone(num_direct)
        self.assertEqual(str(num_direct), "ش.ع/43")

        # مثال هندسة العمارة: هـ ع / 1799 من سطر OCR العد: Ref: \799 /4 5
        text_arch_1799 = """
        قسم هندسة العمارة
        العد: Ref: \\799 /4 5
        تاريخ Date: 202 4 / 10 / 29
        الى / الى السيد مساعد رئيس الجامعة للشؤون العلمية
        م/ إضافة نشاط
        """
        num_arch = extract_document_number(text_arch_1799)
        self.assertIsNotNone(num_arch)
        self.assertEqual(str(num_arch), "هـ.ع/1799")
        dates_arch = extract_dates(text_arch_1799)
        self.assertTrue(len(dates_arch) > 0)
        self.assertEqual(dates_arch[0], "2024/10/29")

        # مثال مباشر لصيغة المستخدم: هـ ع / 1799
        text_arch_direct = """
        الجامعة التكنولوجية
        قسم هندسة العمارة
        العدد: هـ ع / 1799
        التاريخ: 2024/10/29
        """
        num_arch_direct = extract_document_number(text_arch_direct)
        self.assertIsNotNone(num_arch_direct)
        self.assertEqual(str(num_arch_direct), "هـ.ع/1799")

        # مثال مكتب الوزير: م و 8 / 135 (شكر التكنولوجية)
        text_minister = """
        مكتب الوزير
        العدد :
        م و 8 /
        التاريخ:
        1/21
        135
        2025
        أ.د . أحمد محمد حسن الغبان المحترم
        رئيس الجامعة التكنولوجية
        م / شكر وتقدير
        """
        num_min = extract_document_number(text_minister)
        self.assertIsNotNone(num_min)
        self.assertEqual(str(num_min), "م و 8 / 135")
        dates_min = extract_dates(text_minister)
        self.assertTrue(len(dates_min) > 0)
        self.assertEqual(dates_min[0], "2025/01/21")

        # مثال مباشر لصيغة المستخدم: م و 8 / 135
        text_min_direct = """
        مكتب الوزير
        العدد: م و 8 / 135
        التاريخ: 2025/1/21
        """
        num_min_direct = extract_document_number(text_min_direct)
        self.assertIsNotNone(num_min_direct)
        self.assertEqual(str(num_min_direct), "م و 8 / 135")

    def test_user_uploaded_cropped_images_all_have_arabic_letters(self):
        """التحقق من أن كافة الصور المقتطعة للمستخدم تحتوي على الحروف العربية بخط اليد كاملة"""
        cases = [
            ("العدد : 1509/40202\nالتاريخ: 20024/9/19", "م.ع/1509"),
            ("العدد: هRef.: 1/34 /4\nالتاريخ : Date: 2025 / 4 / 14", "هـ.ع/734"),
            ("العدد: مش 43 /4\nالتاريخ: 2025/1/13", "ش.ع/43"),
            ("سد: Rer: 1799 8-/4\nتاريخ D:e: 202 { / 10 / 29", "هـ.ع/1799"),
            ("العدد :\nم و 8 /\n135\nالتاريخ: 2025 / 1 / 21", "م و 8 / 135"),
        ]
        for snippet, expected in cases:
            res = extract_document_number(snippet)
            self.assertIsNotNone(res, f"Failed on snippet: {snippet}")
            self.assertEqual(str(res), expected, f"Expected {expected} but got {res} on snippet: {snippet}")
            self.assertTrue(getattr(res, "is_handwritten", False))

    def test_handwritten_edge_cases_and_non_decree_filtering(self):
        """التحقق من عدم اختلاق اختصارات للكتب المجردة من الحروف ومنع استخراج أرقام من مقالات Scopus ورسائل البريد"""
        # 1. كتاب مجلة العمارة: العدد 17 مع وجود مخاطب مساعد رئيس الجامعة للشؤون العلمية (يجب أن يبقى 17 ولا يصبح م.ع/17)
        text_mag = """
        الجامعة التكنولوجية
        قسم هندسة العمارة
        المجلة العراقية لهندسة العمارة والتخطيط
        IQ JAP
        العدد: 17
        التاريخ: 2024/12/15
        السيد مساعد رئيس الجامعة للشؤون العلمية والدراسات العليا ... المحترم
        """
        num_mag = extract_document_number(text_mag)
        self.assertIsNotNone(num_mag)
        self.assertEqual(str(num_mag), "17")

        # 2. كتاب الشؤون الإدارية والمالية: تصحيح أسر 10582 إلى أ.م/10582
        text_admin = """
        جمهورية العراق
        وزارة التعليم العالي والبحث العلمي
        الجامعة التكنولوجية
        قسم الشؤون الإدارية والمالية
        العدد: أسر 10582
        التاريخ: 2024/ 12 /30
        """
        num_admin = extract_document_number(text_admin)
        self.assertIsNotNone(num_admin)
        self.assertEqual(str(num_admin), "أ.م/10582")

        # 3. كتاب مكتب رئيس الجامعة: سد : 51 / 40/2 -> م.ر 1 / 51
        text_pres = """
        وزارة التعليم العالي والبحث العلمي
        الجامعة التكنولوجية
        مصكتب رئيس المامعة
        سد : 51 / 40/2
        تاريخ 2025 / 2/18
        """
        num_pres = extract_document_number(text_pres)
        self.assertIsNotNone(num_pres)
        self.assertIn(str(num_pres), ["م.ر 1 / 51", "م.ر/51"])

        # 4. كتاب نقابة المهندسين: العدد 7417 دون فرض هـ.ع
        text_eng = """
        نقابة المهندسين العراقية
        مكتب النقيب
        العدد: 7417
        Ref.
        """
        num_eng = extract_document_number(text_eng)
        self.assertIsNotNone(num_eng)
        self.assertEqual(str(num_eng), "7417")

        # 5. مستندات غير إدارية يجب ألا يستخرج منها رقم أمر إداري مصطنع
        text_scopus = """
        Scopus - Exploring the Integration of Design Thinking
        References (59) Similar documents
        Civil Engineering and Architecture • Article
        """
        self.assertIsNone(extract_document_number(text_scopus))

        text_email = """
        From: IETAS 2024 ietas2024@easychair.org
        Subject: Thank you for the review on IETAS 2024 submission 270
        Date: November 26-27, 2024
        """
        self.assertIsNone(extract_document_number(text_email))

        text_bologna = """
        نظام مسار بولونيا
        عدد الطلبة
        99
        عدد المواد 3
        """
        self.assertIsNone(extract_document_number(text_bologna))


if __name__ == "__main__":
    unittest.main()


