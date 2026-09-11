import unittest
import os
from core.docx_generator import create_form_21_docx
from core.pdf_generator import create_form_21_pdf

class TestExportGenerators(unittest.TestCase):
    def setUp(self):
        self.sample_data = {
            "personal_info": {
                "university": "جامعة بغداد",
                "college": "كلية الهندسة",
                "department": "الهندسة المدنية",
                "first_name": "علي",
                "father_name": "حسين",
                "grandfather_name": "كاظم",
                "great_grandfather_name": "جواد",
                "last_name": "الزبيدي",
                "mother_name": "فاطمة",
                "mother_father_name": "محمد",
                "mother_grandfather_name": "علي",
                "national_id": "198512345678",
                "registry_no": "142",
                "page_no": "58",
                "issue_year": "2020",
                "issue_month": "05",
                "issue_day": "12",
                "degree": "دكتوراه",
                "order_no_and_date": "ق/452 في 2018/06/10",
                "degree_year": "2018",
                "degree_month": "06",
                "degree_day": "10",
                "granting_country": "العراق",
                "granting_univ": "جامعة بغداد",
                "granting_college": "كلية الهندسة",
                "granting_dept": "الهندسة المدنية",
                "general_specialty": "هندسة مدنية",
                "specific_specialty": "إنشاءات وجسور",
                "academic_title": "أستاذ مساعد",
                "title_granter": "مجلس جامعة بغداد",
                "title_year": "2022",
                "title_month": "03",
                "title_day": "15",
                "phone": "07701234567",
                "email": "dr.ali@uobaghdad.edu.iq"
            },
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
                "items": {"item1": 3, "item2": 4}
            },
            "axis5": {
                "penalties": []
            }
        }
        self.sample_attachments = [
            {
                "type_arabic": "كتاب شكر وتقدير",
                "document_number": "م.و/1042",
                "date": "2025/11/15",
                "title": "كتاب شكر من معالي وزير التعليم العالي والبحث العلمي",
                "axis_name": "المحور الثالث",
                "suggested_paragraph": "3",
                "suggested_score": 20.0
            },
            {
                "type_arabic": "بحث منشور في مستوعب عالمي",
                "document_number": "10.1016/j.apenergy.2025.109823",
                "date": "2025/08/20",
                "title": "High Performance Structural Concrete (Scopus CiteScore 4.8)",
                "axis_name": "المحور الثاني",
                "suggested_paragraph": "1",
                "suggested_score": 60.0
            }
        ]

    def test_docx_generation(self):
        docx_path = "exports/test_form_21.docx"
        res = create_form_21_docx(self.sample_data, docx_path, self.sample_attachments)
        self.assertTrue(os.path.exists(docx_path))
        self.assertGreater(os.path.getsize(docx_path), 5000)

    def test_pdf_generation(self):
        pdf_path = "exports/test_form_21.pdf"
        res = create_form_21_pdf(self.sample_data, pdf_path, self.sample_attachments)
        self.assertTrue(os.path.exists(pdf_path))
    def test_client_export_js_no_alerts(self):
        for js_file in ["static/js/app.js", "docs/js/app.js"]:
            self.assertTrue(os.path.exists(js_file), f"{js_file} does not exist")
            with open(js_file, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertNotIn("تنبيه التصدير", content, f"{js_file} still contains export alert popup")
            self.assertIn("function generateAndDownloadClientWordDoc", content, f"{js_file} missing client-side Word generator")
            self.assertIn("function escapeHtml", content, f"{js_file} missing escapeHtml")

        with open("static/js/app.js", "r", encoding="utf-8") as f1, open("docs/js/app.js", "r", encoding="utf-8") as f2:
            self.assertEqual(f1.read(), f2.read(), "static/js/app.js and docs/js/app.js must be identical")

    def test_streamlit_app_syntax_and_imports(self):
        import ast
        with open("streamlit_app.py", "r", encoding="utf-8") as f:
            code = f.read()
        self.assertIn("import json", code, "streamlit_app.py must import json")
        tree = ast.parse(code)
    def test_bundled_html_scripts_validity(self):
        import re, subprocess
        with open("docs/index.html", "r", encoding="utf-8") as f:
            html = f.read()
        with open("docs/css/styles.css", "r", encoding="utf-8") as f:
            css = f.read()
        with open("docs/js/app.js", "r", encoding="utf-8") as f:
            js = f.read()

        bundle = re.sub(r'<link[^>]*styles\.css[^>]*>', lambda m: f'<style>\n{css}\n</style>', html)
        bundle = re.sub(r'<script[^>]*app\.js[^>]*></script>', lambda m: f'<script>\n{js}\n</script>', bundle)
        scripts = re.findall(r'<script(?:\s+[^>]*)?>(.*?)</script>', bundle, re.DOTALL)
        self.assertGreaterEqual(len(scripts), 2)
        jsc_bin = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc"
        if os.path.exists(jsc_bin):
            mock = "var window = this; var document = { readyState: 'complete', getElementById: function(){ return { style: { setProperty: function(){} } }; }, querySelectorAll: function(){ return []; }, querySelector: function(){ return null; }, addEventListener: function(){} }; var navigator = { userAgent: 'test' }; var localStorage = { getItem: function(){ return null; }, setItem: function(){} }; var Blob = function(){}; var URL = { createObjectURL: function(){}, revokeObjectURL: function(){} }; var alert = function(){}; var console = { log: function(){}, warn: function(){}, error: function(){} };"
            for idx, sc in enumerate(scripts):
                if not sc.strip(): continue
                test_path = f"/tmp/test_eval_block_{idx}.js"
                with open(test_path, "w", encoding="utf-8") as tf:
                    tf.write(mock + "\n" + sc)
                res = subprocess.run([jsc_bin, test_path], capture_output=True, text=True)
                self.assertEqual(res.returncode, 0, f"Script block {idx} failed in jsc: {res.stderr or res.stdout}")

if __name__ == "__main__":
    unittest.main()
